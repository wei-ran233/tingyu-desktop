import { ref, watch, computed, onBeforeUnmount } from '@common/utils/vueTools'
import { playMusicInfo, playInfo } from '@renderer/store/player/state'
import { getListMusics } from '@renderer/store/list/action'
import { downloadList } from '@renderer/store/download/state'
import { LIST_IDS } from '@common/constants'
import { appSetting } from '@renderer/store/setting'


export default ({ props, onLoadedList }) => {
  const rightClickSelectedIndex = ref(-1)
  const selectedIndex = ref(-1)
  const dom_listContent = ref(null)
  const listRef = ref(null)

  const excludeListIds = computed(() => ([props.listId]))


  const list = ref([])
  const fetchListMusics = async(id) => {
    let musics = await getListMusics(id)
    if (id === LIST_IDS.LOCAL || id === LIST_IDS.DOWNLOAD) {
      const downloaded = downloadList.map(item => item.metadata?.musicInfo).filter(Boolean)
      const existingIds = new Set(musics.map(m => m.id))
      for (const d of downloaded) {
        if (!existingIds.has(d.id)) {
          musics.push(d)
          existingIds.add(d.id)
        }
      }
    }
    return musics
  }

  watch(() => props.listId, id => {
    void fetchListMusics(id).then(l => {
      list.value = [...l]
      if (id != props.listId) return
      onLoadedList()
    })
  }, {
    immediate: true,
  })

  watch(() => downloadList.length, () => {
    if (props.listId === LIST_IDS.LOCAL || props.listId === LIST_IDS.DOWNLOAD) {
      void fetchListMusics(props.listId).then(l => {
        list.value = [...l]
      })
    }
  })

  const playerInfo = computed(() => ({
    isPlayList: playMusicInfo.listId == props.listId,
    playIndex: playInfo.playIndex,
    playMusicId: playMusicInfo.musicInfo?.id,
  }))

  const setSelectedIndex = index => {
    selectedIndex.value = index
  }

  const isShowSource = computed(() => appSetting['list.isShowSource'])

  const handleMyListUpdate = (ids) => {
    if (!ids.includes(props.listId)) return
    void fetchListMusics(props.listId).then(l => {
      list.value = [...l]
    })
  }

  window.app_event.on('myListUpdate', handleMyListUpdate)

  onBeforeUnmount(() => {
    window.app_event.off('myListUpdate', handleMyListUpdate)
  })

  return {
    rightClickSelectedIndex,
    selectedIndex,
    dom_listContent,
    listRef,
    list,
    playerInfo,
    setSelectedIndex,
    isShowSource,
    excludeListIds,
  }
}
