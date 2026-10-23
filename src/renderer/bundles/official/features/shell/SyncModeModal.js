import { ref } from '@common/utils/vueTools'
import { sync } from '@renderer/store'
import { sendSyncAction } from '@renderer/utils/ipc'

export default {
  setup() {
    const isOverwrite = ref(false)
    const handleClose = () => {
      sync.isShowSyncMode = false
    }
    const handleSelectMode = (mode) => {
      if (sync.type == 'list') {
        if (mode.startsWith('overwrite') && isOverwrite.value) mode += '_full'
      }
      void sendSyncAction({ action: 'select_mode', data: { type: sync.type, mode } })
      handleClose()
    }
    return {
      sync,
      isOverwrite,
      handleClose,
      handleSelectMode,
    }
  },
}
