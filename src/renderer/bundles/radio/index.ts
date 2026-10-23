import { registerFeature } from '@renderer/core/features/registry'
import { registerService } from '@renderer/core/features/services'
import { RADIO_BUNDLE_ID } from '@common/bundles'

let registered = false
export const registerRadioBundle = () => {
  if (registered) return
  registered = true
  registerService({ id: 'lx.radio.runtime', pluginId: RADIO_BUNDLE_ID, load: async() => (await import('./services/Runtime.vue')).default })
  registerFeature({ id: 'dj', pluginId: RADIO_BUNDLE_ID, displayName: 'ai_dj', defaultView: 'classic', load: async() => (await import('./features/Dj/index.js')).default }, [
    { id: 'classic', featureId: 'dj', pluginId: RADIO_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Dj/index.vue')).default },
    { id: 'compact', featureId: 'dj', pluginId: RADIO_BUNDLE_ID, displayName: '简洁对话', mode: 'compact', load: async() => (await import('./renderers/DjConversation.vue')).default },
  ])
  registerFeature({ id: 'settings.radio', pluginId: RADIO_BUNDLE_ID, displayName: 'ai_dj', defaultView: 'classic', load: async() => (await import('./features/Settings.js')).default }, [
    { id: 'classic', featureId: 'settings.radio', pluginId: RADIO_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Settings.vue')).default },
    { id: 'compact', featureId: 'settings.radio', pluginId: RADIO_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/Settings.vue')).default },
  ])
}
