import { contextBridge, ipcRenderer } from 'electron'
import { PLUGIN_API_VERSION } from '@common/plugin/types'
import { PLUGIN_EVENT_NAME } from '@common/ipcNames'

type RequestKind =
  | 'ready'
  | 'identity'
  | 'snapshot'
  | 'items'
  | 'dispatch'
  | 'options'
  | 'theme'
  | 'navigate'
  | 'storage.get'
  | 'storage.set'
  | 'storage.remove'
  | 'settings.get'
  | 'settings.set'
  | 'anchor'

const request = async <T = unknown>(kind: RequestKind, body?: unknown): Promise<T> => {
  return ipcRenderer.invoke(PLUGIN_EVENT_NAME.request, { kind, body }) as Promise<T>
}

const on = (channel: string, callback: (value: any) => void) => {
  const handler = (_event: Electron.IpcRendererEvent, value: any) => { callback(value) }
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('lxPlugin', {
  apiVersion: PLUGIN_API_VERSION,
  ready: async() => request('ready'),
  getIdentity: async() => request('identity'),
  getSnapshot: async() => request('snapshot'),
  getItems: async(params: unknown) => request('items', params),
  dispatch: async(params: unknown) => request('dispatch', params),
  getCommandOptions: async(params: unknown) => request('options', params),
  subscribe: (event: string | ((value: unknown) => void), callback?: (value: unknown) => void) => {
    if (typeof event === 'function') return on('lxplugin:snapshot', event)
    const channels: Record<string, string> = { snapshot: 'lxplugin:snapshot', theme: PLUGIN_EVENT_NAME.theme_change, locale: 'lxplugin:locale', availability: 'lxplugin:availability' }
    if (!channels[event] || typeof callback !== 'function') throw new Error('Invalid subscription')
    return on(channels[event], callback)
  },
  setScrollAnchor: async(params: unknown) => request('anchor', params),
  getTheme: async() => request('theme'),
  onThemeChange: (callback: (snapshot: unknown) => void) => on(PLUGIN_EVENT_NAME.theme_change, callback),
  navigate: async(routePath: string) => request('navigate', { path: routePath }),
  storage: {
    get: async(key: string) => request('storage.get', { key }),
    set: async(key: string, value: unknown) => request('storage.set', { key, value }),
    remove: async(key: string) => request('storage.remove', { key }),
  },
  settings: {
    get: async() => request('settings.get'),
    set: async(key: string, value: unknown) => request('settings.set', { key, value }),
    subscribe: (callback: (value: unknown) => void) => on('lxplugin:settings', callback),
  },
})
