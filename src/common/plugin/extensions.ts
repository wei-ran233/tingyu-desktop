import type { ExtensionSchema, PluginExtension, PluginExtensionPoint } from './types'
import { PluginSecurityError, isSafePluginPath } from './security'
import { PLUGIN_UI_KINDS, PLUGIN_UI_INPUT_SCHEMA, PLUGIN_UI_SCHEMA } from './ui'
import { isDependencyVersion } from './dependencies'

const idPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/
const invalid = (): never => { throw new PluginSecurityError('invalid_manifest', 'Invalid extension contract') }
const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key)
const isDataProperty = (descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } => {
  return descriptor != null && hasOwn(descriptor, 'value')
}
const isEnumerableDataProperty = (descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } => {
  return isDataProperty(descriptor) && descriptor.enumerable === true
}
export const validateExtensionSchema = (raw: unknown, depth = 0): ExtensionSchema => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || depth > 4) return invalid()
  const schema = raw as ExtensionSchema
  if (schema.type === 'string') {
    if (Object.keys(raw).some(key => !['type', 'maxLength'].includes(key)) || !Number.isInteger(schema.maxLength) || schema.maxLength < 1 || schema.maxLength > 4096) return invalid()
    return { type: 'string', maxLength: schema.maxLength }
  }
  if (schema.type === 'array') {
    if (Object.keys(raw).some(key => !['type', 'items', 'maxItems'].includes(key)) || !Number.isInteger(schema.maxItems) || schema.maxItems < 1 || schema.maxItems > 32) return invalid()
    return { type: 'array', items: validateExtensionSchema(schema.items, depth + 1), maxItems: schema.maxItems }
  }
  if (schema.type === 'boolean' || schema.type === 'number') {
    if (Object.keys(raw).length !== 1) return invalid()
    return { type: schema.type }
  }
  if (schema.type !== 'object' || Object.keys(raw).some(key => !['type', 'properties'].includes(key)) || !schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties)) return invalid()
  const entries = Object.entries(schema.properties)
  if (entries.length > 16 || entries.some(([key]) => !/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key) || ['constructor', 'prototype'].includes(key))) return invalid()
  return { type: 'object', properties: Object.fromEntries(entries.map(([key, value]) => [key, validateExtensionSchema(value, depth + 1)])) }
}
export const matchesExtensionSchema = (schema: ExtensionSchema, value: unknown): boolean => {
  if (schema.type === 'string') return typeof value === 'string' && value.length <= schema.maxLength
  if (schema.type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (schema.type === 'boolean') return typeof value === 'boolean'
  if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > schema.maxItems) return false
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Array.prototype && prototype !== null) return false
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
    if (!isDataProperty(lengthDescriptor)) return false
    const keys = Reflect.ownKeys(value)
    if (keys.length !== value.length + 1 || !keys.includes('length')) return false
    for (const key of keys) {
      if (key === 'length') continue
      if (typeof key !== 'string' || !/^(?:0|[1-9]\d*)$/.test(key)) return false
      const index = Number(key)
      if (!Number.isSafeInteger(index) || index >= value.length) return false
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!isEnumerableDataProperty(descriptor) || !matchesExtensionSchema(schema.items, descriptor.value)) return false
    }
    return true
  }
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  const keys = Reflect.ownKeys(value)
  const schemaKeys = Object.keys(schema.properties)
  if (keys.length !== schemaKeys.length) return false
  return schemaKeys.every(key => {
    if (!hasOwn(value, key)) return false
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return isEnumerableDataProperty(descriptor) && matchesExtensionSchema(schema.properties[key], descriptor.value)
  })
}
/** Property order is not part of a data contract. */
export const equalExtensionSchemas = (left: ExtensionSchema, right: ExtensionSchema): boolean => {
  if (left.type !== right.type) return false
  if (left.type === 'string' && right.type === 'string') return left.maxLength === right.maxLength
  if (left.type === 'array' && right.type === 'array') return left.maxItems === right.maxItems && equalExtensionSchemas(left.items, right.items)
  if (left.type === 'object' && right.type === 'object') {
    const keys = Object.keys(left.properties)
    return keys.length === Object.keys(right.properties).length && keys.every(key => Object.prototype.hasOwnProperty.call(right.properties, key) && equalExtensionSchemas(left.properties[key], right.properties[key]))
  }
  return true
}
export const validateExtensionDeclarations = (manifest: Record<string, unknown>) => {
  const result: { runtime?: { entry: string, timeoutMs?: number }, extensionPoints?: PluginExtensionPoint[], extensions?: PluginExtension[], defaultEnabled?: boolean } = {}
  if (manifest.defaultEnabled != null) {
    if (typeof manifest.defaultEnabled !== 'boolean') return invalid()
    result.defaultEnabled = manifest.defaultEnabled
  }
  if (manifest.runtime != null) {
    const runtime = manifest.runtime as Record<string, unknown>
    if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime) || Object.keys(runtime).some(key => !['entry', 'timeoutMs'].includes(key)) || !isSafePluginPath(runtime.entry) || !runtime.entry.endsWith('.html') || (runtime.timeoutMs != null && (!Number.isInteger(runtime.timeoutMs) || Number(runtime.timeoutMs) < 100 || Number(runtime.timeoutMs) > 10000))) return invalid()
    result.runtime = { entry: runtime.entry, ...(runtime.timeoutMs != null ? { timeoutMs: Number(runtime.timeoutMs) } : {}) }
  }
  if (manifest.extensionPoints != null) {
    if (!Array.isArray(manifest.extensionPoints) || manifest.extensionPoints.length > 16) return invalid()
    const seen = new Set<string>()
    result.extensionPoints = manifest.extensionPoints.map(raw => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid()
      const point = raw as PluginExtensionPoint
      if (Object.keys(raw).some(key => !['id', 'version', 'kind', 'input', 'output'].includes(key)) || typeof point.id !== 'string' || !idPattern.test(point.id) || seen.has(point.id) || !isDependencyVersion(point.version) || !['processor', 'provider', 'action', 'event', ...PLUGIN_UI_KINDS].includes(point.kind)) return invalid()
      if (point.kind === 'event' && (!(manifest.permissions as string[]).includes('events.publish') || point.output?.type !== 'object' || !point.output.properties || Object.keys(point.output.properties).length !== 0)) return invalid()
      if ((PLUGIN_UI_KINDS as readonly string[]).includes(point.kind) && (!equalExtensionSchemas(validateExtensionSchema(point.input), PLUGIN_UI_INPUT_SCHEMA) || !equalExtensionSchemas(validateExtensionSchema(point.output), PLUGIN_UI_SCHEMA))) return invalid()
      seen.add(point.id)
      return { ...point, input: validateExtensionSchema(point.input), output: validateExtensionSchema(point.output) }
    })
  }
  if (manifest.extensions != null) {
    if (!Array.isArray(manifest.extensions) || manifest.extensions.length > 32 || !result.runtime || !(manifest.permissions as string[]).some(permission => ['extensions.process', 'extensions.provide', 'extensions.act', 'extensions.subscribe', 'extensions.render'].includes(permission))) return invalid()
    const seen = new Set<string>()
    const declaredTargets = new Set([
      ...((manifest.dependencies as Array<{ id: string }> | undefined) ?? []),
      ...((manifest.optionalDependencies as Array<{ id: string }> | undefined) ?? []),
    ].map(dependency => dependency?.id).filter((id): id is string => typeof id === 'string'))
    result.extensions = manifest.extensions.map(raw => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid()
      const extension = raw as PluginExtension
      const target = typeof extension.target === 'string' ? extension.target.split('/') : []
      if (Object.keys(raw).some(key => !['id', 'target', 'version', 'handler', 'priority', 'title'].includes(key)) || typeof extension.id !== 'string' || !idPattern.test(extension.id) || seen.has(extension.id) || typeof extension.handler !== 'string' || !idPattern.test(extension.handler) || target.length !== 2 || !idPattern.test(target[1]) || !isDependencyVersion(extension.version) || !declaredTargets.has(target[0]) || (extension.priority != null && (!Number.isInteger(extension.priority) || Math.abs(extension.priority) > 100))) return invalid()
      if (extension.title != null && (typeof extension.title !== 'string' || !extension.title.trim() || extension.title.length > 80)) return invalid()
      seen.add(extension.id)
      return { ...extension }
    })
  }
  const usesUi = result.extensionPoints?.some(point => (PLUGIN_UI_KINDS as readonly string[]).includes(point.kind)) === true || (manifest.permissions as string[]).includes('extensions.render')
  if (usesUi && !/^1\.(?:[7-9]|\d{2,})\./.test(String(manifest.apiVersion))) return invalid()
  const usesEvent = result.extensionPoints?.some(point => point.kind === 'event') === true || (manifest.permissions as string[]).some(permission => ['events.publish', 'extensions.subscribe'].includes(permission))
  if (usesEvent && !/^1\.(?:[6-9]|\d{2,})\./.test(String(manifest.apiVersion))) return invalid()
  const usesAction = result.extensionPoints?.some(point => point.kind === 'action') === true || (manifest.permissions as string[]).includes('extensions.act') || result.extensions?.some(extension => extension.title != null) === true
  if (usesAction && !/^1\.(?:[5-9]|\d{2,})\./.test(String(manifest.apiVersion))) return invalid()
  const usesProvider = result.extensionPoints?.some(point => point.kind === 'provider') === true || (manifest.permissions as string[]).includes('extensions.provide')
  const hasArray = (schema: ExtensionSchema): boolean => schema.type === 'array' || (schema.type === 'object' && Object.values(schema.properties).some(hasArray))
  if ((usesProvider || result.extensionPoints?.some(point => hasArray(point.input) || hasArray(point.output))) && !/^1\.(?:[4-9]|\d{2,})\./.test(String(manifest.apiVersion))) return invalid()
  if (Object.keys(result).length && !/^1\.(?:[3-9]|\d{2,})\./.test(String(manifest.apiVersion))) return invalid()
  return result
}
