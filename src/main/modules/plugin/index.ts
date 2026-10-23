import { BUILTIN_PAGES } from '@common/pages/registry'
import { OFFICIAL_BUNDLE_ID, RADIO_BUNDLE_ID } from '@common/bundles'
import { app, dialog } from 'electron'
import path from 'node:path'
import { constants as fsConstants, promises as fsp } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { mainHandle, mainSend } from '@common/mainIpc'
import { COLLECTION_EVENT_NAME, PLUGIN_EVENT_NAME } from '@common/ipcNames'
import { assertMessageSize } from '@common/collection/validation'
import { PLUGIN_UI_KINDS, PLUGIN_UI_INPUT_SCHEMA, type PluginUiInput } from '@common/plugin/ui'
import { matchesExtensionSchema } from '@common/plugin/extensions'
import { authorizePluginRequest } from '@common/plugin/requests'
import { PluginSecurityError, isSafePluginId } from '@common/plugin/security'
import { MAX_PLUGIN_SETTINGS_DOCUMENT_BYTES } from '@common/plugin/settings'
import type { MusicCollectionSnapshot } from '@common/collection/types'
import type { ThemeSnapshot } from '@common/theme/types'
import { getMainWindow, getWebContents } from '@main/modules/winMain/main'
import type { PluginPublicInfo, PluginCredentialStatus } from '@common/plugin/types'
import type { ForwardedPluginRequest, PluginViewIdentity } from '@main/modules/collection/bridge'
import registerRadio from '@main/bundles/radio'
import { PluginService } from './service'
import { installPluginProtocol } from './protocol'
import { pluginViews } from './views'
import { PluginRequestLimit } from './requestLimit'
import { IsolatedRuntimeBackend } from './runtimeHost'
import { createSystemCredentialVault } from './systemCredentials'
import { APP_NAME, APP_NAME_EN } from '@common/appIdentity'

let service: PluginService | null = null
let bridgeRegistered = false
const pending = new Map<string, { pluginId: string, resolve: (value: unknown) => void, reject: (error: Error) => void, timer: NodeJS.Timeout }>()

const isHostSender = (sender: Electron.WebContents): boolean => {
  try {
    return sender === getWebContents()
  } catch {
    return false
  }
}

const requireHostSender = (sender: Electron.WebContents) => {
  if (!isHostSender(sender)) throw new PluginSecurityError('unauthorized', 'Only the host window may call this API')
}

let radioAvailable = false
let cancelRadioRequests: (() => void) | null = null
let initialization: Promise<PluginService> | null = null
export const ensurePluginService = async(): Promise<PluginService> => {
  initialization ??= initializePluginService().catch(error => { initialization = null; service = null; throw error })
  return initialization
}

const initializePluginService = async(): Promise<PluginService> => {
  const pluginRoot = path.join(global.lxDataPath, 'plugins')
  service = new PluginService(pluginRoot, !app.isPackaged, createSystemCredentialVault(path.join(pluginRoot, 'credentials')))
  await service.init(path.join(global.staticPath, 'plugins'))
  cancelRadioRequests ??= registerRadio(() => radioAvailable)
  service.subscribeNativeBundles(bundles => {
    radioAvailable = bundles.includes(RADIO_BUNDLE_ID)
    if (!radioAvailable) cancelRadioRequests?.()
    const unavailable = new Set(service!.list().filter(plugin => !plugin.available).map(plugin => plugin.id))
    for (const id of unavailable) pluginViews.destroyForPlugin(id)
    for (const [id, request] of pending) if (unavailable.has(request.pluginId)) { clearTimeout(request.timer); request.reject(new Error('Plugin dependency is unavailable')); pending.delete(id) }
    const win = getMainWindow()
    if (win && !win.isDestroyed()) mainSend(win, COLLECTION_EVENT_NAME.host_state, { type: 'catalog' })
  })
  service.subscribeSettings(change => {
    pluginViews.pushSettings(change.pluginId, change.settings)
    const win = getMainWindow()
    if (win && !win.isDestroyed()) mainSend(win, COLLECTION_EVENT_NAME.host_state, { type: 'settings', ...change })
  })
  if (!app.isPackaged && process.env.LX_PLUGIN_DEV_DIR) {
    try {
      await service.installDevDirectory(process.env.LX_PLUGIN_DEV_DIR)
    } catch (error: any) {
      console.warn('[plugin] failed to load development plugin', error?.message)
    }
  }
  if (!bridgeRegistered) {
    installPluginProtocol(service)
    pluginViews.configure(service)
    bridgeRegistered = true
  }
  await service.configureLifecycle(new IsolatedRuntimeBackend(service))
  return service
}

const requireMainWindow = (): Electron.BrowserWindow => {
  const win = getMainWindow()
  if (!win) throw new PluginSecurityError('unavailable', 'Main window is not available')
  return win
}

const requestFromHost = async(request: ForwardedPluginRequest): Promise<unknown> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(request.requestId)
      reject(new Error('Plugin request timed out'))
    }, request.payload.kind === 'dispatch' ? 120_000 : 30_000)
    pending.set(request.requestId, { pluginId: request.pluginId, resolve, reject, timer })
    mainSend(requireMainWindow(), COLLECTION_EVENT_NAME.plugin_request, request)
  })
}


const isolatedRequests = new PluginRequestLimit(16, () => new PluginSecurityError('busy', 'Plugin request queue is busy'))
const storageLocks = new Map<string, Promise<unknown>>()
const pendingInstalls = new Map<string, { packagePath: string, fingerprint: string, archiveHash: string, contextFingerprint: string, expires: number }>()

const handleStorage = async(pluginId: string, kind: string, body: unknown): Promise<unknown> => {
  const api = await ensurePluginService()
  const keyPart = (body as any)?.key
  if (typeof keyPart !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(keyPart)) {
    throw new PluginSecurityError('invalid_request', 'Invalid storage key')
  }
  const run = async(): Promise<unknown> => {
    const dir = path.join(api.rootDirectory, 'storage')
    await fsp.mkdir(dir, { recursive: true })
    const file = path.join(dir, `${pluginId}.json`)
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(await fsp.readFile(file, 'utf8'))
    } catch {
      data = {}
    }
    if (['__proto__', 'constructor', 'prototype'].includes(keyPart)) throw new PluginSecurityError('invalid_request', 'Reserved storage key')
    if (kind === 'storage.get') return Object.prototype.hasOwnProperty.call(data, keyPart) ? data[keyPart] : undefined
    if (kind === 'storage.set') {
      const value = (body as any)?.value
      assertMessageSize(value, 64 * 1024)
      data[keyPart] = value
    } else {
      Reflect.deleteProperty(data, keyPart)
    }
    const serialized = JSON.stringify(data)
    if (Buffer.byteLength(serialized) > 256 * 1024) throw new PluginSecurityError('payload_too_large', 'Plugin storage limit exceeded')
    await fsp.writeFile(file, serialized)
    return null
  }
  const previous = storageLocks.get(pluginId) ?? Promise.resolve()
  const next = previous.then(run, run)
  storageLocks.set(pluginId, next.catch(() => {}))
  return next
}

export const registerPluginModule = () => {
  void ensurePluginService()
  let shutdownComplete = false
  app.on('before-quit', event => {
    if (shutdownComplete || !service) return
    event.preventDefault()
    void service.shutdown().finally(() => { shutdownComplete = true; app.quit() })
  })
  mainHandle<{ text: string }, { text: string }>(PLUGIN_EVENT_NAME.process_search, async({ event, params }) => {
    requireHostSender(event.sender)
    assertMessageSize(params, 16 * 1024)
    if (typeof params?.text !== 'string' || params.text.length > 4096) throw new PluginSecurityError('invalid_request', 'Invalid search text')
    return await (await ensurePluginService()).processExtension(`${OFFICIAL_BUNDLE_ID}/search.query`, { text: params.text }) as { text: string }
  })
  mainHandle<{ source: string }, { suggestions: string[] }>(PLUGIN_EVENT_NAME.search_suggestions, async({ event, params }) => {
    requireHostSender(event.sender)
    assertMessageSize(params, 1024)
    if (typeof params?.source !== 'string' || params.source.length > 32) throw new PluginSecurityError('invalid_request', 'Invalid search source')
    const result = await (await ensurePluginService()).provideExtension(`${OFFICIAL_BUNDLE_ID}/search.suggestions`, { source: params.source })
    return (result ?? { suggestions: [] }) as { suggestions: string[] }
  })
  mainHandle(PLUGIN_EVENT_NAME.search_actions, async({ event }) => {
    requireHostSender(event.sender)
    return (await ensurePluginService()).getActions(`${OFFICIAL_BUNDLE_ID}/search.suggestions.next`)
  })
  mainHandle<{ source: string, actionId: string }, { suggestions: string[] }>(PLUGIN_EVENT_NAME.run_search_action, async({ event, params }) => {
    requireHostSender(event.sender)
    assertMessageSize(params, 2048)
    if (typeof params?.source !== 'string' || params.source.length > 32 || typeof params.actionId !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}\/[a-z0-9][a-z0-9._-]{0,63}$/.test(params.actionId)) throw new PluginSecurityError('invalid_request', 'Invalid search action')
    return await (await ensurePluginService()).executeAction(`${OFFICIAL_BUNDLE_ID}/search.suggestions.next`, params.actionId, { source: params.source }) as { suggestions: string[] }
  })
  mainHandle<{ pluginId: string, themeId: string }, unknown>(PLUGIN_EVENT_NAME.theme_resources, async({ event, params }) => {
    requireHostSender(event.sender)
    if (event.senderFrame !== event.sender.mainFrame) throw new PluginSecurityError('unauthorized', 'Only the host main frame may load theme resources')
    assertMessageSize(params, 1024)
    if (!params || typeof params.pluginId !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(params.pluginId) || typeof params.themeId !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(params.themeId)) throw new PluginSecurityError('invalid_request', 'Invalid theme identity')
    return (await ensurePluginService()).getThemeResources(params.pluginId, params.themeId)
  })
  mainHandle<{ kind: string }, unknown>(PLUGIN_EVENT_NAME.search_ui, async({ event, params }) => {
    requireHostSender(event.sender)
    if (!params || !(PLUGIN_UI_KINDS as readonly string[]).includes(params.kind)) throw new PluginSecurityError('invalid_request', 'Unknown UI point')
    return (await ensurePluginService()).getRenderers(`${OFFICIAL_BUNDLE_ID}/search.suggestions.${params.kind}`).slice(0, 32)
  })
  mainHandle<{ kind: string, renderId: string, input: PluginUiInput }, unknown>(PLUGIN_EVENT_NAME.render_search_ui, async({ event, params }) => {
    requireHostSender(event.sender)
    assertMessageSize(params, 16 * 1024)
    if (!params || !(PLUGIN_UI_KINDS as readonly string[]).includes(params.kind) || typeof params.renderId !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}\/[a-z0-9][a-z0-9._-]{0,63}$/.test(params.renderId) || !matchesExtensionSchema(PLUGIN_UI_INPUT_SCHEMA, params.input)) throw new PluginSecurityError('invalid_request', 'Invalid UI request')
    return (await ensurePluginService()).renderExtension(`${OFFICIAL_BUNDLE_ID}/search.suggestions.${params.kind}`, params.renderId, params.input)
  })
  mainHandle(PLUGIN_EVENT_NAME.runtime_events, async({ event }) => {
    requireHostSender(event.sender)
    return (await ensurePluginService()).getLifecycleEvents()
  })

  mainHandle<{ pluginId: string }, Record<string, string | number | boolean>>(PLUGIN_EVENT_NAME.get_settings, async({ event, params }) => {
    requireHostSender(event.sender)
    return (await ensurePluginService()).getSettings(params.pluginId)
  })
  mainHandle<{ pluginId: string, key: string, value: unknown }, Record<string, string | number | boolean>>(PLUGIN_EVENT_NAME.set_setting, async({ event, params }) => {
    requireHostSender(event.sender)
    assertMessageSize(params, 16 * 1024)
    const settings = await (await ensurePluginService()).setSetting(params.pluginId, params.key, params.value)
    return settings
  })

  mainHandle<{ pluginId: string }, Record<string, string | number | boolean>>(PLUGIN_EVENT_NAME.reset_settings, async({ event, params }) => {
    requireHostSender(event.sender)
    assertMessageSize(params, 1024)
    if (typeof params?.pluginId !== 'string' || params.pluginId.length > 64) throw new PluginSecurityError('invalid_request', 'Invalid plugin id')
    return (await ensurePluginService()).resetSettings(params.pluginId)
  })

  const transferRequests = new PluginRequestLimit(1, () => new PluginSecurityError('busy', '参数导入导出正在进行'))
  const transferId = (params: { pluginId: string }) => {
    assertMessageSize(params, 1024)
    if (!isSafePluginId(params?.pluginId)) throw new PluginSecurityError('invalid_request', 'Invalid plugin id')
    return params.pluginId
  }
  mainHandle<{ pluginId: string }, { cancelled: boolean, count?: number }>(PLUGIN_EVENT_NAME.export_settings, async({ event, params }) => {
    requireHostSender(event.sender)
    const id = transferId(params)
    return transferRequests.run('settings-transfer', async() => {
      const api = await ensurePluginService()
      const document = await api.exportSettings(id)
      const result = await dialog.showSaveDialog(requireMainWindow(), { title: '导出插件参数', defaultPath: `${id}.settings.json`, filters: [{ name: `${APP_NAME}参数`, extensions: ['json'] }] })
      if (result.canceled || !result.filePath) return { cancelled: true }
      // A package changed during the file dialog must still accept this exact schema.
      await api.previewSettingsImport(id, document)
      const temporary = result.filePath + '.' + randomBytes(12).toString('hex') + '.tmp'
      try {
        await fsp.writeFile(temporary, JSON.stringify(document), { mode: 0o600, flag: 'wx' })
        await fsp.rename(temporary, result.filePath)
      } finally { await fsp.rm(temporary, { force: true }) }
      return { cancelled: false, count: Object.keys(document.values).length }
    })
  })
  mainHandle<{ pluginId: string }, { cancelled: boolean, settings?: Record<string, string | number | boolean>, count?: number }>(PLUGIN_EVENT_NAME.import_settings, async({ event, params }) => {
    requireHostSender(event.sender)
    const id = transferId(params)
    return transferRequests.run('settings-transfer', async() => {
      const api = await ensurePluginService()
      // Check availability/opt-in before opening any external file.
      await api.exportSettings(id)
      const result = await dialog.showOpenDialog(requireMainWindow(), { title: '导入插件参数', properties: ['openFile'], filters: [{ name: `${APP_NAME}参数`, extensions: ['json'] }] })
      if (result.canceled || !result.filePaths[0]) return { cancelled: true }
      const handle = await fsp.open(result.filePaths[0], fsConstants.O_RDONLY | fsConstants.O_NONBLOCK)
      let input: unknown
      try {
        const stat = await handle.stat()
        if (!stat.isFile() || stat.size > MAX_PLUGIN_SETTINGS_DOCUMENT_BYTES) throw new PluginSecurityError('invalid_request', '参数文件过大或不是普通文件')
        const buffer = Buffer.alloc(MAX_PLUGIN_SETTINGS_DOCUMENT_BYTES + 1)
        // Read a bounded snapshot even if the selected file grows after stat().
        let total = 0
        while (total < buffer.length) {
          const { bytesRead } = await handle.read(buffer, total, buffer.length - total, null)
          if (!bytesRead) break
          total += bytesRead
        }
        if (total > MAX_PLUGIN_SETTINGS_DOCUMENT_BYTES) throw new PluginSecurityError('invalid_request', '参数文件过大')
        try { input = JSON.parse(buffer.subarray(0, total).toString('utf8')) } catch { throw new PluginSecurityError('invalid_request', '参数文件不是有效JSON') }
      } finally { await handle.close() }
      const preview = await api.previewSettingsImport(id, input)
      const description = preview.changes.map(change => `${change.title} (${change.key}): ${JSON.stringify(change.previous)} → ${JSON.stringify(change.value)}`).join('\n')
      const confirmation = await dialog.showMessageBox(requireMainWindow(), {
        type: 'question',
        title: '导入插件参数',
        message: `将更新 ${id} 的 ${preview.changes.length} 项参数`,
        detail: `${description || '参数值相同，无需更改。'}\n\n仅覆盖文件中列出的可导出参数，其他本机参数保持不变。`,
        buttons: ['导入', '取消'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      })
      if (confirmation.response !== 0) return { cancelled: true }
      const settings = await api.importSettings(id, preview.document, preview)
      return { cancelled: false, count: preview.changes.length, settings }
    })
  })

  mainHandle(PLUGIN_EVENT_NAME.native_bundles, async({ event }) => {
    requireHostSender(event.sender)
    return (await ensurePluginService()).getNativeBundles()
  })

  mainHandle<string>(PLUGIN_EVENT_NAME.restore_bundled, async({ event, params }) => {
    requireHostSender(event.sender)
    await (await ensurePluginService()).restoreBundled(params)
  })

  mainHandle(PLUGIN_EVENT_NAME.list, async({ event }) => {
    requireHostSender(event.sender)
    const api = await ensurePluginService()
    return api.list()
  })

  mainHandle<{ pluginId: string }, PluginCredentialStatus>(PLUGIN_EVENT_NAME.credential_status, async({ event, params }) => {
    requireHostSender(event.sender)
    assertMessageSize(params, 2048)
    return (await ensurePluginService()).credentialStatus(params.pluginId)
  })
  mainHandle<{ pluginId: string, key: string, value: unknown, signerFingerprint: string }, PluginCredentialStatus>(PLUGIN_EVENT_NAME.set_credential, async({ event, params }) => {
    requireHostSender(event.sender)
    assertMessageSize(params, 32 * 1024)
    return (await ensurePluginService()).setCredential(params.pluginId, params.key, params.value, params.signerFingerprint)
  })
  mainHandle<{ pluginId: string, key: string, signerFingerprint: string }, PluginCredentialStatus>(PLUGIN_EVENT_NAME.remove_credential, async({ event, params }) => {
    requireHostSender(event.sender)
    assertMessageSize(params, 2048)
    return (await ensurePluginService()).removeCredential(params.pluginId, params.key, params.signerFingerprint)
  })
  mainHandle<{ pluginId: string, signerFingerprint: string }, { cancelled: boolean, status?: PluginCredentialStatus }>(PLUGIN_EVENT_NAME.clear_credentials, async({ event, params }) => {
    requireHostSender(event.sender)
    assertMessageSize(params, 2048)
    const api = await ensurePluginService()
    const plugin = api.getPublicInfo(params.pluginId)
    if (!plugin || plugin.publicKeyFingerprint !== params.signerFingerprint) throw new PluginSecurityError('permission_denied', '插件签名者已变化，请刷新设置页')
    const result = await dialog.showMessageBox(requireMainWindow(), {
      type: 'warning',
      message: `删除 ${plugin.name}（${plugin.id}）的全部凭据？包括旧版本已移除的凭据项，删除后需要重新填写。`,
      buttons: ['删除全部凭据', '取消'],
      defaultId: 1,
      cancelId: 1,
    })
    if (result.response !== 0) return { cancelled: true }
    return { cancelled: false, status: await api.clearCredentials(params.pluginId, params.signerFingerprint) }
  })

  mainHandle(PLUGIN_EVENT_NAME.get_pages, async({ event }) => {
    requireHostSender(event.sender)
    const api = await ensurePluginService()
    const iconMimes: Record<string, string> = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
    return await Promise.all(api.getPages().map(async page => {
      let iconDataUrl: string | undefined
      if (page.icon) {
        const mime = iconMimes[path.extname(page.icon).toLowerCase()]
        if (mime) {
          try {
            // Host icons are verified, bounded image data; plugin documents keep
            // their separate origins and strict cross-origin resource policy.
            const bytes = await api.readPluginFile(page.pluginId, page.icon)
            if (bytes.length <= 32 * 1024) iconDataUrl = `data:${mime};base64,${bytes.toString('base64')}`
          } catch {}
        }
      }
      return { ...page, iconDataUrl }
    }))
  })

  mainHandle(PLUGIN_EVENT_NAME.install, async({ event }) => {
    requireHostSender(event.sender)
    const api = await ensurePluginService()
    const result = await dialog.showOpenDialog({
      title: `Install ${APP_NAME_EN} plugin`,
      filters: [{ name: `${APP_NAME_EN} Plugin`, extensions: ['lxplugin'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const preview = await api.previewInstall(result.filePaths[0])
    if (preview.keyChanged) throw new PluginSecurityError('key_changed', 'Plugin update must keep the original signing key')
    const token = randomBytes(12).toString('hex')
    for (const [id, value] of pendingInstalls) if (value.expires < Date.now()) pendingInstalls.delete(id)
    if (pendingInstalls.size >= 16) throw new PluginSecurityError('busy', 'Too many pending installs')
    pendingInstalls.set(token, {
      packagePath: preview.packagePath,
      fingerprint: preview.fingerprint,
      archiveHash: preview.archiveHash,
      contextFingerprint: preview.contextFingerprint,
      expires: Date.now() + 5 * 60_000,
    })
    return { token, ...preview }
  })

  mainHandle<{ token: string }, unknown>(PLUGIN_EVENT_NAME.confirm_install, async({ event, params }) => {
    requireHostSender(event.sender)
    const token = String((params)?.token ?? '')
    const pendingInstall = pendingInstalls.get(token)
    if (!pendingInstall || pendingInstall.expires < Date.now()) throw new PluginSecurityError('invalid_request', 'Unknown install request')
    pendingInstalls.delete(token)
    const api = await ensurePluginService()
    const outcome = await api.install(pendingInstall.packagePath, pendingInstall.fingerprint, pendingInstall.archiveHash, pendingInstall.contextFingerprint)
    pluginViews.destroyForPlugin(outcome.plugin.id)
    return outcome
  })

  mainHandle<{ token: string }, null>(PLUGIN_EVENT_NAME.cancel_install, async({ event, params }) => {
    requireHostSender(event.sender)
    const token = String((params)?.token ?? '')
    pendingInstalls.delete(token)
    return null
  })

  mainHandle<{ message: string, confirmText: string, cancelText: string }, boolean>(PLUGIN_EVENT_NAME.confirm_command, async({ event, params }) => {
    requireHostSender(event.sender)
    assertMessageSize(params, 16 * 1024)
    if (![params.message, params.confirmText, params.cancelText].every(value => typeof value === 'string')) throw new PluginSecurityError('invalid_request', 'Invalid confirmation')
    const result = await dialog.showMessageBox(requireMainWindow(), {
      type: 'warning', message: params.message, buttons: [params.confirmText, params.cancelText], defaultId: 1, cancelId: 1, noLink: true,
    })
    return result.response === 0
  })

  mainHandle<{ locale: string }, null>(PLUGIN_EVENT_NAME.host_environment, async({ event, params }) => {
    requireHostSender(event.sender)
    if (!['zh-cn', 'zh-tw', 'en-us', 'ko-kr'].includes(params.locale)) throw new PluginSecurityError('invalid_request', 'Invalid locale')
    pluginViews.pushLocale(params.locale)
    return null
  })

  mainHandle<{ pluginId: string }, null>(PLUGIN_EVENT_NAME.retry_view, async({ event, params }) => {
    requireHostSender(event.sender)
    pluginViews.retry(params.pluginId)
    return null
  })

  mainHandle<{ pluginId: string }, PluginPublicInfo>(PLUGIN_EVENT_NAME.rollback, async({ event, params }) => {
    requireHostSender(event.sender)
    const api = await ensurePluginService()
    pluginViews.destroyForPlugin(params.pluginId)
    return api.rollback(params.pluginId)
  })

  mainHandle<{ pluginId: string }, PluginPublicInfo[]>(PLUGIN_EVENT_NAME.uninstall, async({ event, params }) => {
    requireHostSender(event.sender)
    const api = await ensurePluginService()
    const pluginId = String((params)?.pluginId ?? '')
    pluginViews.destroyForPlugin(pluginId)
    await storageLocks.get(pluginId)
    await api.uninstall(pluginId)
    if (pluginId === OFFICIAL_BUNDLE_ID) (await import('@main/modules/winLyric/main')).closeWindow()
    storageLocks.delete(pluginId)
    return api.list()
  })

  mainHandle<{ pluginId: string, enabled: boolean }, PluginPublicInfo>(PLUGIN_EVENT_NAME.set_enabled, async({ event, params }) => {
    requireHostSender(event.sender)
    const api = await ensurePluginService()
    const { pluginId, enabled } = params as { pluginId: string, enabled: boolean }
    if (!pluginId || typeof enabled !== 'boolean') throw new PluginSecurityError('invalid_request', 'Invalid plugin state')
    if (!enabled) pluginViews.destroyForPlugin(pluginId)
    const result = await api.setEnabled(pluginId, enabled)
    if (!enabled && pluginId === OFFICIAL_BUNDLE_ID) (await import('@main/modules/winLyric/main')).closeWindow()
    return result
  })

  mainHandle<{
    kind: 'collection' | 'page'
    pluginId: string
    providerId?: string
    surfaceId?: string
    contextId?: string
    pageId?: string
    entry?: string
    bounds: Electron.Rectangle
  }, { webContentsId: number }>(PLUGIN_EVENT_NAME.show_view, async({ event, params }) => {
    requireHostSender(event.sender)
    const api = await ensurePluginService()
    const data = params as {
      ownerId: string
      kind: 'collection' | 'page'
      pluginId: string
      providerId?: string
      surfaceId?: string
      contextId?: string
      pageId?: string
      entry?: string
      bounds: Electron.Rectangle
    }
    if (!data || (data.kind !== 'collection' && data.kind !== 'page')) throw new PluginSecurityError('invalid_request', 'Invalid view kind')
    const entry = api.getEntry(data.pluginId)
    if (!entry.enabled) throw new PluginSecurityError('disabled', 'Plugin is disabled')
    let resolvedEntry = entry.manifest.main
    if (data.kind === 'collection') {
      const provider = entry.manifest.collection?.providers.find(item => item.id === data.providerId)
      if (!provider) throw new PluginSecurityError('not_found', 'Unknown collection provider')
      if (data.surfaceId && !provider.surfaces.includes(data.surfaceId as any)) {
        throw new PluginSecurityError('unsupported_surface', 'Provider does not support this surface')
      }
      resolvedEntry = provider.entry ?? resolvedEntry
    } else {
      const page = entry.manifest.pages?.find(item => item.id === data.pageId)
      if (!page) throw new PluginSecurityError('not_found', 'Unknown plugin page')
      resolvedEntry = page.entry ?? resolvedEntry
    }
    const identity: PluginViewIdentity = {
      pluginId: data.pluginId,
      providerId: data.providerId,
      surfaceId: data.surfaceId,
      contextId: data.contextId,
      pageId: data.pageId,
    }
    const result = pluginViews.show({
      ownerId: data.ownerId,
      kind: data.kind,
      identity,
      entry: resolvedEntry,
      bounds: data.bounds ?? { x: 0, y: 0, width: 0, height: 0 },
    })
    return result
  })

  mainHandle<{ bounds: Electron.Rectangle, ownerId: string }, null>(PLUGIN_EVENT_NAME.set_view_bounds, async({ event, params }) => {
    requireHostSender(event.sender)
    pluginViews.setBounds(params.bounds, params.ownerId)
    return null
  })

  mainHandle<{ ownerId: string }, null>(PLUGIN_EVENT_NAME.hide_view, async({ event, params }) => {
    requireHostSender(event.sender)
    pluginViews.hide(params.ownerId)
    return null
  })

  mainHandle<ThemeSnapshot, null>(PLUGIN_EVENT_NAME.theme_change, async({ event, params }) => {
    requireHostSender(event.sender)
    const snapshot = params
    assertMessageSize(snapshot, 256 * 1024)
    if (!snapshot || typeof snapshot.revision !== 'number' || !snapshot.tokens) {
      throw new PluginSecurityError('invalid_request', 'Invalid theme snapshot')
    }
    pluginViews.pushTheme(snapshot)
    return null
  })

  mainHandle<{ snapshot: MusicCollectionSnapshot, identity: PluginViewIdentity }, null>(COLLECTION_EVENT_NAME.publish_snapshot, async({ event, params }) => {
    requireHostSender(event.sender)
    const { snapshot, identity } = params
    assertMessageSize(snapshot)
    pluginViews.sendSnapshot(snapshot, identity)
    return null
  })

  mainHandle<{ requestId: string, result?: unknown, error?: string }, null>(COLLECTION_EVENT_NAME.plugin_response, async({ event, params }) => {
    requireHostSender(event.sender)
    const { requestId, result, error } = params as { requestId: string, result?: unknown, error?: string }
    const entry = pending.get(requestId)
    if (!entry) return null
    pending.delete(requestId)
    clearTimeout(entry.timer)
    if (error) entry.reject(new Error(error))
    else {
      try { assertMessageSize(result); entry.resolve(result) } catch (error) { entry.reject(error as Error) }
    }
    return null
  })

  mainHandle<unknown, unknown>(PLUGIN_EVENT_NAME.request, async({ event, params }) => {
    const identity = pluginViews.identityFor(event.sender.id)
    if (!identity || event.senderFrame !== event.sender.mainFrame) throw new PluginSecurityError('unauthorized', 'Unknown plugin frame')
    assertMessageSize(params, 256 * 1024)
    const payload = params as ForwardedPluginRequest['payload'] & { kind: string }
    const kinds = ['ready', 'snapshot', 'items', 'dispatch', 'options', 'theme', 'navigate', 'storage.get', 'storage.set', 'storage.remove', 'settings.get', 'settings.set', 'identity', 'anchor']
    if (!payload || !kinds.includes(payload.kind)) {
      throw new PluginSecurityError('invalid_request', 'Invalid plugin request')
    }
    if (['dispatch', 'navigate'].includes(payload.kind) && !pluginViews.isInteractive(event.sender.id)) {
      throw new PluginSecurityError('inactive_view', 'Inactive rendering providers cannot perform actions')
    }
    const entry = (await ensurePluginService()).getEntry(identity.pluginId)
    if (!entry.enabled) throw new PluginSecurityError('disabled', 'Plugin is disabled')
    authorizePluginRequest(entry.manifest.permissions, payload.kind)
    return isolatedRequests.run(identity.pluginId, async() => {
      if (payload.kind === 'settings.get') return (await ensurePluginService()).getSettings(identity.pluginId)
      if (payload.kind === 'settings.set') {
        const settings = await (await ensurePluginService()).setSetting(identity.pluginId, (payload.body as { key: string })?.key, (payload.body as { value: unknown })?.value)
        return settings
      }
      if (payload.kind === 'identity') {
        return {
          pluginId: identity.pluginId,
          providerId: identity.providerId,
          surfaceId: identity.surfaceId,
          contextId: identity.contextId,
          pageId: identity.pageId,
        }
      }
      if (payload.kind === 'ready' && identity.pageId && !identity.surfaceId) return { ok: true }
      if (payload.kind === 'theme') return pluginViews.getTheme()
      if (payload.kind === 'navigate') {
        const routePath = (payload.body as { path?: unknown })?.path
        if (typeof routePath !== 'string' || !BUILTIN_PAGES.some(page => page.path === routePath)) {
          throw new PluginSecurityError('invalid_request', 'Invalid navigation path')
        }
        mainSend(requireMainWindow(), COLLECTION_EVENT_NAME.host_state, { type: 'navigate', path: routePath })
        return { ok: true }
      }
      if (payload.kind.startsWith('storage.')) {
        return handleStorage(identity.pluginId, payload.kind, payload.body)
      }
      if (!identity.surfaceId || !identity.providerId || !identity.contextId) {
        throw new PluginSecurityError('unsupported', 'This view is not a collection provider')
      }
      if (pending.size >= 32) throw new PluginSecurityError('busy', 'Too many pending plugin requests')
      const requestId = randomBytes(12).toString('hex')
      return requestFromHost({
        requestId,
        pluginId: identity.pluginId,
        providerId: identity.providerId,
        surfaceId: identity.surfaceId,
        contextId: identity.contextId,
        payload: payload as ForwardedPluginRequest['payload'],
      })
    })
  })
}
