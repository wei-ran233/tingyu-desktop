// import { ref, onBeforeUnmount } from '@common/utils/vueTools'
import { appSetting, updateSetting } from '@renderer/store/setting'

export default {
  name: 'SettingPlayDetail',
  setup() {
    return {
      appSetting,
      updateSetting,
    }
  },
}
