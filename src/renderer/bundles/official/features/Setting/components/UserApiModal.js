import { importUserApi, removeUserApi, showSelectDialog, setAllowShowUserApiUpdateAlert } from '@renderer/utils/ipc'
import { readFile } from '@common/utils/nodejs'
import { openUrl } from '@common/utils/electron'
import apiSourceInfo from '@renderer/utils/musicSdk/api-source-info'
import { userApi } from '@renderer/store'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { computed, ref } from '@common/utils/vueTools'
import { dialog } from '@renderer/plugins/Dialog'

import UserApiOnlineImportModal from '@renderer/bundles/official/views/Setting/components/UserApiOnlineImportModal.vue'

export default {
  components: {
    UserApiOnlineImportModal,
  },
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:modelValue'],
  setup() {
    const isShowOnlineImportModal = ref(false)
    const apiList = computed(() => userApi.list)

    return {
      userApi,
      apiList,
      appSetting,
      isShowOnlineImportModal,
    }
  },
  methods: {
    async importUserApi(script) {
      return importUserApi(script).then(({ apiList }) => {
        userApi.list = apiList
      }).catch((err) => {
        void dialog(this.$t('user_api_import__failed', { message: err.message }))
      })
    },
    handleImport() {
      if (this.userApi.list.length > 20) {
        this.$dialog({
          message: this.$t('user_api__max_tip'),
          confirmButtonText: this.$t('ok'),
        })
        return
      }
      void showSelectDialog({
        title: this.$t('user_api__import_file'),
        properties: ['openFile'],
        filters: [
          { name: 'LX API File', extensions: ['js'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      }).then(async result => {
        if (result.canceled) return
        return readFile(result.filePaths[0]).then(async data => {
          return this.importUserApi(data.toString())
        })
      })
    },
    handleExport() {

    },
    async handleRemove(index) {
      const api = this.apiList[index]
      if (!api) return
      if (appSetting['common.apiSource'] == api.id) {
        let backApi = apiSourceInfo.find(api => !api.disabled)
        if (!backApi) backApi = userApi.list[0]
        updateSetting({ 'common.apiSource': backApi?.id ?? '' })
      }
      userApi.list = await removeUserApi([api.id])
    },
    handleClose() {
      this.$emit('update:modelValue', false)
    },
    handleOpenUrl(url) {
      void openUrl(url)
    },
    handleChangeAllowUpdateAlert(api, enable) {
      void setAllowShowUserApiUpdateAlert(api.id, enable)
    },
  },
}
