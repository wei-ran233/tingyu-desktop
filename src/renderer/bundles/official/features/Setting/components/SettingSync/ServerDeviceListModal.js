import { watch, ref } from '@common/utils/vueTools'
import { sync } from '@renderer/store'
import { getSyncServerDevices, removeSyncServerDevice } from '@renderer/utils/ipc'
import { dateFormat } from '@common/utils/common'

export default {
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:modelValue'],
  setup(props) {
    const historyDeviceList = ref([])

    const getList = () => {
      void getSyncServerDevices().then((list) => {
        historyDeviceList.value = list.map(d => {
          return {
            id: d.clientId,
            name: d.deviceName,
            lastConnectDate: d.lastConnectDate ? dateFormat(d.lastConnectDate) : '-',
            isMobile: d.isMobile,
          }
        })
      })
    }

    watch(() => sync.server.status.devices.length, () => {
      if (!props.modelValue) return
      getList()
    })
    watch(() => props.modelValue, (val) => {
      if (!val) return
      getList()
    })

    const handleRemove = (index) => {
      void removeSyncServerDevice(historyDeviceList.value[index].id).then(getList)
    }

    return {
      historyDeviceList,
      handleRemove,
    }
  },
}
