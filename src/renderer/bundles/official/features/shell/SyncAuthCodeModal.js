import { ref } from '@common/utils/vueTools'
import { sync } from '@renderer/store'
import { appSetting } from '@renderer/store/setting'
import { sendSyncAction } from '@renderer/utils/ipc'

export default {
  setup() {
    const authCode = ref('')
    const handleClose = () => {
      sync.isShowAuthCodeModal = false
    }
    const verify = () => {
      if (authCode.value.length > 100) authCode.value = authCode.value.substring(0, 100)
      return authCode.value
    }
    const handleSubmit = () => {
      let code = verify()
      if (code == '') return
      authCode.value = ''
      handleClose()
      sendSyncAction({
        action: 'enable_client',
        data: {
          enable: appSetting['sync.enable'],
          host: appSetting['sync.client.host'],
          authCode: code,
        },
      }).catch(err => {
        console.log(err)
      })
    }
    return {
      sync,
      authCode,
      handleClose,
      verify,
      handleSubmit,
    }
  },
}
