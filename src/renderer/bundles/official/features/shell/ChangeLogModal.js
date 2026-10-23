import SvgIcon from '@renderer/components/common/SvgIcon.vue'
import { compareVer } from '@common/utils'
import { openUrl, clipboardWriteText } from '@common/utils/electron'
import { versionInfo, isShowChangeLog } from '@renderer/store'
import { getLastStartInfo } from '@renderer/utils/ipc'
import { computed, ref } from '@common/utils/vueTools'

export default {
  components: { SvgIcon },
  setup() {
    const lastStartVersion = ref(null)
    void getLastStartInfo().then(version => {
      lastStartVersion.value = version
    })

    const info = computed(() => {
      let currentVer = process.versions.app
      let lastStartVer = lastStartVersion.value
      let info = {
        version: '',
        desc: '',
        history: [],
        isLatest: true,
      }
      if (!versionInfo.newVersion?.history) return info
      info.isLatest = compareVer(currentVer, versionInfo.newVersion.version) >= 0

      const history = [{ version: versionInfo.newVersion.version, desc: versionInfo.newVersion.desc }, ...versionInfo.newVersion.history]

      if (lastStartVer) {
        for (const ver of history) {
          switch (compareVer(ver.version, currentVer)) {
            case 0:
              info.version = ver.version
              info.desc = ver.desc
              break
            case -1:
              if (compareVer(lastStartVer, ver.version) < 0) info.history.push(ver)
          }
        }
      } else {
        const verInfo = history.find(v => v.version == currentVer)
        if (verInfo) {
          info.version = verInfo.version
          info.desc = verInfo.desc
        } else {
          info.desc = '未找到当前版本的更新日志'
          info.version = currentVer
        }
      }

      return info
    })
    return {
      openUrl,
      clipboardWriteText,
      versionInfo,
      info,
      isShowChangeLog,
    }
  },
}
