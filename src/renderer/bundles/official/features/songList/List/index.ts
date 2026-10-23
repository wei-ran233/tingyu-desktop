import { computed, ref } from '@common/utils/vueTools'
import { getSongListSetting, setSongListSetting } from '@renderer/utils/data'
import TagList from '@renderer/bundles/official/views/songList/List/components/TagList.vue'
import SortTab from '@renderer/bundles/official/views/songList/List/components/SortTab.vue'
import OpenListModal from '@renderer/bundles/official/views/songList/List/components/OpenListModal.vue'
import ListView from '@renderer/bundles/official/views/songList/List/ListView.vue'
import { sources, listInfo, isVisibleListDetail } from '@renderer/store/songList/state'
import { sourceNames } from '@renderer/store'
import { useRoute, useRouter } from '@common/utils/vueRouter'

const source = ref<LX.OnlineSource>('kw')
const tagId = ref<string>('')
const sortId = ref<string>('')
const page = ref<number>(1)


interface Query {
  source?: string
  tagId?: string
  sortId?: string
  page?: string
}

const verifyQueryParams = async function(this: any, to: { query: Query, path: string }, from: any, next: (route?: { path: string, query: Query }) => void) {
  let _source = to.query.source
  let _tagId = to.query.tagId
  let _sortId = to.query.sortId
  let _page: string | undefined = to.query.page

  if (isVisibleListDetail.value) {
    next({ path: '/songList/detail', query: {} })
    return
  } else if (_source == null) {
    if (listInfo.key) {
      _source = listInfo.source
      _tagId = listInfo.tagId
      _sortId = listInfo.sortId
      _page = listInfo.page.toString()
    } else {
      const setting = await getSongListSetting()
      _source = setting.source
      _tagId = setting.tagId
      _sortId = setting.sortId
      _page = '1'
    }

    next({
      path: to.path,
      query: { ...to.query, source: _source, tagId: _tagId, sortId: _sortId, page: _page },
    })
    return
  }
  next()
  source.value = _source as LX.OnlineSource
  tagId.value = _tagId ?? ''
  sortId.value = _sortId ?? ''
  page.value = _page ? parseInt(_page) : 1
  void setSongListSetting({ source: _source, tagId: _tagId, sortId: _sortId })
}


export default {
  components: {
    TagList,
    SortTab,
    ListView,
    OpenListModal,
  },
  beforeRouteEnter: verifyQueryParams,
  beforeRouteUpdate: verifyQueryParams,
  setup() {
    const visibleOpenSongListModal = ref(false)

    const sourceList = computed(() => {
      return sources.map(s => ({ id: s, name: sourceNames.value[s] }))
    })
    const router = useRouter()
    const route = useRoute()
    const handleToggleSource = (id: LX.OnlineSource) => {
      if (id == source.value) return
      void router.replace({
        path: route.path,
        query: {
          source: id,
          tagId: '',
        },
      })
    }

    return {
      source,
      tagId,
      sortId,
      page,
      sourceList,
      handleToggleSource,
      visibleOpenSongListModal,
    }
  },
}
