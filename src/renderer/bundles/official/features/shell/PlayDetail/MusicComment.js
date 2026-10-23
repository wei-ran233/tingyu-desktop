import { toOldMusicInfo } from '@renderer/utils'
import music from '@renderer/utils/musicSdk'
import CommentFloor from '@renderer/components/layout/PlayDetail/components/MusicComment/CommentFloor.vue'

export default {
  name: 'MusicComment',
  components: {
    CommentFloor,
  },
  props: {
    show: Boolean,
    musicInfo: {
      type: Object,
      required: true,
    },
  },
  emits: ['close'],
  data() {
    return {
      available: false,
      requestGeneration: 0,
      newRequestId: 0,
      hotRequestId: 0,
      commentDisposed: false,
      currentMusicInfo: {
        name: '',
        singer: '',
      },
      tabActiveId: 'hot',
      newComment: {
        isLoading: false,
        isLoadError: false,
        page: 1,
        total: 0,
        maxPage: 1,
        nextPage: 1,
        limit: 20,
        list: [
        // {
        //   text: ['123123hhh'],
        //   userName: 'dsads',
        //   avatar: 'http://img4.kuwo.cn/star/userhead/39/52/1602393411654_512039239s.jpg',
        //   time: '2020-10-22 22:14:17',
        //   timeStr: '2020-10-22 22:14:17',
        //   likedCount: 100,
        //   reply: [],
        // },
        ],
      },
      hotComment: {
        isLoading: true,
        isLoadError: true,
        page: 1,
        total: 0,
        maxPage: 1,
        nextPage: 1,
        limit: 20,
        list: [
        // {
        //   text: ['123123hhh'],
        //   userName: 'dsads',
        //   avatar: 'http://img4.kuwo.cn/star/userhead/39/52/1602393411654_512039239s.jpg',
        //   time: '2020-10-22 22:14:17',
        //   timeStr: '2020-10-22 22:14:17',
        //   likedCount: 100,
        //   reply: [
        //     {
        //       text: ['123123hhh'],
        //       userName: 'dsads',
        //       avatar: 'http://img4.kuwo.cn/star/userhead/39/52/1602393411654_512039239s.jpg',
        //       time: '2020-10-22 22:14:17',
        //       timeStr: '2020-10-22 22:14:17',
        //       likedCount: 100,
        //     },
        //   ],
        // },
        ],
      },
    }
  },
  watch: {
    show: {
      immediate: true,
      handler(visible) {
        if (visible) void this.handleShowComment()
        else this.invalidateRequests()
      },
    },
    musicInfo(value) {
      if (!this.show) return
      const info = value && ('progress' in value ? value.metadata?.musicInfo : value)
      // Resolving artwork or playback metadata can replace the same song object.
      if (info?.id != null && info.id === this.currentMusicInfo.id && info.source === this.currentMusicInfo.source) {
        this.currentMusicInfo = info
        return
      }
      void this.handleShowComment()
    },
  },
  mounted() {
    this.setWidth()
    window.addEventListener('resize', this.setWidth)
  },
  beforeUnmount() {
    this.commentDisposed = true
    this.invalidateRequests()
    window.removeEventListener('resize', this.setWidth)
  },
  methods: {
    invalidateRequests() {
      this.requestGeneration++
      this.newRequestId++
      this.hotRequestId++
      this.newComment.isLoading = false
      this.hotComment.isLoading = false
    },
    isCurrentRequest(kind, generation, requestId) {
      return this.show && !this.commentDisposed && generation === this.requestGeneration && requestId === this[kind + 'RequestId']
    },
    setWidth() {
      void this.$nextTick(() => {
        const container = this.$refs.dom_container
        if (this.commentDisposed || !container?.parentNode) return
        container.style.width = Math.floor(container.parentNode.clientWidth * 0.5) + 'px'
        this.handleToggleTab(this.tabActiveId, true)
      })
    },
    async getComments(kind, musicInfo, page, limit, generation, retryNum = 0) {
      if (this.commentDisposed || !this.show || generation !== this.requestGeneration) throw new Error('取消请求')
      const method = kind === 'hot' ? 'getHotComment' : 'getComment'
      try {
        const response = await music[musicInfo.source].comment[method](toOldMusicInfo(musicInfo), page, limit)
        if (!Array.isArray(response?.comments) || !Number.isFinite(Number(response.total))) throw new Error('评论接口未返回有效列表')
        return response
      } catch (error) {
        if (error.message === '取消请求' || retryNum >= 2 || this.commentDisposed || !this.show || generation !== this.requestGeneration) throw error
        return this.getComments(kind, musicInfo, page, limit, generation, retryNum + 1)
      }
    },
    async loadComments(kind, musicInfo, page, limit) {
      if (!this.show || this.commentDisposed || !musicInfo?.source) return
      const generation = this.requestGeneration
      const requestId = ++this[kind + 'RequestId']
      const target = this[kind + 'Comment']
      target.isLoadError = false
      target.isLoading = true
      try {
        const response = await this.getComments(kind, musicInfo, page, limit, generation)
        if (!this.isCurrentRequest(kind, generation, requestId)) return
        Object.assign(target, { total: Number(response.total), maxPage: response.maxPage, page, list: response.comments })
        await this.$nextTick()
        if (this.isCurrentRequest(kind, generation, requestId)) this.$refs[kind === 'hot' ? 'dom_commentHot' : 'dom_commentNew']?.scrollTo(0, 0)
      } catch (error) {
        if (!this.isCurrentRequest(kind, generation, requestId) || error.message === '取消请求') return
        target.isLoadError = true
      } finally {
        if (this.isCurrentRequest(kind, generation, requestId)) target.isLoading = false
      }
    },
    async handleGetNewComment(musicInfo, page, limit) {
      return this.loadComments('new', musicInfo, page, limit)
    },
    async handleGetHotComment(musicInfo, page, limit) {
      return this.loadComments('hot', musicInfo, page, limit)
    },
    async handleShowComment() {
      this.invalidateRequests()
      const info = this.musicInfo && ('progress' in this.musicInfo ? this.musicInfo.metadata?.musicInfo : this.musicInfo)
      this.currentMusicInfo = info || { name: '', singer: '' }
      for (const target of [this.hotComment, this.newComment]) {
        Object.assign(target, { page: 1, total: 0, maxPage: 1, nextPage: 1, list: [], isLoading: false, isLoadError: false })
      }
      this.available = !!info?.source && info.source !== 'local' && !!music[info.source]?.comment
      if (!this.available || !this.show || this.commentDisposed) return
      return Promise.all([
        this.handleGetHotComment(info, 1, this.hotComment.limit),
        this.handleGetNewComment(info, 1, this.newComment.limit),
      ])
    },
    async handleToggleHotCommentPage(page) {
      this.hotComment.nextPage = page
      return this.handleGetHotComment(this.currentMusicInfo, page, this.hotComment.limit)
    },
    async handleToggleCommentPage(page) {
      this.newComment.nextPage = page
      return this.handleGetNewComment(this.currentMusicInfo, page, this.newComment.limit)
    },
    handleToggleTab(id, force) {
      if (!this.available || (!force && this.tabActiveId === id)) return
      const container = this.$refs.dom_tabMain
      if (container) container.scrollLeft = id === 'hot' ? 0 : container.clientWidth
      this.tabActiveId = id
    },
  },
}

