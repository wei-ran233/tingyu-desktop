import { ref, watch } from '@common/utils/vueTools'
import { listDetailInfo } from '@renderer/store/songList/state'
import { setVisibleListDetail } from '@renderer/store/songList/action'
import { useRouter } from '@common/utils/vueRouter'
import { addSongListDetail, playSongListDetail } from '@renderer/bundles/official/features/songList/Detail/action'
import useList from '@renderer/bundles/official/features/songList/Detail/useList'
import useKeyBack from '@renderer/bundles/official/features/songList/Detail/useKeyBack'
import CollectionSurface from '@renderer/components/collection/CollectionSurface.vue'


const source = ref<LX.OnlineSource>('kw')
const id = ref<string>('')
const page = ref<number>(1)
const picUrl = ref<string>('')
const refresh = ref<boolean>(false)


interface Query {
  source?: string
  id?: string
  page?: string
  picUrl?: string
  refresh?: 'true'
  fromName?: string
}

const verifyQueryParams = async function(this: any, to: { query: Query, path: string }, from: any, next: (route?: { path: string, query: Query }) => void) {
  let _source = to.query.source
  let _id = to.query.id
  let _page: string | undefined = to.query.page
  let _picUrl: string | undefined = to.query.picUrl
  let _refresh: 'true' | undefined = to.query.refresh

  if (_source == null || _id == null) {
    if (listDetailInfo.key) {
      _source = listDetailInfo.source
      _id = listDetailInfo.id
      _page = listDetailInfo.page.toString()
      _picUrl = listDetailInfo.info.img
    } else {
      setVisibleListDetail(false)
      next({ path: '/songList/list', query: {} })
      return
    }

    next({
      path: to.path,
      query: { ...to.query, source: _source, id: _id, page: _page, picUrl: _picUrl, refresh: _refresh },
    })
    return
  }
  next()
  setVisibleListDetail(true)
  source.value = _source as LX.OnlineSource
  id.value = _id
  page.value = _page ? parseInt(_page) : 1
  picUrl.value = _picUrl ?? ''
  refresh.value = _refresh ? _refresh == 'true' : false
  if (to.query.fromName) window.lx.songListInfo.fromName = to.query.fromName
}


export default {
  components: { CollectionSurface },
  beforeRouteEnter: verifyQueryParams,
  beforeRouteUpdate: verifyQueryParams,
  setup() {
    const pluginActive = ref(false)
    const router = useRouter()

    const {
      listRef,
      listDetailInfo,
      getListData,
      handlePlayList,
    } = useList()


    const togglePage = (page: number) => {
      void getListData(source.value, id.value, page, refresh.value)
    }

    const handleBack = () => {
      setVisibleListDetail(false)
      if (window.lx.songListInfo.fromName) void router.replace({ name: window.lx.songListInfo.fromName })
      else router.back()
    }

    useKeyBack(handleBack)

    watch([source, id, page, refresh], async([_source, _id, _page, _refresh]) => {
      if (!_source || !_id) return router.replace({ path: '/songList/list' })
      // console.log(_source, _id, _page, _refresh, picUrl.value)
      // source.value = _source
      // id.value = _id
      // refresh.value = _refresh
      // page.value = _page ?? 1
      void getListData(_source, _id, _page, _refresh)
    }, {
      immediate: true,
    })

    return {
      pluginActive,
      source,
      id,
      page,
      picUrl,
      listDetailInfo,
      listRef,
      togglePage,
      addSongListDetail,
      playSongListDetail,
      handlePlayList,
      handleBack,
    }
  },
}
