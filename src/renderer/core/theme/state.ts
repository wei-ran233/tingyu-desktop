import { shallowRef } from 'vue'
import type { LoadedThemeResources } from '@common/theme/resources'
import type { ThemeAppearance } from '@common/theme/types'

export const activeAppearance = shallowRef<ThemeAppearance | null>(null)
export const themeViewOverrides = shallowRef<Record<string, string>>({})

export const activeThemeName = shallowRef('')
export const activeThemeDescription = shallowRef('')
export const activeThemeResources = shallowRef<LoadedThemeResources>({ icons: {} })
