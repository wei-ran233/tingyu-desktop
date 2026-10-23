import { onBeforeUnmount } from '@common/utils/vueTools'
import { appSetting } from '@renderer/store/setting'
import { setDisableAutoPauseBySource } from '@renderer/core/lyric'

export default () => {
  const handleEnable = (enable: boolean) => {
    setDisableAutoPauseBySource(enable, 'statusBarLyric')
  }

  const handleConfig = (setting: Partial<LX.AppSetting>) => {
    if (setting['player.isShowStatusBarLyric'] != null) {
      handleEnable(setting['player.isShowStatusBarLyric'])
    }
  }
  window.app_event.on('configUpdate', handleConfig)
  onBeforeUnmount(() => { window.app_event.off('configUpdate', handleConfig); handleEnable(false) })

  return async() => {
    if (appSetting['player.isShowStatusBarLyric']) {
      handleEnable(true)
    }
  }
}
