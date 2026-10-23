import SvgIcon from '@renderer/components/common/SvgIcon.vue'
import { compareVer, sizeFormate } from '@common/utils'
import { openUrl, clipboardWriteText } from '@common/utils/electron'
import { dialog } from '@renderer/plugins/Dialog'
import { versionInfo } from '@renderer/store'
import { getIgnoreVersion, saveIgnoreVersion, quitUpdate, downloadUpdate, checkUpdate } from '@renderer/utils/ipc'

export default {
  components: { SvgIcon },
  setup() {
    return {
      versionInfo,
    }
  },
  data() {
    return {
      ignoreVersion: null,
      disabledIgnoreFailBtn: true,
    }
  },
  computed: {
    history() {
      if (!this.versionInfo.newVersion?.history) return []
      let arr = []
      let currentVer = this.versionInfo.version
      this.versionInfo.newVersion?.history.forEach(ver => {
        if (compareVer(currentVer, ver.version) < 0) arr.push(ver)
      })

      return arr
    },
    progress() {
      return this.versionInfo.status == 'downloading'
        ? this.versionInfo.downloadProgress
          ? `${this.versionInfo.downloadProgress.percent.toFixed(2)}% - ${sizeFormate(this.versionInfo.downloadProgress.transferred)}/${sizeFormate(this.versionInfo.downloadProgress.total)} - ${sizeFormate(this.versionInfo.downloadProgress.bytesPerSecond)}/s`
          : '处理更新中...'
        : ''
    },
    isIgnored() {
      return this.ignoreVersion == this.versionInfo.newVersion?.version
    },
  },
  created() {
    void getIgnoreVersion().then(version => {
      this.ignoreVersion = version
    })
    this.disabledIgnoreFailBtn = Date.now() - parseInt(localStorage.getItem('update__check_failed_tip') ?? '0') < 7 * 86400000
  },
  methods: {
    handleClose() {
      versionInfo.showModal = false
    },
    handleOpenUrl(url) {
      void openUrl(url)
    },
    handleRestartClick(event) {
      this.handleClose()
      event.target.disabled = true
      quitUpdate()
    },
    handleCopy(text) {
      clipboardWriteText(text)
    },
    async handleIgnoreClick() {
      if (this.isIgnored) {
        saveIgnoreVersion(this.ignoreVersion = null)
        return
      }

      if (this.history.length >= 2) {
        if (await dialog.confirm({
          message: window.i18n.t('update__ignore_tip', { num: this.history.length + 1 }),
          cancelButtonText: window.i18n.t('update__ignore_cancel'),
          confirmButtonText: window.i18n.t('update__ignore_confirm'),
        })) {
          setTimeout(() => {
            void dialog({
              message: window.i18n.t('update__ignore_confirm_tip'),
              confirmButtonText: window.i18n.t('update__ignore_confirm_tip_confirm'),
            })
          }, 500)
          return
        }
      }
      saveIgnoreVersion(this.ignoreVersion = this.versionInfo.newVersion?.version)
      // saveIgnoreVersion(this.versionInfo.newVersion?.version)
      // this.handleClose()
    },
    handleDownloadClick() {
      if (this.isIgnored) saveIgnoreVersion(this.ignoreVersion = null)
      versionInfo.status = 'downloading'
      downloadUpdate()
    },
    handleCheckUpdate() {
      if (this.isIgnored) saveIgnoreVersion(this.ignoreVersion = null)
      versionInfo.status = 'checking'
      versionInfo.reCheck = true
      checkUpdate()
    },
    handleIgnoreFailTipClick() {
      localStorage.setItem('update__check_failed_tip', Date.now().toString())
      this.disabledIgnoreFailBtn = true
    },
  },
}
