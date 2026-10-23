import { WebContentsView, session } from 'electron'
import path from 'node:path'
import { PLUGIN_SCHEME } from '@common/plugin/types'
import { PLUGIN_EVENT_NAME } from '@common/ipcNames'
import { mainSend } from '@common/mainIpc'
import { getMainWindow } from '@main/modules/winMain/main'
import type { ThemeSnapshot } from '@common/theme/types'
import type { MusicCollectionSnapshot } from '@common/collection/types'
import type { PluginViewIdentity, PluginViewPresentation } from '@main/modules/collection/bridge'
import type { PluginService } from './service'
import { installPluginProtocol } from './protocol'

interface ViewRecord {
  view: WebContentsView
  presentation: PluginViewPresentation
  ready: boolean
}

const keyFor = (presentation: PluginViewPresentation) => JSON.stringify([presentation.kind, presentation.identity])
const MAX_CACHED_VIEWS = 4

export class PluginViewManager {
  private readonly views = new Map<string, ViewRecord>()
  private active: ViewRecord | null = null
  private desiredVisible = false
  private theme: ThemeSnapshot | null = null
  private locale = 'zh-cn'
  private listenersInstalled = false
  private readonly identities = new Map<number, PluginViewIdentity>()
  private readonly crashRecords = new Map<string, number[]>()
  private service: PluginService | null = null
  private readonly sessions = new Set<string>()

  configure(service: PluginService) { this.service = service }

  private installWindowListeners() {
    if (this.listenersInstalled) return
    const win = getMainWindow()
    if (!win) return
    this.listenersInstalled = true
    win.on('minimize', () => { this.applyVisibility() })
    win.on('restore', () => { this.applyVisibility() })
    win.on('hide', () => { this.applyVisibility() })
    win.on('show', () => { this.applyVisibility() })
    win.on('enter-full-screen', () => { this.applyVisibility() })
    win.on('leave-full-screen', () => { this.applyVisibility() })
    win.on('resize', () => { this.applyVisibility() })
    win.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) {
        for (const record of [...this.views.values()]) this.destroy(record)
        this.crashRecords.clear()
      }
    })
    win.on('closed', () => {
      for (const record of [...this.views.values()]) this.destroy(record)
      this.listenersInstalled = false
    })
  }

  private applyVisibility() {
    const win = getMainWindow()
    if (!this.active) return
    this.active.view.setVisible(this.desiredVisible && !!win && win.isVisible() && !win.isMinimized())
  }

  private destroy(record: ViewRecord) {
    if (!record.view.webContents.isDestroyed()) record.view.webContents.send('lxplugin:availability', { available: false })
    this.identities.delete(record.view.webContents.id)
    this.views.delete(keyFor(record.presentation))
    if (this.active === record) { this.active = null; this.desiredVisible = false }
    try { getMainWindow()?.contentView.removeChildView(record.view); record.view.webContents.close() } catch {}
  }

  hide(ownerId?: string) {
    if (ownerId && this.active?.presentation.ownerId !== ownerId) return
    this.desiredVisible = false
    this.applyVisibility()
  }

  destroyForPlugin(pluginId: string) {
    for (const record of [...this.views.values()]) if (record.presentation.identity.pluginId === pluginId) this.destroy(record)
  }

  pushSettings(pluginId: string, settings: unknown) {
    for (const record of this.views.values()) if (record.presentation.identity.pluginId === pluginId && !record.view.webContents.isDestroyed()) record.view.webContents.send('lxplugin:settings', settings)
  }

  show(presentation: PluginViewPresentation): { webContentsId: number } {
    const win = getMainWindow()
    if (!win || !this.service) throw new Error('Plugin host is unavailable')
    this.installWindowListeners()
    const key = keyFor(presentation)
    const crashes = (this.crashRecords.get(key) ?? []).filter(at => Date.now() - at < 60_000)
    if (crashes.length >= 2) throw new Error('Plugin failed twice; choose another view or retry explicitly')
    if (this.active) this.active.view.setVisible(false)
    let record = this.views.get(key)
    if (record) {
      record.presentation = presentation
      this.views.delete(key)
      this.views.set(key, record)
    } else {
      const pluginId = presentation.identity.pluginId
      const pluginSession = session.fromPartition(`lx-plugin:${pluginId}`)
      if (!this.sessions.has(pluginId)) {
        installPluginProtocol(this.service, pluginSession.protocol, pluginId)
        // Electron permissions use a boolean response rather than a Node error callback.
        // eslint-disable-next-line n/no-callback-literal
        pluginSession.setPermissionRequestHandler((_contents, _permission, callback) => { callback(false) })
        pluginSession.setPermissionCheckHandler(() => false)
        pluginSession.on('will-download', event => { event.preventDefault() })
        pluginSession.webRequest.onBeforeRequest((details, callback) => {
          const url = new URL(details.url)
          // Electron expects a response object, not a Node-style callback.
          // eslint-disable-next-line n/no-callback-literal
          callback({ cancel: url.protocol !== 'data:' && !(url.protocol === `${PLUGIN_SCHEME}:` && url.hostname === pluginId) })
        })
        this.sessions.add(pluginId)
      }
      const view = new WebContentsView({
        webPreferences: {
          session: pluginSession,
          preload: path.join(__dirname, 'plugin-preload.js'),
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          nodeIntegrationInWorker: false,
          webviewTag: false,
          webSecurity: true,
          spellcheck: false,
        },
      })
      view.setBackgroundColor('#00000000')
      win.contentView.addChildView(view)
      record = { view, presentation, ready: false }
      this.views.set(key, record)
      this.identities.set(view.webContents.id, presentation.identity)
      const created = record
      view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      view.webContents.on('will-navigate', event => { event.preventDefault() })
      view.webContents.on('will-attach-webview', event => { event.preventDefault() })
      view.webContents.on('will-redirect', event => { event.preventDefault() })
      view.webContents.on('render-process-gone', (_event, details) => {
        if (details.reason !== 'clean-exit') this.recordCrash(created)
      })
      view.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
        if (isMainFrame && code !== -3) this.recordCrash(created)
      })
      view.webContents.on('did-finish-load', () => {
        created.ready = true
        view.webContents.send('lxplugin:locale', { locale: this.locale })
        view.webContents.send('lxplugin:availability', { available: true })
        if (this.theme) view.webContents.send(PLUGIN_EVENT_NAME.theme_change, this.theme)
      })
      void view.webContents.loadURL(`${PLUGIN_SCHEME}://${pluginId}/${presentation.entry}`).catch(() => {})
    }
    this.active = record
    record.view.webContents.send('lxplugin:availability', { available: true, visible: true })
    this.desiredVisible = true
    this.setBounds(presentation.bounds, presentation.ownerId)
    this.applyVisibility()
    while (this.views.size > MAX_CACHED_VIEWS) {
      const oldest = this.views.values().next().value!
      this.destroy(oldest)
    }
    return { webContentsId: record.view.webContents.id }
  }

  retry(pluginId: string) {
    for (const key of this.crashRecords.keys()) {
      const [, identity] = JSON.parse(key) as [string, PluginViewIdentity]
      if (identity.pluginId === pluginId) this.crashRecords.delete(key)
    }
    this.destroyForPlugin(pluginId)
  }

  private recordCrash(record: ViewRecord) {
    // did-fail-load and process-gone may describe the same failed instance.
    if (!this.identities.has(record.view.webContents.id)) return
    const key = keyFor(record.presentation)
    const records = [...(this.crashRecords.get(key) ?? []).filter(at => Date.now() - at < 60_000), Date.now()]
    this.crashRecords.set(key, records)
    const identity = record.presentation.identity
    this.destroy(record)
    const win = getMainWindow()
    if (win) mainSend(win, PLUGIN_EVENT_NAME.view_event, { type: records.length >= 2 ? 'recover' : 'crashed', ...identity, at: Date.now() })
  }

  setBounds(bounds: Electron.Rectangle, ownerId?: string) {
    if (!this.active || (ownerId && this.active.presentation.ownerId !== ownerId)) return
    if (![bounds?.x, bounds?.y, bounds?.width, bounds?.height].every(value => Number.isFinite(value) && Math.abs(value) < 100_000)) throw new Error('Invalid view bounds')
    this.active.presentation.bounds = bounds
    this.active.view.setBounds({ x: Math.max(0, Math.round(bounds.x)), y: Math.max(0, Math.round(bounds.y)), width: Math.max(0, Math.round(bounds.width)), height: Math.max(0, Math.round(bounds.height)) })
  }

  identityFor(id: number) { return this.identities.get(id) }
  isInteractive(id: number) { return !!this.active && this.active.view.webContents.id === id && this.desiredVisible && this.active.view.getVisible() }
  isPluginSender(id: number) { return this.identities.has(id) }
  sendSnapshot(snapshot: MusicCollectionSnapshot, provider?: PluginViewIdentity) {
    for (const record of this.active ? [this.active] : []) {
      const identity = record.presentation.identity
      if (provider && (provider.pluginId !== identity.pluginId || provider.providerId !== identity.providerId)) continue
      if (identity.surfaceId === snapshot.surfaceId && identity.contextId === snapshot.contextId) record.view.webContents.send('lxplugin:snapshot', snapshot)
    }
  }

  pushTheme(snapshot: ThemeSnapshot) { this.theme = snapshot; for (const record of this.views.values()) record.view.webContents.send(PLUGIN_EVENT_NAME.theme_change, snapshot) }
  getTheme() { return this.theme }
  pushLocale(locale: string) { this.locale = locale; for (const record of this.views.values()) record.view.webContents.send('lxplugin:locale', { locale }) }
  get current() { return this.active?.presentation ?? null }
}

export const pluginViews = new PluginViewManager()
