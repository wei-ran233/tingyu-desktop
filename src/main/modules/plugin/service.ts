import type { LoadedThemeResources } from '@common/theme/resources'
import { NATIVE_BUNDLES, resolveNativeBundles } from '@common/bundles'
import officialBuild from '@common/bundles/official-build.json'
import radioBuild from '@common/bundles/radio-build.json'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { PluginSecurityError, canonicalizePluginValue, isPluginApiCompatible } from '@common/plugin/security'
import type { PluginSettingsChange, PluginSettingsTransferContext, PluginPublicInfo, PluginRegistryEntry, PluginCredentialStatus } from '@common/plugin/types'
import { PluginStore } from './installer'
import { settingsFilePath } from './settingsSnapshots'
import { type PluginCredentialVault } from './credentialVault'
import { getTrustedPluginFingerprints } from './trustedKeys'
import { digestMapToFiles, verifyManifestSignature } from './signature'
import { resolvePluginDependencies } from '@common/plugin/dependencies'
import { buildPluginInstallImpact } from '@common/plugin/installImpact'
import { createPluginSettingsDocument, validatePluginSettingsDocument, validPluginSettingValue } from '@common/plugin/settings'
import { PluginLifecycle, type RuntimeBackend } from './lifecycle'
const nativeBuilds: Record<string, { buildHash: string }> = { 'lx.official-suite': officialBuild, 'lx.radio': radioBuild }
const settingVersion = (manifest: PluginRegistryEntry['manifest']): number => manifest.settingsVersion ?? 1

const toPublicInfo = (entry: PluginRegistryEntry, allowDevelopmentKeys = false): PluginPublicInfo => {
  let compatible = true
  let incompatibleReason: string | undefined
  let signerFingerprint = entry.publicKeyFingerprint
  try {
    if (entry.source === 'development' && !allowDevelopmentKeys) throw new PluginSecurityError('development_disabled', 'Development plugins are unavailable in production')
    if (entry.source !== 'development') {
      const signature = verifyManifestSignature(entry.manifest, digestMapToFiles(entry.fileDigests))
      signerFingerprint = signature.fingerprint
      if (signerFingerprint !== entry.publicKeyFingerprint) {
        throw new PluginSecurityError('invalid_signature', 'Plugin signer fingerprint does not match its manifest')
      }
    }
    if (!isPluginApiCompatible(entry.manifest.apiVersion)) {
      compatible = false
      incompatibleReason = `Requires plugin API ${entry.manifest.apiVersion}`
    }
    const nativeBuild = Object.prototype.hasOwnProperty.call(nativeBuilds, entry.manifest.id)
      ? nativeBuilds[entry.manifest.id]
      : undefined
    if (nativeBuild && (
      !entry.manifest.nativeBundle ||
      entry.manifest.nativeBundle.id !== entry.manifest.id ||
      entry.manifest.nativeBundle.buildHash !== nativeBuild.buildHash ||
      !getTrustedPluginFingerprints(allowDevelopmentKeys).includes(signerFingerprint)
    )) {
      compatible = false
      incompatibleReason = 'Official bundle does not match this application build or trusted signing key'
    }
  } catch (error: any) {
    compatible = false
    incompatibleReason = error?.message ?? 'Signature verification failed'
  }
  return {
    id: entry.manifest.id,
    name: entry.manifest.name,
    version: entry.manifest.version,
    apiVersion: entry.manifest.apiVersion,
    description: entry.manifest.description,
    author: entry.manifest.author,
    icon: entry.manifest.icon,
    enabled: entry.enabled,
    compatible,
    incompatibleReason,
    source: entry.source,
    publicKeyFingerprint: signerFingerprint,
    permissions: entry.manifest.permissions,
    pages: entry.manifest.pages ?? [],
    nativeBundle: entry.manifest.nativeBundle,
    providers: entry.manifest.collection?.providers ?? [],
    themes: entry.manifest.themes ?? [],
    dependencies: entry.manifest.dependencies,
    optionalDependencies: entry.manifest.optionalDependencies,
    conflicts: entry.manifest.conflicts,
    settings: entry.manifest.settings,
    settingsVersion: entry.manifest.settingsVersion,
    credentials: entry.manifest.credentials,
    runtime: entry.manifest.runtime,
    extensionPoints: entry.manifest.extensionPoints,
    extensions: entry.manifest.extensions,
    canRollback: !!entry.previous,
    official: entry.manifest.id === 'lx.official-list' && getTrustedPluginFingerprints(allowDevelopmentKeys).includes(entry.publicKeyFingerprint),
  }
}

export class PluginService {
  readonly store: PluginStore
  private readonly root: string
  private initialized = false
  private lifecycle: PluginLifecycle | null = null
  private mutations: Promise<unknown> = Promise.resolve()
  private readonly credentialEpochs = new Map<string, number>()
  async configureLifecycle(backend: RuntimeBackend) {
    this.lifecycle = new PluginLifecycle(backend, () => { this.notifyNativeBundles() })
    await this.syncLifecycle()
  }

  private async syncLifecycle() {
    if (this.lifecycle) await this.lifecycle.reconcile(this.catalog().map(plugin => ({ ...plugin, runtimeKey: this.store.get(plugin.id)!.manifest.signature || JSON.stringify(this.store.get(plugin.id)!.fileDigests) })))
    this.notifyNativeBundles()
  }

  private async change<T>(id: string, run: () => Promise<T>, retry = true): Promise<T> {
    this.credentialEpochs.set(id, (this.credentialEpochs.get(id) ?? 0) + 1)
    // Revoke immediately, even if a previous mutation is awaiting activate().
    // File/registry mutations themselves remain serialized below.
    const stopping = this.lifecycle?.suspend(id)
    const work = async() => {
      await stopping
      // Complete any already-committing configuration write before replacing
      // this package/schema or removing its files.
      const before = this.store.get(id)
      if (retry) this.lifecycle?.retry(id)
      try { return await this.withSettingsLock(id, run) } finally {
        await this.syncLifecycle()
        const after = this.store.get(id)
        if (before && after && before.settingsFile !== after.settingsFile) {
          try { this.notifySettings(id, await this.getSettings(id)) } catch (error) { console.warn('[plugin] settings snapshot notification failed', error) }
        }
      }
    }
    const pending = this.mutations.then(work, work)
    this.mutations = pending.catch(() => {})
    return pending
  }

  async shutdown() {
    if (this.lifecycle) await this.lifecycle.reconcile([])
  }

  async processExtension(target: string, input: unknown, signal?: AbortSignal) {
    if (!this.lifecycle) throw new PluginSecurityError('unavailable', 'Plugin runtime has not started')
    return this.lifecycle.process(target, input, signal)
  }

  async provideExtension(target: string, input: unknown, signal?: AbortSignal) {
    if (!this.lifecycle) throw new PluginSecurityError('unavailable', 'Plugin runtime has not started')
    return this.lifecycle.provide(target, input, signal)
  }

  getActions(target: string) { return this.lifecycle?.listActions(target) ?? [] }
  async executeAction(target: string, actionId: string, input: unknown, signal?: AbortSignal) {
    if (!this.lifecycle) throw new PluginSecurityError('unavailable', 'Plugin runtime has not started')
    return this.lifecycle.act(target, actionId, input, signal)
  }

  getRenderers(target: string) { return this.lifecycle?.listRenderers(target) ?? [] }
  async renderExtension(target: string, renderId: string, input: unknown, signal?: AbortSignal) {
    if (!this.lifecycle) throw new PluginSecurityError('unavailable', 'Plugin runtime has not started')
    return this.lifecycle.render(target, renderId, input, signal)
  }

  async getThemeResources(pluginId: string, themeId: string): Promise<LoadedThemeResources> {
    const entry = this.getEntry(pluginId)
    const theme = entry.manifest.themes?.find(theme => theme.id === themeId)
    if (!theme || !entry.manifest.permissions.includes('theme.contribute') || !entry.manifest.permissions.includes('theme.resources')) throw new PluginSecurityError('permission_denied', 'Theme resources unavailable')
    const resources: LoadedThemeResources = { icons: { ...theme.resources?.icons } }
    if (theme.resources?.background) resources.background = (await import('./themeResources')).normalizeThemePng(await this.readPluginFile(pluginId, theme.resources.background))
    if (this.getEntry(pluginId) !== entry) throw new PluginSecurityError('unavailable', 'Theme package changed during resource loading')
    return resources
  }

  getLifecycleEvents() { return this.lifecycle?.events ?? [] }
  private readonly listeners = new Set<(bundles: string[]) => void>()
  subscribeNativeBundles(listener: (bundles: string[]) => void) {
    this.listeners.add(listener)
    listener(this.getNativeBundles())
    return () => { this.listeners.delete(listener) }
  }

  private readonly settingsListeners = new Set<(change: PluginSettingsChange) => void>()
  subscribeSettings(listener: (change: PluginSettingsChange) => void) {
    this.settingsListeners.add(listener)
    return () => { this.settingsListeners.delete(listener) }
  }

  private notifyNativeBundles() {
    const bundles = this.getNativeBundles()
    for (const listener of this.listeners) {
      try { listener(bundles) } catch (error) { console.error('[plugin] native lifecycle failed', error) }
    }
  }

  private bundledDir?: string

  constructor(root: string, private readonly allowDevelopmentKeys = false, private readonly credentialVault?: PluginCredentialVault) {
    this.root = root
    this.store = new PluginStore(root)
  }

  private credentialEntry(id: string, key?: string) {
    const entry = this.refreshEntry(id)
    if (entry.source === 'development' || !isPluginApiCompatible(entry.manifest.apiVersion) ||
      !entry.manifest.permissions.includes('credentials.scoped')) {
      throw new PluginSecurityError('permission_denied', '此插件不能使用凭据存储')
    }
    const fingerprint = verifyManifestSignature(entry.manifest, digestMapToFiles(entry.fileDigests)).fingerprint
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new PluginSecurityError('permission_denied', '凭据身份不可用')
    const field = key === undefined ? undefined : entry.manifest.credentials?.find(field => field.key === key)
    if (key !== undefined && !field) throw new PluginSecurityError('permission_denied', '插件未声明此凭据')
    return { entry, fingerprint, field }
  }

  private requireCredentialVault(): PluginCredentialVault {
    if (!this.credentialVault) throw new PluginSecurityError('unavailable', '凭据存储不可用')
    return this.credentialVault
  }

  async credentialStatus(id: string): Promise<PluginCredentialStatus> {
    return this.withSettingsLock(id, async() => {
      const { entry, fingerprint } = this.credentialEntry(id)
      return this.requireCredentialVault().status(id, fingerprint, (entry.manifest.credentials ?? []).map(field => field.key))
    })
  }

  async setCredential(id: string, key: string, value: unknown, signerFingerprint: string): Promise<PluginCredentialStatus> {
    // Validate before suspending a healthy runtime; repeat inside the mutation
    // because a queued package update can replace the declaration or identity.
    const validate = () => {
      if (typeof key !== 'string') throw new PluginSecurityError('invalid_request', '凭据键无效')
      const context = this.credentialEntry(id, key)
      if (signerFingerprint !== context.fingerprint) throw new PluginSecurityError('permission_denied', '插件签名者已变化，请刷新设置页')
      if (typeof value !== 'string' || value.length === 0 || value.length > (context.field!.maxLength ?? 4096) || Buffer.byteLength(value, 'utf8') > 16384) {
        throw new PluginSecurityError('invalid_request', '凭据值为空或超出允许长度')
      }
      return context
    }
    validate()
    await this.change(id, async() => {
      const { fingerprint } = validate()
      await this.requireCredentialVault().set(id, fingerprint, key, value as string)
    })
    return this.credentialStatus(id)
  }

  async removeCredential(id: string, key: string, signerFingerprint: string): Promise<PluginCredentialStatus> {
    const validate = () => {
      if (typeof key !== 'string') throw new PluginSecurityError('invalid_request', '凭据键无效')
      const context = this.credentialEntry(id, key)
      if (signerFingerprint !== context.fingerprint) throw new PluginSecurityError('permission_denied', '插件签名者已变化，请刷新设置页')
      return context
    }
    validate()
    await this.change(id, async() => {
      const { fingerprint } = validate()
      await this.requireCredentialVault().remove(id, fingerprint, key)
    })
    return this.credentialStatus(id)
  }

  async readCredential(id: string, key: string, signature: string): Promise<string | undefined> {
    if (typeof key !== 'string') throw new PluginSecurityError('invalid_request', '凭据键无效')
    const check = () => {
      const context = this.credentialEntry(id, key)
      const state = this.lifecycle?.status(id)?.state
      if (context.entry.manifest.signature !== signature || !context.entry.enabled ||
        !context.entry.manifest.runtime || !this.catalog().find(plugin => plugin.id === id)?.available ||
        (state !== 'active' && state !== 'activating')) {
        throw new PluginSecurityError('unavailable', '插件运行实例不能读取凭据')
      }
      return context
    }
    const { entry, fingerprint } = check()
    const epoch = this.credentialEpochs.get(id)
    const value = await this.requireCredentialVault().get(id, fingerprint, key)
    const current = check()
    if (current.entry !== entry || this.credentialEpochs.get(id) !== epoch) throw new PluginSecurityError('unavailable', '读取期间插件已变化')
    if (value !== undefined && value.length > (current.field!.maxLength ?? 4096)) {
      throw new PluginSecurityError('invalid_credential', '已保存的凭据不符合当前长度约束，请重新填写')
    }
    return value
  }

  async clearCredentials(id: string, signerFingerprint: string): Promise<PluginCredentialStatus> {
    const validate = () => {
      const context = this.credentialEntry(id)
      if (signerFingerprint !== context.fingerprint) throw new PluginSecurityError('permission_denied', '插件签名者已变化，请刷新设置页')
      return context
    }
    validate()
    await this.change(id, async() => {
      const { fingerprint } = validate()
      await this.requireCredentialVault().clear(id, fingerprint)
    })
    return this.credentialStatus(id)
  }

  async init(bundledDir?: string): Promise<void> {
    if (this.initialized) return
    await this.store.init()
    this.bundledDir = bundledDir
    if (bundledDir) await this.importBundled(bundledDir)
    this.initialized = true
  }

  private async importBundled(dir: string): Promise<void> {
    let files: string[]
    try {
      files = await fs.readdir(dir)
    } catch {
      return
    }
    for (const file of files.filter(name => name.endsWith('.lxplugin')).sort()) {
      const packagePath = path.join(dir, file)
      try {
        const stat = await fs.stat(packagePath)
        if (!stat.isFile()) continue
        // Bundled packages are shipped with the application. Prefer a
        // user-installed copy of the same plugin and only refresh bundled rows.
        let bundledId = ''
        let defaultEnabled = true
        try {
          const { readZipEntries } = await import('./zipArchive')
          const manifestRaw = readZipEntries(await fs.readFile(packagePath)).get('manifest.json')
          if (manifestRaw) { const manifest = JSON.parse(manifestRaw.toString('utf8')); bundledId = String(manifest?.id ?? ''); defaultEnabled = manifest.defaultEnabled !== false }
        } catch {
          continue
        }
        const existing = bundledId ? this.store.get(bundledId) : undefined
        if (this.store.wasBundledRemoved(bundledId)) continue
        // Native bundles must follow the compiled application. An older manually
        // installed activation package must not lock out all official features
        // after an app update. The installer still enforces signing-key pinning.
        if (existing && existing.source === 'installed' && (
          !nativeBuilds[bundledId] || existing.manifest.nativeBundle?.buildHash === nativeBuilds[bundledId].buildHash
        )) continue
        const outcome = await this.store.installFromPackage(packagePath, {
          source: 'bundled',
          enabled: existing?.enabled ?? defaultEnabled,
          trustedFingerprints: getTrustedPluginFingerprints(this.allowDevelopmentKeys),
        })
        if (existing && !existing.enabled) await this.store.setEnabled(outcome.entry.id, false)
      } catch (error: any) {
        console.warn('[plugin] failed to load bundled package', file, error?.message)
      }
    }
  }

  private catalog(): PluginPublicInfo[] {
    return resolvePluginDependencies(this.store.list().map(entry => toPublicInfo(entry, this.allowDevelopmentKeys)))
  }

  list(): PluginPublicInfo[] {
    return this.catalog().map(entry => {
      const plugin = { ...entry, optionalDependencyStates: this.lifecycle?.optionalDependencyStates(entry.id) ?? entry.optionalDependencies?.map(dependency => ({ id: dependency.id, available: false, reason: '插件运行时尚未启动' })) }
      const status = this.lifecycle?.status(plugin.id)
      if (status) return { ...plugin, lifecycleState: status.state, available: plugin.available && status.state === 'active', blockedReason: plugin.blockedReason ?? (status.state === 'active' ? undefined : status.reason ?? '插件正在准备') }
      return plugin.runtime ? { ...plugin, available: false, lifecycleState: plugin.enabled ? 'installed' : 'disabled', blockedReason: plugin.blockedReason ?? '插件运行时尚未启动' } : plugin
    })
  }

  private refreshEntry(id: string): PluginRegistryEntry {
    const entry = this.store.get(id)
    if (!entry) throw new PluginSecurityError('not_found', 'Plugin not found')
    if (entry.source === 'development' && !this.allowDevelopmentKeys) throw new PluginSecurityError('development_disabled', 'Development plugins are unavailable in production')
    if (entry.source !== 'development') {
      verifyManifestSignature(entry.manifest, digestMapToFiles(entry.fileDigests))
    }
    return entry
  }

  /**
   * Loads an unpacked plugin directory. This is only reachable through an
   * explicit development flag; production builds never enable it.
   */
  async installDevDirectory(dir: string) {
    if (!this.allowDevelopmentKeys) throw new PluginSecurityError('development_disabled', 'Development plugins are unavailable in production')
    const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'))
    return this.change(String(manifest.id), async() => this.store.installDevDirectory(dir))
  }

  async readPluginFile(pluginId: string, relativePath: string, runtimeBootstrap = false): Promise<Buffer> {
    const entry = this.resourceEntry(pluginId, runtimeBootstrap)
    const file = this.resolvePluginFile(pluginId, relativePath, runtimeBootstrap)
    const data = await fs.readFile(file)
    if (entry.source !== 'development') this.store.verifyFile(entry, relativePath, data)
    return data
  }

  getEntry(id: string): PluginRegistryEntry {
    const entry = this.refreshEntry(id)
    const state = this.getPublicInfo(id)
    if (!state?.available) throw new PluginSecurityError('unavailable', state?.blockedReason ?? 'Plugin is unavailable')
    return entry
  }

  getPublicInfo(id: string): PluginPublicInfo | undefined {
    return this.list().find(plugin => plugin.id === id)
  }

  getNativeBundles(): string[] {
    return resolveNativeBundles(this.list().filter(plugin => plugin.available && !!nativeBuilds[plugin.id] && !!plugin.nativeBundle && plugin.source !== 'development').map(plugin => plugin.id))
  }

  getPages() {
    return this.list().filter(plugin => plugin.available).flatMap(plugin => plugin.pages.map(page => ({ pluginId: plugin.id, pluginName: plugin.name, ...page })))
  }

  private readonly settingsLocks = new Map<string, Promise<unknown>>()
  async getSettings(id: string): Promise<Record<string, string | number | boolean>> {
    // Reads stay parallel, but must not publish a staged registry/settings pair.
    for (let attempt = 0; attempt < 4; attempt++) {
      const barrier = this.settingsLocks.get(id)
      await barrier
      const entry = this.refreshEntry(id)
      const settings = await this.readSettings(entry)
      if (this.store.get(id) === entry && this.settingsLocks.get(id) === barrier) return settings
    }
    throw new PluginSecurityError('settings_changed', '读取期间插件或参数持续变化，请重试')
  }

  private async readSettings(entry: PluginRegistryEntry): Promise<Record<string, string | number | boolean>> {
    const fields = entry.manifest.settings ?? []
    let saved: Record<string, unknown> = {}
    try { saved = JSON.parse(await fs.readFile(settingsFilePath(this.root, entry), 'utf8')) } catch {}
    return Object.fromEntries(fields.map(field => [field.key, saved && Object.prototype.hasOwnProperty.call(saved, field.key) && validPluginSettingValue(field, saved[field.key]) ? saved[field.key] : field.default])) as Record<string, string | number | boolean>
  }

  async setSetting(id: string, key: string, value: unknown) {
    const run = async() => {
      const entry = this.getEntry(id)
      const field = entry.manifest.settings?.find(field => field.key === key)
      if (!field || !validPluginSettingValue(field, value)) throw new PluginSecurityError('invalid_request', 'Invalid plugin setting')
      const settings = await this.readSettings(entry)
      this.getEntry(id)
      const changed = settings[key] !== value
      settings[key] = value
      const dir = path.join(this.root, 'settings'); await fs.mkdir(dir, { recursive: true })
      const file = settingsFilePath(this.root, entry)
      await fs.writeFile(file + '.tmp', JSON.stringify(settings), { mode: 0o600 })
      await fs.rename(file + '.tmp', file)
      if (changed) this.notifySettings(id, settings)
      return settings
    }
    return this.withSettingsLock(id, run)
  }

  private settingsDigest(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(canonicalizePluginValue(value))).digest('hex')
  }

  private transferContext(entry: PluginRegistryEntry): PluginSettingsTransferContext {
    if (entry.source === 'development' || !/^[a-f0-9]{64}$/.test(entry.publicKeyFingerprint)) {
      throw new PluginSecurityError('invalid_signature', '参数导入导出仅支持已验证签名的插件包')
    }
    const fields = entry.manifest.settings ?? []
    if (!entry.manifest.permissions.includes('settings.scoped') || !fields.some(field => field.exportable === true)) throw new PluginSecurityError('permission_denied', '插件未声明可导出的参数')
    const settingsVersion = entry.manifest.settingsVersion ?? 1
    return { pluginId: entry.id, signerFingerprint: entry.publicKeyFingerprint, settingsVersion, schemaFingerprint: this.settingsDigest({ settingsVersion, fields }), fields }
  }

  /** All transfer snapshots share the ordinary setting-write lock. */
  async exportSettings(id: string) {
    return this.withSettingsLock(id, async() => {
      const entry = this.getEntry(id)
      const context = this.transferContext(entry)
      const settings = await this.readSettings(entry)
      if (this.getEntry(id) !== entry) throw new PluginSecurityError('unavailable', '参数读取期间插件已变化')
      return createPluginSettingsDocument(context, settings)
    })
  }

  async previewSettingsImport(id: string, input: unknown) {
    return this.withSettingsLock(id, async() => {
      const entry = this.getEntry(id)
      const document = validatePluginSettingsDocument(input, this.transferContext(entry))
      const settings = await this.readSettings(entry)
      if (this.getEntry(id) !== entry) throw new PluginSecurityError('unavailable', '参数预览期间插件已变化')
      const changes = Object.entries(document.values).filter(([key, value]) => settings[key] !== value).map(([key, value]) => ({ key, title: entry.manifest.settings!.find(field => field.key === key)!.title, previous: settings[key], value }))
      return { document, changes, packageSignature: entry.manifest.signature || this.settingsDigest(entry.fileDigests), settingsHash: this.settingsDigest(settings) }
    })
  }

  async importSettings(id: string, input: unknown, expected: { packageSignature: string, settingsHash: string }) {
    return this.withSettingsLock(id, async() => {
      const entry = this.getEntry(id)
      const document = validatePluginSettingsDocument(input, this.transferContext(entry))
      const settings = await this.readSettings(entry)
      if (this.getEntry(id) !== entry || expected.packageSignature !== (entry.manifest.signature || this.settingsDigest(entry.fileDigests)) || expected.settingsHash !== this.settingsDigest(settings)) throw new PluginSecurityError('settings_changed', '预览后插件或参数已变化，请重新导入')
      const next = { ...settings, ...document.values }
      if (Object.entries(document.values).some(([key, value]) => settings[key] !== value)) {
        await this.writeSettings(id, next)
        this.notifySettings(id, next)
      }
      return next
    })
  }

  private async writeSettings(id: string, settings: Record<string, string | number | boolean>) {
    const dir = path.join(this.root, 'settings')
    await fs.mkdir(dir, { recursive: true })
    const file = settingsFilePath(this.root, this.refreshEntry(id))
    const temporary = file + '.' + randomBytes(12).toString('hex') + '.tmp'
    try {
      await fs.writeFile(temporary, JSON.stringify(settings), { mode: 0o600, flag: 'wx' })
      await fs.rename(temporary, file)
    } finally { await fs.rm(temporary, { force: true }) }
  }

  /** Clear overrides so current and future package defaults take effect. */
  async resetSettings(id: string): Promise<Record<string, string | number | boolean>> {
    return this.withSettingsLock(id, async() => {
      const entry = this.getEntry(id)
      const previous = await this.readSettings(entry)
      this.getEntry(id)
      const defaults = Object.fromEntries((entry.manifest.settings ?? []).map(field => [field.key, field.default]))
      try { await fs.unlink(settingsFilePath(this.root, entry)) } catch (error: any) { if (error.code !== 'ENOENT') throw error }
      if (Object.entries(defaults).some(([key, value]) => previous[key] !== value)) this.notifySettings(id, defaults)
      return defaults
    })
  }

  private async withSettingsLock<T>(id: string, run: () => Promise<T>): Promise<T> {
    const pending = (this.settingsLocks.get(id) ?? Promise.resolve()).then(run, run)
    this.settingsLocks.set(id, pending.catch(() => {}))
    return pending
  }

  private notifySettings(id: string, settings: Record<string, string | number | boolean>) {
    const targets = this.lifecycle?.settingsChanged(id) ?? []
    for (const listener of this.settingsListeners) {
      try { listener({ pluginId: id, settings: { ...settings }, targets: [...targets] }) } catch (error) { console.error('[plugin] settings listener failed', error) }
    }
  }

  private installContextFingerprint(): string {
    const entries = this.store.list().map(entry => ({
      id: entry.id,
      manifest: entry.manifest,
      signature: entry.manifest.signature,
      fileDigests: entry.fileDigests,
      enabled: entry.enabled,
      source: entry.source,
    })).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    return createHash('sha256').update(JSON.stringify(canonicalizePluginValue(entries))).digest('hex')
  }

  private assertInstallContext(expected?: string) {
    if (expected === undefined || expected === this.installContextFingerprint()) return
    throw new PluginSecurityError('catalog_changed', '插件目录在预览后已变化，请重新预览安装影响')
  }

  private installCandidate(
    packagePath: string,
    preview: Awaited<ReturnType<PluginStore['previewPackage']>>,
    previous?: PluginRegistryEntry,
  ): PluginPublicInfo {
    return toPublicInfo({
      id: preview.manifest.id,
      path: previous?.path ?? packagePath,
      source: 'installed',
      // Match installFromPackage(): upgrades keep the current switch state,
      // while a new user-installed plugin starts enabled.
      enabled: previous?.enabled ?? true,
      publicKey: preview.manifest.publicKey,
      publicKeyFingerprint: preview.fingerprint,
      manifest: preview.manifest,
      fileDigests: preview.fileDigests,
      installedAt: 0,
    }, this.allowDevelopmentKeys)
  }

  private assertPreviewCandidate(
    previous: PluginRegistryEntry | undefined,
    preview: Awaited<ReturnType<PluginStore['previewPackage']>>,
    candidate: PluginPublicInfo,
  ) {
    if (!candidate.compatible) {
      throw new PluginSecurityError(
        'incompatible_plugin',
        `Plugin ${candidate.id} is incompatible: ${candidate.incompatibleReason ?? 'unknown reason'}`,
      )
    }
    if (!previous) return
    const previousVersion = settingVersion(previous.manifest)
    const targetVersion = settingVersion(preview.manifest)
    const hasPreviousSettingsFile = Object.prototype.hasOwnProperty.call(previous, 'settingsFile')
    if (!hasPreviousSettingsFile && preview.manifest.settingsMigrations === undefined &&
      previousVersion === targetVersion) return
    if (targetVersion < previousVersion) {
      throw new PluginSecurityError('invalid_settings_snapshot', 'Plugin settings version downgrade is rejected; use the existing package rollback instead')
    }
    if (targetVersion === previousVersion &&
      JSON.stringify(canonicalizePluginValue(previous.manifest.settings ?? [])) !==
      JSON.stringify(canonicalizePluginValue(preview.manifest.settings ?? []))) {
      throw new PluginSecurityError('invalid_settings_snapshot', 'Plugin settings declaration changed without a settings version increase')
    }
  }

  async previewInstall(packagePath: string) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const contextFingerprint = this.installContextFingerprint()
      const preview = await this.store.previewPackage(packagePath)
      const previous = this.store.get(preview.manifest.id)
      const candidate = this.installCandidate(packagePath, preview, previous)
      this.assertPreviewCandidate(previous, preview, candidate)
      const catalog = this.catalog()
      if (contextFingerprint !== this.installContextFingerprint()) continue
      return {
        packagePath,
        archiveHash: preview.archiveHash,
        id: preview.manifest.id,
        name: preview.manifest.name,
        version: preview.manifest.version,
        author: preview.manifest.author,
        description: preview.manifest.description,
        permissions: preview.manifest.permissions,
        dependencies: preview.manifest.dependencies ?? [],
        optionalDependencies: preview.manifest.optionalDependencies ?? [],
        conflicts: preview.manifest.conflicts ?? [],
        fingerprint: preview.fingerprint,
        previousFingerprint: preview.previousFingerprint,
        keyChanged: preview.previousFingerprint != null && preview.previousFingerprint !== preview.fingerprint,
        requiresConfirmation: preview.previousFingerprint == null,
        impact: buildPluginInstallImpact(catalog, candidate),
        contextFingerprint,
      }
    }
    throw new PluginSecurityError('catalog_changed', '插件目录在预览期间持续变化，请重新预览安装影响')
  }

  async install(packagePath: string, expectedFingerprint?: string, expectedArchiveHash?: string, expectedContextFingerprint?: string) {
    this.assertInstallContext(expectedContextFingerprint)
    const preview = await this.store.previewPackage(packagePath)
    const previous = this.store.get(preview.manifest.id)
    this.assertPreviewCandidate(
      previous,
      preview,
      this.installCandidate(packagePath, preview, previous),
    )
    const outcome = await this.change(preview.manifest.id, async() => {
      // change() suspends immediately; this second check runs only when the
      // serialized registry/package transaction reaches its commit boundary.
      this.assertInstallContext(expectedContextFingerprint)
      return this.store.installFromPackage(packagePath, {
        source: 'installed',
        expectedFingerprint: expectedFingerprint?.length ? expectedFingerprint : preview.fingerprint,
        expectedArchiveHash: expectedArchiveHash?.length ? expectedArchiveHash : preview.archiveHash,
      })
    })
    return {
      plugin: this.getPublicInfo(outcome.entry.id)!,
      fingerprint: outcome.fingerprint,
      requiresConfirmation: outcome.previousFingerprint == null,
    }
  }

  async rollback(id: string) {
    const entry = await this.change(id, async() => this.store.rollback(id))
    return this.getPublicInfo(entry.id)!
  }

  async setEnabled(id: string, enabled: boolean) {
    const entry = await this.change(id, async() => this.store.setEnabled(id, enabled), enabled)
    return this.getPublicInfo(entry.id)!
  }

  async uninstall(id: string) {
    await this.settingsLocks.get(id)
    await this.change(id, async() => {
      const entry = this.store.get(id)
      const fingerprint = entry && entry.source !== 'development'
        ? verifyManifestSignature(entry.manifest, digestMapToFiles(entry.fileDigests)).fingerprint : undefined
      // Keep the signed identity selectable if deleting its credential file
      // fails. Uninstall explicitly authorizes secret destruction; a later
      // package failure must not restore a credential the user asked to remove.
      if (fingerprint && this.credentialVault) await this.credentialVault.clear(id, fingerprint)
      try { await this.store.remove(id) } catch (error) {
        if (fingerprint && this.credentialVault) throw new PluginSecurityError('uninstall_failed', '凭据已清理，但插件卸载失败；请重试卸载。完成卸载后可重新安装并填写凭据')
        throw error
      }
    })
    this.settingsLocks.delete(id)
  }

  async restoreBundled(id: string) {
    if (!NATIVE_BUNDLES.some(bundle => bundle.id === id) || !this.bundledDir) throw new PluginSecurityError('not_found', 'Bundled recovery package is unavailable')
    const packagePath = path.join(this.bundledDir, `${id}.lxplugin`)
    const preview = await this.store.previewPackage(packagePath)
    if (preview.manifest.id !== id) throw new PluginSecurityError('invalid_manifest', 'Recovery package has an unexpected id')
    await this.change(id, async() => {
      await this.store.installFromPackage(packagePath, {
        source: 'bundled',
        enabled: true,
        expectedArchiveHash: preview.archiveHash,
        trustedFingerprints: getTrustedPluginFingerprints(this.allowDevelopmentKeys),
      })
      await this.store.setEnabled(id, true)
    })
  }

  private resourceEntry(id: string, runtimeBootstrap: boolean) {
    if (!runtimeBootstrap) return this.getEntry(id)
    const entry = this.refreshEntry(id)
    if (!entry.manifest.runtime || !this.catalog().find(plugin => plugin.id === id)?.available) throw new PluginSecurityError('unavailable', 'Runtime bootstrap unavailable')
    return entry
  }

  resolvePluginFile(pluginId: string, relativePath: string, runtimeBootstrap = false): string {
    const entry = this.resourceEntry(pluginId, runtimeBootstrap)
    const base = path.resolve(entry.path)
    const target = path.resolve(base, relativePath)
    if (target !== base && !target.startsWith(base + path.sep)) {
      throw new PluginSecurityError('unsafe_path', 'Plugin resource escapes its directory')
    }
    return target
  }

  get rootDirectory() {
    return this.root
  }
}
