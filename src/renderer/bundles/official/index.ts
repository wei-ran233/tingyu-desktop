import { registerService } from '@renderer/core/features/services'
import { registerFeature } from '@renderer/core/features/registry'
import { OFFICIAL_BUNDLE_ID } from '@common/bundles'
import { registerThemeViews } from './renderers/themes/register'

let registered = false
export const registerOfficialBundle = () => {
  if (registered) return
  registered = true
  registerService({ id: 'lx.official.runtime', pluginId: OFFICIAL_BUNDLE_ID, load: async() => (await import('./services/Runtime.vue')).default })
  registerFeature({ id: 'search', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'search', defaultView: 'classic', load: async() => (await import('./features/Search/index.js')).default }, [
    { id: 'classic', featureId: 'search', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Search/index.vue')).default },
    { id: 'compact', featureId: 'search', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/Search/index.vue')).default },
  ])
  registerFeature({ id: 'songlists', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'song_list', defaultView: 'classic', load: async() => (await import('./features/songList/List/index')).default }, [
    { id: 'classic', featureId: 'songlists', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/songList/List/index.vue')).default },
    { id: 'compact', featureId: 'songlists', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/songList/List/index.vue')).default },
  ])
  registerFeature({ id: 'leaderboard', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'leaderboard', defaultView: 'classic', load: async() => (await import('./features/Leaderboard/index.js')).default }, [
    { id: 'classic', featureId: 'leaderboard', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Leaderboard/index.vue')).default },
    { id: 'compact', featureId: 'leaderboard', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/Leaderboard/index.vue')).default },
  ])
  registerFeature({ id: 'list', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'my_list', defaultView: 'classic', load: async() => (await import('./features/List/index.js')).default }, [
    { id: 'classic', featureId: 'list', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/List/index.vue')).default },
    { id: 'compact', featureId: 'list', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/List/index.vue')).default },
  ])
  registerFeature({ id: 'download', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'download', defaultView: 'classic', load: async() => (await import('./features/Download/index.js')).default }, [
    { id: 'classic', featureId: 'download', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Download/index.vue')).default },
    { id: 'compact', featureId: 'download', pluginId: OFFICIAL_BUNDLE_ID, displayName: '简洁卡片', mode: 'compact', load: async() => (await import('./renderers/DownloadCards.vue')).default },
  ])
  registerFeature({ id: 'settings', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'setting', defaultView: 'classic', load: async() => (await import('./features/Setting/index.js')).default }, [
    { id: 'classic', featureId: 'settings', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Setting/index.vue')).default },
    { id: 'compact', featureId: 'settings', pluginId: OFFICIAL_BUNDLE_ID, displayName: '简洁页签', mode: 'compact', load: async() => (await import('./renderers/SettingsTabs.vue')).default },
  ])
  registerFeature({ id: 'songlist-detail', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'song_list', defaultView: 'classic', load: async() => (await import('./features/songList/Detail/index')).default }, [
    { id: 'classic', featureId: 'songlist-detail', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/songList/Detail/index.vue')).default },
    { id: 'compact', featureId: 'songlist-detail', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/songList/Detail/index.vue')).default },
  ])
  registerFeature({ id: 'settings.basic', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'setting__basic', defaultView: 'classic', load: async() => (await import('./features/Setting/components/SettingBasic.js')).default }, [
    { id: 'classic', featureId: 'settings.basic', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Setting/components/SettingBasic.vue')).default },
    { id: 'compact', featureId: 'settings.basic', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/Setting/components/SettingBasic.vue')).default },
  ])
  registerFeature({ id: 'settings.play', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'setting__play', defaultView: 'classic', load: async() => (await import('./features/Setting/components/SettingPlay.js')).default }, [
    { id: 'classic', featureId: 'settings.play', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Setting/components/SettingPlay.vue')).default },
    { id: 'compact', featureId: 'settings.play', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/Setting/components/SettingPlay.vue')).default },
  ])
  registerFeature({ id: 'settings.play_detail', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'setting__play_detail', defaultView: 'classic', load: async() => (await import('./features/Setting/components/SettingPlayDetail.js')).default }, [
    { id: 'classic', featureId: 'settings.play_detail', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Setting/components/SettingPlayDetail.vue')).default },
    { id: 'compact', featureId: 'settings.play_detail', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/Setting/components/SettingPlayDetail.vue')).default },
  ])
  registerFeature({ id: 'settings.desktop_lyric', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'setting__desktop_lyric', defaultView: 'classic', load: async() => (await import('./features/Setting/components/SettingDesktopLyric.js')).default }, [
    { id: 'classic', featureId: 'settings.desktop_lyric', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Setting/components/SettingDesktopLyric.vue')).default },
    { id: 'compact', featureId: 'settings.desktop_lyric', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/Setting/components/SettingDesktopLyric.vue')).default },
  ])
  registerFeature({ id: 'settings.search', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'setting__search', defaultView: 'classic', load: async() => (await import('./features/Setting/components/SettingSearch.js')).default }, [
    { id: 'classic', featureId: 'settings.search', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Setting/components/SettingSearch.vue')).default },
    { id: 'compact', featureId: 'settings.search', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/Setting/components/SettingSearch.vue')).default },
  ])
  registerFeature({ id: 'settings.list', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'setting__list', defaultView: 'classic', load: async() => (await import('./features/Setting/components/SettingList.js')).default }, [
    { id: 'classic', featureId: 'settings.list', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Setting/components/SettingList.vue')).default },
    { id: 'compact', featureId: 'settings.list', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/Setting/components/SettingList.vue')).default },
  ])
  registerFeature({ id: 'settings.download', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'setting__download', defaultView: 'classic', load: async() => (await import('./features/Setting/components/SettingDownload.js')).default }, [
    { id: 'classic', featureId: 'settings.download', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Setting/components/SettingDownload.vue')).default },
    { id: 'compact', featureId: 'settings.download', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/Setting/components/SettingDownload.vue')).default },
  ])
  registerFeature({ id: 'settings.hot_key', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'setting__hot_key', defaultView: 'classic', load: async() => (await import('./features/Setting/components/SettingHotKey.js')).default }, [
    { id: 'classic', featureId: 'settings.hot_key', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Setting/components/SettingHotKey.vue')).default },
    { id: 'compact', featureId: 'settings.hot_key', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/Setting/components/SettingHotKey.vue')).default },
  ])
  registerFeature({ id: 'settings.sync', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'setting__sync', defaultView: 'classic', load: async() => (await import('./features/Setting/components/SettingSync/index.js')).default }, [
    { id: 'classic', featureId: 'settings.sync', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Setting/components/SettingSync/index.vue')).default },
    { id: 'compact', featureId: 'settings.sync', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/Setting/components/SettingSync/index.vue')).default },
  ])
  registerFeature({ id: 'settings.open_api', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'setting__open_api', defaultView: 'classic', load: async() => (await import('./features/Setting/components/SettingOpenAPI.js')).default }, [
    { id: 'classic', featureId: 'settings.open_api', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Setting/components/SettingOpenAPI.vue')).default },
    { id: 'compact', featureId: 'settings.open_api', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/Setting/components/SettingOpenAPI.vue')).default },
  ])
  registerFeature({ id: 'settings.network', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'setting__network', defaultView: 'classic', load: async() => (await import('./features/Setting/components/SettingNetwork.js')).default }, [
    { id: 'classic', featureId: 'settings.network', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Setting/components/SettingNetwork.vue')).default },
    { id: 'compact', featureId: 'settings.network', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/Setting/components/SettingNetwork.vue')).default },
  ])
  registerFeature({ id: 'settings.odc', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'setting__odc', defaultView: 'classic', load: async() => (await import('./features/Setting/components/SettingOdc.js')).default }, [
    { id: 'classic', featureId: 'settings.odc', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Setting/components/SettingOdc.vue')).default },
    { id: 'compact', featureId: 'settings.odc', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/Setting/components/SettingOdc.vue')).default },
  ])
  registerFeature({ id: 'settings.backup', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'setting__backup', defaultView: 'classic', load: async() => (await import('./features/Setting/components/SettingBackup.js')).default }, [
    { id: 'classic', featureId: 'settings.backup', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Setting/components/SettingBackup.vue')).default },
    { id: 'compact', featureId: 'settings.backup', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/Setting/components/SettingBackup.vue')).default },
  ])
  registerFeature({ id: 'settings.other', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'setting__other', defaultView: 'classic', load: async() => (await import('./features/Setting/components/SettingOther.js')).default }, [
    { id: 'classic', featureId: 'settings.other', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Setting/components/SettingOther.vue')).default },
    { id: 'compact', featureId: 'settings.other', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/Setting/components/SettingOther.vue')).default },
  ])
  registerFeature({ id: 'settings.update', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'setting__update', defaultView: 'classic', load: async() => (await import('./features/Setting/components/SettingUpdate.js')).default }, [
    { id: 'classic', featureId: 'settings.update', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Setting/components/SettingUpdate.vue')).default },
    { id: 'compact', featureId: 'settings.update', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/Setting/components/SettingUpdate.vue')).default },
  ])
  registerFeature({ id: 'settings.about', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'setting__about', defaultView: 'classic', load: async() => (await import('./features/Setting/components/SettingAbout.js')).default }, [
    { id: 'classic', featureId: 'settings.about', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./views/Setting/components/SettingAbout.vue')).default },
    { id: 'compact', featureId: 'settings.about', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./views/Setting/components/SettingAbout.vue')).default },
  ])
  registerFeature({ id: 'playback', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'playback', defaultView: 'classic', load: async() => (await import('./features/shell/PlayBar.js')).default }, [
    { id: 'classic', featureId: 'playback', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./renderers/shell/PlayBar.vue')).default },
    { id: 'compact', featureId: 'playback', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./renderers/shell/PlayBar.vue')).default },
  ])
  registerFeature({ id: 'playback.detail', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'playback.detail', defaultView: 'classic', load: async() => (await import('./features/shell/PlayDetail.js')).default }, [
    { id: 'classic', featureId: 'playback.detail', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./renderers/shell/PlayDetail.vue')).default },
    { id: 'compact', featureId: 'playback.detail', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./renderers/shell/PlayDetail.vue')).default },
  ])
  registerFeature({ id: 'navigation.search', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'navigation.search', defaultView: 'classic', load: async() => (await import('./features/shell/Toolbar.js')).default }, [
    { id: 'classic', featureId: 'navigation.search', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./renderers/shell/Toolbar.vue')).default },
    { id: 'compact', featureId: 'navigation.search', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./renderers/shell/Toolbar.vue')).default },
  ])
  registerFeature({ id: 'sync.mode', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'sync.mode', defaultView: 'classic', load: async() => (await import('./features/shell/SyncModeModal.js')).default }, [
    { id: 'classic', featureId: 'sync.mode', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./renderers/shell/SyncModeModal.vue')).default },
    { id: 'compact', featureId: 'sync.mode', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./renderers/shell/SyncModeModal.vue')).default },
  ])
  registerFeature({ id: 'sync.auth', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'sync.auth', defaultView: 'classic', load: async() => (await import('./features/shell/SyncAuthCodeModal.js')).default }, [
    { id: 'classic', featureId: 'sync.auth', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./renderers/shell/SyncAuthCodeModal.vue')).default },
    { id: 'compact', featureId: 'sync.auth', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./renderers/shell/SyncAuthCodeModal.vue')).default },
  ])
  registerFeature({ id: 'updates.notice', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'updates.notice', defaultView: 'classic', load: async() => (await import('./features/shell/UpdateModal.js')).default }, [
    { id: 'classic', featureId: 'updates.notice', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./renderers/shell/UpdateModal.vue')).default },
    { id: 'compact', featureId: 'updates.notice', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./renderers/shell/UpdateModal.vue')).default },
  ])
  registerFeature({ id: 'updates.changelog', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'updates.changelog', defaultView: 'classic', load: async() => (await import('./features/shell/ChangeLogModal.js')).default }, [
    { id: 'classic', featureId: 'updates.changelog', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./renderers/shell/ChangeLogModal.vue')).default },
    { id: 'compact', featureId: 'updates.changelog', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./renderers/shell/ChangeLogModal.vue')).default },
  ])
  registerFeature({ id: 'terms', pluginId: OFFICIAL_BUNDLE_ID, displayName: 'terms', defaultView: 'classic', load: async() => (await import('./features/shell/PactModal.js')).default }, [
    { id: 'classic', featureId: 'terms', pluginId: OFFICIAL_BUNDLE_ID, displayName: '默认', mode: 'classic', load: async() => (await import('./renderers/shell/PactModal.vue')).default },
    { id: 'compact', featureId: 'terms', pluginId: OFFICIAL_BUNDLE_ID, displayName: '紧凑', mode: 'compact', load: async() => (await import('./renderers/shell/PactModal.vue')).default },
  ])
  registerThemeViews()
}
