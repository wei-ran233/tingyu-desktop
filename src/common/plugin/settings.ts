import type { PluginSettingField, PluginSettingsTransferContext } from './types'

export interface PluginSettingsDocument {
  format: 'lxplugin-settings/1'
  pluginId: string
  signerFingerprint: string
  settingsVersion: number
  schemaFingerprint: string
  values: Record<string, string | number | boolean>
}

export const MAX_PLUGIN_SETTINGS_DOCUMENT_BYTES = 256 * 1024
const MAX_PLUGIN_SETTINGS_VALUES = 64
const MAX_SETTINGS_VERSION = 1_000_000
const DOCUMENT_FORMAT = 'lxplugin-settings/1'
const DOCUMENT_KEYS = new Set(['format', 'pluginId', 'signerFingerprint', 'settingsVersion', 'schemaFingerprint', 'values'])

export class PluginSettingsTransferError extends Error {
  readonly code = 'invalid_settings_document'

  constructor(message: string) {
    super(message)
    this.name = 'PluginSettingsTransferError'
  }
}

const invalid = (message: string): never => {
  throw new PluginSettingsTransferError(message)
}

const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key)
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
const descriptors = (value: Record<PropertyKey, unknown>): Record<PropertyKey, PropertyDescriptor> => {
  try {
    return Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>
  } catch {
    return invalid('Unable to read plugin settings document')
  }
}
const readDataProperty = (value: Record<PropertyKey, PropertyDescriptor>, key: string, label: string): unknown => {
  const descriptor = value[key]
  if (!isDataProperty(descriptor) || descriptor.enumerable !== true) return invalid(`Invalid plugin settings ${label}`)
  return descriptor.value
}

const contextFields = (context: PluginSettingsTransferContext): PluginSettingField[] => {
  if (context == null || typeof context !== 'object' || Array.isArray(context) ||
    typeof context.pluginId !== 'string' ||
    typeof context.signerFingerprint !== 'string' ||
    !Number.isInteger(context.settingsVersion) ||
    context.settingsVersion < 1 ||
    context.settingsVersion > MAX_SETTINGS_VERSION ||
    typeof context.schemaFingerprint !== 'string' ||
    !Array.isArray(context.fields) ||
    context.fields.length > MAX_PLUGIN_SETTINGS_VALUES) {
    return invalid('Invalid plugin settings transfer context')
  }
  return context.fields
}

const settingFieldMap = (context: PluginSettingsTransferContext): Record<string, PluginSettingField> => {
  const result = Object.create(null) as Record<string, PluginSettingField>
  for (const field of contextFields(context)) {
    if (!field || typeof field !== 'object' || Array.isArray(field) || typeof field.key !== 'string' ||
      ['__proto__', 'constructor', 'prototype'].includes(field.key) || hasOwn(result, field.key)) {
      return invalid('Invalid plugin settings field declaration')
    }
    result[field.key] = field
  }
  return result
}

const documentByteLength = (document: PluginSettingsDocument): number => {
  try {
    return new TextEncoder().encode(JSON.stringify(document)).byteLength
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

export const validPluginSettingValue = (field: PluginSettingField, value: unknown): value is string | number | boolean => {
  switch (field.type) {
    case 'boolean': return typeof value === 'boolean'
    case 'number': return typeof value === 'number' && Number.isFinite(value) && (field.min == null || value >= field.min) && (field.max == null || value <= field.max)
    case 'string': return typeof value === 'string' && value.length <= (field.maxLength ?? 500)
    case 'select': return typeof value === 'string' && !!field.options?.some(option => option.value === value)
    default: return false
  }
}

export const validatePluginSettingsDocument = (
  input: unknown,
  context: PluginSettingsTransferContext,
): PluginSettingsDocument => {
  const fields = settingFieldMap(context)
  if (!isPlainRecord(input)) return invalid('Plugin settings document must be a plain object')
  const top = descriptors(input)
  const topKeys = Reflect.ownKeys(top)
  if (topKeys.length !== DOCUMENT_KEYS.size || topKeys.some(key => typeof key !== 'string' || !DOCUMENT_KEYS.has(key))) {
    return invalid('Plugin settings document has unexpected or missing keys')
  }

  const format = readDataProperty(top, 'format', 'format')
  if (format !== DOCUMENT_FORMAT) return invalid('Unsupported plugin settings document format')
  const pluginId = readDataProperty(top, 'pluginId', 'plugin id')
  if (typeof pluginId !== 'string' || pluginId !== context.pluginId) return invalid('Plugin settings plugin id does not match')
  const signerFingerprint = readDataProperty(top, 'signerFingerprint', 'signer fingerprint')
  if (typeof signerFingerprint !== 'string' || signerFingerprint !== context.signerFingerprint) return invalid('Plugin settings signer fingerprint does not match')
  const settingsVersion = readDataProperty(top, 'settingsVersion', 'settings version')
  if (typeof settingsVersion !== 'number' || settingsVersion !== context.settingsVersion) return invalid('Plugin settings version does not match')
  const schemaFingerprint = readDataProperty(top, 'schemaFingerprint', 'schema fingerprint')
  if (typeof schemaFingerprint !== 'string' || schemaFingerprint !== context.schemaFingerprint) return invalid('Plugin settings schema fingerprint does not match')

  const rawValues = readDataProperty(top, 'values', 'values')
  if (!isPlainRecord(rawValues)) return invalid('Plugin settings values must be a plain object')
  const valueProperties = descriptors(rawValues)
  const keys = Reflect.ownKeys(valueProperties)
  if (keys.length > MAX_PLUGIN_SETTINGS_VALUES) return invalid('Plugin settings document exceeds 64 values')
  const values: Record<string, string | number | boolean> = {}
  for (const key of keys) {
    if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) return invalid('Invalid plugin setting value key')
    const field = fields[key]
    if (!field) return invalid(`Unknown plugin setting value: ${key}`)
    if (field.exportable !== true) return invalid(`Plugin setting is not exportable: ${key}`)
    const value = readDataProperty(valueProperties, key, `value: ${key}`)
    if (!validPluginSettingValue(field, value)) return invalid(`Invalid plugin setting value: ${key}`)
    values[key] = value
  }

  const document: PluginSettingsDocument = {
    format: DOCUMENT_FORMAT,
    pluginId,
    signerFingerprint,
    settingsVersion,
    schemaFingerprint,
    values,
  }
  if (documentByteLength(document) > MAX_PLUGIN_SETTINGS_DOCUMENT_BYTES) return invalid('Plugin settings document exceeds the 256 KiB limit')
  return document
}

export const createPluginSettingsDocument = (
  context: PluginSettingsTransferContext,
  settings: Record<string, unknown>,
): PluginSettingsDocument => {
  if (!isPlainRecord(settings)) return invalid('Plugin settings source must be a plain object')
  const values = Object.create(null) as Record<string, string | number | boolean>
  for (const field of contextFields(context)) {
    if (field.exportable !== true) continue
    const descriptor = Object.getOwnPropertyDescriptor(settings, field.key)
    if (!isDataProperty(descriptor)) continue
    if (validPluginSettingValue(field, descriptor.value)) values[field.key] = descriptor.value
  }
  return validatePluginSettingsDocument({
    format: DOCUMENT_FORMAT,
    pluginId: context.pluginId,
    signerFingerprint: context.signerFingerprint,
    settingsVersion: context.settingsVersion,
    schemaFingerprint: context.schemaFingerprint,
    values,
  }, context)
}
