import { BrowserWindow, ipcMain, session } from 'electron'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { assertMessageSize } from '@common/collection/validation'
import { PluginRequestLimit } from './requestLimit'
import { PluginRuntimeBusyError, type EventPublisher, type RuntimeBackend, type RuntimeInstance, type RuntimePlugin } from './lifecycle'
import type { PluginService } from './service'
import { installPluginProtocol } from './protocol'

interface Pending { resolve: (value: unknown) => void, reject: (error: Error) => void }
interface RuntimeRecord { win: BrowserWindow, pluginId: string, ready: () => void, publishEvent: EventPublisher, readCredential: (key: string) => Promise<string | undefined>, pending: Map<string, Pending> }
const records = new Map<number, RuntimeRecord>()
const credentialRequests = new PluginRequestLimit(16, () => new PluginRuntimeBusyError())
let registered = false
const channel = 'lxruntime:request'
const registerBridge = () => {
  if (registered) return
  registered = true
  ipcMain.handle(channel, async(event, message) => {
    const record = records.get(event.sender.id)
    if (!record || event.senderFrame !== event.sender.mainFrame) throw new Error('Unknown runtime frame')
    assertMessageSize(message, 64 * 1024)
    if (message?.kind === 'credential-get') {
      if (typeof message.key !== 'string' || message.key.length > 64) throw new Error('Invalid credential key')
      return credentialRequests.run(record.pluginId, async() => {
        const value = await record.readCredential(message.key)
        if (records.get(event.sender.id) !== record) throw new Error('Plugin runtime stopped')
        return value
      })
    }
    if (message?.kind === 'publish-event') {
      if (typeof message.target !== 'string' || message.target.length > 129) throw new Error('Invalid event target')
      return record.publishEvent(message.target, message.value)
    }
    if (message?.kind === 'ready') { record.ready(); return }
    if (message?.kind !== 'result' || typeof message.id !== 'string') throw new Error('Invalid runtime response')
    const pending = record.pending.get(message.id)
    if (!pending) return
    record.pending.delete(message.id)
    if (typeof message.error === 'string') pending.reject(new Error(message.error.slice(0, 300)))
    else pending.resolve(message.value)
  })
}

/** No Node, arbitrary IPC, network, window creation, or cross-plugin resources. */
export class IsolatedRuntimeBackend implements RuntimeBackend {
  private readonly partitions = new Set<string>()
  constructor(private readonly service: PluginService) { registerBridge() }
  async start(plugin: RuntimePlugin, signal: AbortSignal, failed: (error: Error) => void, publishEvent: EventPublisher): Promise<RuntimeInstance> {
    if (!plugin.runtime) throw new Error('Missing runtime entry')
    const pluginSession = session.fromPartition(`lx-runtime:${plugin.id}`)
    if (!this.partitions.has(plugin.id)) {
      installPluginProtocol(this.service, pluginSession.protocol, plugin.id, true)
      // Electron permission callbacks return booleans, not Node error arguments.
      // eslint-disable-next-line n/no-callback-literal
      pluginSession.setPermissionRequestHandler((_contents, _permission, callback) => { callback(false) })
      pluginSession.setPermissionCheckHandler(() => false)
      pluginSession.on('will-download', event => { event.preventDefault() })
      pluginSession.webRequest.onBeforeRequest((details, callback) => {
        const url = new URL(details.url)
        // eslint-disable-next-line n/no-callback-literal
        callback({ cancel: !(url.protocol === 'lxplugin:' && url.hostname === plugin.id) })
      })
      this.partitions.add(plugin.id)
    }
    const win = new BrowserWindow({ show: false, width: 1, height: 1, skipTaskbar: true, webPreferences: { session: pluginSession, preload: path.join(__dirname, 'plugin-runtime-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, nodeIntegrationInWorker: false, webSecurity: true, webviewTag: false, backgroundThrottling: false, spellcheck: false } })
    const contentsId = win.webContents.id
    let destroyed = false
    let ready: () => void = () => {}
    const started = new Promise<void>(resolve => { ready = resolve })
    const signature = this.service.store.get(plugin.id)!.manifest.signature
    const record: RuntimeRecord = {
      win,
      pluginId: plugin.id,
      ready,
      publishEvent,
      readCredential: async key => this.service.readCredential(plugin.id, key, signature),
      pending: new Map(),
    }
    records.set(contentsId, record)
    const destroy = () => {
      if (destroyed) return
      destroyed = true
      records.delete(contentsId)
      for (const pending of record.pending.values()) pending.reject(new Error('Plugin runtime stopped'))
      record.pending.clear()
      if (!win.isDestroyed()) win.destroy()
      signal.removeEventListener('abort', startupCancel)
    }
    const startupCancel = () => { destroy(); ready() }
    signal.addEventListener('abort', startupCancel, { once: true })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', event => { event.preventDefault() })
    win.webContents.on('will-redirect', event => { event.preventDefault() })
    win.webContents.on('will-attach-webview', event => { event.preventDefault() })
    win.webContents.on('render-process-gone', (_event, details) => { if (!destroyed) { failed(new Error(`Plugin runtime exited: ${details.reason}`)); destroy() } })
    win.on('closed', () => { if (!destroyed) { failed(new Error('Plugin runtime closed')); destroy() } })
    const command = async(kind: string, body?: unknown, requestSignal?: AbortSignal): Promise<unknown> => {
      if (destroyed || requestSignal?.aborted) throw new Error('Plugin runtime unavailable')
      if (record.pending.size >= 16) throw new PluginRuntimeBusyError()
      const id = randomBytes(12).toString('hex')
      return new Promise((resolve, reject) => {
        const cancel = () => {
          record.pending.delete(id)
          if (!destroyed) win.webContents.send('lxruntime:cancel', id)
          reject(new Error('Plugin request cancelled'))
        }
        const finish = () => { requestSignal?.removeEventListener('abort', cancel) }
        record.pending.set(id, { resolve: value => { finish(); resolve(value) }, reject: error => { finish(); reject(error) } })
        requestSignal?.addEventListener('abort', cancel, { once: true })
        win.webContents.send('lxruntime:command', { id, kind, body })
      })
    }
    try {
      if (signal.aborted) throw new Error('Plugin activation cancelled')
      await win.loadURL(`lxplugin://${plugin.id}/${plugin.runtime.entry}`)
      await started
      if (signal.aborted || destroyed) throw new Error('Plugin activation cancelled')
      await command('activate', { settings: await this.service.getSettings(plugin.id) }, signal)
      signal.removeEventListener('abort', startupCancel)
      const invocations = new PluginRequestLimit(16, () => new PluginRuntimeBusyError())
      return {
        invoke: async(handler, value, requestSignal) => invocations.run(plugin.id, async() => {
          if (destroyed || requestSignal.aborted) throw new Error('Plugin runtime unavailable')
          return command('invoke', { handler, value, settings: await this.service.getSettings(plugin.id) }, requestSignal)
        }),
        dispose: async() => { await command('deactivate') },
        destroy,
      }
    } catch (error) { destroy(); throw error }
  }
}
