export default {
  name: 'SongFilterModal',
  props: {
    show: {
      type: Boolean,
      default: false,
    },
    modelValue: {
      type: Array,
      default: () => [],
    },
    list: {
      type: Array,
      default: () => [],
    },
  },
  emits: ['update:show', 'confirm'],
  data() {
    return {
      selectedTags: [],
    }
  },
  computed: {
    categories() {
      const cats = []

      // 1. 歌手分类 (Dynamic Singers from current list)
      const singerMap = new Map()
      for (const item of this.list) {
        if (item.singer) {
          const names = item.singer.split(/\s*[/&,、;]\s*/).filter(Boolean)
          for (const name of names) {
            singerMap.set(name, (singerMap.get(name) || 0) + 1)
          }
        }
      }
      const topSingers = [...singerMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([name]) => name)

      if (topSingers.length) {
        cats.push({
          name: '歌手分类',
          tags: topSingers,
        })
      }

      // 2. 专辑分类 (Dynamic Albums from current list)
      const albumMap = new Map()
      for (const item of this.list) {
        const album = item.meta?.albumName
        if (album?.trim()) {
          albumMap.set(album.trim(), (albumMap.get(album.trim()) || 0) + 1)
        }
      }
      const topAlbums = [...albumMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([name]) => name)

      if (topAlbums.length) {
        cats.push({
          name: '专辑分类',
          tags: topAlbums,
        })
      }

      // 3. 音源平台 (Dynamic Sources from current list)
      const sourceMap = {
        kw: '酷我音乐',
        kg: '酷狗音乐',
        tx: 'QQ音乐',
        wy: '网易云音乐',
        mg: '咪咕音乐',
        local: '本地音乐',
      }
      const presentSources = new Set()
      for (const item of this.list) {
        if (item.source) presentSources.add(sourceMap[item.source] || item.source)
      }
      if (presentSources.size) {
        cats.push({
          name: '音源平台',
          tags: [...presentSources],
        })
      }

      // 4. 时长范围 (Duration)
      cats.push({
        name: '时长范围',
        tags: ['3分钟以下', '3 - 4分钟', '4 - 5分钟', '5分钟以上'],
      })

      return cats
    },
  },
  watch: {
    show(n) {
      if (n) {
        this.selectedTags = [...(this.modelValue || [])]
      }
    },
  },
  methods: {
    handleClose() {
      this.$emit('update:show', false)
    },
    toggleTag(tag) {
      const idx = this.selectedTags.indexOf(tag)
      if (idx > -1) {
        this.selectedTags.splice(idx, 1)
      } else {
        this.selectedTags.push(tag)
      }
    },
    handleReset() {
      this.selectedTags = []
    },
    handleConfirm() {
      this.$emit('confirm', [...this.selectedTags])
      this.handleClose()
    },
  },
}
