import type { Component } from 'vue'

export interface NativeServiceDefinition {
  id: string
  pluginId: string
  featureId?: string
  /** Services have their own lifetime and never remount on view changes. */
  load: () => Promise<Component>
}
const services = new Map<string, NativeServiceDefinition>()
export const registerService = (definition: NativeServiceDefinition) => {
  if (services.has(definition.id)) throw new Error(`Duplicate service: ${definition.id}`)
  services.set(definition.id, definition)
}
export const getServices = () => [...services.values()]
