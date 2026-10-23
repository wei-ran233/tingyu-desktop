import { addTempPlayList, clearPlayedList, clearTempPlayeList, setPlayListId, setPlayMusicInfo } from '@renderer/store/player/action'
import { playList } from '@renderer/core/player'
import { LIST_IDS } from '@common/constants'
import { appSetting } from '@renderer/store/setting'
import { addListMusics, setListMusics } from '@renderer/store/list/action'
import { playMusicInfo, playInfo } from '@renderer/store/player/state'
import { handlePlay } from '@renderer/core/player/action'
import { toRaw } from '@common/utils/vueTools'

export default ({ selectedList, list, listAll, removeAllSelect }) => {
  const handlePlayMusic = (index) => {
    const targetMusic = list.value[index]?.metadata?.musicInfo
    if (!targetMusic) return

    const isSwitch = appSetting['player.isSwitchPlayListOnPlay']
    const isAddAll = appSetting['player.isAddAllToPlayDirectoryOnPlay']
    const isAutoClean = appSetting['player.isAutoCleanPlayedList']

    if (isAutoClean && playMusicInfo.listId === LIST_IDS.DOWNLOAD) {
      clearPlayedList()
    }

    if (isSwitch) {
      playList(LIST_IDS.DOWNLOAD, listAll.value.indexOf(list.value[index]))
    } else {
      const musicInfos = listAll.value.map(item => item.metadata?.musicInfo).filter(Boolean)
      if (isAddAll) {
        // Play immediately to prevent reaction delay
        const prevListId = playInfo.playerListId
        setPlayListId(LIST_IDS.DEFAULT)
        setPlayMusicInfo(LIST_IDS.DEFAULT, targetMusic)
        if (appSetting['player.isAutoCleanPlayedList'] || prevListId != LIST_IDS.DEFAULT) clearPlayedList()
        clearTempPlayeList()
        handlePlay()

        // Background sync list
        setListMusics(LIST_IDS.DEFAULT, musicInfos.map(toRaw)).catch((err) => { console.error('setListMusics error:', err) })
      } else {
        // Play immediately to prevent reaction delay
        const prevListId = playInfo.playerListId
        setPlayListId(LIST_IDS.DEFAULT)
        setPlayMusicInfo(LIST_IDS.DEFAULT, targetMusic)
        if (appSetting['player.isAutoCleanPlayedList'] || prevListId != LIST_IDS.DEFAULT) clearPlayedList()
        clearTempPlayeList()
        handlePlay()

        // Background sync list
        addListMusics(LIST_IDS.DEFAULT, [toRaw(targetMusic)]).catch((err) => { console.error('addListMusics error:', err) })
      }
    }
  }

  const handlePlayMusicLater = (index, single) => {
    if (selectedList.value.length && !single) {
      addTempPlayList(selectedList.value.map(s => ({ listId: LIST_IDS.DOWNLOAD, musicInfo: s })))
      removeAllSelect()
    } else {
      addTempPlayList([{ listId: LIST_IDS.DOWNLOAD, musicInfo: list.value[index] }])
    }
  }

  return {
    handlePlayMusic,
    handlePlayMusicLater,
  }
}
