// import { computed } from '@common/utils/vueTools'
import { openAPI } from '@renderer/store'
import { openUrl } from '@common/utils/electron'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { debounce } from '@common/utils'

export default {
  name: 'SettingOpenAPI',
  setup() {
    const setPort = debounce(port => {
      updateSetting({ 'openAPI.port': port.trim() })
    }, 500)

    return {
      appSetting,
      updateSetting,
      openAPI,
      openUrl,
      setPort,
    }
  },
}
