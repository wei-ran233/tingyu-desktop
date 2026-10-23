import type { CollectionController } from './controller'

interface CollectionSession {
  id: string
  controller?: CollectionController
}

// Keep a bounded working set across route changes. Eviction drops controller
// state deliberately; it must never create an unbounded song-object cache.
const sessions = new Map<string, CollectionSession>()
const MAX_SESSIONS = 8
export const getCollectionSession = (fingerprint: string): CollectionSession => {
  const session = sessions.get(fingerprint) ?? { id: globalThis.crypto.randomUUID() }
  sessions.delete(fingerprint)
  sessions.set(fingerprint, session)
  while (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value!
    sessions.get(oldest)?.controller?.dispose()
    sessions.delete(oldest)
  }
  return session
}
