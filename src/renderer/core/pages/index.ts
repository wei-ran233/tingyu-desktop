import { computed, ref } from '@common/utils/vueTools'
import { BUILTIN_PAGES } from '@common/pages/registry'
import type { PageDefinition } from '@common/pages/types'
import { PLUGIN_EVENT_NAME } from '@common/ipcNames'
import { rendererInvoke } from '@common/rendererIpc'
import { featureEnabled } from '@renderer/core/features/state'
import { appSetting } from '@renderer/store/setting'

export interface PluginPageInfo {
  pluginId: string
  pluginName: string
  id: string
  title: string
  icon?: string
  iconDataUrl?: string
  entry?: string
  order?: number
  placement?: 'primary' | 'tools' | 'hidden'
}

export interface HostPage {
  id: string
  path: string
  routeName: string
  title: string
  iconRef?: string
  iconViewBox?: string
  iconUrl?: string
  placement: 'primary' | 'tools' | 'hidden'
  order: number
  source: 'builtin' | 'plugin'
  pluginId?: string
  pageId?: string
  entry?: string
  lazy?: boolean
  component?: string
  featureId?: string
  titleIsKey?: boolean
  visible?: PageDefinition['visible']
  surfaceId?: PageDefinition['surfaceId']
}

export const pluginPages = ref<PluginPageInfo[]>([])

export const buildHostPages = (pages: PluginPageInfo[]): HostPage[] => {
  const builtin: HostPage[] = BUILTIN_PAGES.map(page => ({
    id: page.id,
    path: page.path,
    routeName: page.routeName,
    title: page.titleKey,
    iconRef: page.icon,
    iconViewBox: page.iconViewBox,
    placement: page.placement as HostPage['placement'],
    order: page.order,
    source: 'plugin',
    pluginId: page.pluginId,
    featureId: page.component === 'settings' ? undefined : page.component,
    titleIsKey: true,
    lazy: page.lazy,
    component: page.component,
    surfaceId: page.surfaceId,
    visible: page.visible,
  }))
  const plugin: HostPage[] = pages.map(page => ({
    id: `plugin:${page.pluginId}:${page.id}`,
    path: `/plugins/${page.pluginId}/${page.id}`,
    routeName: `Plugin:${page.pluginId}:${page.id}`,
    title: page.title,
    iconViewBox: '0 0 24 24',
    iconUrl: page.iconDataUrl,
    placement: page.placement ?? 'primary',
    order: page.order ?? 1000,
    source: 'plugin',
    pluginId: page.pluginId,
    pageId: page.id,
    entry: page.entry,
  }))
  const recovery: HostPage = { id: 'extensions', path: '/extensions', routeName: 'Extensions', title: '功能与渲染插件', iconRef: '#icon-setting', iconViewBox: '0 0 493.23 436.47', placement: 'tools', order: 10000, source: 'builtin' }
  return [...builtin, ...plugin, recovery]
}

export const allPages = computed(() => buildHostPages(pluginPages.value))

export const visiblePages = computed(() => {
  return allPages.value
    .filter(page => page.placement !== 'hidden' && (!page.featureId || featureEnabled(page.featureId)))
    .filter(page => !page.visible || page.visible({ downloadEnabled: appSetting['download.enable'] }))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
})

export const loadPluginPages = async() => {
  try {
    pluginPages.value = await rendererInvoke<PluginPageInfo[]>(PLUGIN_EVENT_NAME.get_pages)
  } catch (error) {
    console.warn('[pages] failed to load plugin pages', error)
    pluginPages.value = []
  }
}

export const findPluginPage = (pluginId: string, pageId: string): PluginPageInfo | undefined => {
  return pluginPages.value.find(page => page.pluginId === pluginId && page.id === pageId)
}
