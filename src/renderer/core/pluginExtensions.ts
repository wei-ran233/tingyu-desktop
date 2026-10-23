import type { PluginUiInput, PluginUiDocument } from '@common/plugin/ui'
import type { PluginActionInfo } from '@common/plugin/types'
import { rendererInvoke } from '@common/rendererIpc'
import { PLUGIN_EVENT_NAME } from '@common/ipcNames'

export const processSearchText = async(text: string): Promise<string> => {
  const result = await rendererInvoke<{ text: string }, { text: string }>(PLUGIN_EVENT_NAME.process_search, { text })
  return result.text
}

export const getSearchSuggestions = async(source: string): Promise<string[]> => {
  const result = await rendererInvoke<{ source: string }, { suggestions: string[] }>(PLUGIN_EVENT_NAME.search_suggestions, { source })
  return [...new Set(result.suggestions.map(text => text.trim()).filter(Boolean))]
}

export const getSearchActions = async(): Promise<PluginActionInfo[]> => rendererInvoke<PluginActionInfo[]>(PLUGIN_EVENT_NAME.search_actions)
export const executeSearchAction = async(actionId: string, source: string): Promise<string[]> => {
  const result = await rendererInvoke<{ actionId: string, source: string }, { suggestions: string[] }>(PLUGIN_EVENT_NAME.run_search_action, { actionId, source })
  return [...new Set(result.suggestions.map(text => text.trim()).filter(Boolean))]
}

export const getSearchUi = async(kind: string): Promise<PluginActionInfo[]> => rendererInvoke<{ kind: string }, PluginActionInfo[]>(PLUGIN_EVENT_NAME.search_ui, { kind })
export const renderSearchUi = async(kind: string, renderId: string, input: PluginUiInput): Promise<PluginUiDocument> => rendererInvoke<{ kind: string, renderId: string, input: PluginUiInput }, PluginUiDocument>(PLUGIN_EVENT_NAME.render_search_ui, { kind, renderId, input })
