import type {
  CollectionCommandOptions,
  CollectionDispatchRequest,
  CollectionFacet,
  CollectionQuery,
  CollectionSurfaceId,
  MusicItemSummary,
} from '@common/collection/types'
import { CollectionProtocolError } from '@common/collection/validation'
import { COLLECTION_ERRORS } from '@common/collection/types'
import type { AdapterSelection, CollectionAdapter, CollectionAdapterPageInfo } from '../types'
import {
  addToLater,
  addToNext,
  addToPlaylist,
  dislikeMusic,
  downloadMusic,
  downloadOptions,
  musicKey,
  openMusicSource,
  playCollectionInfo,
  playMusicInfo,
  playlistOptions,
  removeFromPlaylist,
  resolveOptionById,
  toMusicSummary,
  toggleLoveInfo,
} from '../music'
import { useRouter } from '@common/utils/vueRouter'
import { searchText } from '@renderer/store/search/state'

export abstract class BaseCollectionAdapter implements CollectionAdapter {
  abstract readonly surfaceId: CollectionSurfaceId
  abstract readonly commands: readonly any[]
  abstract readonly supportsSort: boolean
  abstract readonly supportsFilters: boolean

  protected index = new Map<string, LX.Music.MusicInfo>()
  private readonly keys = new Map<string, string>()

  keyForMusic(info: LX.Music.MusicInfo): string | undefined { return this.keys.get(musicKey(info)) }
  hasKey(key: string): boolean { return this.index.has(key) }

  protected resetIndex(list: LX.Music.MusicInfo[]) {
    this.index.clear()
    this.remember(list)
    const current = new Set(list.map(musicKey))
    for (const identity of this.keys.keys()) if (!current.has(identity)) this.keys.delete(identity)
  }

  protected remember(list: LX.Music.MusicInfo[]) {
    for (const item of list) {
      const identity = musicKey(item)
      const key = this.keys.get(identity) ?? globalThis.crypto.randomUUID()
      this.keys.set(identity, key)
      this.index.set(key, item)
    }
    return list
  }

  protected find(key: string): LX.Music.MusicInfo | undefined {
    return this.index.get(key)
  }

  protected summary(list: LX.Music.MusicInfo[]): MusicItemSummary[] {
    return this.remember(list).map(item => ({ ...toMusicSummary(item), key: this.keyForMusic(item)! }))
  }

  abstract refresh(query: CollectionQuery): Promise<CollectionAdapterPageInfo>
  abstract getItems(offset: number, limit: number, query: CollectionQuery): Promise<MusicItemSummary[]>
  /** Whole collection, used only for collection-wide commands. */
  abstract allItems(): Promise<LX.Music.MusicInfo[]>
  /** Items currently loaded for the active page. */
  abstract pageItems(): LX.Music.MusicInfo[]

  protected forbidden(command: string): never {
    throw new CollectionProtocolError(COLLECTION_ERRORS.unsupportedCommand, `Command is not supported on this surface: ${command}`)
  }

  protected resolveTargets(
    request: CollectionDispatchRequest,
    selection: AdapterSelection,
  ): LX.Music.MusicInfo[] {
    const target = request.target
    if (!target) return []
    if (target.kind === 'item') {
      return target.keys
        .map(key => this.find(key))
        .filter((item): item is LX.Music.MusicInfo => item != null)
    }
    if (target.kind === 'selection') {
      if (selection.mode === 'all') return this.pageItems().filter(item => !selection.excludedKeys.includes(this.keyForMusic(item)!))
      return selection.keys
        .map(key => this.find(key))
        .filter((item): item is LX.Music.MusicInfo => item != null)
    }
    return this.pageItems()
  }

  protected async resolveAllTargets(
    request: CollectionDispatchRequest,
    selection: AdapterSelection,
  ): Promise<LX.Music.MusicInfo[]> {
    if (request.target?.kind === 'selection' && selection.mode === 'all') {
      return (await this.allItems()).filter(item => !selection.excludedKeys.includes(this.keyForMusic(item)!))
    }
    if (request.target?.kind === 'collection') return this.allItems()
    return this.resolveTargets(request, selection)
  }

  async getOptions(
    request: CollectionDispatchRequest,
    query: CollectionQuery,
    selection: AdapterSelection,
  ): Promise<CollectionCommandOptions | null> {
    switch (request.command) {
      case 'addToPlaylist':
      case 'moveToPlaylist':
        return playlistOptions(request.command)
      case 'download':
        return downloadOptions()
      default:
        return null
    }
  }

  protected async runCommonCommand(
    request: CollectionDispatchRequest,
    selection: AdapterSelection,
  ): Promise<boolean | null> {
    const list = await this.resolveAllTargets(request, selection)
    switch (request.command) {
      case 'playItem':
        await playMusicInfo(list, 0)
        return true
      case 'playCollection':
        await playCollectionInfo(await this.resolveAllTargets(request, selection), 0)
        return true
      case 'playNext':
        addToNext(list, this.currentListId() || undefined)
        return true
      case 'playLater':
        addToLater(list, this.currentListId() || undefined)
        return true
      case 'toggleLove':
        await toggleLoveInfo(list)
        return true
      case 'addToPlaylist': {
        const option = resolveOptionById(await playlistOptions('addToPlaylist'), request.optionId)
        if (!option) throw new CollectionProtocolError(COLLECTION_ERRORS.invalidOption, 'Unknown playlist option')
        await addToPlaylist(await this.resolveAllTargets(request, selection), option)
        return true
      }
      case 'download': {
        const option = resolveOptionById(await downloadOptions(), request.optionId)
        if (!option) throw new CollectionProtocolError(COLLECTION_ERRORS.invalidOption, 'Unknown quality option')
        await downloadMusic(await this.resolveAllTargets(request, selection), option)
        return true
      }
      case 'dislike':
        await dislikeMusic(list)
        return true
      case 'searchItem': {
        const item = list[0]
        if (!item) return false
        searchText.value = `${item.name} ${item.singer}`
        void useRouter().push({ path: '/search', query: { text: searchText.value } })
        return true
      }
      case 'openSourceDetail': {
        if (list[0]) openMusicSource(list[0])
        return true
      }
      default:
        return null
    }
  }

  async dispatch(
    request: CollectionDispatchRequest,
    query: CollectionQuery,
    selection: AdapterSelection,
  ): Promise<boolean> {
    const common = await this.runCommonCommand(request, selection)
    if (common != null) return common
    switch (request.command) {
      case 'refresh':
        return true
      case 'removeFromCurrentList':
        await removeFromPlaylist(this.currentListId(), this.resolveTargets(request, selection))
        return true
      default:
        return this.forbidden(request.command)
    }
  }

  protected currentListId(): string {
    return ''
  }

  protected sortOptions(): CollectionFacet[] {
    return []
  }

  protected filterOptions(): CollectionFacet[] {
    return []
  }

  protected buildInfo(partial: Partial<CollectionAdapterPageInfo> & { total: number, page: number, pageCount: number }): CollectionAdapterPageInfo {
    const info: CollectionAdapterPageInfo = {
      facets: [...this.sortOptions(), ...this.filterOptions()],
      status: partial.total > 0 ? 'ready' : 'empty',
      ...partial,
      pageSize: partial.pageSize ?? 30,
    }
    return info
  }

  dispose() { this.index.clear(); this.keys.clear() }
}
