import {
  COLLECTION_COMMANDS,
  COLLECTION_SURFACE_IDS,
  COLLECTION_ERRORS,
  type CollectionCommand,
  type CollectionDispatchRequest,
  type CollectionGetItemsRequest,
  type CollectionItemsPage,
  type CollectionSurfaceId,
  type CollectionTarget,
  type MusicCollectionSnapshot,
  type MusicItemSummary,
} from './types'

export const MAX_ITEMS_PER_READ = 100
export const MAX_TARGET_KEYS = MAX_ITEMS_PER_READ
export const MAX_PLUGIN_MESSAGE_BYTES = 1024 * 1024
export const MAX_PLUGIN_REQUEST_BYTES = 256 * 1024

export class CollectionProtocolError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'CollectionProtocolError'
    this.code = code
  }
}

export const isCollectionSurfaceId = (value: unknown): value is CollectionSurfaceId => {
  return typeof value === 'string' && (COLLECTION_SURFACE_IDS as readonly string[]).includes(value)
}

export const isCollectionCommand = (value: unknown): value is CollectionCommand => {
  return typeof value === 'string' && (COLLECTION_COMMANDS as readonly string[]).includes(value)
}

export const byteLength = (value: unknown): number => {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export const assertMessageSize = (value: unknown, limit = MAX_PLUGIN_MESSAGE_BYTES) => {
  if (byteLength(value) > limit) {
    throw new CollectionProtocolError(COLLECTION_ERRORS.payloadTooLarge, 'Message exceeds the allowed size')
  }
}

export const isSafeKey = (value: unknown): value is string => {
  // eslint-disable-next-line no-control-regex
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f]/.test(value)
}

export const validateItemsRequest = (request: CollectionGetItemsRequest): CollectionGetItemsRequest => {
  if (!request || typeof request !== 'object') {
    throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Invalid item request')
  }
  const { revision, offset, limit } = request
  if (!Number.isInteger(revision) || revision < 0) {
    throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Invalid revision')
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Invalid offset')
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ITEMS_PER_READ) {
    throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, `limit must be between 1 and ${MAX_ITEMS_PER_READ}`)
  }
  return { revision, offset, limit }
}

export const validateTarget = (target: CollectionTarget | undefined): CollectionTarget | undefined => {
  if (target == null) return undefined
  switch (target.kind) {
    case 'collection':
    case 'selection':
      return target
    case 'item': {
      if (!Array.isArray(target.keys) || target.keys.length < 1 || target.keys.length > MAX_TARGET_KEYS) {
        throw new CollectionProtocolError(COLLECTION_ERRORS.invalidTarget, 'Invalid item target')
      }
      if (!target.keys.every(isSafeKey)) {
        throw new CollectionProtocolError(COLLECTION_ERRORS.invalidKey, 'Invalid item key')
      }
      return { kind: 'item', keys: [...new Set(target.keys)] }
    }
    default:
      throw new CollectionProtocolError(COLLECTION_ERRORS.invalidTarget, 'Unknown target kind')
  }
}

export const validateDispatchRequest = (request: CollectionDispatchRequest): CollectionDispatchRequest => {
  if (!request || typeof request !== 'object') {
    throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Invalid dispatch request')
  }
  if (!Number.isInteger(request.revision) || request.revision < 0) {
    throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Invalid revision')
  }
  if (!isCollectionCommand(request.command)) {
    throw new CollectionProtocolError(COLLECTION_ERRORS.unknownCommand, 'Unknown collection command')
  }
  if (request.optionId != null && (typeof request.optionId !== 'string' || request.optionId.length > 200)) {
    throw new CollectionProtocolError(COLLECTION_ERRORS.invalidOption, 'Invalid option id')
  }
  return {
    revision: request.revision,
    command: request.command,
    target: validateTarget(request.target),
    optionId: request.optionId,
    value: request.value,
  }
}

export const validateMusicItemSummary = (item: unknown): MusicItemSummary => {
  if (item == null || typeof item !== 'object') {
    throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Invalid music item')
  }
  const raw = item as Record<string, unknown>
  if (!isSafeKey(raw.key)) throw new CollectionProtocolError(COLLECTION_ERRORS.invalidKey, 'Invalid music item key')
  if (typeof raw.name !== 'string' || raw.name.length > 500) {
    throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Invalid music item name')
  }
  if (raw.available !== true && raw.available !== false) {
    throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Invalid music item availability')
  }
  return raw as unknown as MusicItemSummary
}

export const validateItemsPage = (
  page: CollectionItemsPage,
  request: CollectionGetItemsRequest,
): CollectionItemsPage => {
  if (page == null || typeof page !== 'object') {
    throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Invalid items page')
  }
  if (page.revision !== request.revision) {
    throw new CollectionProtocolError(COLLECTION_ERRORS.staleRevision, 'Items revision does not match the request')
  }
  if (!Number.isInteger(page.offset) || page.offset !== request.offset) {
    throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Items page offset does not match the request')
  }
  if (!Array.isArray(page.items) || page.items.length > MAX_ITEMS_PER_READ) {
    throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Items page exceeds the read limit')
  }
  page.items.forEach(validateMusicItemSummary)
  return {
    revision: page.revision,
    offset: page.offset,
    total: Number.isFinite(page.total) && page.total >= 0 ? page.total : 0,
    items: page.items,
  }
}

export const validateSnapshot = (snapshot: MusicCollectionSnapshot): MusicCollectionSnapshot => {
  if (snapshot == null || typeof snapshot !== 'object') {
    throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Invalid collection snapshot')
  }
  if (!isCollectionSurfaceId(snapshot.surfaceId)) {
    throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Invalid collection surface')
  }
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 0) {
    throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Invalid collection revision')
  }
  if (typeof snapshot.contextId !== 'string' || snapshot.contextId.length === 0 || snapshot.contextId.length > 200) {
    throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Invalid collection context')
  }
  if (!['idle', 'loading', 'ready', 'empty', 'error'].includes(snapshot.status)) {
    throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Invalid collection status')
  }
  assertMessageSize(snapshot)
  return snapshot
}
