import { watch, shallowReactive } from '@common/utils/vueTools'
import { sortList } from '@renderer/store/songList/state'
import { useRouter, useRoute } from '@common/utils/vueRouter'


export default {
  __name: 'SortTab',
  props: {
    source: {
      type: String,
      required: true,
    },
    tagId: {
      type: String,
      required: true,
    },
    sortId: {
      type: String,
      default: '',
    },
  },
  setup(__props, { expose: __expose }) {
    __expose()

    const props = __props

    const router = useRouter()
    const route = useRoute()

    const list = shallowReactive([])


    const handleToggle = (id) => {
      void router.replace({
        path: route.path,
        query: {
          source: props.source,
          tagId: props.tagId,
          sortId: id,
        },
      })
    }
    watch(() => props.source, async(source) => {
      // const source = (await getLeaderboardSetting()).source as LX.OnlineSource
      if (!source) return
      let _list = sortList[source] ?? []
      list.splice(0, list.length, ..._list)
      if (!props.sortId && list.length) handleToggle(list[0].id)
      // console.log(list)
    }, {
      immediate: true,
    })

    const __returned__ = { props, router, route, list, handleToggle, get watch() { return watch }, get shallowReactive() { return shallowReactive }, get sortList() { return sortList }, get useRouter() { return useRouter }, get useRoute() { return useRoute } }

    return __returned__
  },

}
