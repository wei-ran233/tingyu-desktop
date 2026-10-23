import type { CollectionSurfaceId } from '@common/collection/types'
import type { PagePlacement } from '@common/pages/types'
import type { ThemeResources } from '@common/theme/resources'
import type { ThemeAppearance } from '@common/theme/types'

export const PLUGIN_API_VERSION = '1.12.0'
export const PLUGIN_SCHEME = 'lxplugin'

export type PluginPermission =
  | 'collection.read'
  | 'collection.commands'
  | 'plugin.pages'
  | 'theme.contribute'
  | 'theme.appearance'
  | 'theme.resources'
  | 'storage.scoped'
  | 'settings.scoped'
  | 'credentials.scoped'
  | 'extensions.process'
  | 'extensions.provide'
  | 'extensions.act'
  | 'events.publish'
  | 'extensions.subscribe'
  | 'extensions.render'

export const PLUGIN_PERMISSIONS: readonly PluginPermission[] = [
  'collection.read',
  'collection.commands',
  'plugin.pages',
  'theme.contribute',
  'theme.appearance',
  'theme.resources',
  'storage.scoped',
  'settings.scoped',
  'credentials.scoped',
  'extensions.process',
  'extensions.provide',
  'extensions.act',
  'events.publish',
  'extensions.subscribe',
  'extensions.render',
]

/** Bounded data contracts, never executable validators or arbitrary JSON schema. */
export type ExtensionSchema = { type: 'string', maxLength: number } | { type: 'number' } | { type: 'boolean' } | { type: 'array', items: ExtensionSchema, maxItems: number } | { type: 'object', properties: Record<string, ExtensionSchema> }
export interface PluginExtensionPoint { id: string, version: string, kind: 'processor' | 'provider' | 'action' | 'event' | 'renderer' | 'slot' | 'toolbar', input: ExtensionSchema, output: ExtensionSchema }
export interface PluginExtension { id: string, target: string, version: string, handler: string, priority?: number, title?: string }
export interface PluginEventReceipt { delivered: number, failed: number, skipped: number }
export interface PluginActionInfo { id: string, title: string, pluginId: string, pluginName: string }
export type PluginLifecycleState = 'installed' | 'disabled' | 'blocked' | 'resolving' | 'activating' | 'active' | 'stopping' | 'failed'

export interface PluginDependency { id: string, minVersion?: string, maxVersionExclusive?: string }
export interface PluginSettingField {
  key: string
  title: string
  description?: string
  type: 'boolean' | 'number' | 'string' | 'select'
  default: boolean | number | string
  exportable?: boolean
  min?: number
  max?: number
  maxLength?: number
  options?: Array<{ value: string, label: string }>
}

export interface PluginCredentialField {
  key: string
  title: string
  description?: string
  maxLength?: number
}

export interface PluginCredentialStatus {
  available: boolean
  configured: Record<string, boolean>
}

export interface PluginSettingsMigration {
  fromVersion: number
  toVersion: number
  rename?: Record<string, string>
  remove?: string[]
}

export interface PluginThemeContribution {
  id: string
  name: string
  isDark?: boolean
  tokens: Record<string, string>
  description?: string
  appearance?: ThemeAppearance
  resources?: ThemeResources
}

export interface PluginCollectionProviderContribution {
  id: string
  displayName: string
  description?: string
  surfaces: CollectionSurfaceId[]
  entry?: string
  icon?: string
}

export interface PluginPageContribution {
  id: string
  title: string
  icon?: string
  entry?: string
  order?: number
  placement?: PagePlacement
}

export interface PluginManifest {
  id: string
  name: string
  version: string
  apiVersion: string
  description?: string
  author?: string
  main: string
  icon?: string
  permissions: PluginPermission[]
  collection?: {
    providers: PluginCollectionProviderContribution[]
  }
  pages?: PluginPageContribution[]
  nativeBundle?: { id: string, buildHash: string }
  themes?: PluginThemeContribution[]
  dependencies?: PluginDependency[]
  optionalDependencies?: PluginDependency[]
  conflicts?: PluginDependency[]
  settings?: PluginSettingField[]
  credentials?: PluginCredentialField[]
  settingsVersion?: number
  settingsMigrations?: PluginSettingsMigration[]
  defaultEnabled?: boolean
  runtime?: { entry: string, timeoutMs?: number }
  extensionPoints?: PluginExtensionPoint[]
  extensions?: PluginExtension[]
  signature: string
  publicKey: string
}

export interface PluginPublicInfo {
  id: string
  name: string
  version: string
  apiVersion: string
  description?: string
  author?: string
  icon?: string
  enabled: boolean
  compatible: boolean
  /** Effective contribution availability, independent of the user's switch. */
  available?: boolean
  blockedReason?: string
  activationIndex?: number
  dependencies?: PluginDependency[]
  optionalDependencies?: PluginDependency[]
  conflicts?: PluginDependency[]
  optionalDependencyStates?: Array<{ id: string, available: boolean, reason?: string }>
  settings?: PluginSettingField[]
  credentials?: PluginCredentialField[]
  settingsVersion?: number
  runtime?: PluginManifest['runtime']
  extensionPoints?: PluginExtensionPoint[]
  extensions?: PluginExtension[]
  lifecycleState?: PluginLifecycleState
  incompatibleReason?: string
  source: 'bundled' | 'installed' | 'development'
  publicKeyFingerprint: string
  permissions: PluginPermission[]
  nativeBundle?: { id: string, buildHash: string }
  pages: PluginPageContribution[]
  providers: PluginCollectionProviderContribution[]
  themes: PluginThemeContribution[]
  official: boolean
  canRollback: boolean
}

/** Host-only notification emitted after settings are committed. */
export interface PluginSettingsChange {
  pluginId: string
  settings: Record<string, string | number | boolean>
  targets: string[]
}

export interface PluginSettingsTransferContext {
  pluginId: string
  signerFingerprint: string
  settingsVersion: number
  schemaFingerprint: string
  fields: PluginSettingField[]
}

export interface PluginInstallResult {
  plugin: PluginPublicInfo
  fingerprint: string
  requiresConfirmation: boolean
}

export interface PluginRegistryEntry {
  id: string
  path: string
  source: 'bundled' | 'installed' | 'development'
  enabled: boolean
  publicKey: string
  publicKeyFingerprint: string
  manifest: PluginManifest
  settingsFile?: string
  /** sha256 of every packaged resource except manifest.json. */
  fileDigests: Record<string, string>
  installedAt: number
  previous?: Omit<PluginRegistryEntry, 'previous'>
}

export interface PluginRegistryFile {
  version: 1
  plugins: PluginRegistryEntry[]
  removedBundled?: string[]
}
