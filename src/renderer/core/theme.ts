import { requestPluginCatalog } from '@renderer/core/pluginCatalog'
import { PLUGIN_EVENT_NAME } from '@common/ipcNames'
import { rendererInvoke } from '@common/rendererIpc'
import type { LoadedThemeResources } from '@common/theme/resources'
import type { ThemeSnapshot } from '@common/theme/types'
import { createThemeSnapshot, buildCompatibilityTokens } from '@common/theme/semantic'
import { mergeThemeTokens } from '@common/theme/validation'
import { themeShouldUseDarkColors, themeId } from '@renderer/store'
import { ref } from 'vue'
import type { PluginThemeContribution } from '@common/plugin/types'
import { validateThemeAppearance } from '@common/theme/appearance'
import { buildPluginCompatibilityTokens } from '@common/theme/compatibility'
import { activeAppearance, themeViewOverrides, activeThemeName, activeThemeDescription, activeThemeResources } from './theme/state'

const SELECTION_KEY = 'lx.theme.plugin.v1'
const MOTION_KEY = 'lx.theme.motion.v1'
export const selectedPluginTheme = ref(localStorage.getItem(SELECTION_KEY) ?? '')
export const themeMotionEnabled = ref(localStorage.getItem(MOTION_KEY) !== 'off')
export const themeLoadingKey = ref('')
let selectionRevision = 0
export const pluginThemeCatalog = ref<Array<PluginThemeContribution & { pluginId: string, pluginName: string, key: string }>>([])
const syncAppearance = () => {
  const root = document.documentElement
  const appearance = activeAppearance.value
  for (const name of ['layout', 'background', 'detail', 'content', 'identity'] as const) {
    if (appearance?.[name]) root.setAttribute(`data-lx-${name}`, appearance[name])
    else root.removeAttribute(`data-lx-${name}`)
  }
  const effectiveMotion = themeMotionEnabled.value && appearance?.motion?.enabled !== false
  root.dataset.lxMotion = effectiveMotion ? 'on' : 'off'
  const variables: Record<string, number | undefined> = {
    '--lx-theme-sidebar-width': appearance?.metrics?.sidebarWidth,
    '--lx-theme-radius': appearance?.metrics?.radius,
    '--lx-theme-spacing': appearance?.metrics?.spacing,
    '--lx-theme-motion-duration': appearance?.motion?.durationMs,
  }
  for (const [key, value] of Object.entries(variables)) {
    if (value != null) root.style.setProperty(key, `${value}${key.endsWith('duration') ? 'ms' : 'px'}`)
    else root.style.removeProperty(key)
  }
}
export const setThemeMotionEnabled = (enabled: boolean) => {
  themeMotionEnabled.value = enabled
  localStorage.setItem(MOTION_KEY, enabled ? 'on' : 'off')
  syncAppearance()
}

let revision = 0
let current: ThemeSnapshot | null = null
let styleElement: HTMLStyleElement | null = null
const contributed = new Map<string, { tokens: Record<string, string>, isDark?: boolean }>()

const ensureStyleElement = () => {
  if (styleElement && document.contains(styleElement)) return styleElement
  styleElement = document.createElement('style')
  styleElement.id = 'lx-theme-tokens'
  document.head.appendChild(styleElement)
  return styleElement
}

const writeTokens = (tokens: Record<string, string>) => {
  const element = ensureStyleElement()
  element.textContent = `${contributed.size ? 'html[data-lx-theme]' : ':root'} {${Object.entries(tokens).map(([key, value]) => `${key}:${value};`).join('')}}`
}

const publish = () => {
  if (!current) return
  const tokens = [...contributed.values()].reduce<Record<string, string>>((acc, item) => mergeThemeTokens(acc, item.tokens), current.tokens)
  const isDark = [...contributed.values()].at(-1)?.isDark ?? current.isDark
  const snapshot: ThemeSnapshot = { ...current, themeId: [...contributed.keys()].at(-1) ?? current.themeId, tokens, isDark }
  writeTokens({ ...buildCompatibilityTokens(snapshot.tokens), ...(contributed.size ? buildPluginCompatibilityTokens(snapshot.tokens) : {}) })
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
  if (contributed.size) document.documentElement.dataset.lxScheme = isDark ? 'dark' : 'light'
  else document.documentElement.removeAttribute('data-lx-scheme')
  void rendererInvoke(PLUGIN_EVENT_NAME.theme_change, snapshot).catch(error => { console.warn('[theme] plugin theme push failed', error) })
}

export const applyThemeSnapshot = (colors: Record<string, string>, activeThemeId = themeId.value, isDark = themeShouldUseDarkColors.value) => {
  revision++
  current = createThemeSnapshot({
    revision,
    themeId: activeThemeId,
    isDark,
    colors,
  })
  publish()
  return current
}

export const applyContributedTheme = (key: string, tokens: Record<string, string>, isDark?: boolean) => {
  if (current) current = { ...current, revision: ++revision }
  contributed.clear()
  contributed.set(key, { tokens, isDark })
  document.documentElement.dataset.lxTheme = key
  publish()
}

export const removeContributedTheme = (key: string) => {
  if (selectedPluginTheme.value === key) { resetPluginTheme(); return }
  if (current) current = { ...current, revision: ++revision }
  contributed.delete(key)
  if (!contributed.size) document.documentElement.removeAttribute('data-lx-theme')
  publish()
}

export const getThemeSnapshot = (): ThemeSnapshot | null => {
  if (!current) return null
  const tokens = [...contributed.values()].reduce<Record<string, string>>((acc, item) => mergeThemeTokens(acc, item.tokens), current.tokens)
  return { ...current, themeId: [...contributed.keys()].at(-1) ?? current.themeId, tokens, isDark: [...contributed.values()].at(-1)?.isDark ?? current.isDark }
}

export const removePluginThemes = (pluginId: string) => {
  catalogRequest++
  pluginThemeCatalog.value = pluginThemeCatalog.value.filter(theme => theme.pluginId !== pluginId)
  if (themeLoadingKey.value.startsWith(`plugin:${pluginId}:`)) {
    selectionRevision++
    themeLoadingKey.value = ''
  }
  for (const key of [...contributed.keys()]) if (key.startsWith(`plugin:${pluginId}:`)) removeContributedTheme(key)
  if (selectedPluginTheme.value.startsWith(`plugin:${pluginId}:`)) resetPluginTheme()
}

export const resetPluginTheme = () => {
  selectionRevision++
  themeLoadingKey.value = ''
  selectedPluginTheme.value = ''
  localStorage.removeItem(SELECTION_KEY)
  activeAppearance.value = null
  activeThemeName.value = ''; activeThemeDescription.value = ''
  activeThemeResources.value = { icons: {} }
  themeViewOverrides.value = {}
  contributed.clear()
  document.documentElement.removeAttribute('data-lx-theme')
  syncAppearance()
  if (current) current = { ...current, revision: ++revision }
  publish()
}

export const selectPluginTheme = async(key: string) => {
  const theme = pluginThemeCatalog.value.find(theme => theme.key === key)
  if (!theme) throw new Error('该主题插件尚未启用或已不可用')
  const appearance = theme.appearance ? validateThemeAppearance(theme.appearance, true) : null
  const request = ++selectionRevision
  themeLoadingKey.value = key
  try {
    const resources = theme.resources ? await rendererInvoke<{ pluginId: string, themeId: string }, LoadedThemeResources>(PLUGIN_EVENT_NAME.theme_resources, { pluginId: theme.pluginId, themeId: theme.id }) : { icons: {} }
    if (appearance?.background === 'image' && !resources.background) throw new Error('主题背景资源不可用')
    if (appearance?.views) await (await import('@renderer/core/features/component')).preloadFeatureViews(appearance.views)
    if (request !== selectionRevision || !pluginThemeCatalog.value.some(theme => theme.key === key)) return
    activeAppearance.value = appearance
    activeThemeName.value = theme.name; activeThemeDescription.value = theme.description ?? ''
    activeThemeResources.value = resources
    themeViewOverrides.value = { ...appearance?.views }
    selectedPluginTheme.value = key
    localStorage.setItem(SELECTION_KEY, key)
    syncAppearance()
    applyContributedTheme(key, theme.tokens, theme.isDark)
  } catch (error) {
    if (request === selectionRevision && selectedPluginTheme.value === key) resetPluginTheme()
    throw error
  } finally { if (request === selectionRevision) themeLoadingKey.value = '' }
}

let catalogRequest = 0
export const loadPluginThemes = async() => {
  const request = ++catalogRequest
  const plugins = await requestPluginCatalog()
  if (request !== catalogRequest) return
  pluginThemeCatalog.value = plugins.filter(plugin => plugin.enabled && plugin.compatible && plugin.available !== false && plugin.permissions.includes('theme.contribute'))
    .flatMap(plugin => plugin.themes.map(theme => ({ ...theme, pluginId: plugin.id, pluginName: plugin.name, key: `plugin:${plugin.id}:${theme.id}` })))
  const loading = themeLoadingKey.value
  if (loading) {
    if (pluginThemeCatalog.value.some(theme => theme.key === loading)) { await selectPluginTheme(loading); return }
    selectionRevision++
    themeLoadingKey.value = ''
  }
  const selected = selectedPluginTheme.value
  if (!selected) return
  if (pluginThemeCatalog.value.some(theme => theme.key === selected)) await selectPluginTheme(selected)
  else resetPluginTheme()
}

export const initializePluginThemes = () => {
  syncAppearance()
  const reload = () => { void loadPluginThemes().catch(error => { console.warn('[theme] catalog unavailable', error) }) }
  reload()
  window.addEventListener('lx:collection-catalog-changed', reload)
  return () => { window.removeEventListener('lx:collection-catalog-changed', reload) }
}
