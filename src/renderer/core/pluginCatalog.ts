import { shallowRef } from 'vue'
import { rendererInvoke } from '@common/rendererIpc'
import { PLUGIN_EVENT_NAME } from '@common/ipcNames'
import type { PluginPublicInfo } from '@common/plugin/types'

import { createCoalescedLoader } from './latestLoader'

export const requestPluginCatalog = createCoalescedLoader(async() => rendererInvoke<PluginPublicInfo[]>(PLUGIN_EVENT_NAME.list))

export const settingsPlugins = shallowRef<PluginPublicInfo[]>([])
let revision = 0
export const loadSettingsPlugins = async() => {
  const request = ++revision
  const plugins = await requestPluginCatalog()
  if (request === revision) settingsPlugins.value = plugins
}
