import type { PluginPermission } from './types'
import { PluginSecurityError } from './security'

const requestPermissions: Record<string, PluginPermission | null> = {
  ready: null,
  identity: null,
  theme: null,
  snapshot: 'collection.read',
  items: 'collection.read',
  dispatch: 'collection.commands',
  options: 'collection.commands',
  'storage.get': 'storage.scoped',
  'storage.set': 'storage.scoped',
  'storage.remove': 'storage.scoped',
  'settings.get': 'settings.scoped',
  'settings.set': 'settings.scoped',
  navigate: 'plugin.pages',
  anchor: 'collection.read',
}

export const authorizePluginRequest = (permissions: readonly PluginPermission[], kind: string) => {
  if (!Object.prototype.hasOwnProperty.call(requestPermissions, kind)) throw new PluginSecurityError('invalid_request', 'Unknown plugin request')
  const permission = requestPermissions[kind]
  if (permission && !permissions.includes(permission)) throw new PluginSecurityError('permission_denied', `Missing permission: ${permission}`)
}
