import { COLLECTION_EVENT_NAME, PLUGIN_EVENT_NAME } from '@common/ipcNames'
import { watch } from '@common/utils/vueTools'
import { BUILTIN_PAGES } from '@common/pages/registry'
import { rendererOn, rendererInvoke } from '@common/rendererIpc'
import { CollectionProtocolError } from '@common/collection/validation'
import { COLLECTION_ERRORS } from '@common/collection/types'
import type { PluginSettingsChange } from '@common/plugin/types'
import { type CollectionController } from './controller'
import router from '@renderer/router'
interface ForwardedPluginRequest {
  requestId: string
  pluginId: string
  providerId: string
  surfaceId: string
  contextId: string
  payload: { kind: string, body?: unknown }
}

const sendHost = (name: string, payload: unknown) => {
  void rendererInvoke(name, payload).catch(error => { console.warn('[collection] host message failed', error) })
}

const controllers = new Set<CollectionController>()
let installed = false

export interface PluginViewEvent {
  type: 'crashed' | 'recover'
  pluginId?: string
  providerId?: string
  surfaceId?: string
  at: number
}

export const registerCollectionController = (controller: CollectionController) => {
  controllers.add(controller)
  const unsubscribe = controller.subscribe(snapshot => {
    sendHost(COLLECTION_EVENT_NAME.publish_snapshot, { identity: controller.identity, snapshot })
  })
  return () => {
    unsubscribe()
    controllers.delete(controller)
  }
}

const findController = (request: ForwardedPluginRequest): CollectionController => {
  const match = [...controllers].find(controller => controller.matches(request))
  if (!match) throw new CollectionProtocolError(COLLECTION_ERRORS.viewMismatch, 'No matching collection view')
  return match
}

const respond = (requestId: string, result?: unknown, error?: unknown) => {
  sendHost(COLLECTION_EVENT_NAME.plugin_response, {
    requestId,
    result,
    error: error ? serializeError(error) : undefined,
  })
}

const serializeError = (error: unknown): string => {
  if (error && typeof error === 'object') {
    const code = (error as { code?: string }).code
    const message = (error as { message?: string }).message ?? 'Collection request failed'
    return code ? `${code}: ${message}` : message
  }
  return String(error)
}

const safeNavigate = (body: unknown) => {
  const path = (body as { path?: unknown })?.path
  if (typeof path !== 'string' || !BUILTIN_PAGES.some(page => page.path === path)) {
    throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Navigation must target a registered host page')
  }
  void router.push(path)
  return { ok: true }
}

export const installCollectionGateway = () => {
  if (installed) return
  installed = true
  rendererOn<{ type: string, path: string } & Partial<PluginSettingsChange>>(COLLECTION_EVENT_NAME.host_state, ({ params }) => {
    if (params.type === 'navigate') safeNavigate(params)
    if (params.type === 'settings') window.dispatchEvent(new CustomEvent('lx:plugin-settings-changed', { detail: params }))
    if (params.type === 'catalog') window.dispatchEvent(new Event('lx:collection-catalog-changed'))
  })
  watch(() => { window.i18n.t('search'); return window.i18n.locale }, locale => {
    sendHost(PLUGIN_EVENT_NAME.host_environment, { locale })
  }, { immediate: true })
  rendererOn<ForwardedPluginRequest>(COLLECTION_EVENT_NAME.plugin_request, ({ params }) => {
    const request = params
    void (async() => {
      try {
        const controller = findController(request)
        switch (request.payload.kind) {
          case 'ready':
            respond(request.requestId, { ok: true, revision: controller.snapshot().revision })
            return
          case 'snapshot':
            respond(request.requestId, controller.snapshot())
            return
          case 'items':
            respond(request.requestId, await controller.getItems(request.payload.body as never))
            return
          case 'anchor': {
            const body = request.payload.body as { offset?: unknown }
            const offset = body?.offset
            if (!Number.isInteger(offset) || Number(offset) < 0 || Number(offset) > controller.snapshot().total) {
              throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Invalid scroll anchor')
            }
            controller.setScrollAnchor({ offset: Number(offset) })
            respond(request.requestId, { ok: true })
            return
          }
          case 'dispatch':
            respond(request.requestId, await controller.dispatch(request.payload.body as never))
            return
          case 'options':
            respond(request.requestId, await controller.getOptions(request.payload.body as never))
            return
          case 'navigate':
            respond(request.requestId, safeNavigate(request.payload.body))
            return
          default:
            throw new CollectionProtocolError(COLLECTION_ERRORS.invalidRequest, 'Unsupported plugin request')
        }
      } catch (error) {
        respond(request.requestId, undefined, error)
      }
    })()
  })

  rendererOn<PluginViewEvent>(PLUGIN_EVENT_NAME.view_event, ({ params }) => {
    window.dispatchEvent(new CustomEvent('lx:plugin-view-event', { detail: params }))
  })
}
