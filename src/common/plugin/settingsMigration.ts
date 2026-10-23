import type {
  PluginManifest,
  PluginSettingField,
  PluginSettingsMigration,
} from './types'
import { validPluginSettingValue } from './settings'

type PluginSettingValue = string | number | boolean
type PluginSettingValues = Record<string, PluginSettingValue>

const MAX_SETTINGS_MIGRATIONS = 16
const MAX_SETTINGS_VERSION = 1_000_000
const MAX_MIGRATION_KEYS = 64
const SETTING_KEY_RE = /^[a-z][a-zA-Z0-9._-]{0,63}$/
const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const MIGRATION_KEYS = new Set(['fromVersion', 'toVersion', 'rename', 'remove'])
const SETTING_FIELD_KEYS = new Set(['key', 'title', 'description', 'type', 'default', 'min', 'max', 'maxLength', 'options', 'exportable'])
const SETTING_OPTION_KEYS = new Set(['value', 'label'])

const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key)

const invalid = (message: string): never => {
  const error = new Error(message)
  error.name = 'PluginSettingsMigrationError'
  throw error
}

const isDataProperty = (descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } => {
  return descriptor != null && hasOwn(descriptor, 'value')
}

const isPlainRecord = (value: unknown): value is Record<PropertyKey, unknown> => {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

const plainEntries = (value: unknown, label: string): Map<string, unknown> => {
  if (!isPlainRecord(value)) return invalid(`Invalid ${label}`)
  let keys: PropertyKey[]
  try {
    keys = Reflect.ownKeys(value)
  } catch {
    return invalid(`Invalid ${label}`)
  }
  const result = new Map<string, unknown>()
  for (const key of keys) {
    if (typeof key !== 'string') return invalid(`Invalid ${label}`)
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!isDataProperty(descriptor) || descriptor.enumerable !== true) return invalid(`Invalid ${label}`)
    result.set(key, descriptor.value)
  }
  return result
}

const denseArray = (value: unknown, maximum: number, label: string): unknown[] => {
  if (!Array.isArray(value)) return invalid(`Invalid ${label}`)
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return invalid(`Invalid ${label}`)
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
    if (!isDataProperty(lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value) || Number(lengthDescriptor.value) > maximum) {
      return invalid(`Invalid ${label}`)
    }
    const length = Number(lengthDescriptor.value)
    const keys = Reflect.ownKeys(value)
    if (keys.length !== length + 1 || !keys.includes('length')) return invalid(`Invalid ${label}`)
    const result: unknown[] = []
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (!isDataProperty(descriptor) || descriptor.enumerable !== true) return invalid(`Invalid ${label}`)
      result.push(descriptor.value)
    }
    return result
  } catch {
    return invalid(`Invalid ${label}`)
  }
}

const settingsVersion = (value: unknown, label = 'settings version'): number => {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > MAX_SETTINGS_VERSION) {
    return invalid(`Invalid ${label}`)
  }
  return Number(value)
}

const settingKey = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !SETTING_KEY_RE.test(value) || PROTOTYPE_KEYS.has(value)) {
    return invalid(`Invalid ${label}`)
  }
  return value
}

const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

const normalizeRename = (input: unknown, step: number): Record<string, string> => {
  const entries = plainEntries(input, `settings migration ${step} rename`)
  if (entries.size > MAX_MIGRATION_KEYS) return invalid(`Settings migration ${step} rename exceeds 64 keys`)
  const targets = new Set<string>()
  const result: Record<string, string> = {}
  for (const [rawSource, rawTarget] of entries) {
    const source = settingKey(rawSource, `settings migration ${step} rename source`)
    const target = settingKey(rawTarget, `settings migration ${step} rename target`)
    if (source === target) return invalid(`Settings migration ${step} rename must change its key`)
    if (targets.has(target)) return invalid(`Settings migration ${step} has duplicate rename targets`)
    targets.add(target)
    result[source] = target
  }
  return result
}

const normalizeRemove = (input: unknown, step: number): string[] => {
  const entries = denseArray(input, MAX_MIGRATION_KEYS, `settings migration ${step} remove`)
  const seen = new Set<string>()
  return entries.map(value => {
    const key = settingKey(value, `settings migration ${step} remove key`)
    if (seen.has(key)) return invalid(`Settings migration ${step} has duplicate remove keys`)
    seen.add(key)
    return key
  })
}

/**
 * Validates and clones migration declarations without invoking accessors.
 * Manifest API and permission gating belongs to security.ts.
 */
export const normalizePluginSettingsMigrations = (
  input: unknown,
  targetVersion: number,
): PluginSettingsMigration[] => {
  const version = settingsVersion(targetVersion)
  const entries = denseArray(input, MAX_SETTINGS_MIGRATIONS, 'settings migrations')
  const seenFrom = new Set<number>()
  return entries.map((raw, index) => {
    const step = index + 1
    const entry = plainEntries(raw, `settings migration ${step}`)
    if ([...entry.keys()].some(key => !MIGRATION_KEYS.has(key))) return invalid(`Invalid settings migration ${step} fields`)
    if (!entry.has('fromVersion') || !entry.has('toVersion')) return invalid(`Invalid settings migration ${step} versions`)
    const fromVersion = settingsVersion(entry.get('fromVersion'), `settings migration ${step} fromVersion`)
    const toVersion = settingsVersion(entry.get('toVersion'), `settings migration ${step} toVersion`)
    if (fromVersion >= toVersion || toVersion > version) return invalid(`Invalid settings migration ${step} version range`)
    if (seenFrom.has(fromVersion)) return invalid(`Duplicate settings migration fromVersion: ${fromVersion}`)
    seenFrom.add(fromVersion)

    const migration: PluginSettingsMigration = { fromVersion, toVersion }
    if (entry.has('rename')) migration.rename = normalizeRename(entry.get('rename'), step)
    if (entry.has('remove')) migration.remove = normalizeRemove(entry.get('remove'), step)
    const renameSources = new Set(Object.keys(migration.rename ?? {}))
    const renameTargets = new Set(Object.values(migration.rename ?? {}))
    if (migration.remove?.some(key => renameSources.has(key) || renameTargets.has(key))) {
      return invalid(`Settings migration ${step} removes a renamed key`)
    }
    return migration
  })
}

const readValues = (input: unknown): PluginSettingValues => {
  const entries = plainEntries(input, 'plugin settings values')
  if (entries.size > MAX_MIGRATION_KEYS) return invalid('Plugin settings values exceed 64 keys')
  const result: PluginSettingValues = {}
  for (const [rawKey, value] of entries) {
    const key = settingKey(rawKey, 'plugin setting value key')
    if (!['string', 'number', 'boolean'].includes(typeof value) ||
      (typeof value === 'number' && !Number.isFinite(value))) {
      return invalid(`Invalid plugin setting value: ${key}`)
    }
    result[key] = value as PluginSettingValue
  }
  return result
}

const applyMigration = (values: PluginSettingValues, migration: PluginSettingsMigration): PluginSettingValues => {
  const rename = migration.rename ?? {}
  const sources = new Set(Object.keys(rename))
  for (const target of Object.values(rename)) {
    if (hasOwn(values, target) && !sources.has(target)) {
      return invalid(`Settings migration target is occupied: ${target}`)
    }
  }
  const moved: Array<[string, PluginSettingValue]> = []
  for (const [source, target] of Object.entries(rename)) {
    if (hasOwn(values, source)) moved.push([target, values[source]])
  }
  for (const source of sources) Reflect.deleteProperty(values, source)
  for (const [target, value] of moved) values[target] = value
  for (const key of migration.remove ?? []) Reflect.deleteProperty(values, key)
  return values
}

const readTargetFields = (input: unknown): PluginSettingField[] => {
  if (input == null) return []
  const rawFields = denseArray(input, MAX_MIGRATION_KEYS, 'plugin settings fields')
  const seen = new Set<string>()
  return rawFields.map((raw, index) => {
    const field = plainEntries(raw, `plugin setting field ${index + 1}`)
    if ([...field.keys()].some(name => !SETTING_FIELD_KEYS.has(name))) return invalid(`Invalid plugin setting field ${index + 1}`)
    const key = settingKey(field.get('key'), 'plugin setting field key')
    if (seen.has(key)) return invalid(`Duplicate plugin setting field: ${key}`)
    seen.add(key)
    const title = field.get('title')
    if (!nonEmptyString(title) || title.length > 100) return invalid(`Invalid plugin setting title: ${key}`)
    if (field.has('description') && field.get('description') != null &&
      (typeof field.get('description') !== 'string' || (field.get('description') as string).length > 500)) {
      return invalid(`Invalid plugin setting description: ${key}`)
    }
    const type = field.get('type')
    if (!['boolean', 'number', 'string', 'select'].includes(type as string)) return invalid(`Invalid plugin setting type: ${key}`)
    const normalized: PluginSettingField = {
      key,
      title,
      type: type as PluginSettingField['type'],
      default: field.get('default') as PluginSettingValue,
    }
    for (const name of ['min', 'max', 'maxLength'] as const) {
      if (field.has(name) && field.get(name) !== undefined) normalized[name] = field.get(name) as number
    }
    if ([normalized.min, normalized.max].some(value => value != null && (typeof value !== 'number' || !Number.isFinite(value))) ||
      (normalized.min != null && normalized.max != null && normalized.min > normalized.max)) {
      return invalid(`Invalid plugin setting bounds: ${key}`)
    }
    if (normalized.maxLength != null &&
      (!Number.isInteger(normalized.maxLength) || normalized.maxLength < 1 || normalized.maxLength > 4000)) {
      return invalid(`Invalid plugin setting maxLength: ${key}`)
    }
    if (field.has('exportable') && typeof field.get('exportable') !== 'boolean') {
      return invalid(`Invalid plugin setting exportable flag: ${key}`)
    }
    if (type === 'select') {
      const options = denseArray(field.get('options'), 50, `plugin setting options: ${key}`)
      if (options.length === 0) return invalid(`Invalid plugin setting options: ${key}`)
      const seenValues = new Set<string>()
      normalized.options = options.map(option => {
        const optionRecord = plainEntries(option, `plugin setting option: ${key}`)
        if ([...optionRecord.keys()].some(name => !SETTING_OPTION_KEYS.has(name))) return invalid(`Invalid plugin setting option: ${key}`)
        const value = optionRecord.get('value')
        const label = optionRecord.get('label')
        if (typeof value !== 'string' || value.length > 100 || !nonEmptyString(label) || label.length > 100 || seenValues.has(value)) {
          return invalid(`Invalid plugin setting option: ${key}`)
        }
        seenValues.add(value)
        return { value, label }
      })
    }
    if (!validPluginSettingValue(normalized, normalized.default)) return invalid(`Invalid plugin setting default: ${key}`)
    return normalized
  })
}

const projectValues = (values: PluginSettingValues, fields: PluginSettingField[]): PluginSettingValues => {
  const fieldMap = new Map(fields.map(field => [field.key, field]))
  for (const key of Object.keys(values)) {
    if (!fieldMap.has(key)) return invalid(`Unknown plugin setting value: ${key}`)
  }
  const result: PluginSettingValues = {}
  for (const field of fields) {
    const value = hasOwn(values, field.key) ? values[field.key] : field.default
    if (!validPluginSettingValue(field, value)) return invalid(`Invalid plugin setting value: ${field.key}`)
    result[field.key] = value
  }
  return result
}

export const migratePluginSettings = (
  fromVersion: number,
  target: Pick<PluginManifest, 'settingsVersion' | 'settingsMigrations' | 'settings'>,
  values: PluginSettingValues,
): PluginSettingValues => {
  const installedVersion = settingsVersion(fromVersion, 'installed settings version')
  const targetRecord = plainEntries(target, 'settings migration target')
  const hasExplicitVersion = targetRecord.has('settingsVersion')
  const targetVersion = hasExplicitVersion ? settingsVersion(targetRecord.get('settingsVersion')) : 1
  if (installedVersion > targetVersion) return invalid('Installed settings version is newer than the target')

  let migrations: PluginSettingsMigration[] = []
  if (targetRecord.has('settingsMigrations')) {
    if (!hasExplicitVersion) return invalid('Settings migrations require an explicit settings version')
    migrations = normalizePluginSettingsMigrations(targetRecord.get('settingsMigrations'), targetVersion)
  }

  const current = readValues(values)
  if (installedVersion < targetVersion) {
    const byFrom = new Map(migrations.map(migration => [migration.fromVersion, migration]))
    const seen = new Set<number>()
    let version = installedVersion
    let steps = 0
    while (version < targetVersion) {
      if (seen.has(version) || steps >= MAX_SETTINGS_MIGRATIONS) return invalid('Settings migration cycle or step limit reached')
      const migration = byFrom.get(version)
      if (!migration) return invalid(`Missing settings migration from version ${version}`)
      if (migration.toVersion <= version) return invalid('Settings migration version did not increase')
      if (migration.toVersion > targetVersion) return invalid('Settings migration path exceeds the target version')
      seen.add(version)
      applyMigration(current, migration)
      version = migration.toVersion
      steps++
    }
    if (version !== targetVersion) return invalid('Settings migration path did not reach the target version')
  }

  const fields = readTargetFields(targetRecord.has('settings') ? targetRecord.get('settings') : undefined)
  return projectValues(current, fields)
}
