import { defineComponent as _defineComponent } from 'vue'
import { watch, ref, nextTick } from '@common/utils/vueTools'
import { listInfo } from '@renderer/store/songList/state'
import { getAndSetList } from '@renderer/store/songList/action'
import { useRouter, useRoute, onBeforeRouteLeave } from '@common/utils/vueRouter'
import SongList from '@renderer/bundles/official/views/songList/List/components/SongList.vue'


export default /* #__PURE__ */_defineComponent({
  components: { SongList },
  __name: 'ListView',
  props: {
    source: { type: null, required: true },
    tagId: { type: String, required: true },
    sortId: { type: String, required: false },
    page: { type: Number, required: true },
  },
  setup(__props: any, { expose: __expose }) {
    __expose()

    const props = __props


    const list_ref = ref<any>(null)

    const router = useRouter()
    const route = useRoute()

    const getListData = async(source: LX.OnlineSource, tabId: string, sortId: string, page: number) => {
      // console.log(source, tabId, sortId, page)
      await getAndSetList(source, tabId, sortId, page).then(() => {
        if (listInfo.key == window.lx.songListInfo.songlistKey && window.lx.songListInfo.songlistPosition) {
          void nextTick(() => {
            list_ref.value?.scrollTo(window.lx.songListInfo.songlistPosition)
          })
        } else if (list_ref.value) {
          window.lx.songListInfo.songlistKey = null
          void nextTick(() => {
            list_ref.value.scrollTo(0)
          })
        }
      })
    }

    const togglePage = (page: number) => {
      void router.replace({
        path: route.path,
        query: {
          ...route.query,
          sortId: props.sortId ?? '',
          page,
        },
      })
      // getListData(props.source, props.tagId, props.sortId ?? '', page)
    }

    watch(() => [props.source, props.tagId, props.sortId, props.page], ([source, tagId, sortId, page]) => {
      // const source = (await getLeaderboardSetting()).source as LX.OnlineSource
      // console.log(source, tagId, sortId)
      if (!source || !sortId) return
      // console.log(source, tagId, sortId, page)
      void getListData(source as LX.OnlineSource, tagId as string, sortId as string, page as number)
    }, {
      immediate: true,
    })

    onBeforeRouteLeave(() => {
      window.lx.songListInfo.songlistKey = listInfo.key
      if (list_ref.value) window.lx.songListInfo.songlistPosition = list_ref.value.getScrollTop()
    })


    const __returned__ = { props, list_ref, router, route, getListData, togglePage, get listInfo() { return listInfo }, SongList }

    return __returned__
  },

})
