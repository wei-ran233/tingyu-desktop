import {
  COLLECTION_SURFACE_IDS,
  OFFICIAL_PLUGIN_ID,
  OFFICIAL_PROVIDER_ID,
  type CollectionProviderInfo,
  type CollectionProviderPreferences,
  type CollectionProviderState,
  type CollectionSurfaceId,
  toQualifiedProviderId,
} from './types'

export type CollectionProviderResolutionSource = 'surface' | 'global' | 'official' | 'recovery'

export interface CollectionProviderResolution {
  providerId: string | null
  source: CollectionProviderResolutionSource
  /** A stored preference that can no longer be satisfied. It is kept verbatim. */
  unavailablePreferenceId: string | null
  unavailableReason?: string
}

const findProvider = (
  providers: readonly CollectionProviderInfo[],
  qualifiedId: string | null,
  surfaceId: CollectionSurfaceId,
): CollectionProviderInfo | undefined => {
  const provider = qualifiedId == null ? undefined : providers.find(item => item.qualifiedId === qualifiedId)
  return provider?.surfaces.includes(surfaceId) ? provider : undefined
}

export const resolveCollectionProvider = (
  providers: readonly CollectionProviderInfo[],
  preferences: CollectionProviderPreferences,
  surfaceId: CollectionSurfaceId,
): CollectionProviderResolution => {
  let invalidPreferenceId: string | null = null
  let invalidReason: string | undefined
  const surfacePreference = preferences.surfaceProviders?.[surfaceId] ?? null
  if (surfacePreference) {
    const provider = findProvider(providers, surfacePreference, surfaceId)
    if (provider?.available) return { providerId: provider.qualifiedId, source: 'surface', unavailablePreferenceId: null }
    invalidPreferenceId = surfacePreference
    invalidReason = provider?.unavailableReason ?? 'unavailable'
  }
  if (preferences.globalProviderId) {
    const provider = findProvider(providers, preferences.globalProviderId, surfaceId)
    if (provider?.available) return { providerId: provider.qualifiedId, source: 'global', unavailablePreferenceId: invalidPreferenceId, unavailableReason: invalidReason }
    invalidPreferenceId ??= preferences.globalProviderId
    invalidReason ??= provider?.unavailableReason ?? 'unavailable'
  }
  const official = findProvider(providers, toQualifiedProviderId(OFFICIAL_PLUGIN_ID, OFFICIAL_PROVIDER_ID), surfaceId)
  if (official?.available && official.isOfficial) return { providerId: official.qualifiedId, source: 'official', unavailablePreferenceId: invalidPreferenceId, unavailableReason: invalidReason }
  return { providerId: null, source: 'recovery', unavailablePreferenceId: invalidPreferenceId, unavailableReason: invalidReason }
}

export const buildProviderState = (
  providers: CollectionProviderInfo[],
  preferences: CollectionProviderPreferences,
): CollectionProviderState => {
  const resolved: Record<CollectionSurfaceId, string | null> = {
    'search-music': null,
    'list-music': null,
    'songlist-detail-music': null,
    'leaderboard-music': null,
  }
  const invalidPreferences: Record<CollectionSurfaceId, string | null> = {
    'search-music': null,
    'list-music': null,
    'songlist-detail-music': null,
    'leaderboard-music': null,
  }
  let globalInvalidPreference: string | null = null
  for (const surfaceId of COLLECTION_SURFACE_IDS) {
    const resolution = resolveCollectionProvider(providers, preferences, surfaceId)
    resolved[surfaceId] = resolution.providerId
    invalidPreferences[surfaceId] = resolution.unavailablePreferenceId
    if (resolution.unavailablePreferenceId && resolution.unavailablePreferenceId === preferences.globalProviderId && !preferences.surfaceProviders?.[surfaceId]) {
      globalInvalidPreference = resolution.unavailablePreferenceId
    }
  }
  return {
    providers,
    preferences,
    resolved,
    invalidPreferences,
    globalInvalidPreference,
  }
}

export const providerSupportsSurface = (
  provider: CollectionProviderInfo,
  surfaceId: CollectionSurfaceId,
): boolean => provider.surfaces.includes(surfaceId)
