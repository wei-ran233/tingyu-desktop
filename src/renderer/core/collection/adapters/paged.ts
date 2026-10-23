import type { CollectionFacet, CollectionQuery, MusicItemSummary } from '@common/collection/types'
import type { CollectionAdapterPageInfo } from '../types'
import { BaseCollectionAdapter } from './base'

export interface PagedSource {
  /** Page size reported by the remote source. */
  pageSize: number
  load: (page: number) => Promise<{ items: LX.Music.MusicInfo[], total: number, pageCount: number }>
  pageItems: () => LX.Music.MusicInfo[]
  total: () => number
  page: () => number
  setPage?: (page: number) => Promise<void>
  facets?: CollectionFacet[]
  title?: string
  subtitle?: string
  coverUrl?: string
  supportsSort: boolean
  supportsFilters: boolean
}

/**
 * Adapter for paginated remote collections (search, songlist detail,
 * leaderboard). Reads are always capped to one protocol page (<= 100 items)
 * and the remote source is asked for its own pages on demand.
 */
export class PagedCollectionAdapter extends BaseCollectionAdapter {
  readonly commands: readonly any[]
  readonly supportsSort: boolean
  readonly supportsFilters: boolean
  readonly surfaceId: any
  private readonly source: PagedSource
  private page = 1
  private readonly pages = new Map<number, LX.Music.MusicInfo[]>()

  constructor(surfaceId: any, commands: readonly any[], source: PagedSource) {
    super()
    this.surfaceId = surfaceId
    this.commands = commands
    this.source = source
    this.page = Math.max(1, source.page() || 1)
    this.supportsSort = source.supportsSort
    this.supportsFilters = source.supportsFilters
  }

  async refresh(query: CollectionQuery): Promise<CollectionAdapterPageInfo> {
    this.pages.clear()
    const page = this.page
    const result = await this.source.load(page)
    this.remember(result.items)
    this.pages.set(page, result.items)
    return this.buildInfo({
      total: result.total,
      page,
      pageCount: result.pageCount,
      pageSize: this.source.pageSize,
      status: result.items.length ? 'ready' : 'empty',
      title: this.source.title,
      subtitle: this.source.subtitle,
      coverUrl: this.source.coverUrl,
      facets: this.source.facets ?? [],
    })
  }

  async getItems(offset: number, limit: number): Promise<MusicItemSummary[]> {
    const pageSize = this.source.pageSize
    const firstPage = Math.floor(offset / pageSize) + 1
    const lastPage = Math.floor((offset + limit - 1) / pageSize) + 1
    const collected: LX.Music.MusicInfo[] = []
    for (let page = firstPage; page <= lastPage; page++) {
      let items = this.pages.get(page)
      if (!items) {
        const result = await this.source.load(page)
        items = result.items
        this.pages.set(page, items)
        this.remember(items)
      }
      collected.push(...items)
    }
    const startInFirst = offset - (firstPage - 1) * pageSize
    return this.summary(collected.slice(startInFirst, startInFirst + limit))
  }

  async allItems(): Promise<LX.Music.MusicInfo[]> {
    const first = await this.source.load(1)
    this.remember(first.items)
    const all = [...first.items]
    const pageCount = Math.max(1, first.pageCount)
    for (let page = 2; page <= pageCount; page++) {
      const result = await this.source.load(page)
      this.remember(result.items)
      all.push(...result.items)
    }
    return all
  }

  pageItems(): LX.Music.MusicInfo[] {
    return this.remember(this.pages.get(this.page) ?? [])
  }

  async dispatch(request: Parameters<BaseCollectionAdapter['dispatch']>[0], query: CollectionQuery, selection: Parameters<BaseCollectionAdapter['dispatch']>[2]): Promise<boolean> {
    if (request.command === 'setPage') {
      const page = Number(request.value)
      if (!Number.isInteger(page) || page < 1) return false
      this.page = page
      return true
    }
    if (request.command === 'loadMore') return true
    if (request.command === 'setSort' || request.command === 'setFilters') return false
    return super.dispatch(request, query, selection)
  }

  protected sortOptions(): CollectionFacet[] {
    return []
  }
}
