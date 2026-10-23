import type {
  CollectionCommand,
  CollectionCommandOptions,
  CollectionDispatchRequest,
  CollectionFacet,
  CollectionQuery,
  CollectionSurfaceId,
  MusicItemSummary,
} from '@common/collection/types'

export interface CollectionAdapterPageInfo {
  title?: string
  subtitle?: string
  coverUrl?: string
  total: number
  page: number
  pageCount: number
  pageSize: number
  facets: CollectionFacet[]
  status: 'ready' | 'empty' | 'error'
  error?: { code: string, message: string }
}

export interface AdapterSelection {
  mode: 'none' | 'some' | 'all'
  keys: string[]
  excludedKeys: string[]
}

export interface CollectionAdapter {
  readonly surfaceId: CollectionSurfaceId
  readonly commands: readonly CollectionCommand[]
  /** Whether the adapter can honour setSort/setFilters. */
  readonly supportsSort: boolean
  readonly supportsFilters: boolean
  /** Load (or reload) the first page metadata for the current context. */
  refresh: (query: CollectionQuery) => Promise<CollectionAdapterPageInfo>
  /** Read at most `limit` summaries starting at `offset`. */
  getItems: (offset: number, limit: number, query: CollectionQuery) => Promise<MusicItemSummary[]>
  dispatch: (request: CollectionDispatchRequest, query: CollectionQuery, selection: AdapterSelection) => Promise<boolean>
  getOptions: (request: CollectionDispatchRequest, query: CollectionQuery, selection: AdapterSelection) => Promise<CollectionCommandOptions | null>
  keyForMusic?: (info: LX.Music.MusicInfo) => string | undefined
  hasKey: (key: string) => boolean
  /** Release listeners when the surface unmounts. */
  dispose?: () => void
}

export interface CollectionMountOptions {
  surfaceId: CollectionSurfaceId
  contextId: string
  params: Record<string, string>
  adapter: CollectionAdapter
}
