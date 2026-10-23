import { checkUpdate, quitApp } from '@renderer/utils/ipc'
import { openUrl } from '@common/utils/electron'
import { isShowPact } from '@renderer/store'
import { appSetting, saveAgreePact } from '@renderer/store/setting'
import { computed } from '@common/utils/vueTools'

export default {
  setup() {
    const isAgreePact = computed(() => appSetting['common.isAgreePact'])

    return {
      isShowPact,
      isAgreePact,
      appSetting,
    }
  },
  data() {
    return {
      time: 20,
    }
  },
  computed: {
    btnEnable() {
      return this.time == 0
    },
    timeStr() {
      return this.btnEnable ? '' : `(${this.time})`
    },
  },
  watch: {
    isAgreePact(n) {
      if (n) return
      this.time = 5
      this.startTimeout()
    },
  },
  mounted() {
    this.$nextTick(() => {
      if (!this.isAgreePact) {
        this.startTimeout()
      }
    })
  },
  methods: {
    handleClick() {
      saveAgreePact(true)
      window.setTimeout(() => {
        this.$dialog({
          message: Buffer.from('e69cace8bdafe4bbb6e5ae8ce585a8e5858de8b4b9e4b894e5bc80e6ba90efbc8ce5a682e69e9ce4bda0e698afe88ab1e992b1e8b4ade4b9b0e79a84efbc8ce8afb7e79bb4e68ea5e7bb99e5b7aee8af84efbc810a0a5468697320736f667477617265206973206672656520616e64206f70656e20736f757263652e', 'hex').toString(),
          confirmButtonText: Buffer.from('e5a5bde79a8420284f4b29', 'hex').toString(),
        }).then(() => {
          checkUpdate()
        })
      }, 2e3)
    },
    handleClose(isExit) {
      if (isExit) {
        quitApp(true)
        return
      }
      isShowPact.value = false
    },
    openUrl(url) {
      void openUrl(url)
    },
    startTimeout() {
      window.setTimeout(() => {
        if (--this.time > 0) this.startTimeout()
      }, 1e3)
    },
  },
}
