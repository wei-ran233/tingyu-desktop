import { computed } from 'vue'
import { activeAppearance, activeThemeName, activeThemeResources } from './state'
import { themeGlyphs, themeIconAliases, baseThemeGlyphs } from './icons'

export const themeIdentity = computed(() => activeAppearance.value?.identity)
const names: Record<string, string> = { tide: '潮汐', signal: '信号', petals: '花间' }
export const themeDisplayName = computed(() => activeThemeName.value || (themeIdentity.value ? names[themeIdentity.value] ?? themeIdentity.value : ''))
export const activeThemeGlyphs = computed(() => ({ ...((themeGlyphs as Record<string, typeof themeGlyphs.tide>)[themeIdentity.value ?? ''] ?? (themeIdentity.value ? baseThemeGlyphs : {})), ...activeThemeResources.value.icons }))
export const themeIconRef = (reference: string) => {
  const identity = themeIdentity.value
  let id = reference?.replace(/^#icon-/, '')
  if (Object.prototype.hasOwnProperty.call(themeIconAliases, id) && !Object.prototype.hasOwnProperty.call(activeThemeResources.value.icons, id) && Object.prototype.hasOwnProperty.call(activeThemeResources.value.icons, themeIconAliases[id])) id = themeIconAliases[id]
  return identity && Object.prototype.hasOwnProperty.call(activeThemeGlyphs.value, id) ? `#lx-icon-${identity}-${id}` : reference
}
