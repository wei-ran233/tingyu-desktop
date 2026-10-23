import { defineComponent as _defineComponent } from 'vue'
import { watch } from '@common/utils/vueTools'
import useList from '@renderer/bundles/official/features/Leaderboard/MusicList/useList'


export default /* #__PURE__ */_defineComponent({
  __name: 'index',
  props: {
    source: { type: null, required: true },
    boardId: { type: String, required: false },
  },
  emits: ['show-menu'],
  setup(__props: any, { expose: __expose, emit: __emit }) {
    const props = __props

    const emit = __emit

    const {
      listRef,
      listDetailInfo,
      getList,
      handlePlayList,
    } = useList()

    watch(() => props.boardId, (boardId) => {
      if (!boardId) return
      getList(boardId, 1)
    }, {
      immediate: true,
    })


    const hideListsMenu = () => {
      emit('show-menu')
    }

    const togglePage = (page: number) => {
      getList(listDetailInfo.id, page)
    }

    const hideMenu = () => {
      listRef.value.handleMenuClick()
    }

    __expose({ hideMenu })


    const __returned__ = { props, emit, listRef, listDetailInfo, getList, handlePlayList, hideListsMenu, togglePage, hideMenu }

    return __returned__
  },

})
