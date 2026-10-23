import { requestPluginCatalog } from '@renderer/core/pluginCatalog'
import {
  COLLECTION_SURFACE_IDS,
  HOST_RECOVERY_PROVIDER_ID,
  OFFICIAL_PLUGIN_ID,
  OFFICIAL_PROVIDER_ID,
  type CollectionProviderInfo,
  type CollectionProviderPreferences,
} from '@common/collection/types'
import type { PluginPublicInfo } from '@common/plugin/types'
import { PLUGIN_API_VERSION } from '@common/plugin/types'
import { isPluginApiCompatible } from '@common/plugin/security'

const STORAGE_KEY = 'lx.collection.providers.v1'

export const DEFAULT_PREFERENCES: CollectionProviderPreferences = {
  enabled: false,
  globalProviderId: null,
  surfaceProviders: {},
}

export const readPreferences = (): CollectionProviderPreferences => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (raw && typeof raw === 'object') {
      return {
        enabled: raw.enabled === true,
        globalProviderId: typeof raw.globalProviderId === 'string' ? raw.globalProviderId : null,
        surfaceProviders: raw.surfaceProviders && typeof raw.surfaceProviders === 'object' ? raw.surfaceProviders : {},
      }
    }
  } catch {
    // Ignore malformed preferences and fall back to defaults.
  }
  return { ...DEFAULT_PREFERENCES, surfaceProviders: {} }
}

export const writePreferences = (preferences: CollectionProviderPreferences) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  for (const listener of preferenceListeners) listener(preferences)
}

const preferenceListeners = new Set<(preferences: CollectionProviderPreferences) => void>()

export const subscribePreferences = (listener: (preferences: CollectionProviderPreferences) => void) => {
  preferenceListeners.add(listener)
  return () => {
    preferenceListeners.delete(listener)
  }
}

export const setCollectionEnabled = (enabled: boolean) => {
  writePreferences({ ...readPreferences(), enabled })
}

export const setGlobalProvider = (qualifiedId: string | null) => {
  writePreferences({ ...readPreferences(), globalProviderId: qualifiedId })
}

export const setSurfaceProvider = (surfaceId: (typeof COLLECTION_SURFACE_IDS)[number], qualifiedId: string | null) => {
  const preferences = readPreferences()
  const surfaceProviders = { ...preferences.surfaceProviders }
  if (qualifiedId) surfaceProviders[surfaceId] = qualifiedId
  else Reflect.deleteProperty(surfaceProviders, surfaceId)
  writePreferences({ ...preferences, surfaceProviders })
}

export const buildProviderCatalog = (plugins: PluginPublicInfo[]): CollectionProviderInfo[] => {
  const providers: CollectionProviderInfo[] = []
  for (const plugin of plugins) {
    for (const contribution of plugin.providers) {
      const available = plugin.enabled && plugin.compatible && plugin.available !== false && isPluginApiCompatible(contribution.entry ? plugin.apiVersion : plugin.apiVersion)
      const info: CollectionProviderInfo = {
        id: contribution.id,
        qualifiedId: `${plugin.id}/${contribution.id}`,
        displayName: contribution.displayName,
        description: contribution.description,
        pluginId: plugin.id,
        apiVersion: plugin.apiVersion || PLUGIN_API_VERSION,
        surfaces: contribution.surfaces,
        entry: contribution.entry ?? plugin.pages?.[0]?.entry ?? plugin.icon ?? 'index.html',
        icon: contribution.icon ?? plugin.icon ?? '',
        enabled: plugin.enabled,
        available,
        unavailableReason: !plugin.enabled ? 'user_disabled' : !plugin.compatible ? (plugin.incompatibleReason ?? 'incompatible') : plugin.blockedReason,
        isOfficial: plugin.official && plugin.id === OFFICIAL_PLUGIN_ID && contribution.id === OFFICIAL_PROVIDER_ID,
      }
      providers.push(info)
    }
  }
  return providers
}

export const loadProviderCatalog = async(): Promise<CollectionProviderInfo[]> => {
  try {
    const plugins = await requestPluginCatalog()
    return buildProviderCatalog(plugins)
  } catch (error) {
    console.warn('[collection] failed to load plugins', error)
    return []
  }
}

export const recoveryProvider = (): CollectionProviderInfo => ({
  id: HOST_RECOVERY_PROVIDER_ID,
  qualifiedId: HOST_RECOVERY_PROVIDER_ID,
  displayName: 'Host recovery list',
  pluginId: 'host',
  apiVersion: PLUGIN_API_VERSION,
  surfaces: [...COLLECTION_SURFACE_IDS],
  entry: '',
  icon: '',
  enabled: true,
  available: true,
  isOfficial: false,
})
