import type { FeatureDefinition, FeatureViewDefinition } from '@common/features'
import { resolveFeatureView } from '@common/features'
import { featurePreferences } from './state'
import { ref } from 'vue'
import { activeAppearance, themeViewOverrides } from '../theme/state'
import type { ThemeIdentity } from '../theme/icons'

export interface NativeView {
  render: (...args: any[]) => any
  __cssModules?: Record<string, Record<string, string>>
  __scopeId?: string
}
export interface NativeFeature extends FeatureDefinition {
  load: () => Promise<object>
}
export interface NativeFeatureView extends FeatureViewDefinition {
  themeIdentity?: ThemeIdentity
  load: () => Promise<object>
}
const features = new Map<string, NativeFeature>()
const views = new Map<string, NativeFeatureView>()
const revision = ref(0)
export const registerFunction = (feature: NativeFeature) => {
  if (features.has(feature.id)) throw new Error(`Duplicate feature: ${feature.id}`)
  features.set(feature.id, feature)
  revision.value++
}
/** Rendering providers may be contributed independently of their function. */
export const registerFeatureView = (view: NativeFeatureView) => {
  if (!features.has(view.featureId) || views.has(`${view.featureId}/${view.id}`)) throw new Error('Unknown function or duplicate rendering contribution')
  views.set(`${view.featureId}/${view.id}`, view)
  revision.value++
}
export const registerFeature = (feature: NativeFeature, renderers: NativeFeatureView[]) => {
  if (features.has(feature.id)) throw new Error(`Duplicate feature: ${feature.id}`)
  const ids = new Set<string>()
  for (const view of renderers) {
    if (view.featureId !== feature.id || ids.has(view.id) || views.has(`${feature.id}/${view.id}`)) throw new Error('Invalid or duplicate rendering contribution')
    ids.add(view.id)
  }
  resolveFeatureView(feature, renderers, { disabled: [], views: {} })
  registerFunction(feature)
  for (const view of renderers) registerFeatureView(view)
}
export const getFeature = (id: string): NativeFeature => {
  const feature = features.get(id)
  if (!feature) throw new Error(`Unknown feature: ${id}`)
  return feature
}
export const getFeatures = () => { void revision.value; return [...features.values()] }
export const getFeatureViews = (id: string) => { void revision.value; return [...views.values()].filter(view => view.featureId === id) }
export const resolveNativeView = (id: string): NativeFeatureView => {
  const choices = getFeatureViews(id).filter(view => !view.themeIdentity || view.themeIdentity === activeAppearance.value?.identity)
  const preferred = themeViewOverrides.value[id]
  const preferences = preferred && choices.some(view => view.id === preferred)
    ? { ...featurePreferences.value, views: { ...featurePreferences.value.views, [id]: preferred } }
    : featurePreferences.value
  return resolveFeatureView(getFeature(id), choices, preferences) as NativeFeatureView
}
