import { computed } from '@common/utils/vueTools'
import { sync } from '@renderer/store'
import { useI18n } from '@renderer/plugins/i18n'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { debounce } from '@common/utils/common'
import { SYNC_CODE } from '@common/constants_sync'

export default {
  name: 'SettingSyncClient',
  setup() {
    const t = useI18n()

    const clientStatus = computed(() => {
      let status
      switch (sync.client.status.message) {
        case SYNC_CODE.msgBlockedIp:
          status = t('setting__sync_code_blocked_ip')
          break
        case SYNC_CODE.authFailed:
          status = t('setting__sync_code_fail')
          break
        default:
          status = sync.client.status.message
            ? sync.client.status.message
            : sync.client.status.status
              ? t('setting_sync_status_enabled')
              : t('sync_status_disabled')
          break
      }
      return status
    })

    const setSyncClientHost = debounce(host => {
      updateSetting({ 'sync.client.host': host.trim() })
    }, 500)


    return {
      appSetting,
      sync,
      setSyncClientHost,
      clientStatus,
    }
  },
}
