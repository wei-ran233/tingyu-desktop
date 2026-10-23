import type { ThemeSnapshot, ThemeSnapshotInput, ThemeTokenMap } from './types'

const first = (colors: Record<string, string>, keys: string[], fallback: string): string => {
  for (const key of keys) {
    const value = colors[key]
    if (typeof value === 'string' && value.trim() && value !== 'none') return value
  }
  return fallback
}

/**
 * Semantic tokens are the plugin-facing theme contract. The legacy
 * `--color-*` variables keep working through the compatibility block.
 */
export const buildSemanticTokens = (colors: Record<string, string>, isDark: boolean): ThemeTokenMap => {
  const background = first(colors, ['--color-primary-light-1000', '--color-main-background'], isDark ? 'rgb(20, 20, 20)' : 'rgb(255, 255, 255)')
  const surface = first(colors, ['--color-main-background', '--color-primary-light-1000'], background)
  const raised = first(colors, ['--color-primary-light-900', '--color-primary-light-800'], surface)
  const text = first(colors, ['--color-850', '--color-font'], isDark ? 'rgb(235, 235, 235)' : 'rgb(40, 40, 40)')
  const muted = first(colors, ['--color-450', '--color-font-label'], isDark ? 'rgb(160, 160, 160)' : 'rgb(110, 110, 110)')
  const accent = first(colors, ['--color-primary', '--color-theme'], 'rgb(77, 175, 124)')
  const accentContrast = first(colors, ['--color-primary-light-1000'], isDark ? 'rgb(20, 20, 20)' : 'rgb(255, 255, 255)')
  const border = first(colors, ['--color-primary-alpha-700', '--color-primary-light-500'], accent)
  const hover = first(colors, ['--color-primary-light-300-alpha-700', '--color-primary-light-400-alpha-700'], raised)
  const selected = first(colors, ['--color-primary-light-300-alpha-800', '--color-primary-alpha-700'], hover)

  return {
    '--lx-background': background,
    '--lx-surface': surface,
    '--lx-surface-raised': raised,
    '--lx-text': text,
    '--lx-text-muted': muted,
    '--lx-accent': accent,
    '--lx-accent-contrast': accentContrast,
    '--lx-border': border,
    '--lx-hover': hover,
    '--lx-selected': selected,
    '--lx-danger': '#e05a5a',
    '--lx-radius': '8px',
    '--lx-shadow': isDark ? '0 12px 32px rgba(0, 0, 0, 0.55)' : '0 12px 32px rgba(0, 0, 0, 0.18)',
    '--lx-font': 'system-ui, -apple-system, "Segoe UI", sans-serif',
  }
}

/**
 * Compatibility mappings let existing host styles participate in the same
 * semantic theme without renaming every `--color-*` usage at once.
 */
export const buildCompatibilityTokens = (tokens: ThemeTokenMap): Record<string, string> => ({
  ...tokens,
  '--color-font': tokens['--lx-text'],
  '--color-font-label': tokens['--lx-text-muted'],
  '--color-content-background': tokens['--lx-background'],
  '--color-main-background': tokens['--lx-surface'],
  '--color-primary': tokens['--lx-accent'],
})

export const createThemeSnapshot = (input: ThemeSnapshotInput): ThemeSnapshot => ({
  revision: input.revision,
  themeId: input.themeId,
  isDark: input.isDark,
  tokens: buildSemanticTokens(input.colors, input.isDark),
})

export const themeSnapshotToCss = (snapshot: ThemeSnapshot): string => {
  return Object.entries(buildCompatibilityTokens(snapshot.tokens))
    .map(([key, value]) => `${key}:${value};`)
    .join('')
}
