import type { CollectionCommandOptions, CollectionFacet, CollectionQuery, MusicItemSummary } from '@common/collection/types'
import { COLLECTION_SURFACE_COMMANDS, COLLECTION_ERRORS } from '@common/collection/types'
import { playList } from '@renderer/core/player/action'
import { LIST_IDS } from '@common/constants'
import { CollectionProtocolError } from '@common/collection/validation'
import { getListMusics, getUserLists, moveListMusics } from '@renderer/store/list/action'
import { userLists } from '@renderer/store/list/state'
import { getListMeta } from '@renderer/store/list/listMeta'
import type { CollectionAdapterPageInfo } from '../types'
import { BaseCollectionAdapter } from './base'
import {
  buildReplaceOptions,
  confirmRemoveFromCurrentList,
  confirmReplaceSource,
  playlistOptions,
  removeFromPlaylist,
  replaceMusicInList,
  resolveOptionById,
  takeSourceCandidate,
} from '../music'

type SortKey = 'default' | 'name' | 'singer' | 'album' | 'source'

const SORT_KEYS: Record<string, SortKey> = {
  default: 'default',
  name: 'name',
  singer: 'singer',
  album: 'album',
  source: 'source',
}

export class ListCollectionAdapter extends BaseCollectionAdapter {
  readonly surfaceId = 'list-music' as const
  readonly commands = COLLECTION_SURFACE_COMMANDS['list-music']
  readonly supportsSort = true
  readonly supportsFilters = true
  private readonly listId: string
  private all: LX.Music.MusicInfo[] = []
  private sort: SortKey = 'default'
  private filter: string = 'all'

  constructor(params: Record<string, string>) {
    super()
    this.listId = params.listId || 'default'
  }

  private sortFacet(): CollectionFacet {
    return {
      id: 'sort',
      label: window.i18n.t('music_list_sort') || 'Sort',
      value: this.sort,
      options: [
        { id: 'default', label: window.i18n.t('sort__default') || 'Default' },
        { id: 'name', label: window.i18n.t('music_name') },
        { id: 'singer', label: window.i18n.t('music_singer') },
        { id: 'album', label: window.i18n.t('music_album') },
        { id: 'source', label: window.i18n.t('source') || 'Source' },
      ],
    }
  }

  private title(): string {
    if (this.listId === LIST_IDS.DEFAULT) return window.i18n.t('list__name_default')
    if (this.listId === LIST_IDS.LOVE) return window.i18n.t('list__name_love')
    if (this.listId === LIST_IDS.LOCAL) return window.i18n.t('list__name_local')
    return userLists.find(list => list.id === this.listId)?.name ?? this.listId
  }

  private sorted(): LX.Music.MusicInfo[] {
    const list = this.filter === 'local'
      ? this.all.filter(item => item.source === 'local')
      : this.all
    if (this.sort === 'default') return list
    const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
    const valueOf = (item: LX.Music.MusicInfo): string => {
      switch (this.sort) {
        case 'name': return item.name
        case 'singer': return item.singer
        case 'album': return item.meta?.albumName ?? ''
        case 'source': return item.source
        default: return ''
      }
    }
    return [...list].sort((a, b) => collator.compare(valueOf(a), valueOf(b)))
  }

  async refresh(query: CollectionQuery): Promise<CollectionAdapterPageInfo> {
    await getUserLists()
    this.all = await getListMusics(this.listId)
    this.resetIndex(this.all)
    const sort = query.sort as SortKey | undefined
    if (sort && Object.prototype.hasOwnProperty.call(SORT_KEYS, sort)) this.sort = sort
    const total = this.sorted().length
    const meta = getListMeta(this.listId)
    const cover = this.all.find(item => item.meta?.picUrl)?.meta?.picUrl ?? undefined
    return this.buildInfo({
      total,
      page: 1,
      pageCount: 1,
      pageSize: 100,
      title: this.title(),
      subtitle: meta.subtitle ?? undefined,
      coverUrl: cover,
      facets: [this.sortFacet(), {
        id: 'filters',
        label: window.i18n.t('source'),
        value: this.filter,
        options: [{ id: 'all', label: window.i18n.t('collection_filter_all') }, { id: 'local', label: window.i18n.t('list__name_local') }],
      }],
      status: total ? 'ready' : 'empty',
    })
  }

  async getItems(offset: number, limit: number): Promise<MusicItemSummary[]> {
    return this.summary(this.sorted().slice(offset, offset + limit))
  }

  async allItems(): Promise<LX.Music.MusicInfo[]> {
    return this.sorted()
  }

  pageItems(): LX.Music.MusicInfo[] {
    return this.sorted()
  }

  protected currentListId(): string {
    return this.listId
  }

  async getOptions(
    request: Parameters<BaseCollectionAdapter['dispatch']>[0],
    query: CollectionQuery,
    selection: Parameters<BaseCollectionAdapter['dispatch']>[2],
  ): Promise<CollectionCommandOptions | null> {
    if (request.command === 'replaceSource') {
      const list = this.resolveTargets(request, selection)
      return buildReplaceOptions(`list:${this.listId}:${request.revision}:${list[0] ? this.keyForMusic(list[0]) : ''}`, list)
    }
    return super.getOptions(request, query, selection)
  }

  async dispatch(request: Parameters<BaseCollectionAdapter['dispatch']>[0], query: CollectionQuery, selection: Parameters<BaseCollectionAdapter['dispatch']>[2]): Promise<boolean> {
    switch (request.command) {
      case 'playItem': {
        const target = this.resolveTargets(request, selection)[0]
        const index = this.all.findIndex(item => item.id === target?.id && item.source === target?.source)
        if (index < 0) throw new CollectionProtocolError(COLLECTION_ERRORS.invalidKey, 'Song is no longer in this list')
        playList(this.listId, index)
        return true
      }
      case 'setSort': {
        const key = String(request.value)
        if (!Object.prototype.hasOwnProperty.call(SORT_KEYS, key)) throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Unknown sort option')
        const next = SORT_KEYS[key]
        this.sort = next
        return true
      }
      case 'setFilters': {
        const value = request.value as { localOnly?: boolean } | undefined
        if (!value || typeof value.localOnly !== 'boolean' || Object.keys(value).some(key => key !== 'localOnly')) throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Invalid filters')
        this.filter = value.localOnly ? 'local' : 'all'
        return true
      }
      case 'moveToPlaylist': {
        const option = resolveOptionById(await playlistOptions('moveToPlaylist'), request.optionId)
        if (!option) throw new CollectionProtocolError(COLLECTION_ERRORS.invalidOption, 'Unknown playlist option')
        const list = await this.resolveAllTargets(request, selection)
        await moveListMusics(this.listId, option, list)
        return true
      }
      case 'removeFromCurrentList': {
        if (this.listId === LIST_IDS.LOCAL) return false
        const list = await this.resolveAllTargets(request, selection)
        if (!await confirmRemoveFromCurrentList(list.length)) return false
        await removeFromPlaylist(this.listId, list)
        return true
      }
      case 'replaceSource': {
        const list = this.resolveTargets(request, selection)
        const target = list[0]
        if (!target) return false
        const candidate = takeSourceCandidate(`list:${this.listId}:${request.revision}:${list[0] ? this.keyForMusic(list[0]) : ''}`, request.optionId)
        if (!candidate) throw new CollectionProtocolError(COLLECTION_ERRORS.invalidOption, 'Unknown source option')
        if (!await confirmReplaceSource(target.name)) return false
        await replaceMusicInList(this.listId, target, candidate)
        return true
      }
      case 'setPage':
      case 'loadMore':
        return true
      default:
        return super.dispatch(request, query, selection)
    }
  }
}
