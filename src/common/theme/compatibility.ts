import type { ThemeTokenMap } from './types'

/** Derive the legacy palette so every existing page participates in a plugin theme. */
export const buildPluginCompatibilityTokens = (tokens: ThemeTokenMap): Record<string, string> => {
  const surface = tokens['--lx-surface']
  const text = tokens['--lx-text']
  const accent = tokens['--lx-accent']
  const mix = (a: string, b: string, percent: number) => `color-mix(in srgb, ${a} ${percent}%, ${b})`
  const result: Record<string, string> = {
    '--background-image': 'none',
    '--color-app-background': 'transparent',
    '--color-main-background': surface,
    '--color-content-background': tokens['--lx-background'],
    '--color-primary': accent,
    '--color-primary-font': text,
    '--color-primary-font-hover': accent,
    '--color-primary-font-active': accent,
    '--color-theme': accent,
    '--color-font': text,
    '--color-font-label': tokens['--lx-text-muted'],
    '--color-label': tokens['--lx-text-muted'],
    '--color-nav-font': text,
    '--color-scrollbar-track': 'transparent',
    '--color-border': tokens['--lx-border'],
    '--color-button-background': tokens['--lx-surface-raised'],
    '--color-button-background-hover': tokens['--lx-hover'],
    '--color-button-background-active': tokens['--lx-selected'],
    '--color-button-background-selected': tokens['--lx-selected'],
    '--color-button-font': text,
    '--color-button-font-selected': text,
    '--color-primary-background': tokens['--lx-selected'],
    '--color-primary-background-hover': tokens['--lx-hover'],
    '--color-primary-background-active': tokens['--lx-selected'],
    '--color-list-header-border-bottom': tokens['--lx-border'],
    '--radius-sm': tokens['--lx-radius'],
    '--radius-md': tokens['--lx-radius'],
  }
  for (let n = 0; n <= 1000; n += 50) result[`--color-${String(n).padStart(3, '0')}`] = mix(text, surface, n / 10)
  for (let n = 100; n <= 1000; n += 100) {
    result[`--color-primary-alpha-${n}`] = mix(accent, 'transparent', n / 10)
    for (const kind of ['light', 'dark']) {
      const color = mix(accent, surface, kind === 'light' ? Math.max(0, 30 - n / 35) : 65)
      result[`--color-primary-${kind}-${n}`] = color
      for (let alpha = 100; alpha < 1000; alpha += 100) result[`--color-primary-${kind}-${n}-alpha-${alpha}`] = mix(color, 'transparent', alpha / 10)
    }
  }
  return result
}
