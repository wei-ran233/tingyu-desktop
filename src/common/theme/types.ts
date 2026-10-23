/** Semantic tokens are always `--lx-*`; the index signature keeps merging simple. */
export type ThemeTokenMap = Record<string, string>

/** Host-interpreted presentation, with no executable CSS or business actions. */
export interface ThemeAppearance {
  identity?: string
  layout: 'sidebar' | 'rail' | 'topbar'
  background: 'tide' | 'signal' | 'petals' | 'image' | 'none'
  detail: 'cinema' | 'sleeve' | 'poster'
  content: 'full' | 'focus'
  views?: Record<string, string>
  metrics?: { sidebarWidth: number, radius: number, spacing: number }
  motion?: { durationMs: number, enabled: boolean }
}

export interface ThemeSnapshot {
  revision: number
  themeId: string
  isDark: boolean
  tokens: ThemeTokenMap
}

export interface ThemeSnapshotInput {
  revision: number
  themeId: string
  isDark: boolean
  colors: Record<string, string>
}
