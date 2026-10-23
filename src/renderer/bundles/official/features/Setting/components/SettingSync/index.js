// import { computed } from '@common/utils/vueTools'
import { sync } from '@renderer/store'
import { openUrl } from '@common/utils/electron'
import { appSetting, updateSetting } from '@renderer/store/setting'
import SyncServer from '@renderer/bundles/official/views/Setting/components/SettingSync/SyncServer.vue'
import SyncClient from '@renderer/bundles/official/views/Setting/components/SettingSync/SyncClient.vue'

export default {
  name: 'SettingSync',
  components: {
    SyncServer,
    SyncClient,
  },
  setup() {
    return {
      appSetting,
      updateSetting,
      sync,
      openUrl,
    }
  },
}
