import type { ThemeAppearance } from './types'

const choices = {
  layout: ['sidebar', 'rail', 'topbar'],
  background: ['tide', 'signal', 'petals'],
  detail: ['cinema', 'sleeve', 'poster'],
  content: ['full', 'focus'],
}

export const validateThemeAppearance = (input: unknown, extended = false): ThemeAppearance => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid theme appearance')
  const raw = input as Record<string, unknown>
  if (Object.keys(raw).some(key => !Object.prototype.hasOwnProperty.call(choices, key) && !['views', 'identity', ...(extended ? ['metrics', 'motion'] : [])].includes(key))) throw new Error('Unknown theme appearance property')
  if (raw.identity != null && (typeof raw.identity !== 'string' || !(extended ? (/^[a-z0-9][a-z0-9._-]{0,63}$/.test(raw.identity) && !['constructor', 'prototype'].includes(raw.identity)) : ['tide', 'signal', 'petals'].includes(raw.identity)))) throw new Error('Invalid theme identity')
  for (const [key, values] of Object.entries(choices)) {
    if (typeof raw[key] !== 'string' || ![...values, ...(extended && key === 'background' ? ['image', 'none'] : [])].includes(raw[key])) throw new Error(`Invalid theme ${key}`)
  }
  if (raw.views != null) {
    if (typeof raw.views !== 'object' || Array.isArray(raw.views) || Object.keys(raw.views).length > 32) throw new Error('Invalid theme views')
    for (const [feature, view] of Object.entries(raw.views)) {
      if (!/^[a-z][a-z0-9._-]{0,100}$/.test(feature) || typeof view !== 'string' || !/^[a-z][a-z0-9._-]{0,100}$/.test(view)) throw new Error('Invalid theme view reference')
    }
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'metrics')) {
    const metrics = raw.metrics as Record<string, unknown>
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics) || Object.keys(metrics).length !== 3 || !Number.isFinite(metrics.sidebarWidth) || Number(metrics.sidebarWidth) < 56 || Number(metrics.sidebarWidth) > 240 || !Number.isFinite(metrics.radius) || Number(metrics.radius) < 0 || Number(metrics.radius) > 32 || !Number.isFinite(metrics.spacing) || Number(metrics.spacing) < 0 || Number(metrics.spacing) > 24) throw new Error('Invalid theme metrics')
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'motion')) {
    const motion = raw.motion as Record<string, unknown>
    if (!motion || typeof motion !== 'object' || Array.isArray(motion) || Object.keys(motion).length !== 2 || !Number.isFinite(motion.durationMs) || Number(motion.durationMs) < 1000 || Number(motion.durationMs) > 120000 || typeof motion.enabled !== 'boolean') throw new Error('Invalid theme motion')
  }
  return input as ThemeAppearance
}
