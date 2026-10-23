import {
  COLLECTION_ERRORS,
  COLLECTION_SURFACE_COMMANDS,
  type CollectionCommandOptions,
  type CollectionDispatchRequest,
  type CollectionGetItemsRequest,
  type CollectionItemsPage,
  type CollectionProviderInfo,
  type CollectionQuery,
  type CollectionSurfaceId,
  type MusicCollectionSnapshot,
} from '@common/collection/types'
import {
  CollectionProtocolError,
  assertMessageSize,
  validateDispatchRequest,
  validateItemsRequest,
  validateMusicItemSummary,
  validateSnapshot,
} from '@common/collection/validation'
import type { AdapterSelection, CollectionAdapter, CollectionAdapterPageInfo } from './types'

export interface ControllerIdentity {
  pluginId: string
  providerId: string
  surfaceId: CollectionSurfaceId
  contextId: string
}

export interface MountOptions {
  surfaceId: CollectionSurfaceId
  contextId: string
  params: Record<string, string>
  adapter: CollectionAdapter
  provider: CollectionProviderInfo | null
}

type Listener = (snapshot: MusicCollectionSnapshot) => void
// Never reuse a version after unmount/remount: queued IPC from an old view must fail.
let revisionSequence = 0
let optionSequence = 0
const optionCommands = new Set(['addToPlaylist', 'moveToPlaylist', 'download', 'replaceSource'])
const targetCommands = new Set(['playItem', 'playCollection', 'playNext', 'playLater', 'toggleLove', 'addToPlaylist', 'moveToPlaylist', 'download', 'removeFromCurrentList', 'replaceSource', 'dislike', 'searchItem', 'openSourceDetail'])

export class CollectionController {
  readonly surfaceId: CollectionSurfaceId
  readonly contextId: string
  private readonly adapter: CollectionAdapter
  private provider: CollectionProviderInfo | null
  private revision = ++revisionSequence
  private status: MusicCollectionSnapshot['status'] = 'idle'
  private error: MusicCollectionSnapshot['error']
  private info: CollectionAdapterPageInfo | null = null
  private query: CollectionQuery = {}
  private readonly selected = new Set<string>()
  private readonly excluded = new Set<string>()
  private allSelected = false
  private playingKey: string | undefined
  private scrollAnchor: MusicCollectionSnapshot['scrollAnchor']
  private loadedCount = 0
  private readonly listeners = new Set<Listener>()
  private disposed = false
  private generation = 0
  private commands: Promise<void> = Promise.resolve()
  private readonly options = new Map<string, { revision: number, command: string, target: string, value: string }>()

  constructor(options: MountOptions) {
    this.surfaceId = options.surfaceId
    this.contextId = options.contextId
    this.adapter = options.adapter
    this.provider = options.provider
  }

  get identity(): ControllerIdentity | null {
    if (!this.provider) return null
    return { pluginId: this.provider.pluginId, providerId: this.provider.id, surfaceId: this.surfaceId, contextId: this.contextId }
  }

  matches(identity: { pluginId?: string, providerId?: string, surfaceId?: string, contextId?: string }): boolean {
    const own = this.identity
    return !!own && identity.pluginId === own.pluginId && identity.providerId === own.providerId &&
      identity.surfaceId === own.surfaceId && identity.contextId === own.contextId
  }

  attachProvider(provider: CollectionProviderInfo | null) {
    this.provider = provider
    this.bump()
    this.emit()
  }

  async refresh(): Promise<void> {
    const generation = ++this.generation
    this.status = 'loading'
    this.error = undefined
    this.bump()
    this.emit()
    try {
      const info = await this.adapter.refresh(this.query)
      if (this.disposed || generation !== this.generation) return
      this.info = info
      this.status = info.status
      this.error = info.error
      this.loadedCount = Math.min(info.total, info.pageSize)
      for (const key of this.selected) if (!this.adapter.hasKey(key)) this.selected.delete(key)
      for (const key of this.excluded) if (!this.adapter.hasKey(key)) this.excluded.delete(key)
    } catch (error: any) {
      if (this.disposed || generation !== this.generation) return
      this.status = 'error'
      this.error = { code: error?.code ?? 'load_failed', message: error?.message ?? 'Load failed' }
    }
    this.bump()
    this.emit()
  }

  setPlayingKey(key: string | undefined) {
    if (this.playingKey === key) return
    this.playingKey = key
    this.emit()
  }

  snapshot(): MusicCollectionSnapshot {
    const total = this.info?.total ?? 0
    const count = this.allSelected ? Math.max(0, total - this.excluded.size) : this.selected.size
    return validateSnapshot({
      revision: this.revision,
      surfaceId: this.surfaceId,
      contextId: this.contextId,
      title: this.info?.title,
      subtitle: this.info?.subtitle,
      coverUrl: this.info?.coverUrl,
      total,
      loadedCount: this.loadedCount,
      page: this.info?.page,
      pageCount: this.info?.pageCount,
      pageSize: this.info?.pageSize,
      selection: { mode: count === 0 ? 'none' : this.allSelected && this.excluded.size === 0 ? 'all' : 'some', count },
      playingKey: this.playingKey,
      query: { ...this.query },
      facets: this.info?.facets ?? [],
      commands: COLLECTION_SURFACE_COMMANDS[this.surfaceId].filter(command => this.adapter.commands.includes(command)).map(command => ({
        id: command,
        label: command,
        enabled: this.status !== 'loading' && (command === 'refresh' || total > 0),
        multi: !['playItem', 'replaceSource', 'searchItem', 'openSourceDetail'].includes(command),
      })),
      status: this.status,
      error: this.error,
      scrollAnchor: this.scrollAnchor,
    })
  }

  private assertRevision(revision: number) {
    if (this.disposed || revision !== this.revision) throw new CollectionProtocolError(COLLECTION_ERRORS.staleRevision, 'Collection revision is stale')
  }

  async getItems(input: CollectionGetItemsRequest): Promise<CollectionItemsPage> {
    assertMessageSize(input)
    const request = validateItemsRequest(input)
    this.assertRevision(request.revision)
    const items = this.status === 'ready'
      ? await this.adapter.getItems(request.offset, request.limit, this.query)
      : []
    this.assertRevision(request.revision)
    items.forEach(validateMusicItemSummary)
    const result = {
      revision: this.revision,
      offset: request.offset,
      total: this.info?.total ?? 0,
      items: items.map(item => ({ ...item, selected: this.isSelected(item.key) })),
    }
    if (items.length > request.limit) throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Adapter exceeded read limit')
    assertMessageSize(result)
    this.loadedCount = Math.min(this.info?.total ?? 0, Math.max(this.loadedCount, request.offset + items.length))
    return result
  }

  private validateCommand(input: CollectionDispatchRequest): CollectionDispatchRequest {
    assertMessageSize(input)
    const request = validateDispatchRequest(input)
    this.assertRevision(request.revision)
    if (!COLLECTION_SURFACE_COMMANDS[this.surfaceId].includes(request.command) || !this.adapter.commands.includes(request.command)) {
      throw new CollectionProtocolError(COLLECTION_ERRORS.unsupportedCommand, 'Unsupported command')
    }
    if (targetCommands.has(request.command) && !request.target) throw new CollectionProtocolError(COLLECTION_ERRORS.invalidTarget, 'Explicit target required')
    if (request.target?.kind === 'item' && request.target.keys.some(key => !this.adapter.hasKey(key))) {
      throw new CollectionProtocolError(COLLECTION_ERRORS.invalidKey, 'Key does not belong to this collection')
    }
    if (['playItem', 'replaceSource', 'searchItem', 'openSourceDetail'].includes(request.command) &&
      (request.target?.kind !== 'item' || request.target.keys.length !== 1)) {
      throw new CollectionProtocolError(COLLECTION_ERRORS.invalidTarget, 'Command requires one item')
    }
    if (request.command === 'setPage' && (!Number.isInteger(request.value) || Number(request.value) < 1 || Number(request.value) > (this.info?.pageCount ?? 1))) {
      throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Invalid page')
    }
    if (request.command === 'setSort' && !this.adapter.supportsSort) throw new CollectionProtocolError(COLLECTION_ERRORS.unsupportedCommand, 'Sorting unavailable')
    if (request.command === 'setFilters' && !this.adapter.supportsFilters) throw new CollectionProtocolError(COLLECTION_ERRORS.unsupportedCommand, 'Filtering unavailable')
    if (request.command !== 'refresh' && this.status !== 'ready' && this.status !== 'empty') throw new CollectionProtocolError(COLLECTION_ERRORS.unavailable, 'Collection is not ready')
    return request
  }

  async dispatch(input: CollectionDispatchRequest): Promise<{ revision: number, changed: boolean }> {
    // Serialize effects and revalidate on execution, so two requests based on one
    // snapshot cannot both perform a destructive operation.
    const run = this.commands.then(async() => this.execute(input))
    this.commands = run.then(() => {}, () => {})
    return run
  }

  private async execute(input: CollectionDispatchRequest): Promise<{ revision: number, changed: boolean }> {
    const request = this.validateCommand(input)
    if (request.command === 'select') {
      if (request.target?.kind !== 'item' || !['add', 'remove', 'toggle'].includes(String(request.value))) {
        throw new CollectionProtocolError(COLLECTION_ERRORS.invalidTarget, 'Selection requires item keys and a selection action')
      }
      for (const key of request.target.keys) {
        const selected = request.value === 'add' || (request.value === 'toggle' && !this.isSelected(key))
        if (this.allSelected) {
          if (selected) this.excluded.delete(key)
          else this.excluded.add(key)
        } else if (selected) this.selected.add(key)
        else this.selected.delete(key)
      }
    } else if (request.command === 'selectAll' || request.command === 'clearSelection') {
      this.clearSelection()
      this.allSelected = request.command === 'selectAll'
    } else {
      if (optionCommands.has(request.command)) {
        const option = request.optionId ? this.options.get(request.optionId) : undefined
        if (!option || option.revision !== this.revision || option.command !== request.command || option.target !== JSON.stringify(request.target)) {
          throw new CollectionProtocolError(COLLECTION_ERRORS.invalidOption, 'Option was not issued for this command and target')
        }
        request.optionId = option.value
      }
      this.bump()
      const changed = await this.adapter.dispatch(request, this.query, this.selection())
      if (this.disposed) return { revision: this.revision, changed }
      if (request.command === 'setSort') this.query = { ...this.query, sort: request.value }
      if (request.command === 'setFilters') this.query = { ...this.query, filters: request.value }
      if (['refresh', 'setSort', 'setFilters', 'removeFromCurrentList', 'moveToPlaylist', 'replaceSource'].includes(request.command)) {
        this.clearSelection()
        if (request.command !== 'setSort') this.scrollAnchor = undefined
      }
      if (['setPage', 'refresh', 'setSort', 'setFilters', 'removeFromCurrentList', 'moveToPlaylist', 'replaceSource'].includes(request.command)) await this.refresh()
      else this.emit()
      return { revision: this.revision, changed }
    }
    this.bump()
    this.emit()
    return { revision: this.revision, changed: true }
  }

  async getOptions(input: CollectionDispatchRequest): Promise<CollectionCommandOptions | null> {
    const request = this.validateCommand(input)
    const options = await this.adapter.getOptions(request, this.query, this.selection())
    this.assertRevision(request.revision)
    if (!options) return null
    assertMessageSize(options)
    if (options.options.length > 1000) throw new CollectionProtocolError(COLLECTION_ERRORS.payloadTooLarge, 'Too many options')
    // A repeated options request replaces previous grants for this action.
    for (const [id, value] of this.options) if (value.command === request.command) this.options.delete(id)
    return {
      ...options,
      options: options.options.map(option => {
        const id = `option-${++optionSequence}`
        if (!option.disabled) this.options.set(id, { revision: this.revision, command: request.command, target: JSON.stringify(request.target), value: option.id })
        return { ...option, id }
      }),
    }
  }

  private isSelected(key: string) { return this.allSelected ? !this.excluded.has(key) : this.selected.has(key) }
  private selection(): AdapterSelection { return { mode: this.allSelected ? 'all' : this.selected.size ? 'some' : 'none', keys: [...this.selected], excludedKeys: [...this.excluded] } }
  private clearSelection() { this.allSelected = false; this.selected.clear(); this.excluded.clear() }
  private bump() { this.revision = ++revisionSequence; this.options.clear() }
  private emit() {
    if (this.disposed) return
    const snapshot = this.snapshot()
    for (const listener of this.listeners) {
      try { listener(snapshot) } catch (error) { console.warn('[collection] snapshot listener failed', error) }
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => { this.listeners.delete(listener) }
  }

  setScrollAnchor(anchor: { offset: number, key?: string }) { this.scrollAnchor = anchor }
  get currentProvider() { return this.provider }
  get currentInfo() { return this.info }
  get adapterInstance() { return this.adapter }
  dispose() { this.disposed = true; this.generation++; this.listeners.clear(); this.options.clear(); this.adapter.dispose?.() }
}
