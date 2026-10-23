import { ref, computed, reactive } from '@common/utils/vueTools'
import { LIST_IDS } from '@common/constants'
import { loveList, localList, tempList, userLists } from '@renderer/store/list/state'
import { getListMeta } from '@renderer/store/list/listMeta'
import { addListMusics, createUserList } from '@renderer/store/list/action'
import { clipboardWriteText } from '@common/utils/electron'
import { assertApiSupport } from '@renderer/store/utils'
import { dialog } from '@renderer/plugins/Dialog'
import SearchList from '@renderer/bundles/official/views/List/MusicList/components/SearchList.vue'
import MusicSortModal from '@renderer/bundles/official/views/List/MusicList/components/MusicSortModal.vue'
import MusicToggleModal from '@renderer/bundles/official/views/List/MusicList/components/MusicToggleModal.vue'
import ListMetaEditModal from '@renderer/bundles/official/views/List/MyList/components/ListMetaEditModal.vue'
import SongFilterModal from '@renderer/bundles/official/views/List/MusicList/components/SongFilterModal.vue'
import useListInfo from '@renderer/bundles/official/features/List/MusicList/useListInfo'
import useList from '@renderer/bundles/official/features/List/MusicList/useList'
import useMenu from '@renderer/bundles/official/features/List/MusicList/useMenu'
import usePlay from '@renderer/bundles/official/features/List/MusicList/usePlay'
import useMusicDownload from '@renderer/bundles/official/features/List/MusicList/useMusicDownload'
import useMusicAdd from '@renderer/bundles/official/features/List/MusicList/useMusicAdd'
import useSort from '@renderer/bundles/official/features/List/MusicList/useSort'
import useMusicActions from '@renderer/bundles/official/features/List/MusicList/useMusicActions'
import useSearch from '@renderer/bundles/official/features/List/MusicList/useSearch'
import useListScroll from '@renderer/bundles/official/features/List/MusicList/useListScroll'
import useMusicToggle from '@renderer/bundles/official/features/List/MusicList/useMusicToggle'
import { appSetting } from '@renderer/store/setting'

export default {
  name: 'MusicList',
  components: {
    SearchList,
    MusicSortModal,
    MusicToggleModal,
    ListMetaEditModal,
    SongFilterModal,
  },
  props: {
    listId: {
      type: String,
      required: true,
    },
  },
  emits: ['show-menu'],
  setup(props, { emit }) {
    const actionButtonsVisible = computed(() => appSetting['list.actionButtonsVisible'])

    let scrollIndex = null
    let isAnimation = false
    const handleRestoreScroll = (_scrollIndex, _isAnimation) => {
      scrollIndex = _scrollIndex
      isAnimation = _isAnimation
      if (isAnimation) void restoreScroll(scrollIndex, isAnimation)
    }
    const onLoadedList = () => {
      void restoreScroll(scrollIndex, isAnimation)
    }

    const {
      rightClickSelectedIndex,
      selectedIndex,
      dom_listContent,
      listRef,
      list,
      playerInfo,
      setSelectedIndex,
      isShowSource,
      excludeListIds,
    } = useListInfo({ props, onLoadedList })

    // Interactive Search, Filter & Column Sorting State
    const searchKeyword = ref('')
    const sortType = ref('default') // 'default' | 'name' | 'singer' | 'album' | 'interval'
    const sortOrder = ref('asc') // 'asc' | 'desc'
    const isBatchMode = ref(false)

    const isShowSongFilterModal = ref(false)
    const activeFilterTags = ref([])

    const isShowSortMenu = ref(false)
    const sortMenuLocation = reactive({ x: 0, y: 0 })

    const displayList = computed(() => {
      let result = [...list.value]

      // Filter by Active Filter Tags (歌曲筛选)
      if (activeFilterTags.value.length) {
        result = result.filter(item => {
          return activeFilterTags.value.every(tag => {
            const t = tag.toLowerCase()

            // Source mapping check
            const sourceMap = {
              kw: '酷我音乐',
              kg: '酷狗音乐',
              tx: 'QQ音乐',
              wy: '网易云音乐',
              mg: '咪咕音乐',
              local: '本地音乐',
            }
            const sourceName = sourceMap[item.source] || item.source || ''

            // Duration check
            let durationSeconds = 0
            if (item.interval) {
              const parts = item.interval.split(':').map(Number)
              if (parts.length === 2) durationSeconds = parts[0] * 60 + parts[1]
              else if (parts.length === 3) durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2]
            }

            if (tag === '3分钟以下') return durationSeconds > 0 && durationSeconds < 180
            if (tag === '3 - 4分钟') return durationSeconds >= 180 && durationSeconds <= 240
            if (tag === '4 - 5分钟') return durationSeconds > 240 && durationSeconds <= 300
            if (tag === '5分钟以上') return durationSeconds > 300

            // Singer / Album / Source / Name check
            return item.name?.toLowerCase().includes(t) ||
                   item.singer?.toLowerCase().includes(t) ||
                   item.meta?.albumName?.toLowerCase().includes(t) ||
                   sourceName.toLowerCase().includes(t)
          })
        })
      }

      // Live Search Box Filter
      const kw = searchKeyword.value.trim().toLowerCase()
      if (kw) {
        result = result.filter(item => {
          return item.name?.toLowerCase().includes(kw) ||
                 item.singer?.toLowerCase().includes(kw) ||
                 item.meta?.albumName?.toLowerCase().includes(kw)
        })
      }

      // Sort
      if (sortType.value !== 'default') {
        result.sort((a, b) => {
          let comp = 0
          if (sortType.value === 'name') {
            comp = (a.name || '').localeCompare(b.name || '', 'zh-CN')
          } else if (sortType.value === 'singer') {
            comp = (a.singer || '').localeCompare(b.singer || '', 'zh-CN')
          } else if (sortType.value === 'album') {
            comp = (a.meta?.albumName || '').localeCompare(b.meta?.albumName || '', 'zh-CN')
          } else if (sortType.value === 'interval') {
            comp = (a.interval || '').localeCompare(b.interval || '')
          }
          return sortOrder.value === 'asc' ? comp : -comp
        })
      }

      return result
    })

    const {
      selectedList,
      listItemHeight,
      handleSelectData,
      removeAllSelect,
    } = useList({ listRef, list: displayList })

    const {
      handlePlayMusic,
      handlePlayAll,
      handlePlayMusicLater,
    } = usePlay({ props, selectedList, list: displayList, removeAllSelect })

    const {
      isShowListAdd,
      isMove,
      isShowListAddMultiple,
      isMoveMultiple,
      selectedAddMusicInfo,
      handleShowMusicAddModal,
      handleShowMusicMoveModal,
    } = useMusicAdd({ selectedList, list: displayList })

    const {
      isShowDownload,
      isShowDownloadMultiple,
      selectedDownloadMusicInfo,
      handleShowDownloadModal,
    } = useMusicDownload({ selectedList, list: displayList })

    const {
      isShowMusicSortModal,
      selectedNum,
      selectedSortMusicInfo,
      handleShowSortModal,
      sortMusic,
    } = useSort({ props, list: displayList, selectedList, removeAllSelect })

    const {
      handleShowMusicToggleModal,
      isShowMusicToggleModal,
      selectedToggleMusicInfo,
      toggleSource,
    } = useMusicToggle(props, displayList)

    const {
      handleSearch,
      handleOpenMusicDetail,
      handleCopyName,
      handleDislikeMusic,
      handleRemoveMusic,
    } = useMusicActions({ props, list: displayList, removeAllSelect, selectedList })

    const {
      menus,
      menuLocation,
      isShowItemMenu,
      showMenu,
      menuClick,
    } = useMenu({
      assertApiSupport,
      emit,
      handleShowDownloadModal,
      handlePlayMusic,
      handlePlayMusicLater,
      handleShowMusicToggleModal,
      handleSearch,
      handleShowMusicAddModal,
      handleShowMusicMoveModal,
      handleShowSortModal,
      handleOpenMusicDetail,
      handleCopyName,
      handleDislikeMusic,
      handleRemoveMusic,
    })

    const {
      isShowSearchBar,
      searchList,
      handleMusicSearchAction,
    } = useSearch({
      setSelectedIndex,
      handlePlayMusic,
      listRef,
    })

    const { saveListPosition, restoreScroll } = useListScroll({ props, listRef, list: displayList, handleRestoreScroll })

    // Column Sorting Handlers
    const handleColumnSort = (type) => {
      if (sortType.value === type) {
        if (sortOrder.value === 'asc') {
          sortOrder.value = 'desc'
        } else {
          sortType.value = 'default'
          sortOrder.value = 'asc'
        }
      } else {
        sortType.value = type
        sortOrder.value = 'asc'
      }
    }

    const sortMenus = computed(() => [
      { name: '默认排序' + (sortType.value === 'default' ? ' ✓' : ''), action: 'default' },
      { name: '标题升序 (A-Z)' + (sortType.value === 'name' && sortOrder.value === 'asc' ? ' ✓' : ''), action: 'name_asc' },
      { name: '标题降序 (Z-A)' + (sortType.value === 'name' && sortOrder.value === 'desc' ? ' ✓' : ''), action: 'name_desc' },
      { name: '歌手升序 (A-Z)' + (sortType.value === 'singer' && sortOrder.value === 'asc' ? ' ✓' : ''), action: 'singer_asc' },
      { name: '歌手降序 (Z-A)' + (sortType.value === 'singer' && sortOrder.value === 'desc' ? ' ✓' : ''), action: 'singer_desc' },
      { name: '专辑升序 (A-Z)' + (sortType.value === 'album' && sortOrder.value === 'asc' ? ' ✓' : ''), action: 'album_asc' },
      { name: '专辑降序 (Z-A)' + (sortType.value === 'album' && sortOrder.value === 'desc' ? ' ✓' : ''), action: 'album_desc' },
      { name: '时长升序 (短-长)' + (sortType.value === 'interval' && sortOrder.value === 'asc' ? ' ✓' : ''), action: 'interval_asc' },
      { name: '时长降序 (长-短)' + (sortType.value === 'interval' && sortOrder.value === 'desc' ? ' ✓' : ''), action: 'interval_desc' },
    ])

    const handleSortMenuClick = (menu) => {
      if (!menu) return
      if (menu.action === 'default') {
        sortType.value = 'default'
        sortOrder.value = 'asc'
      } else {
        const [type, order] = menu.action.split('_')
        sortType.value = type
        sortOrder.value = order
      }
    }

    // Filter Confirm & Create List Handlers
    const handleFilterConfirm = (tags) => {
      activeFilterTags.value = tags
    }

    const handleCreateListFromFilter = () => {
      if (displayList.value.length) {
        const name = `${activeFilterTags.value.join('·')} 筛选歌单`
        void createUserList({
          name,
          list: displayList.value,
        })
        void dialog(`已成功以筛选歌曲创建新歌单：“${name}”`)
      }
    }

    // Batch Selection Mode Logic
    const enterBatchMode = () => {
      isBatchMode.value = true
    }

    const exitBatchMode = () => {
      isBatchMode.value = false
      removeAllSelect()
    }

    const isAllSelected = computed(() => {
      if (!displayList.value.length) return false
      return displayList.value.every(item => selectedList.value.includes(item))
    })

    const toggleSelectAll = () => {
      if (isAllSelected.value) {
        removeAllSelect()
      } else {
        selectedList.value.splice(0, selectedList.value.length, ...displayList.value)
      }
    }

    const isSelected = (item) => {
      return selectedList.value.includes(item)
    }

    const isLovedSong = (item) => {
      const list = loveList?.list || []
      return list.some(s => (item.id && s.id === item.id) || (s.name === item.name && s.singer === item.singer))
    }

    const toggleLoveSong = (item) => {
      if (!isLovedSong(item)) {
        void addListMusics(LIST_IDS.LOVE, [item])
      }
    }

    const toggleSelectItem = (item) => {
      const index = selectedList.value.indexOf(item)
      if (index > -1) {
        selectedList.value.splice(index, 1)
      } else {
        selectedList.value.push(item)
      }
    }

    const handlePlaySelected = () => {
      if (selectedList.value.length) {
        void addListMusics(LIST_IDS.DEFAULT, selectedList.value)
        const first = selectedList.value[0]
        const idx = displayList.value.indexOf(first)
        if (idx > -1) handlePlayMusic(idx)
      }
    }

    const handleBatchAddToPlaylist = () => {
      if (selectedList.value.length) {
        void addListMusics(LIST_IDS.DEFAULT, selectedList.value)
        void dialog(`已成功将 ${selectedList.value.length} 首歌曲添加到播放列表`)
      }
    }

    const handleBatchCollect = () => {
      if (selectedList.value.length) {
        isMoveMultiple.value = false
        isShowListAddMultiple.value = true
      }
    }

    const handleBatchDelete = () => {
      if (selectedList.value.length) {
        void handleRemoveMusic(selectedList.value)
      }
    }

    const handleBatchDownload = () => {
      if (selectedList.value.length) {
        isShowDownloadMultiple.value = true
      } else if (displayList.value.length) {
        handleSelectData('all')
        isShowDownloadMultiple.value = true
      }
    }

    const handleListItemClick = (event, index) => {
      if (rightClickSelectedIndex.value > -1) return
      handleSelectData(index)
    }
    const handleListItemRightClick = (event, index) => {
      rightClickSelectedIndex.value = index
      showMenu(event, displayList.value[index], props.listId)
    }
    const handleMenuClick = (action) => {
      let index = rightClickSelectedIndex.value
      rightClickSelectedIndex.value = -1
      menuClick(action, index)
    }
    const handleListRightClick = (event) => {
      if (!event.target.classList.contains('select')) return
      event.stopImmediatePropagation()
      let classList = dom_listContent.value.classList
      classList.add('copying')
      window.requestAnimationFrame(() => {
        let str = window.getSelection().toString()
        classList.remove('copying')
        str = str.split(/\n\n/).map(s => s.replace(/\n/g, '  ')).join('\n').trim()
        if (!str.length) return
        clipboardWriteText(str)
      })
    }
    const handleListBtnClick = ({ action, index }) => {
      switch (action) {
        case 'download':
          handleShowDownloadModal(index, true)
          break
        case 'play':
          handlePlayMusic(index, true)
          break
        case 'search':
          handleSearch(index)
          break
        case 'listAdd':
          handleShowMusicAddModal(index, true)
          break
      }
    }
    const scrollToTop = () => {
      listRef.value.scrollTo(0, true)
    }

    const currentListName = computed(() => {
      const id = props.listId
      if (!id || id === LIST_IDS.DEFAULT) return '当前目录'
      if (id === LIST_IDS.LOVE) return loveList.name.startsWith('list__') ? window.i18n.t(loveList.name) : loveList.name
      if (id === LIST_IDS.LOCAL) return localList.name.startsWith('list__') ? window.i18n.t(localList.name) : localList.name
      if (id === LIST_IDS.DOWNLOAD) return window.i18n.t('download')
      if (id === LIST_IDS.TEMP) return tempList.name
      const targetUserList = userLists.find(l => l.id === id)
      if (targetUserList) return targetUserList.name
      return '当前目录'
    })

    const isShowMetaModal = ref(false)

    const currentListMeta = computed(() => {
      if (props.listId === LIST_IDS.DEFAULT) {
        return {
          subtitle: '当前播放列表与队列',
          tags: ['播放队列'],
        }
      }
      return getListMeta(props.listId)
    })

    const headerCover = computed(() => {
      const meta = currentListMeta.value
      if (meta?.customPic) return meta.customPic
      if (list.value.length) {
        for (const item of list.value) {
          if (item.meta?.picUrl) return item.meta.picUrl
          // @ts-expect-error fallback
          if (item.pic) return item.pic
          // @ts-expect-error fallback
          if (item.img) return item.img
        }
      }
      return ''
    })

    return {
      props,
      LIST_IDS,
      currentListName,
      currentListMeta,
      headerCover,
      isShowMetaModal,
      handlePlayAll,
      handlePlayMusic,
      handleBatchDownload,
      listItemHeight,
      handleListItemClick,
      selectedList,
      handleListItemRightClick,
      removeAllSelect,
      handleListBtnClick,
      rightClickSelectedIndex,
      selectedIndex,
      dom_listContent,
      listRef,
      excludeListIds,

      menus,
      isShowItemMenu,
      menuLocation,
      handleMenuClick,

      handleListRightClick,
      assertApiSupport,

      isShowListAdd,
      isMove,
      isShowListAddMultiple,
      isMoveMultiple,
      selectedAddMusicInfo,

      isShowMusicSortModal,
      selectedNum,
      selectedSortMusicInfo,
      sortMusic,

      isShowDownload,
      isShowDownloadMultiple,
      selectedDownloadMusicInfo,

      scrollToTop,

      isShowSearchBar,
      searchList,
      handleMusicSearchAction,

      list,
      displayList,
      playerInfo,

      saveListPosition,
      isShowSource,
      handleRestoreScroll,

      actionButtonsVisible,

      isShowMusicToggleModal,
      selectedToggleMusicInfo,
      toggleSource,

      searchKeyword,
      sortType,
      sortOrder,
      handleColumnSort,

      isBatchMode,
      enterBatchMode,
      exitBatchMode,
      isAllSelected,
      toggleSelectAll,
      isSelected,
      isLovedSong,
      toggleLoveSong,
      toggleSelectItem,
      handlePlaySelected,
      handleBatchAddToPlaylist,
      handleBatchCollect,
      handleBatchDelete,

      isShowSortMenu,
      sortMenuLocation,
      sortMenus,
      handleSortMenuClick,

      isShowSongFilterModal,
      activeFilterTags,
      handleFilterConfirm,
      handleCreateListFromFilter,
    }
  },
}
