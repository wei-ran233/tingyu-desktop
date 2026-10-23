import { computed, ref } from '@common/utils/vueTools'
import { sync } from '@renderer/store'
import { sendSyncAction } from '@renderer/utils/ipc'
import { useI18n } from '@renderer/plugins/i18n'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { debounce } from '@common/utils/common'
import ServerDeviceListModal from '@renderer/bundles/official/views/Setting/components/SettingSync/ServerDeviceListModal.vue'

export default {
  name: 'SettingSyncServer',
  components: {
    ServerDeviceListModal,
  },
  setup() {
    const t = useI18n()
    const isShowDeviceListModal = ref(false)

    const syncEnableServerTitle = computed(() => {
      let title = t('setting__sync_server_mode')
      if (sync.server.status.message) {
        title += ` [${sync.server.status.message}]`
      }
      // else if (this.sync.server.status.address.length) {
      //   // title += ` [${this.sync.server.status.address.join(', ')}]`
      // }
      return title
    })

    const syncDevices = computed(() => {
      return sync.server.status.devices.length
        ? sync.server.status.devices.map(d => `${d.deviceName} (${d.clientId.substring(0, 5)})`).join(', ')
        : ''
    })

    const refreshSyncCode = () => {
      void sendSyncAction({ action: 'generate_code' })
    }

    const setSyncServerPort = debounce(port => {
      updateSetting({ 'sync.server.port': port.trim() })
    }, 500)

    return {
      appSetting,
      sync,
      syncEnableServerTitle,
      setSyncServerPort,
      syncDevices,
      refreshSyncCode,
      isShowDeviceListModal,
    }
  },
}
