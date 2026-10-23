import { computed } from '@common/utils/vueTools'
// import { getSystemFonts } from '@renderer/utils/tools'
import { showSelectDialog, openDirInExplorer } from '@renderer/utils/ipc'
import { useI18n } from '@renderer/plugins/i18n'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { dialog } from '@renderer/plugins/Dialog'

export default {
  name: 'SettingDownload',
  setup() {
    const t = useI18n()

    const handleChangeSavePath = () => {
      void showSelectDialog({
        title: t('setting__download_select_save_path'),
        defaultPath: appSetting['download.savePath'],
        properties: ['openDirectory'],
      }).then(result => {
        if (result.canceled) return
        updateSetting({ 'download.savePath': result.filePaths[0] })
      })
    }

    const maxNums = new Array(6).fill(null).map((_, i) => ({ id: i + 1 }))
    const handleUpdateMaxNum = async({ id }) => {
      if (id > 3) {
        if (!await dialog.confirm(window.i18n.t('setting__download_max_num_tip'))) return
      }
      updateSetting({ 'download.maxDownloadNum': id })
    }

    const musicNames = computed(() => {
      return [
        { value: '歌名 - 歌手', name: t('setting__download_name1') },
        { value: '歌手 - 歌名', name: t('setting__download_name2') },
        { value: '歌名', name: t('setting__download_name3') },
      ]
    })

    const lrcFormatList = computed(() => {
      return [
        { id: 'utf8', name: t('setting__download_lyric_format_utf8') },
        { id: 'gbk', name: t('setting__download_lyric_format_gbk') },
      ]
    })

    return {
      appSetting,
      updateSetting,
      openDirInExplorer,
      handleChangeSavePath,
      musicNames,
      lrcFormatList,
      maxNums,
      handleUpdateMaxNum,
    }
  },
}
