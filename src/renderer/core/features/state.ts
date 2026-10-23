import { ref } from '@common/utils/vueTools'
import { normalizeFeaturePreferences } from '@common/features'
import { OFFICIAL_BUNDLE_ID, NATIVE_FEATURE_OWNERS, NATIVE_FEATURE_DEPENDENCIES, resolveNativeBundles } from '@common/bundles'
import { PLUGIN_EVENT_NAME } from '@common/ipcNames'
import { rendererInvoke } from '@common/rendererIpc'

const KEY = 'lx.features.v1'
const read = () => {
  try { return normalizeFeaturePreferences(JSON.parse(localStorage.getItem(KEY) ?? 'null')) } catch { return normalizeFeaturePreferences(null) }
}
export const featurePreferences = ref(read())
export const bundleAvailable = ref(false)
export const bundleReady = ref(false)
export const availableBundles = ref<string[]>([])
export const nativeBundleEnabled = (id: string) => availableBundles.value.includes(id)
const enabled = (id: string, visited: Set<string>): boolean => {
  if (visited.has(id) || !nativeBundleEnabled(NATIVE_FEATURE_OWNERS[id]) || featurePreferences.value.disabled.includes(id)) return false
  return (NATIVE_FEATURE_DEPENDENCIES[id] ?? []).every(dependency => enabled(dependency, new Set([...visited, id])))
}
export const featureEnabled = (id: string): boolean => enabled(id, new Set())
export const setFeatureEnabled = (id: string, enabled: boolean) => {
  const prefs = featurePreferences.value
  featurePreferences.value = normalizeFeaturePreferences({ ...prefs, disabled: enabled ? prefs.disabled.filter(value => value !== id) : [...prefs.disabled, id] })
  localStorage.setItem(KEY, JSON.stringify(featurePreferences.value))
}
export const setFeatureView = (id: string, view: string) => {
  featurePreferences.value = normalizeFeaturePreferences({ ...featurePreferences.value, views: { ...featurePreferences.value.views, [id]: view } })
  localStorage.setItem(KEY, JSON.stringify(featurePreferences.value))
}
export const refreshNativeBundles = async() => {
  try {
    const bundles = await rendererInvoke<string[]>(PLUGIN_EVENT_NAME.native_bundles)
    availableBundles.value = resolveNativeBundles(bundles)
    bundleAvailable.value = nativeBundleEnabled(OFFICIAL_BUNDLE_ID)
  } catch (error) {
    availableBundles.value = []
    bundleAvailable.value = false
    console.warn('[features] bundle load failed', error)
  } finally { bundleReady.value = true }
}
export const restoreFeatureDefaults = () => {
  featurePreferences.value = normalizeFeaturePreferences(null)
  localStorage.removeItem(KEY)
}
