import { watch, nextTick } from '@common/utils/vueTools'
import { playMusicInfo } from '@renderer/store/player/state'
import { getListPrevSelectId } from '@renderer/utils/data'

import MyList from '@renderer/bundles/official/views/List/MyList/index.vue'
import MusicList from '@renderer/bundles/official/views/List/MusicList/index.vue'
import CollectionSurface from '@renderer/components/collection/CollectionSurface.vue'

export default {
  name: 'List',
  components: {
    MyList,
    MusicList,
    CollectionSurface,
  },
  async beforeRouteEnter(to, from, next) {
    let id = to.query.id
    if (!id) {
      id = await getListPrevSelectId()
      next({
        path: to.path,
        query: { id },
      })
    } else next()
  },
  beforeRouteUpdate(to, from) {
    if (to.query.updated) return
    let id = to.query.id
    if (id == null) return
    this.listId = id
    const scrollIndex = to.query.scrollIndex
    const isAnimation = from.query.id == to.query.id
    this.$refs.musicList?.handleRestoreScroll(scrollIndex, isAnimation)

    return {
      path: '/list',
      query: { id, updated: true },
    }
  },
  beforeRouteLeave(to, from) {
    this.$refs.musicList?.saveListPosition()
  },
  data() {
    return {
      listId: null,
    }
  },
  created() {
    this.listId = this.$route.query.id
  },
  mounted() {
    this.unwatchPlayListId = watch(
      () => playMusicInfo.listId,
      (newListId) => {
        if (newListId && newListId !== this.listId) {
          void nextTick(() => {
            if (newListId !== this.listId) {
              this.listId = newListId
              this.$router.replace({
                path: '/list',
                query: { id: newListId },
              }).catch(_ => _)
            }
          })
        }
      },
    )
  },
  beforeUnmount() {
    if (this.unwatchPlayListId) this.unwatchPlayListId()
  },
}
