import { computed, ref } from '@common/utils/vueTools'
import { getLeaderboardSetting, setLeaderboardSetting } from '@renderer/utils/data'
import BoardList from '@renderer/bundles/official/views/Leaderboard/BoardList/index.vue'
import MusicList from '@renderer/bundles/official/views/Leaderboard/MusicList/index.vue'
import CollectionSurface from '@renderer/components/collection/CollectionSurface.vue'
import { sources } from '@renderer/store/leaderboard/state'
import { sourceNames } from '@renderer/store'
import { useRoute, useRouter } from '@common/utils/vueRouter'


const source = ref('')
const boardId = ref(null)

const verifyQueryParams = async function(to, from, next) {
  let _source = to.query.source
  let _boardId = to.query.boardId

  if (_source == null) {
    const setting = await getLeaderboardSetting()
    if (_source == null) {
      _source = setting.source
      _boardId = setting.boardId
    }
    next({
      path: to.path,
      query: { ...to.query, source: _source, boardId: _boardId },
    })
    return
  }
  next()
  source.value = _source
  boardId.value = _boardId
  void setLeaderboardSetting({ source: _source, boardId: _boardId })
}


export default {
  components: {
    BoardList,
    MusicList,
    CollectionSurface,
  },
  beforeRouteEnter: verifyQueryParams,
  beforeRouteUpdate: verifyQueryParams,
  setup() {
    const musicListRef = ref(null)
    const boardListRef = ref(null)
    const sourceList = computed(() => {
      return sources.map(s => ({ id: s, name: sourceNames.value[s] }))
    })
    const router = useRouter()
    const route = useRoute()
    const handleToggleSource = (id) => {
      void router.replace({
        path: route.path,
        query: {
          source: id,
        },
      })
    }

    return {
      source,
      boardId,
      sourceList,
      handleToggleSource,
      musicListRef,
      boardListRef,
    }
  },
}
