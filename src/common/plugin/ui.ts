import type { ExtensionSchema } from './types'
import { matchesExtensionSchema } from './extensions'

export const PLUGIN_UI_KINDS = ['renderer', 'slot', 'toolbar'] as const
export type PluginUiKind = typeof PLUGIN_UI_KINDS[number]
export interface PluginUiInput { source: string, suggestions: string[], actions: Array<{ id: string, title: string }> }
export interface PluginUiDocument { layout: 'list' | 'grid' | 'row', heading: string, items: Array<{ label: string, command: 'text' | 'search' | 'action', value: string }> }
export const PLUGIN_UI_INPUT_SCHEMA: ExtensionSchema = {
  type: 'object',
  properties: {
    source: { type: 'string', maxLength: 32 },
    suggestions: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 100 } },
    actions: { type: 'array', maxItems: 12, items: { type: 'object', properties: { id: { type: 'string', maxLength: 129 }, title: { type: 'string', maxLength: 80 } } } },
  },
}
export const PLUGIN_UI_SCHEMA: ExtensionSchema = {
  type: 'object',
  properties: {
    layout: { type: 'string', maxLength: 8 },
    heading: { type: 'string', maxLength: 100 },
    items: { type: 'array', maxItems: 24, items: { type: 'object', properties: { label: { type: 'string', maxLength: 100 }, command: { type: 'string', maxLength: 8 }, value: { type: 'string', maxLength: 129 } } } },
  },
}
/** No HTML, CSS, URL, component, script, or unadvertised host command. */
export const validatePluginUiDocument = (value: unknown, input: unknown): value is PluginUiDocument => {
  if (!matchesExtensionSchema(PLUGIN_UI_INPUT_SCHEMA, input) || !matchesExtensionSchema(PLUGIN_UI_SCHEMA, value)) return false
  const document = value as PluginUiDocument
  const snapshot = input as PluginUiInput
  return ['list', 'grid', 'row'].includes(document.layout) && document.items.every(item =>
    item.command === 'text' ? item.value === '' : item.command === 'search' ? snapshot.suggestions.includes(item.value) : item.command === 'action' && snapshot.actions.some(action => action.id === item.value),
  )
}
