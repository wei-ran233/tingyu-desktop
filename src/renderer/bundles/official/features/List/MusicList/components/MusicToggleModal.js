import { LIST_IDS } from '@common/constants'
import { openUrl } from '@common/utils/electron'
import { playNext } from '@renderer/core/player'
import { getSourceI18nPrefix } from '@renderer/store'
import { addTempPlayList } from '@renderer/store/player/action'
import { playMusicInfo } from '@renderer/store/player/state'
import { toNewMusicInfo, toOldMusicInfo } from '@renderer/utils'
import musicSdk from '@renderer/utils/musicSdk'
import { markRaw } from 'vue'

export default {
  props: {
    show: {
      type: Boolean,
      default: false,
    },
    musicInfo: {
      type: Object,
      default() {
        return {}
      },
    },
  },
  emits: ['update:show', 'toggle'],
  data() {
    return {
      tabs: [],
      lists: {},
      source: '',
      isError: false,
      loading: false,
      searchKey: 0,
      toggleMusicInfo: null,
    }
  },
  computed: {
    list() {
      return this.lists[this.source] ?? []
    },
    noItemLabel() {
      return this.loading ? this.$t('list__loading') : this.isError ? this.$t('list__load_failed') : this.$t('no_item')
    },
  },
  watch: {
    show(n) {
      if (n) {
        this.isError = false
        this.toggleMusicInfo = null
        const musicInfo = this.musicInfo
        this.tabs = []
        this.lists = {}
        this.loading = true
        const searchKey = this.searchKey = Math.random()
        void musicSdk.searchMusic({
          name: musicInfo.name,
          singer: musicInfo.singer,
          source: '',
          albumName: musicInfo.meta.albumName,
          interval: musicInfo.interval ?? '',
        }).then((lists) => {
          if (this.searchKey != searchKey) return
          const prefix = getSourceI18nPrefix()
          this.tabs = lists.map(item => {
            return {
              id: item.source,
              label: window.i18n.t(prefix + item.source),
            }
          })
          if (lists.length) this.source = lists[0].source
          for (const s of lists) this.lists[s.source] = s.list.map(s => markRaw(toNewMusicInfo(s)))
        }).catch(() => {
          if (this.searchKey != searchKey) return
          this.isError = true
        }).finally(() => {
          if (this.searchKey != searchKey) return
          this.loading = false
        })
      }
    },
  },
  methods: {
    handleClose() {
      this.$emit('update:show', false)
    },
    handleConfirm() {
      this.$emit('toggle', this.toggleMusicInfo)
    },
    openDetail(minfo) {
      const url = musicSdk[minfo.source]?.getMusicDetailPageUrl(toOldMusicInfo(minfo))
      if (!url) return
      void openUrl(url)
    },
    handlePlay(musicInfo) {
      this.toggleMusicInfo = musicInfo
      const isPlaying = !!playMusicInfo.musicInfo
      addTempPlayList([{ listId: LIST_IDS.PLAY_LATER, musicInfo, isTop: true }])
      if (isPlaying) void playNext()
    },
  },
}
