import {
  PLUGIN_API_VERSION,
  PLUGIN_PERMISSIONS,
  type PluginManifest,
  type PluginPermission,
  type PluginCredentialField,
  type PluginDependency,
  type PluginSettingField,
  type PluginSettingsMigration,
} from './types'
import type { CollectionSurfaceId } from '@common/collection/types'
import { COLLECTION_SURFACE_IDS } from '@common/collection/types'
import type { PagePlacement } from '@common/pages/types'
import { validateThemeResources } from '@common/theme/resources'
import { validateThemeAppearance } from '@common/theme/appearance'
import { validateThemeTokens } from '@common/theme/validation'
import { comparePluginVersions, isDependencyVersion } from './dependencies'
import { validPluginSettingValue } from './settings'
import { normalizePluginSettingsMigrations } from './settingsMigration'
import { validateExtensionDeclarations } from './extensions'

export const MAX_PLUGIN_ARCHIVE_BYTES = 32 * 1024 * 1024
export const MAX_PLUGIN_FILES = 512
export const MAX_PLUGIN_FILE_BYTES = 8 * 1024 * 1024
export const MAX_PLUGIN_TOTAL_BYTES = 64 * 1024 * 1024
export const MAX_PLUGIN_ENTRYPOINT_BYTES = 2 * 1024 * 1024
export const MAX_COMPRESSION_RATIO = 120
export const MAX_MANIFEST_BYTES = 256 * 1024

const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/
const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/
const MAX_SETTINGS_VERSION = 1_000_000
const MAX_CREDENTIALS = 16
const MAX_CREDENTIAL_TITLE_LENGTH = 80
const MAX_CREDENTIAL_DESCRIPTION_LENGTH = 500
const MAX_CREDENTIAL_VALUE_LENGTH = 4096
const CREDENTIAL_KEY_RE = /^[a-z][a-zA-Z0-9._-]{0,63}$/
const CREDENTIAL_FIELD_KEYS = new Set(['key', 'title', 'description', 'maxLength'])
const CREDENTIAL_RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export class PluginSecurityError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'PluginSecurityError'
    this.code = code
  }
}

export const isSafePluginId = (value: unknown): value is string => {
  return typeof value === 'string' && PLUGIN_ID_RE.test(value)
}

/**
 * Plugin paths are always POSIX relative paths inside the package. Backslashes
 * are rejected instead of normalized so a Windows client cannot reinterpret a
 * verified path as an escape.
 */
export const isSafePluginPath = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) return false
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(value)) return false
  if (value.includes('\\')) return false
  if (value.startsWith('/') || /^[a-zA-Z]:/.test(value)) return false
  const parts = value.split('/')
  return parts.every(part => part !== '' && part !== '.' && part !== '..')
}

export const assertSafePluginPath = (value: unknown, label = 'path'): string => {
  if (!isSafePluginPath(value)) {
    throw new PluginSecurityError('unsafe_path', `Unsafe plugin ${label}`)
  }
  return value
}

const isString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key)
const isDataProperty = (descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } => {
  return descriptor != null && hasOwn(descriptor, 'value')
}

const normalizePluginCredentials = (
  input: unknown,
  settingKeys: ReadonlySet<string>,
): PluginCredentialField[] => {
  const invalid = (message = 'Invalid credential declaration'): never => {
    throw new PluginSecurityError('invalid_manifest', message)
  }

  const readFields = (): unknown[] => {
    if (!Array.isArray(input)) return invalid('Credentials must be an array')
    if (Object.getPrototypeOf(input) !== Array.prototype) return invalid('Invalid credentials')
    const lengthDescriptor = Object.getOwnPropertyDescriptor(input, 'length')
    if (!isDataProperty(lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value)) {
      return invalid('Invalid credentials')
    }
    const length = Number(lengthDescriptor.value)
    if (length < 0 || length > MAX_CREDENTIALS) return invalid('Credentials support at most 16 fields')
    const keys = Reflect.ownKeys(input)
    if (keys.length !== length + 1 || !keys.includes('length')) return invalid('Invalid credentials')
    const result: unknown[] = []
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index))
      if (!isDataProperty(descriptor) || descriptor.enumerable !== true) return invalid('Invalid credentials')
      result.push(descriptor.value)
    }
    return result
  }

  try {
    const fields = readFields()
    const seen = new Set<string>()
    const result: PluginCredentialField[] = []
    for (const raw of fields) {
      if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return invalid('Invalid credential field')
      const prototype = Object.getPrototypeOf(raw)
      if (prototype !== Object.prototype && prototype !== null) return invalid('Invalid credential field')
      const keys = Reflect.ownKeys(raw)
      if (keys.some(key => typeof key !== 'string')) return invalid('Invalid credential field')
      const forbidden = ['default', 'exportable', 'value'].find(key => keys.includes(key))
      if (forbidden) return invalid(`Credential fields do not accept ${forbidden}`)
      if (keys.some(key => typeof key === 'string' && !CREDENTIAL_FIELD_KEYS.has(key))) {
        return invalid('Invalid credential field')
      }

      const values = new Map<string, unknown>()
      for (const key of keys as string[]) {
        const descriptor = Object.getOwnPropertyDescriptor(raw, key)
        if (!isDataProperty(descriptor) || descriptor.enumerable !== true) return invalid('Invalid credential field')
        values.set(key, descriptor.value)
      }

      const key = values.get('key')
      const title = values.get('title')
      if (typeof key !== 'string' || !CREDENTIAL_KEY_RE.test(key) || CREDENTIAL_RESERVED_KEYS.has(key)) {
        return invalid('Invalid credential key')
      }
      if (seen.has(key)) return invalid(`Duplicate credential key: ${key}`)
      if (settingKeys.has(key)) return invalid(`Credential key conflicts with setting: ${key}`)
      seen.add(key)
      if (!isString(title) || title.length > MAX_CREDENTIAL_TITLE_LENGTH) {
        return invalid(`Invalid credential title: ${key}`)
      }

      const description = values.get('description')
      if (description !== undefined &&
        (typeof description !== 'string' || description.length > MAX_CREDENTIAL_DESCRIPTION_LENGTH)) {
        return invalid(`Invalid credential description: ${key}`)
      }
      const maxLength = values.get('maxLength')
      if (maxLength !== undefined &&
        (!Number.isInteger(maxLength) || Number(maxLength) < 1 || Number(maxLength) > MAX_CREDENTIAL_VALUE_LENGTH)) {
        return invalid(`Invalid credential maxLength: ${key}`)
      }

      const field: PluginCredentialField = { key, title }
      if (description !== undefined) field.description = description
      if (maxLength !== undefined) field.maxLength = Number(maxLength)
      result.push(field)
    }
    return result
  } catch (error) {
    if (error instanceof PluginSecurityError) throw error
    return invalid('Invalid credentials')
  }
}

export const validatePluginManifest = (input: unknown): PluginManifest => {
  if (input == null || typeof input !== 'object') {
    throw new PluginSecurityError('invalid_manifest', 'Plugin manifest must be an object')
  }
  const manifest = input as Record<string, unknown>
  if (!isSafePluginId(manifest.id)) throw new PluginSecurityError('invalid_manifest', 'Invalid plugin id')
  if (!isString(manifest.name) || manifest.name.length > 80) throw new PluginSecurityError('invalid_manifest', 'Invalid plugin name')
  if (!isString(manifest.version) || !isDependencyVersion(manifest.version)) throw new PluginSecurityError('invalid_manifest', 'Invalid plugin version')
  if (!isString(manifest.apiVersion) || !VERSION_RE.test(manifest.apiVersion)) throw new PluginSecurityError('invalid_manifest', 'Invalid plugin apiVersion')
  if (!isString(manifest.main)) throw new PluginSecurityError('invalid_manifest', 'Missing plugin entry')
  assertSafePluginPath(manifest.main, 'entry')
  if (manifest.icon != null) assertSafePluginPath(manifest.icon, 'icon')

  if (!Array.isArray(manifest.permissions)) throw new PluginSecurityError('invalid_manifest', 'Permissions must be an array')
  const permissions = [...new Set(manifest.permissions)]
  for (const permission of permissions) {
    if (!(PLUGIN_PERMISSIONS as readonly unknown[]).includes(permission)) {
      throw new PluginSecurityError('invalid_manifest', `Unknown permission: ${String(permission)}`)
    }
  }

  const providers: NonNullable<PluginManifest['collection']>['providers'] = []
  if (manifest.collection != null) {
    const collection = manifest.collection as Record<string, unknown>
    if (!Array.isArray(collection.providers)) throw new PluginSecurityError('invalid_manifest', 'Invalid providers')
    if (!permissions.includes('collection.read')) {
      throw new PluginSecurityError('invalid_manifest', 'Collection providers require collection.read')
    }
    const seen = new Set<string>()
    for (const raw of collection.providers) {
      if (raw == null || typeof raw !== 'object') throw new PluginSecurityError('invalid_manifest', 'Invalid provider')
      const provider = raw as Record<string, unknown>
      if (!isString(provider.id) || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(provider.id)) {
        throw new PluginSecurityError('invalid_manifest', 'Invalid provider id')
      }
      if (seen.has(provider.id)) throw new PluginSecurityError('invalid_manifest', 'Duplicate provider id')
      seen.add(provider.id)
      if (!isString(provider.displayName) || provider.displayName.length > 80) {
        throw new PluginSecurityError('invalid_manifest', 'Invalid provider name')
      }
      if (!Array.isArray(provider.surfaces) || provider.surfaces.length === 0) {
        throw new PluginSecurityError('invalid_manifest', 'Provider must declare surfaces')
      }
      for (const surface of provider.surfaces) {
        if (!(COLLECTION_SURFACE_IDS as readonly unknown[]).includes(surface)) {
          throw new PluginSecurityError('invalid_manifest', `Unknown collection surface: ${String(surface)}`)
        }
      }
      if (provider.entry != null) assertSafePluginPath(provider.entry, 'provider entry')
      if (provider.icon != null) assertSafePluginPath(provider.icon, 'provider icon')
      providers.push({
        id: provider.id,
        displayName: provider.displayName,
        description: typeof provider.description === 'string' ? provider.description.slice(0, 300) : undefined,
        surfaces: [...new Set(provider.surfaces)] as CollectionSurfaceId[],
        entry: provider.entry as string | undefined,
        icon: provider.icon as string | undefined,
      })
    }
  }

  const pages: NonNullable<PluginManifest['pages']> = []
  if (manifest.pages != null) {
    if (!Array.isArray(manifest.pages)) throw new PluginSecurityError('invalid_manifest', 'Invalid pages')
    if (!permissions.includes('plugin.pages')) throw new PluginSecurityError('invalid_manifest', 'Plugin pages require plugin.pages')
    const seen = new Set<string>()
    for (const raw of manifest.pages) {
      if (raw == null || typeof raw !== 'object') throw new PluginSecurityError('invalid_manifest', 'Invalid page')
      const page = raw as Record<string, unknown>
      if (!isString(page.id) || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(page.id)) {
        throw new PluginSecurityError('invalid_manifest', 'Invalid page id')
      }
      if (seen.has(page.id)) throw new PluginSecurityError('invalid_manifest', 'Duplicate page id')
      seen.add(page.id)
      if (!isString(page.title) || page.title.length > 80) throw new PluginSecurityError('invalid_manifest', 'Invalid page title')
      if (page.entry != null) assertSafePluginPath(page.entry, 'page entry')
      if (page.icon != null) assertSafePluginPath(page.icon, 'page icon')
      const placement = page.placement ?? 'primary'
      if (!['primary', 'tools', 'hidden'].includes(placement as string)) {
        throw new PluginSecurityError('invalid_manifest', 'Invalid page placement')
      }
      pages.push({
        id: page.id,
        title: page.title,
        icon: page.icon as string | undefined,
        entry: page.entry as string | undefined,
        order: Number.isFinite(page.order) ? Number(page.order) : undefined,
        placement: placement as PagePlacement,
      })
    }
  }

  const extendedTheme = /^1\.(?:[89]|\d{2,})\./.test(String(manifest.apiVersion))
  if (permissions.includes('theme.resources') && !extendedTheme) throw new PluginSecurityError('invalid_manifest', 'Theme resources require API 1.8')
  const themes: NonNullable<PluginManifest['themes']> = []
  if (manifest.themes != null) {
    if (!Array.isArray(manifest.themes)) throw new PluginSecurityError('invalid_manifest', 'Invalid themes')
    if (!permissions.includes('theme.contribute')) throw new PluginSecurityError('invalid_manifest', 'Themes require theme.contribute')
    const seen = new Set<string>()
    if (manifest.themes.length > 32) throw new PluginSecurityError('invalid_manifest', 'Too many themes')
    for (const raw of manifest.themes) {
      if (raw == null || typeof raw !== 'object') throw new PluginSecurityError('invalid_manifest', 'Invalid theme')
      const theme = raw as Record<string, unknown>
      if (!isString(theme.id) || !isString(theme.name) || theme.tokens == null || typeof theme.tokens !== 'object') {
        throw new PluginSecurityError('invalid_manifest', 'Invalid theme contribution')
      }
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(theme.id) || seen.has(theme.id) || theme.name.length > 80) throw new PluginSecurityError('invalid_manifest', 'Invalid or duplicate theme id')
      seen.add(theme.id)
      if (theme.description != null && (typeof theme.description !== 'string' || theme.description.length > 240)) throw new PluginSecurityError('invalid_manifest', 'Invalid theme description')
      if (validateThemeTokens(theme.tokens).invalid.length) throw new PluginSecurityError('invalid_manifest', 'Unsafe theme tokens')
      const tokens: Record<string, string> = {}
      for (const [key, value] of Object.entries(theme.tokens as Record<string, unknown>)) {
        if (!/^--lx-[a-z0-9-]{1,48}$/.test(key)) throw new PluginSecurityError('invalid_manifest', `Invalid theme token: ${key}`)
        if (typeof value !== 'string' || value.length > 200 || /url\s*\(/i.test(value) || /[;{}]/.test(value)) {
          throw new PluginSecurityError('invalid_manifest', `Invalid theme token value: ${key}`)
        }
        tokens[key] = value
      }
      let appearance
      if (theme.appearance != null) {
        if (!permissions.includes('theme.appearance')) throw new PluginSecurityError('invalid_manifest', 'Theme appearance requires theme.appearance')
        try { appearance = validateThemeAppearance(theme.appearance, extendedTheme) } catch { throw new PluginSecurityError('invalid_manifest', 'Invalid theme appearance') }
      }
      let resources
      if (Object.prototype.hasOwnProperty.call(theme, 'resources')) {
        if (!extendedTheme || !permissions.includes('theme.resources')) throw new PluginSecurityError('invalid_manifest', 'Theme resources require permission and API 1.8')
        try { resources = validateThemeResources(theme.resources) } catch { throw new PluginSecurityError('invalid_manifest', 'Invalid theme resources') }
      }
      themes.push({ ...(resources != null ? { resources } : {}), id: theme.id, name: theme.name, isDark: theme.isDark === true, tokens, description: theme.description as string | undefined, appearance })
    }
  }

  let dependencies: PluginDependency[] | undefined
  let optionalDependencies: PluginDependency[] | undefined
  let conflicts: PluginDependency[] | undefined
  const dependencyIds = new Set<string>()
  const readDependencies = (value: unknown, label: string): PluginDependency[] => {
    if (!Array.isArray(value) || value.length > 32) throw new PluginSecurityError('invalid_manifest', `Invalid ${label}`)
    const result: PluginDependency[] = []
    for (const raw of value) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PluginSecurityError('invalid_manifest', `Invalid ${label} entry`)
      const dependency = raw as PluginDependency
      if (Object.keys(raw).some(key => !['id', 'minVersion', 'maxVersionExclusive'].includes(key)) || !isSafePluginId(dependency.id) || dependency.id === manifest.id || dependencyIds.has(dependency.id)) throw new PluginSecurityError('invalid_manifest', `Invalid, self or duplicate ${label} entry`)
      if ((dependency.minVersion != null && !isDependencyVersion(dependency.minVersion)) || (dependency.maxVersionExclusive != null && !isDependencyVersion(dependency.maxVersionExclusive))) throw new PluginSecurityError('invalid_manifest', 'Invalid dependency version')
      if (dependency.minVersion != null && dependency.maxVersionExclusive != null && comparePluginVersions(dependency.minVersion, dependency.maxVersionExclusive) >= 0) throw new PluginSecurityError('invalid_manifest', 'Empty dependency version range')
      dependencyIds.add(dependency.id)
      result.push({ ...dependency })
    }
    return result
  }
  if (manifest.dependencies != null) dependencies = readDependencies(manifest.dependencies, 'dependency')
  const supportsOptionalContracts = (() => {
    try { return comparePluginVersions(String(manifest.apiVersion), '1.9.0') >= 0 } catch { return false }
  })()
  if (manifest.optionalDependencies !== undefined) {
    if (!supportsOptionalContracts) throw new PluginSecurityError('invalid_manifest', 'Optional dependencies require plugin API 1.9 or newer')
    optionalDependencies = readDependencies(manifest.optionalDependencies, 'optional dependency')
  }
  if (manifest.conflicts !== undefined) {
    if (!supportsOptionalContracts) throw new PluginSecurityError('invalid_manifest', 'Plugin conflicts require plugin API 1.9 or newer')
    conflicts = readDependencies(manifest.conflicts, 'conflict')
  }
  const supportsSettingsTransfer = (() => {
    try {
      return /^1\./.test(String(manifest.apiVersion)) && comparePluginVersions(String(manifest.apiVersion), '1.10.0') >= 0
    } catch {
      return false
    }
  })()
  const hasSettingsVersion = Object.prototype.hasOwnProperty.call(manifest, 'settingsVersion')
  if (hasSettingsVersion) {
    if (!supportsSettingsTransfer) throw new PluginSecurityError('invalid_manifest', 'Settings versions require plugin API 1.10 with major version 1')
    if (!permissions.includes('settings.scoped')) throw new PluginSecurityError('invalid_manifest', 'Settings versions require settings.scoped')
    if (!Number.isInteger(manifest.settingsVersion) || Number(manifest.settingsVersion) < 1 || Number(manifest.settingsVersion) > MAX_SETTINGS_VERSION) {
      throw new PluginSecurityError('invalid_manifest', 'Invalid settings version')
    }
  }
  const supportsSettingsMigrations = (() => {
    try {
      return typeof manifest.apiVersion === 'string' &&
        manifest.apiVersion.split('.')[0] === '1' &&
        isDependencyVersion(manifest.apiVersion) &&
        comparePluginVersions(manifest.apiVersion, '1.11.0') >= 0
    } catch {
      return false
    }
  })()
  const hasSettingsMigrations = Object.prototype.hasOwnProperty.call(manifest, 'settingsMigrations')
  let settingsMigrations: PluginSettingsMigration[] | undefined
  if (hasSettingsMigrations) {
    if (!supportsSettingsMigrations) throw new PluginSecurityError('invalid_manifest', 'Settings migrations require plugin API 1.11 with major version 1')
    if (!permissions.includes('settings.scoped')) throw new PluginSecurityError('invalid_manifest', 'Settings migrations require settings.scoped')
    if (!hasSettingsVersion) throw new PluginSecurityError('invalid_manifest', 'Settings migrations require an explicit settings version')
    const descriptor = Object.getOwnPropertyDescriptor(manifest, 'settingsMigrations')
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || descriptor.enumerable !== true) {
      throw new PluginSecurityError('invalid_manifest', 'Invalid settings migrations')
    }
    try {
      settingsMigrations = normalizePluginSettingsMigrations(descriptor.value, Number(manifest.settingsVersion))
    } catch (error) {
      throw new PluginSecurityError('invalid_manifest', error instanceof Error ? error.message : 'Invalid settings migrations')
    }
  }
  let settings: PluginSettingField[] | undefined
  if (manifest.settings != null) {
    if (!Array.isArray(manifest.settings) || manifest.settings.length > 64 || !permissions.includes('settings.scoped')) throw new PluginSecurityError('invalid_manifest', 'Settings require settings.scoped and at most 64 fields')
    const seen = new Set<string>()
    settings = manifest.settings.map(raw => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PluginSecurityError('invalid_manifest', 'Invalid setting')
      const field = raw as PluginSettingField
      const hasExportable = Object.prototype.hasOwnProperty.call(raw, 'exportable')
      if (hasExportable && !supportsSettingsTransfer) throw new PluginSecurityError('invalid_manifest', 'Exportable settings require plugin API 1.10 with major version 1')
      if (Object.keys(raw).some(key => !['key', 'title', 'description', 'type', 'default', 'min', 'max', 'maxLength', 'options', 'exportable'].includes(key)) || typeof field.key !== 'string' || !/^[a-z][a-zA-Z0-9._-]{0,63}$/.test(field.key) || ['__proto__', 'constructor', 'prototype'].includes(field.key) || seen.has(field.key)) throw new PluginSecurityError('invalid_manifest', 'Invalid or duplicate setting key')
      seen.add(field.key)
      if (!isString(field.title) || field.title.length > 100 || (field.description != null && (typeof field.description !== 'string' || field.description.length > 500))) throw new PluginSecurityError('invalid_manifest', 'Invalid setting label')
      if (hasExportable && typeof field.exportable !== 'boolean') throw new PluginSecurityError('invalid_manifest', 'Invalid exportable setting flag')
      if ([field.min, field.max].some(value => value != null && (typeof value !== 'number' || !Number.isFinite(value))) || (field.min != null && field.max != null && field.min > field.max)) throw new PluginSecurityError('invalid_manifest', 'Invalid setting bounds')
      if (field.maxLength != null && (!Number.isInteger(field.maxLength) || field.maxLength < 1 || field.maxLength > 4000)) throw new PluginSecurityError('invalid_manifest', 'Invalid text limit')
      if (field.type === 'select' && (!Array.isArray(field.options) || !field.options.length || field.options.length > 50 || new Set(field.options.map(option => option?.value)).size !== field.options.length || field.options.some(option => !option || Object.keys(option).some(key => !['value', 'label'].includes(key)) || typeof option.value !== 'string' || option.value.length > 100 || !isString(option.label) || option.label.length > 100))) throw new PluginSecurityError('invalid_manifest', 'Invalid setting options')
      if (!validPluginSettingValue(field, field.default)) throw new PluginSecurityError('invalid_manifest', 'Invalid setting type or default')
      return { ...field }
    })
  }
  const supportsScopedCredentials = (() => {
    try {
      return typeof manifest.apiVersion === 'string' &&
        manifest.apiVersion.split('.')[0] === '1' &&
        isDependencyVersion(manifest.apiVersion) &&
        comparePluginVersions(manifest.apiVersion, '1.12.0') >= 0
    } catch {
      return false
    }
  })()
  const hasCredentialPermission = permissions.includes('credentials.scoped')
  if (hasCredentialPermission && !supportsScopedCredentials) {
    throw new PluginSecurityError('invalid_manifest', 'Scoped credentials require plugin API 1.12 with major version 1')
  }
  const credentialsDescriptor = Object.getOwnPropertyDescriptor(manifest, 'credentials')
  let credentials: PluginCredentialField[] | undefined
  let hasCredentials = false
  if (credentialsDescriptor != null) {
    if (!supportsScopedCredentials) throw new PluginSecurityError('invalid_manifest', 'Scoped credentials require plugin API 1.12 with major version 1')
    if (!hasCredentialPermission) throw new PluginSecurityError('invalid_manifest', 'Credential declarations require credentials.scoped')
    if (!isDataProperty(credentialsDescriptor) || credentialsDescriptor.enumerable !== true) {
      throw new PluginSecurityError('invalid_manifest', 'Invalid credentials')
    }
    credentials = normalizePluginCredentials(
      credentialsDescriptor.value,
      new Set((settings ?? []).map(field => field.key)),
    )
    hasCredentials = true
  }
  if (((dependencies?.length ?? 0) > 0 || (settings?.length ?? 0) > 0) && !/^1\.(?:[2-9]|\d{2,})\./.test(manifest.apiVersion)) throw new PluginSecurityError('invalid_manifest', 'Dependencies and settings require plugin API 1.2 or newer')
  let nativeBundle: PluginManifest['nativeBundle']
  if (manifest.nativeBundle != null) {
    const native = manifest.nativeBundle as Record<string, unknown>
    if (!['lx.official-suite', 'lx.radio'].includes(native.id as string) || manifest.id !== native.id || typeof native.buildHash !== 'string' || !/^[0-9a-f]{64}$/.test(native.buildHash)) {
      throw new PluginSecurityError('invalid_manifest', 'Invalid trusted bundle declaration')
    }
    nativeBundle = { id: native.id, buildHash: native.buildHash }
  }
  return {
    ...validateExtensionDeclarations(manifest),
    nativeBundle,
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    apiVersion: manifest.apiVersion,
    description: typeof manifest.description === 'string' ? manifest.description.slice(0, 500) : undefined,
    author: typeof manifest.author === 'string' ? manifest.author.slice(0, 100) : undefined,
    main: manifest.main,
    icon: manifest.icon as string | undefined,
    permissions: permissions as PluginPermission[],
    collection: providers.length ? { providers } : undefined,
    pages: pages.length ? pages : undefined,
    themes: themes.length ? themes : undefined,
    dependencies,
    optionalDependencies,
    conflicts,
    settings,
    ...(hasCredentials ? { credentials } : {}),
    ...(hasSettingsVersion ? { settingsVersion: manifest.settingsVersion as number } : {}),
    ...(hasSettingsMigrations ? { settingsMigrations } : {}),
    signature: typeof manifest.signature === 'string' ? manifest.signature : '',
    publicKey: typeof manifest.publicKey === 'string' ? manifest.publicKey : '',
  }
}

export const isPluginApiCompatible = (apiVersion: string): boolean => {
  // apiVersion is the minimum supported host API, not merely a major tag.
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(apiVersion)
  if (!match) return false
  const requested = match.slice(1).map(Number)
  const host = PLUGIN_API_VERSION.split('.').map(Number)
  return requested[0] === host[0] && (requested[1] < host[1] || (requested[1] === host[1] && requested[2] <= host[2]))
}

export const canonicalizePluginValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalizePluginValue)
  if (value != null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .filter(key => (value as Record<string, unknown>)[key] !== undefined)
        .sort()
        .map(key => [key, canonicalizePluginValue((value as Record<string, unknown>)[key])]),
    )
  }
  return value
}

/** Deterministic JSON used as the Ed25519 signature payload. */
export const canonicalManifestPayload = (manifest: PluginManifest): string => {
  const clone: Record<string, unknown> = { ...manifest }
  delete clone.signature
  return JSON.stringify(canonicalizePluginValue(clone))
}
