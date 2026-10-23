import { randomBytes } from 'node:crypto'
import { constants as fsConstants, promises as fs } from 'node:fs'
import path from 'node:path'
import { migratePluginSettings } from '@common/plugin/settingsMigration'
import {
  PluginSecurityError,
  canonicalizePluginValue,
  isSafePluginId,
} from '@common/plugin/security'
import { validPluginSettingValue } from '@common/plugin/settings'
import type {
  PluginManifest,
  PluginRegistryEntry,
  PluginSettingField,
} from '@common/plugin/types'

const MAX_SETTINGS_SNAPSHOT_BYTES = 2 * 1024 * 1024
const SETTINGS_FILE_RE = /\.([a-f0-9]{24})\.json$/
const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key)

const invalid = (message: string): never => {
  throw new PluginSecurityError('invalid_settings_snapshot', message)
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const settingsFilePath = (
  root: string,
  entry: Pick<PluginRegistryEntry, 'id' | 'settingsFile'>,
): string => {
  if (!isSafePluginId(entry.id)) return invalid('Invalid plugin id for settings file')
  if (entry.settingsFile === undefined) return path.join(root, 'settings', `${entry.id}.json`)
  if (typeof entry.settingsFile !== 'string' ||
    entry.settingsFile.includes('/') ||
    entry.settingsFile.includes('\\') ||
    path.basename(entry.settingsFile) !== entry.settingsFile) {
    return invalid('Invalid plugin settings file pointer')
  }
  const pattern = new RegExp(`^${escapeRegExp(entry.id)}\\.([a-f0-9]{24})\\.json$`)
  if (!pattern.test(entry.settingsFile) || !SETTINGS_FILE_RE.test(entry.settingsFile)) {
    return invalid('Invalid plugin settings file pointer')
  }
  return path.join(root, 'settings', entry.settingsFile)
}

const settingVersion = (manifest: PluginManifest): number => manifest.settingsVersion ?? 1

const readBoundedFile = async(file: string): Promise<Buffer | undefined> => {
  let handle: Awaited<ReturnType<typeof fs.open>>
  try {
    handle = await fs.open(
      file,
      fsConstants.O_RDONLY | fsConstants.O_NONBLOCK | (fsConstants.O_NOFOLLOW ?? 0),
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) return invalid('Plugin settings file must be a regular file')
    if (stat.size > MAX_SETTINGS_SNAPSHOT_BYTES) return invalid('Plugin settings file exceeds the 2 MiB limit')
    const buffer = Buffer.alloc(MAX_SETTINGS_SNAPSHOT_BYTES + 1)
    let total = 0
    while (total < buffer.length) {
      const { bytesRead } = await handle.read(buffer, total, buffer.length - total, null)
      if (bytesRead === 0) break
      total += bytesRead
    }
    if (total > MAX_SETTINGS_SNAPSHOT_BYTES) return invalid('Plugin settings file exceeds the 2 MiB limit')
    return buffer.subarray(0, total)
  } finally {
    await handle.close()
  }
}

const normalizePreviousValues = (
  input: unknown,
  fields: PluginSettingField[],
): Record<string, string | number | boolean> => {
  if (!isPlainRecord(input)) return invalid('Plugin settings file must contain one plain object')
  const fieldMap = new Map(fields.map(field => [field.key, field]))
  const values: Record<string, string | number | boolean> = {}
  for (const field of fields) values[field.key] = field.default
  for (const [key, value] of Object.entries(input)) {
    const field = fieldMap.get(key)
    if (!field) return invalid(`Unknown plugin setting in existing settings file: ${key}`)
    if (!validPluginSettingValue(field, value)) return invalid(`Invalid plugin setting value in existing settings file: ${key}`)
    values[key] = value
  }
  return values
}

const normalizeTargetValues = (
  input: unknown,
  fields: PluginSettingField[],
): Record<string, string | number | boolean> => {
  if (!isPlainRecord(input)) return invalid('Migrated plugin settings must be a plain object')
  const fieldMap = new Map(fields.map(field => [field.key, field]))
  const values: Record<string, string | number | boolean> = {}
  for (const key of Object.keys(input)) {
    if (!fieldMap.has(key)) return invalid(`Unknown migrated plugin setting: ${key}`)
  }
  for (const field of fields) {
    if (!hasOwn(input, field.key)) return invalid(`Migrated plugin settings are missing: ${field.key}`)
    const value = input[field.key]
    if (!validPluginSettingValue(field, value)) return invalid(`Invalid migrated plugin setting: ${field.key}`)
    values[field.key] = value
  }
  return values
}

export interface PreparedPluginSettingsSnapshot {
  settingsFile: string
  cleanup: () => Promise<void>
}

export class PluginSettingsSnapshots {
  private readonly root: string

  constructor(root: string) {
    this.root = root
  }

  async prepare(
    previous: PluginRegistryEntry | undefined,
    manifest: PluginManifest,
  ): Promise<PreparedPluginSettingsSnapshot | undefined> {
    const previousVersion = previous ? settingVersion(previous.manifest) : settingVersion(manifest)
    const targetVersion = settingVersion(manifest)
    const hasPreviousSettingsFile = previous != null && hasOwn(previous, 'settingsFile')
    const versionChanged = previous != null && previousVersion !== targetVersion
    if (!hasPreviousSettingsFile && manifest.settingsMigrations === undefined && !versionChanged) return undefined

    if (previous && previous.id !== manifest.id) return invalid('Previous plugin id does not match the new manifest')
    if (hasPreviousSettingsFile && typeof previous.settingsFile !== 'string') {
      return invalid('Invalid plugin settings file pointer')
    }
    if (previous) settingsFilePath(this.root, previous)

    if (previous && targetVersion < previousVersion) {
      return invalid('Plugin settings version downgrade is rejected; use the existing package rollback instead')
    }
    if (previous && targetVersion === previousVersion &&
      JSON.stringify(canonicalizePluginValue(previous.manifest.settings ?? [])) !==
      JSON.stringify(canonicalizePluginValue(manifest.settings ?? []))) {
      return invalid('Plugin settings declaration changed without a settings version increase')
    }

    const targetFields = manifest.settings ?? []
    let values: Record<string, string | number | boolean> = {}
    if (previous) {
      const previousFields = previous.manifest.settings ?? []
      const previousPath = settingsFilePath(this.root, previous)
      const raw = await readBoundedFile(previousPath)
      if (raw === undefined) {
        values = normalizePreviousValues({}, previousFields)
      } else {
        let parsed: unknown
        try {
          parsed = JSON.parse(raw.toString('utf8'))
        } catch {
          return invalid('Plugin settings file is not valid JSON')
        }
        values = normalizePreviousValues(parsed, previousFields)
      }
    }

    let migrated: Record<string, string | number | boolean>
    try {
      migrated = normalizeTargetValues(
        migratePluginSettings(previousVersion, manifest, values),
        targetFields,
      )
    } catch (error) {
      if (error instanceof PluginSecurityError) throw error
      throw new PluginSecurityError(
        'invalid_settings_snapshot',
        error instanceof Error ? error.message : 'Plugin settings migration failed',
      )
    }

    let serialized: string | undefined
    try {
      serialized = JSON.stringify(migrated)
    } catch {
      return invalid('Unable to serialize migrated plugin settings')
    }
    if (serialized === undefined) return invalid('Unable to serialize migrated plugin settings')
    const data = Buffer.from(serialized, 'utf8')
    if (data.length > MAX_SETTINGS_SNAPSHOT_BYTES) {
      return invalid('Migrated plugin settings exceed the 2 MiB limit')
    }

    const dir = path.join(this.root, 'settings')
    await fs.mkdir(dir, { recursive: true })
    let file: string | undefined
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = path.join(
        dir,
        `${manifest.id}.${randomBytes(12).toString('hex')}.json`,
      )
      try {
        await fs.writeFile(candidate, data, { mode: 0o600, flag: 'wx' })
        file = candidate
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          await fs.rm(candidate, { force: true })
          throw error
        }
      }
    }
    if (file === undefined) return invalid('Unable to allocate a unique plugin settings snapshot file')

    const snapshotFile = file
    let cleanupRun: Promise<void> | undefined
    const cleanup = async(): Promise<void> => {
      cleanupRun ??= fs.rm(snapshotFile, { force: true })
      await cleanupRun
    }
    return {
      settingsFile: path.basename(snapshotFile),
      cleanup,
    }
  }
}
