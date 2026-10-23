import { watch, shallowReactive, ref } from '@common/utils/vueTools'
import { getBoardsList, setBoard } from '@renderer/store/leaderboard/action'
import { boards } from '@renderer/store/leaderboard/state'
import useMenu from '@renderer/bundles/official/features/Leaderboard/BoardList/useMenu'
import { useRouter, useRoute } from '@common/utils/vueRouter'


export default {
  __name: 'index',
  props: {
    source: {
      type: String,
      required: true,
    },
    boardId: {
      type: [String, undefined],
      default: undefined,
    },
  },
  emits: ['show-menu'],
  setup(__props, { expose: __expose, emit: __emit }) {
    const props = __props

    const emit = __emit

    const router = useRouter()
    const route = useRoute()

    const list = shallowReactive([])
    const rightClickItemIndex = ref(-1)

    const handleToggleList = (id) => {
      void router.replace({
        path: route.path,
        query: {
          source: props.source,
          boardId: id,
        },
      })
    }

    const {
      menus,
      menuLocation,
      isShowMenu,
      showMenu,
      menuClick,
    } = useMenu({ emit, list })

    const handleRigthClick = (event, index) => {
      rightClickItemIndex.value = index
      showMenu(event, index)
    }
    const handleMenuClick = (action) => {
      if (rightClickItemIndex.value < 0) return
      let index = rightClickItemIndex.value
      rightClickItemIndex.value = -1
      menuClick(action, index, props.source)
    }


    watch(() => props.source, async(source) => {
      // const source = (await getLeaderboardSetting()).source as LX.OnlineSource
      let boardList = boards[source]
      if (boardList == null) setBoard(boardList = await getBoardsList(source), source)
      list.splice(0, list.length, ...boardList.list)
      if (!props.boardId && boardList.list.length) handleToggleList(boardList.list[0].id)
    }, {
      immediate: true,
    })

    __expose({ hideMenu: handleMenuClick })


    const __returned__ = { props, emit, router, route, list, rightClickItemIndex, handleToggleList, menus, menuLocation, isShowMenu, showMenu, menuClick, handleRigthClick, handleMenuClick, get watch() { return watch }, get shallowReactive() { return shallowReactive }, get ref() { return ref }, get getBoardsList() { return getBoardsList }, get setBoard() { return setBoard }, get boards() { return boards }, get useMenu() { return useMenu }, get useRouter() { return useRouter }, get useRoute() { return useRoute } }

    return __returned__
  },

}
