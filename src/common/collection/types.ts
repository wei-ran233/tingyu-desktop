export type CollectionSurfaceId =
  | 'search-music'
  | 'list-music'
  | 'songlist-detail-music'
  | 'leaderboard-music'

export const COLLECTION_SURFACE_IDS: readonly CollectionSurfaceId[] = [
  'search-music',
  'list-music',
  'songlist-detail-music',
  'leaderboard-music',
]

export const COLLECTION_SURFACE_LABELS: Record<CollectionSurfaceId, string> = {
  'search-music': 'collection_surface_search',
  'list-music': 'collection_surface_list',
  'songlist-detail-music': 'collection_surface_songlist',
  'leaderboard-music': 'collection_surface_leaderboard',
}

export type CollectionCommand =
  | 'playItem'
  | 'playCollection'
  | 'playNext'
  | 'playLater'
  | 'select'
  | 'selectAll'
  | 'clearSelection'
  | 'setSort'
  | 'setFilters'
  | 'setPage'
  | 'loadMore'
  | 'refresh'
  | 'toggleLove'
  | 'addToPlaylist'
  | 'moveToPlaylist'
  | 'download'
  | 'removeFromCurrentList'
  | 'replaceSource'
  | 'dislike'
  | 'searchItem'
  | 'openSourceDetail'

export const COLLECTION_COMMANDS: readonly CollectionCommand[] = [
  'playItem',
  'playCollection',
  'playNext',
  'playLater',
  'select',
  'selectAll',
  'clearSelection',
  'setSort',
  'setFilters',
  'setPage',
  'loadMore',
  'refresh',
  'toggleLove',
  'addToPlaylist',
  'moveToPlaylist',
  'download',
  'removeFromCurrentList',
  'replaceSource',
  'dislike',
  'searchItem',
  'openSourceDetail',
]

export interface MusicItemSummary {
  key: string
  name: string
  singer?: string
  album?: string
  interval?: string
  source?: string
  coverUrl?: string
  qualityTags?: string[]
  available: boolean
  selected?: boolean
}

export interface CollectionFacet {
  id: string
  label: string
  value?: string | number | boolean | null
  options?: Array<{ id: string, label: string }>
}

export interface CommandDescriptor {
  id: CollectionCommand
  label: string
  enabled: boolean
  reason?: string
  multi?: boolean
}

export interface CollectionSelection {
  mode: 'none' | 'some' | 'all'
  count: number
}

export interface CollectionQuery {
  sort?: unknown
  filters?: unknown
}

export interface CollectionError {
  code: string
  message: string
}

export interface MusicCollectionSnapshot {
  revision: number
  surfaceId: CollectionSurfaceId
  contextId: string
  title?: string
  subtitle?: string
  coverUrl?: string
  total: number
  loadedCount: number
  page?: number
  pageCount?: number
  pageSize?: number
  selection: CollectionSelection
  playingKey?: string
  query: CollectionQuery
  facets: CollectionFacet[]
  commands: CommandDescriptor[]
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error'
  error?: CollectionError
  /** Restored after a provider switch so the replacement view can scroll back. */
  scrollAnchor?: { offset: number, key?: string }
}

export interface CollectionGetItemsRequest {
  revision: number
  offset: number
  limit: number
}

export interface CollectionItemsPage {
  revision: number
  offset: number
  total: number
  items: MusicItemSummary[]
}

export type CollectionTarget =
  | { kind: 'item', keys: string[] }
  | { kind: 'selection' }
  | { kind: 'collection' }

export interface CollectionDispatchRequest {
  revision: number
  command: CollectionCommand
  target?: CollectionTarget
  optionId?: string
  value?: unknown
}

export interface CollectionCommandOption {
  id: string
  label: string
  description?: string
  disabled?: boolean
}

export interface CollectionCommandOptions {
  title?: string
  multiple?: boolean
  options: CollectionCommandOption[]
}

export interface CollectionDispatchResult {
  revision: number
  changed: boolean
  closeOptions?: boolean
}

export interface CollectionViewProvider {
  id: string
  displayName: string
  description?: string
  pluginId: string
  apiVersion: string
  surfaces: CollectionSurfaceId[]
  entry: string
  icon: string
}

export interface CollectionProviderRef {
  pluginId: string
  providerId: string
}

export interface CollectionProviderPreferences {
  /** Migration switch; disabled until desktop acceptance. */
  enabled?: boolean
  globalProviderId: string | null
  surfaceProviders: Partial<Record<CollectionSurfaceId, string | null>>
}

export interface CollectionProviderAvailability {
  available: boolean
  reason?: string
}

export interface CollectionProviderInfo extends CollectionViewProvider {
  /** Globally unique `pluginId/providerId` preference key. */
  qualifiedId: string
  enabled: boolean
  available: boolean
  unavailableReason?: string
  isOfficial: boolean
}

export interface CollectionProviderState {
  providers: CollectionProviderInfo[]
  preferences: CollectionProviderPreferences
  resolved: Record<CollectionSurfaceId, string | null>
  invalidPreferences: Record<CollectionSurfaceId, string | null>
  globalInvalidPreference: string | null
}

export const COLLECTION_ERRORS = {
  staleRevision: 'STALE_SNAPSHOT',
  invalidRequest: 'invalid_request',
  invalidKey: 'invalid_key',
  unknownCommand: 'unknown_command',
  unsupportedCommand: 'unsupported_command',
  invalidTarget: 'invalid_target',
  invalidOption: 'invalid_option',
  payloadTooLarge: 'payload_too_large',
  viewMismatch: 'view_mismatch',
  unavailable: 'unavailable',
  internal: 'internal_error',
} as const

export type CollectionErrorCode = typeof COLLECTION_ERRORS[keyof typeof COLLECTION_ERRORS]

export const HOST_RECOVERY_PROVIDER_ID = 'host-recovery'
export const OFFICIAL_PROVIDER_ID = 'official-list'
export const OFFICIAL_PLUGIN_ID = 'lx.official-list'
export const COLLECTION_PROTOCOL_VERSION = 1

export const toQualifiedProviderId = (pluginId: string, providerId: string): string => `${pluginId}/${providerId}`


export interface CollectionContextDescriptor {
  surfaceId: CollectionSurfaceId
  contextId: string
  params: Record<string, string>
}

export interface CollectionSurfaceCapabilities {
  commands: CollectionCommand[]
  supportsSort: boolean
  supportsFilters: boolean
  supportsPaging: boolean
  removable: boolean
}

export const COLLECTION_SURFACE_COMMANDS: Record<CollectionSurfaceId, CollectionCommand[]> = {
  'search-music': [
    'playItem', 'playCollection', 'playNext', 'playLater', 'select', 'selectAll', 'clearSelection',
    'setSort', 'setFilters', 'setPage', 'refresh', 'toggleLove', 'addToPlaylist', 'download', 'dislike',
    'searchItem', 'openSourceDetail',
  ],
  'list-music': [
    'playItem', 'playCollection', 'playNext', 'playLater', 'select', 'selectAll', 'clearSelection',
    'setSort', 'setFilters', 'loadMore', 'refresh', 'toggleLove', 'addToPlaylist', 'moveToPlaylist',
    'download', 'removeFromCurrentList', 'replaceSource', 'dislike', 'searchItem', 'openSourceDetail',
  ],
  'songlist-detail-music': [
    'playItem', 'playCollection', 'playNext', 'playLater', 'select', 'selectAll', 'clearSelection',
    'setSort', 'setFilters', 'setPage', 'refresh', 'toggleLove', 'addToPlaylist', 'download',
    'replaceSource', 'dislike', 'searchItem', 'openSourceDetail',
  ],
  'leaderboard-music': [
    'playItem', 'playCollection', 'playNext', 'playLater', 'select', 'selectAll', 'clearSelection',
    'setSort', 'setFilters', 'setPage', 'refresh', 'toggleLove', 'addToPlaylist', 'download',
    'replaceSource', 'dislike', 'searchItem', 'openSourceDetail',
  ],
}

export interface CollectionHostPreferences {
  globalProviderId: string | null
  surfaceProviders: Partial<Record<CollectionSurfaceId, string | null>>
}

export interface PluginCollectionSurfaceState {
  pluginId: string
  providerId: string
  surfaceId: CollectionSurfaceId
  contextId: string
  revision: number
}
