import { contextBridge, ipcRenderer } from 'electron'
import type { PluginEventReceipt } from '@common/plugin/types'

interface RuntimeContext { credentials: { get: (key: string) => Promise<string | undefined> }, publishEvent: (target: string, value: unknown) => Promise<PluginEventReceipt>, settings: Record<string, unknown>, isCancelled: () => boolean, onCancel: (callback: () => void) => () => void }
const context = (settings: Record<string, unknown>, signal: AbortSignal): RuntimeContext => ({
  settings,
  credentials: {
    get: async key => {
      if (signal.aborted || lifetime.signal.aborted) throw new Error('Plugin operation cancelled')
      const value = await ipcRenderer.invoke('lxruntime:request', { kind: 'credential-get', key })
      if (signal.aborted || lifetime.signal.aborted) throw new Error('Plugin operation cancelled')
      return value as string | undefined
    },
  },
  publishEvent: async(target, value) => {
    if (signal.aborted || lifetime.signal.aborted) throw new Error('Plugin operation cancelled')
    return ipcRenderer.invoke('lxruntime:request', { kind: 'publish-event', target, value })
  },
  isCancelled: () => signal.aborted,
  onCancel: callback => {
    if (signal.aborted) callback()
    else signal.addEventListener('abort', callback, { once: true })
    return () => { signal.removeEventListener('abort', callback) }
  },
})
interface RuntimeModule {
  activate?: (context: RuntimeContext) => Promise<void> | void
  deactivate?: () => Promise<void> | void
  handlers: Record<string, (value: unknown, context: RuntimeContext) => unknown | Promise<unknown>>
}
let runtime: RuntimeModule | undefined
const lifetime = new AbortController()
const requests = new Map<string, AbortController>()
ipcRenderer.on('lxruntime:cancel', (_event, id: string) => { requests.get(id)?.abort() })
ipcRenderer.on('lxruntime:command', (_event, request) => {
  void (async() => {
    const controller = new AbortController()
    requests.set(request.id, controller)
    try {
      if (!runtime) throw new Error('Plugin runtime is not registered')
      let value
      if (request.kind === 'activate') await runtime.activate?.(context(request.body.settings, lifetime.signal))
      else if (request.kind === 'deactivate') { lifetime.abort(); for (const pending of requests.values()) pending.abort(); await runtime.deactivate?.() } else if (request.kind === 'invoke') {
        const handler = Object.prototype.hasOwnProperty.call(runtime.handlers, request.body.handler) ? runtime.handlers[request.body.handler] : undefined
        if (!handler || lifetime.signal.aborted) throw new Error('Unknown or inactive plugin handler')
        value = await handler(request.body.value, context(request.body.settings, controller.signal))
        if (controller.signal.aborted) throw new Error('Plugin operation cancelled')
      } else throw new Error('Unknown runtime command')
      await ipcRenderer.invoke('lxruntime:request', { kind: 'result', id: request.id, value })
    } catch (error: any) {
      await ipcRenderer.invoke('lxruntime:request', { kind: 'result', id: request.id, error: String(error?.message ?? error).slice(0, 300) }).catch(() => {})
    } finally { requests.delete(request.id) }
  })()
})
contextBridge.exposeInMainWorld('lxRuntime', {
  start: async(module: RuntimeModule) => {
    if (runtime != null || module == null || typeof module.handlers !== 'object') throw new Error('Invalid or duplicate runtime registration')
    runtime = module
    await ipcRenderer.invoke('lxruntime:request', { kind: 'ready' })
  },
})
