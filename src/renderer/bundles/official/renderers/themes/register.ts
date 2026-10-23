import { registerFeatureView } from '@renderer/core/features/registry'
import { OFFICIAL_BUNDLE_ID } from '@common/bundles'

export const registerThemeViews = () => {
  registerFeatureView({ id: 'theme-tide', themeIdentity: 'tide', featureId: 'search', pluginId: OFFICIAL_BUNDLE_ID, displayName: '潮汐主题', mode: 'classic', load: async() => (await import('./tide/Search.vue')).default })
  registerFeatureView({ id: 'theme-tide', themeIdentity: 'tide', featureId: 'list', pluginId: OFFICIAL_BUNDLE_ID, displayName: '潮汐主题', mode: 'classic', load: async() => (await import('./tide/List.vue')).default })
  registerFeatureView({ id: 'theme-tide', themeIdentity: 'tide', featureId: 'leaderboard', pluginId: OFFICIAL_BUNDLE_ID, displayName: '潮汐主题', mode: 'classic', load: async() => (await import('./tide/Leaderboard.vue')).default })
  registerFeatureView({ id: 'theme-tide', themeIdentity: 'tide', featureId: 'songlists', pluginId: OFFICIAL_BUNDLE_ID, displayName: '潮汐主题', mode: 'classic', load: async() => (await import('./tide/SongLists.vue')).default })
  registerFeatureView({ id: 'theme-tide', themeIdentity: 'tide', featureId: 'playback', pluginId: OFFICIAL_BUNDLE_ID, displayName: '潮汐主题', mode: 'classic', load: async() => (await import('./tide/Playback.vue')).default })
  registerFeatureView({ id: 'theme-tide', themeIdentity: 'tide', featureId: 'playback.detail', pluginId: OFFICIAL_BUNDLE_ID, displayName: '潮汐主题', mode: 'classic', load: async() => (await import('./tide/PlayDetail.vue')).default })
  registerFeatureView({ id: 'theme-signal', themeIdentity: 'signal', featureId: 'search', pluginId: OFFICIAL_BUNDLE_ID, displayName: '信号主题', mode: 'classic', load: async() => (await import('./signal/Search.vue')).default })
  registerFeatureView({ id: 'theme-signal', themeIdentity: 'signal', featureId: 'list', pluginId: OFFICIAL_BUNDLE_ID, displayName: '信号主题', mode: 'classic', load: async() => (await import('./signal/List.vue')).default })
  registerFeatureView({ id: 'theme-signal', themeIdentity: 'signal', featureId: 'leaderboard', pluginId: OFFICIAL_BUNDLE_ID, displayName: '信号主题', mode: 'classic', load: async() => (await import('./signal/Leaderboard.vue')).default })
  registerFeatureView({ id: 'theme-signal', themeIdentity: 'signal', featureId: 'songlists', pluginId: OFFICIAL_BUNDLE_ID, displayName: '信号主题', mode: 'classic', load: async() => (await import('./signal/SongLists.vue')).default })
  registerFeatureView({ id: 'theme-signal', themeIdentity: 'signal', featureId: 'playback', pluginId: OFFICIAL_BUNDLE_ID, displayName: '信号主题', mode: 'classic', load: async() => (await import('./signal/Playback.vue')).default })
  registerFeatureView({ id: 'theme-signal', themeIdentity: 'signal', featureId: 'playback.detail', pluginId: OFFICIAL_BUNDLE_ID, displayName: '信号主题', mode: 'classic', load: async() => (await import('./signal/PlayDetail.vue')).default })
  registerFeatureView({ id: 'theme-petals', themeIdentity: 'petals', featureId: 'search', pluginId: OFFICIAL_BUNDLE_ID, displayName: '花间主题', mode: 'classic', load: async() => (await import('./petals/Search.vue')).default })
  registerFeatureView({ id: 'theme-petals', themeIdentity: 'petals', featureId: 'list', pluginId: OFFICIAL_BUNDLE_ID, displayName: '花间主题', mode: 'classic', load: async() => (await import('./petals/List.vue')).default })
  registerFeatureView({ id: 'theme-petals', themeIdentity: 'petals', featureId: 'leaderboard', pluginId: OFFICIAL_BUNDLE_ID, displayName: '花间主题', mode: 'classic', load: async() => (await import('./petals/Leaderboard.vue')).default })
  registerFeatureView({ id: 'theme-petals', themeIdentity: 'petals', featureId: 'songlists', pluginId: OFFICIAL_BUNDLE_ID, displayName: '花间主题', mode: 'classic', load: async() => (await import('./petals/SongLists.vue')).default })
  registerFeatureView({ id: 'theme-petals', themeIdentity: 'petals', featureId: 'playback', pluginId: OFFICIAL_BUNDLE_ID, displayName: '花间主题', mode: 'classic', load: async() => (await import('./petals/Playback.vue')).default })
  registerFeatureView({ id: 'theme-petals', themeIdentity: 'petals', featureId: 'playback.detail', pluginId: OFFICIAL_BUNDLE_ID, displayName: '花间主题', mode: 'classic', load: async() => (await import('./petals/PlayDetail.vue')).default })
  registerFeatureView({ id: 'theme-tide', themeIdentity: 'tide', featureId: 'settings', pluginId: OFFICIAL_BUNDLE_ID, displayName: '潮汐主题', mode: 'classic', load: async() => (await import('./tide/Settings.vue')).default })
  registerFeatureView({ id: 'theme-tide', themeIdentity: 'tide', featureId: 'download', pluginId: OFFICIAL_BUNDLE_ID, displayName: '潮汐主题', mode: 'classic', load: async() => (await import('./tide/Download.vue')).default })
  registerFeatureView({ id: 'theme-signal', themeIdentity: 'signal', featureId: 'settings', pluginId: OFFICIAL_BUNDLE_ID, displayName: '信号主题', mode: 'classic', load: async() => (await import('./signal/Settings.vue')).default })
  registerFeatureView({ id: 'theme-signal', themeIdentity: 'signal', featureId: 'download', pluginId: OFFICIAL_BUNDLE_ID, displayName: '信号主题', mode: 'classic', load: async() => (await import('./signal/Download.vue')).default })
  registerFeatureView({ id: 'theme-petals', themeIdentity: 'petals', featureId: 'settings', pluginId: OFFICIAL_BUNDLE_ID, displayName: '花间主题', mode: 'classic', load: async() => (await import('./petals/Settings.vue')).default })
  registerFeatureView({ id: 'theme-petals', themeIdentity: 'petals', featureId: 'download', pluginId: OFFICIAL_BUNDLE_ID, displayName: '花间主题', mode: 'classic', load: async() => (await import('./petals/Download.vue')).default })
}
