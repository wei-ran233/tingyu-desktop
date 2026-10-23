/** A feature is independent of the view selected to present it. */
export interface FeatureDefinition {
  id: string
  pluginId: string
  displayName: string
  defaultView: string
  requires?: string
}

export interface FeatureViewDefinition {
  id: string
  featureId: string
  pluginId: string
  displayName: string
  mode: 'classic' | 'compact'
}

export interface FeaturePreferences {
  disabled: string[]
  views: Record<string, string>
}

export const normalizeFeaturePreferences = (input: unknown): FeaturePreferences => {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const views: Record<string, string> = Object.create(null)
  if (raw.views && typeof raw.views === 'object' && !Array.isArray(raw.views)) {
    for (const [key, value] of Object.entries(raw.views).slice(0, 128)) {
      if (/^[a-z][a-z0-9._-]{0,100}$/.test(key) && typeof value === 'string' && /^[a-z][a-z0-9._-]{0,100}$/.test(value)) views[key] = value
    }
  }
  return { disabled: Array.isArray(raw.disabled) ? [...new Set(raw.disabled.filter((id): id is string => typeof id === 'string' && /^[a-z][a-z0-9._-]{0,100}$/.test(id)))].slice(0, 128) : [], views }
}

export const resolveFeatureView = (feature: FeatureDefinition, views: readonly FeatureViewDefinition[], preferences: FeaturePreferences): FeatureViewDefinition => {
  const choices = views.filter(view => view.featureId === feature.id)
  const result = choices.find(view => view.id === preferences.views[feature.id]) ?? choices.find(view => view.id === feature.defaultView)
  if (!result) throw new Error(`No rendering provider for feature ${feature.id}`)
  return result
}
