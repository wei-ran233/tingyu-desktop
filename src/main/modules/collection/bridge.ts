import type { ThemeSnapshot } from '@common/theme/types'
import type { MusicCollectionSnapshot } from '@common/collection/types'

export interface ForwardedPluginRequest {
  requestId: string
  pluginId: string
  providerId: string
  surfaceId: string
  contextId: string
  payload: {
    kind: 'ready' | 'snapshot' | 'items' | 'dispatch' | 'options' | 'theme' | 'navigate' | 'identity' | 'storage.get' | 'storage.set' | 'storage.remove' | 'settings.get' | 'settings.set' | 'anchor'
    body?: unknown
  }
}

export interface PluginViewIdentity {
  pluginId: string
  providerId?: string
  surfaceId?: string
  contextId?: string
  pageId?: string
}

export interface PluginViewPresentation {
  kind: 'collection' | 'page'
  ownerId: string
  identity: PluginViewIdentity
  entry: string
  bounds: Electron.Rectangle
}

export interface PluginHostPush {
  kind: 'snapshot' | 'theme'
  snapshot?: MusicCollectionSnapshot
  theme?: ThemeSnapshot
}
