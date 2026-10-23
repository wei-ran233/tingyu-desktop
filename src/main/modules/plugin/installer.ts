import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  MAX_MANIFEST_BYTES,
  MAX_PLUGIN_ARCHIVE_BYTES,
  PluginSecurityError,
  isPluginApiCompatible,
  validatePluginManifest,
} from '@common/plugin/security'
import type { PluginManifest, PluginRegistryEntry, PluginRegistryFile } from '@common/plugin/types'
import { PluginSettingsSnapshots, settingsFilePath } from './settingsSnapshots'
import { readZipEntries } from './zipArchive'
import { digestMapToFiles, digestPluginFiles, sha256, verifyManifestSignature } from './signature'

interface InstallOptions {
  source?: 'bundled' | 'installed'
  expectedFingerprint?: string
  enabled?: boolean
  /** Bundled packages must be signed by a host-trusted key. */
  expectedArchiveHash?: string
  trustedFingerprints?: readonly string[]
}

export interface InstallOutcome {
  entry: PluginRegistryEntry
  fingerprint: string
  previousFingerprint?: string
}

const randomSuffix = () => randomBytes(6).toString('hex')

const isRecord = (value: unknown): value is Record<string, unknown> => value != null && typeof value === 'object'

export class PluginStore {
  private readonly entries = new Map<string, PluginRegistryEntry>()
  private readonly removedBundled = new Set<string>()
  private readonly root: string
  private readonly registryPath: string
  private changes: Promise<void> = Promise.resolve()
  private readonly settingsSnapshots: PluginSettingsSnapshots

  private async serial<T>(run: () => Promise<T>): Promise<T> {
    const next = this.changes.then(run)
    this.changes = next.then(() => {}, () => {})
    return next
  }

  constructor(root: string) {
    this.root = root
    this.registryPath = path.join(root, 'registry.json')
    this.settingsSnapshots = new PluginSettingsSnapshots(root)
  }

  async init(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true })
    let raw: unknown
    try {
      raw = JSON.parse(await fs.readFile(this.registryPath, 'utf8'))
    } catch {
      raw = null
    }
    if (isRecord(raw) && Array.isArray(raw.removedBundled)) {
      for (const id of raw.removedBundled.slice(0, 1024)) {
        if (typeof id === 'string' && /^[a-z][a-z0-9.-]{0,127}$/.test(id)) this.removedBundled.add(id)
      }
    }
    if (isRecord(raw) && Array.isArray(raw.plugins)) {
      for (const item of raw.plugins) {
        if (!isRecord(item) || typeof item.id !== 'string' || typeof item.path !== 'string') continue
        if (!isRecord(item.manifest)) continue
        try {
          const manifest = validatePluginManifest(item.manifest)
          if (item.id !== manifest.id) throw new PluginSecurityError('invalid_manifest', 'Registry plugin id does not match its manifest')
          if (Object.prototype.hasOwnProperty.call(item, 'settingsFile')) settingsFilePath(this.root, { id: item.id, settingsFile: item.settingsFile as string })
          if (isRecord(item.previous) && Object.prototype.hasOwnProperty.call(item.previous, 'settingsFile')) settingsFilePath(this.root, { id: item.id, settingsFile: item.previous.settingsFile as string })
          const pluginPath = path.resolve(this.root, item.path)
          if (!pluginPath.startsWith(this.root + path.sep)) continue
          this.entries.set(item.id, {
            id: item.id,
            path: pluginPath,
            source: item.source === 'bundled' ? 'bundled' : item.source === 'development' ? 'development' : 'installed',
            enabled: item.enabled !== false,
            publicKey: String(item.publicKey ?? manifest.publicKey),
            publicKeyFingerprint: String(item.publicKeyFingerprint ?? ''),
            manifest,
            ...(item.settingsFile !== undefined ? { settingsFile: item.settingsFile as string } : {}),
            fileDigests: isRecord(item.fileDigests)
              ? Object.fromEntries(Object.entries(item.fileDigests).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
              : {},
            installedAt: Number(item.installedAt) || Date.now(),
            previous: isRecord(item.previous) && typeof item.previous.path === 'string' && path.resolve(item.previous.path).startsWith(this.root + path.sep)
              ? item.previous as unknown as PluginRegistryEntry['previous'] : undefined,
          })
        } catch {
          // Invalid registry records are skipped; a reinstall can repair them.
        }
      }
    }
  }

  list(): PluginRegistryEntry[] {
    return [...this.entries.values()]
  }

  get(id: string): PluginRegistryEntry | undefined {
    return this.entries.get(id)
  }

  wasBundledRemoved(id: string): boolean { return this.removedBundled.has(id) }

  private async persist(plugins = this.list(), removedBundled = [...this.removedBundled]): Promise<void> {
    const file: PluginRegistryFile = { version: 1, plugins, removedBundled }
    const temporary = `${this.registryPath}.${randomSuffix()}.tmp`
    try {
      await fs.writeFile(temporary, JSON.stringify(file, null, 2))
      await fs.rename(temporary, this.registryPath)
    } finally { await fs.rm(temporary, { force: true }).catch(() => {}) }
  }

  private async commitEntry(id: string, entry: PluginRegistryEntry | undefined, bundledRemoved?: boolean): Promise<void> {
    const entries = new Map(this.entries)
    const removed = new Set(this.removedBundled)
    if (entry) entries.set(id, entry)
    else entries.delete(id)
    if (bundledRemoved === true) removed.add(id)
    else if (bundledRemoved === false) removed.delete(id)
    // Public readers keep seeing the last committed package and schema while
    // registry I/O is pending. Publish only after the registry pointer changes.
    await this.persist([...entries.values()], [...removed])
    this.entries.clear()
    for (const [key, value] of entries) this.entries.set(key, value)
    this.removedBundled.clear()
    for (const key of removed) this.removedBundled.add(key)
  }

  async installFromPackage(packagePath: string, options: InstallOptions = {}): Promise<InstallOutcome> {
    const stat = await fs.stat(packagePath)
    if (stat.size > MAX_PLUGIN_ARCHIVE_BYTES) throw new PluginSecurityError('archive_too_large', 'Plugin package exceeds the size limit')
    return this.installArchive(await fs.readFile(packagePath), options)
  }

  async previewPackage(packagePath: string): Promise<{
    manifest: PluginManifest
    fingerprint: string
    previousFingerprint?: string
    archiveHash: string
    fileDigests: Record<string, string>
  }> {
    const stat = await fs.stat(packagePath)
    if (stat.size > MAX_PLUGIN_ARCHIVE_BYTES) throw new PluginSecurityError('archive_too_large', 'Plugin package exceeds the size limit')
    const archive = await fs.readFile(packagePath)
    const files = readZipEntries(archive)
    const manifestBuffer = files.get('manifest.json')
    if (!manifestBuffer) throw new PluginSecurityError('invalid_manifest', 'Plugin package is missing manifest.json')
    const manifest = validatePluginManifest(JSON.parse(manifestBuffer.toString('utf8')))
    if (!isPluginApiCompatible(manifest.apiVersion)) throw new PluginSecurityError('incompatible_api', `Plugin requires API ${manifest.apiVersion}`)
    const digests = digestPluginFiles(files)
    const signature = verifyManifestSignature(manifest, digests)
    const previous = this.entries.get(manifest.id)
    return {
      manifest,
      archiveHash: sha256(archive),
      fingerprint: signature.fingerprint,
      previousFingerprint: previous?.publicKeyFingerprint,
      fileDigests: Object.fromEntries(digests.map(item => [item.path, item.sha256])),
    }
  }

  async installArchive(archive: Buffer, options: InstallOptions = {}): Promise<InstallOutcome> {
    return this.serial(async() => this.installArchiveUnlocked(archive, options))
  }

  private async installArchiveUnlocked(archive: Buffer, options: InstallOptions = {}): Promise<InstallOutcome> {
    if (archive.length > MAX_PLUGIN_ARCHIVE_BYTES) {
      throw new PluginSecurityError('archive_too_large', 'Plugin package exceeds the size limit')
    }
    if (options.expectedArchiveHash && sha256(archive) !== options.expectedArchiveHash) throw new PluginSecurityError('package_changed', 'Plugin package changed after preview; preview it again')
    // Everything below stays in memory until the signature and every path have
    // been validated. Nothing is written outside this store's root.
    const files = readZipEntries(archive)
    const manifestBuffer = files.get('manifest.json')
    if (!manifestBuffer) throw new PluginSecurityError('invalid_manifest', 'Plugin package is missing manifest.json')
    if (manifestBuffer.length > MAX_MANIFEST_BYTES) throw new PluginSecurityError('invalid_manifest', 'Plugin manifest is too large')
    let parsed: unknown
    try {
      parsed = JSON.parse(manifestBuffer.toString('utf8'))
    } catch {
      throw new PluginSecurityError('invalid_manifest', 'Plugin manifest is not valid JSON')
    }
    const manifest: PluginManifest = validatePluginManifest(parsed)
    if (!isPluginApiCompatible(manifest.apiVersion)) {
      throw new PluginSecurityError('incompatible_api', `Plugin requires API ${manifest.apiVersion}`)
    }
    const digests = digestPluginFiles(files)
    const signature = verifyManifestSignature(manifest, digests)
    if (options.trustedFingerprints && !options.trustedFingerprints.includes(signature.fingerprint)) {
      throw new PluginSecurityError('untrusted_key', 'Bundled plugin is not signed by a trusted key')
    }
    if (options.expectedFingerprint != null && signature.fingerprint !== options.expectedFingerprint) {
      throw new PluginSecurityError('key_changed', 'Plugin update must keep the original signing key')
    }

    const previous = this.entries.get(manifest.id)
    if (previous && previous.publicKeyFingerprint !== signature.fingerprint) {
      throw new PluginSecurityError('key_changed', 'Plugin update must keep the original signing key')
    }
    const requiredEntries = [
      manifest.main,
      manifest.icon,
      ...(manifest.collection?.providers ?? []).map(p => p.entry),
      ...(manifest.collection?.providers ?? []).map(p => p.icon),
      ...(manifest.pages ?? []).map(p => p.entry),
      ...(manifest.pages ?? []).map(p => p.icon),
    ].filter((value): value is string => typeof value === 'string')
    for (const entry of requiredEntries) {
      if (!files.has(entry)) throw new PluginSecurityError('missing_entry', `Plugin package is missing ${entry}`)
    }

    if (previous?.manifest.signature === manifest.signature && previous.source === (options.source ?? previous.source)) {
      return { entry: previous, fingerprint: signature.fingerprint, previousFingerprint: previous.publicKeyFingerprint }
    }
    // Immutable version directory + atomic registry pointer. The old tree stays
    // usable until the new files AND registry have been persisted successfully.
    const target = path.join(this.root, `${manifest.id}-${randomSuffix()}`)
    const preparedSettings = await this.settingsSnapshots.prepare(previous, manifest)
    const { previous: discarded, ...lastVersion } = previous ?? { previous: undefined }
    const entry: PluginRegistryEntry = {
      id: manifest.id,
      path: target,
      source: options.source ?? previous?.source ?? 'installed',
      enabled: options.enabled ?? previous?.enabled ?? true,
      publicKey: manifest.publicKey,
      publicKeyFingerprint: signature.fingerprint,
      manifest,
      ...(preparedSettings ? { settingsFile: preparedSettings.settingsFile } : {}),
      fileDigests: Object.fromEntries(digests.map(item => [item.path, item.sha256])),
      installedAt: Date.now(),
      previous: previous ? lastVersion as Omit<PluginRegistryEntry, 'previous'> : undefined,
    }
    try {
      await fs.mkdir(target, { recursive: true })
      for (const [name, data] of files) {
        const destination = path.join(target, ...name.split('/'))
        if (!destination.startsWith(target + path.sep)) throw new PluginSecurityError('unsafe_path', 'Plugin entry escapes install directory')
        await fs.mkdir(path.dirname(destination), { recursive: true })
        await fs.writeFile(destination, data, { mode: 0o644 })
      }
      await this.commitEntry(entry.id, entry, false)
    } catch (error) {
      await fs.rm(target, { recursive: true, force: true })
      await preparedSettings?.cleanup()
      throw error
    }
    if (discarded) {
      await fs.rm(discarded.path, { recursive: true, force: true }).catch(() => {})
      await this.removeSettingsSnapshot(discarded, [entry, ...(entry.previous ? [entry.previous] : [])])
    }
    return { entry, fingerprint: signature.fingerprint, previousFingerprint: previous?.publicKeyFingerprint }
  }

  async rollback(id: string): Promise<PluginRegistryEntry> {
    return this.serial(async() => this.rollbackUnlocked(id))
  }

  private async rollbackUnlocked(id: string): Promise<PluginRegistryEntry> {
    const entry = this.entries.get(id)
    const previous = entry?.previous
    if (!entry || !previous) throw new PluginSecurityError('not_found', 'No previous plugin version')
    if (previous.publicKeyFingerprint !== entry.publicKeyFingerprint) throw new PluginSecurityError('key_changed', 'Invalid rollback key')
    this.verifyEntry(previous)
    for (const relative of Object.keys(previous.fileDigests)) this.verifyFile(previous, relative, await fs.readFile(path.join(previous.path, relative)))
    const restored = { ...previous, enabled: entry.enabled }
    await this.commitEntry(id, restored)
    await fs.rm(entry.path, { recursive: true, force: true }).catch(() => {})
    await this.removeSettingsSnapshot(entry, [restored])
    return restored
  }

  private async removeSettingsSnapshot(entry: Pick<PluginRegistryEntry, 'id' | 'settingsFile'>, retained: Array<Pick<PluginRegistryEntry, 'id' | 'settingsFile'>> = [], strict = false) {
    const file = settingsFilePath(this.root, entry)
    if (retained.some(value => settingsFilePath(this.root, value) === file)) return
    if (strict) await fs.rm(file, { force: true })
    else await fs.rm(file, { force: true }).catch(() => {})
  }

  verifyFile(entry: PluginRegistryEntry, relativePath: string, data: Buffer): void {
    const expected = entry.fileDigests[relativePath]
    if (!expected) throw new PluginSecurityError('not_found', 'Plugin resource is not part of the signed package')
    if (sha256(data) !== expected) {
      throw new PluginSecurityError('integrity_error', 'Plugin resource failed integrity verification')
    }
  }

  async installDevDirectory(dir: string): Promise<PluginRegistryEntry> {
    return this.serial(async() => this.installDevDirectoryUnlocked(dir))
  }

  private async installDevDirectoryUnlocked(dir: string): Promise<PluginRegistryEntry> {
    const manifestRaw = await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')
    const manifest = validatePluginManifest(JSON.parse(manifestRaw))
    const previous = this.entries.get(manifest.id)
    if (manifest.settingsMigrations !== undefined || previous?.settingsFile) throw new PluginSecurityError('invalid_signature', '设置迁移仅支持签名插件包，开发目录不能覆盖快照包')
    const files = new Map<string, Buffer>()
    const walk = async(relative: string): Promise<void> => {
      const absolute = path.join(dir, ...relative.split('/'))
      const entries = await fs.readdir(absolute, { withFileTypes: true })
      for (const item of entries) {
        const next = relative ? `${relative}/${item.name}` : item.name
        if (item.isSymbolicLink()) throw new PluginSecurityError('unsafe_path', 'Development plugins may not contain symbolic links')
        if (item.isDirectory()) {
          await walk(next)
        } else if (item.isFile()) {
          files.set(next, await fs.readFile(path.join(dir, ...next.split('/'))))
        }
      }
    }
    await walk('')
    const target = path.join(this.root, `${manifest.id}-${randomSuffix()}`)
    const entry: PluginRegistryEntry = {
      id: manifest.id,
      path: target,
      source: 'development',
      enabled: true,
      publicKey: manifest.publicKey,
      publicKeyFingerprint: '',
      manifest,
      fileDigests: Object.fromEntries([...files.entries()].filter(([name]) => name !== 'manifest.json').map(([name, data]) => [name, sha256(data)])),
      installedAt: Date.now(),
    }
    try {
      await fs.cp(dir, target, { recursive: true, dereference: true })
      await this.commitEntry(entry.id, entry)
    } catch (error) {
      await fs.rm(target, { recursive: true, force: true })
      throw error
    }
    if (previous) {
      await fs.rm(previous.path, { recursive: true, force: true }).catch(() => {})
      if (previous.previous) await fs.rm(previous.previous.path, { recursive: true, force: true }).catch(() => {})
    }
    return entry
  }

  verifyEntry(entry: PluginRegistryEntry): void {
    verifyManifestSignature(entry.manifest, digestMapToFiles(entry.fileDigests))
  }

  async setEnabled(id: string, enabled: boolean): Promise<PluginRegistryEntry> {
    return this.serial(async() => this.setEnabledUnlocked(id, enabled))
  }

  private async setEnabledUnlocked(id: string, enabled: boolean): Promise<PluginRegistryEntry> {
    const entry = this.entries.get(id)
    if (!entry) throw new PluginSecurityError('not_found', 'Plugin not found')
    const next = { ...entry, enabled }
    await this.commitEntry(id, next)
    return next
  }

  async remove(id: string): Promise<void> {
    return this.serial(async() => this.removeUnlocked(id))
  }

  private async removeUnlocked(id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (!entry) return
    // Keep a persisted, selectable identity until every requested cleanup has
    // succeeded. A partial failure may already have removed files, but retry
    // can finish the remaining work even after restarting the service.
    await fs.rm(entry.path, { recursive: true, force: true })
    if (entry.previous) await fs.rm(entry.previous.path, { recursive: true, force: true })
    await fs.rm(path.join(this.root, 'storage', `${id}.json`), { force: true })
    await this.removeSettingsSnapshot(entry, [], true)
    if (entry.previous) await this.removeSettingsSnapshot(entry.previous, [], true)
    await fs.rm(path.join(this.root, 'settings', `${id}.json`), { force: true })
    await this.commitEntry(id, undefined, true)
  }
}
