import { defineComponent as _defineComponent } from 'vue'
import { watch } from '@common/utils/vueTools'
import { searchText } from '@renderer/store/search/state'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import useList, { type SearchSource } from '@renderer/bundles/official/features/Search/MusicList/useList'



export default /* #__PURE__ */_defineComponent({
  __name: 'index',
  props: {
    sourceId: { type: null, required: true },
    page: { type: Number, required: true },
  },
  setup(__props: any, { expose: __expose }) {
    __expose()

    const props = __props
    const router = useRouter()
    const route = useRoute()

    const {
      listRef,
      listInfo,
      search,
      handlePlayList,
    } = useList()

    watch(() => [props.sourceId, props.page], ([sourceId, page]) => {
      setTimeout(() => {
        search(searchText.value, sourceId as SearchSource, page as number || 1)
      })
    })
    watch(searchText, (searchText) => {
      setTimeout(() => {
        search(searchText, props.sourceId, props.page)
      })
    }, {
      immediate: true,
    })

    const handleTogglePage = (page: number) => {
      void router.replace({
        path: route.path,
        query: {
          ...route.query,
          page,
        },
      })
    }


    const __returned__ = { props, router, route, listRef, listInfo, search, handlePlayList, handleTogglePage }

    return __returned__
  },

})
