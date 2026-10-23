import { defineComponent as _defineComponent } from 'vue'
import { watch } from '@common/utils/vueTools'
import { searchText } from '@renderer/store/search/state'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import useList, { type SearchSource } from '@renderer/bundles/official/features/Search/SongListList/useList'
import SongList from '@renderer/bundles/official/views/songList/List/components/SongList.vue'



export default /* #__PURE__ */_defineComponent({
  components: { SongList },
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

    const togglePage = (page: number) => {
      void router.replace({
        path: route.path,
        query: {
          ...route.query,
          page,
        },
      })
      // search(searchText.value, props.sourceId, page)
    }


    const __returned__ = { props, router, route, listRef, listInfo, search, togglePage, SongList }

    return __returned__
  },

})
