import { debounce } from '@common/utils'
import { clipboardReadText } from '@common/utils/electron'
import { toRaw } from '@common/utils/vueTools'

export default {
  props: {
    placeholder: {
      type: String,
      default: 'Search for something...',
    },
    list: {
      type: Array,
      default() {
        return []
      },
    },
    visible: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['action'],
  data() {
    return {
      text: '',
      selectIndex: -1,
      listStyle: {
        height: 0,
        maxHeight: 0,
        overflow: 'hidden',
      },
      maxHeight: 0,
      resultList: [],
      isModDown: false,
      isShow: false,
    }
  },
  watch: {
    resultList(n) {
      if (this.selectIndex > -1) this.selectIndex = -1
      this.$nextTick(() => {
        const height = this.$refs.dom_list.scrollHeight
        if (height > this.maxHeight) {
          this.listStyle.height = this.maxHeight + 'px'
          this.listStyle.overflow = 'auto'
        } else {
          this.listStyle.height = height + 'px'
          this.listStyle.overflow = 'hidden'
        }
      })
    },
    list(n) {
      if (!this.visible) return
      this.handleDelaySearch()
    },
    visible(n) {
      if (!n) return
      this.isShow = true
      this.init()
    },
  },
  created() {
    this.handleDelaySearch = debounce(() => {
      this.handleSearch()
    })
    if (this.visible) this.isShow = true
  },
  mounted() {
    this.init()
    // window.key_event.on('key_mod_down', this.handle_key_mod_down)
    // window.key_event.on('key_mod_up', this.handle_key_mod_up)
    window.key_event.on('key_mod+f_down', this.handle_key_mod_f_down)
  },
  beforeUnmount() {
    // window.key_event.off('key_mod_down', this.handle_key_mod_down)
    // window.key_event.off('key_mod_up', this.handle_key_mod_up)
    window.key_event.off('key_mod+f_down', this.handle_key_mod_f_down)
  },
  methods: {
    init() {
      if (!this.visible) return
      this.handleSearch()
      this.$nextTick(() => {
        if (!this.listStyle.maxHeight) {
          this.maxHeight = this.$refs.dom_container.offsetParent.clientHeight - this.$refs.dom_list.offsetTop - 70
          this.listStyle.maxHeight = this.maxHeight + 'px'
        }
        this.$refs.dom_input.focus()
      })
    },
    handleKeyEsc() {
      if (this.text.length > 0) {
        this.text = ''
        this.resultList = []
      } else {
        this.handleHide()
      }
    },
    handle_key_mod_down() {
      console.log('handle_key_mod_down')
      this.isModDown ||= true
    },
    handle_key_mod_up() {
      this.isModDown &&= false
    },
    handle_key_mod_f_down() {
      if (this.visible) this.$refs.dom_input.focus()
    },
    handleAnimated() {
      if (this.visible) return
      this.isShow = false
    },
    handleTemplistClick(index) {
      if (index < 0) return
      const id = this.resultList[index].id
      this.sendEvent('listClick', {
        index: this.list.findIndex(m => m.id == id),
        isPlay: this.isModDown,
      })
    },
    handleHide() {
      this.sendEvent('hide')
    },
    sendEvent(action, data) {
      this.$emit('action', {
        action,
        data,
      })
    },
    handleKeyDown() {
      if (this.resultList.length) {
        this.selectIndex = this.selectIndex + 1 < this.resultList.length ? this.selectIndex + 1 : 0
        this.handleScrollList()
      } else if (this.selectIndex > -1) {
        this.selectIndex = -1
      }
    },
    handleKeyUp() {
      if (this.resultList.length) {
        this.selectIndex = this.selectIndex - 1 < -1 ? this.resultList.length - 1 : this.selectIndex - 1
        this.handleScrollList()
      } else if (this.selectIndex > -1) {
        this.selectIndex = -1
      }
    },
    handleScrollList() {
      if (this.selectIndex < 0) return
      let dom = this.$refs.dom_list.children[this.selectIndex]
      let offsetTop = dom.offsetTop
      let scrollTop = this.$refs.dom_scrollContainer.scrollTop
      let top
      if (offsetTop < scrollTop) {
        top = offsetTop
      } else if (offsetTop + dom.clientHeight > this.$refs.dom_scrollContainer.clientHeight + scrollTop) {
        top = offsetTop + dom.clientHeight - this.$refs.dom_scrollContainer.clientHeight
      } else return
      this.$refs.dom_scrollContainer.scrollTo(0, top)
    },
    handleContextMenu() {
      let str = clipboardReadText()
      str = str.trim()
      str = str.replace(/\t|\r\n|\n|\r/g, ' ')
      str = str.replace(/\s+/g, ' ')
      let dom_input = this.$refs.dom_input
      const text = dom_input.value
      // if (dom_input.selectionStart == dom_input.selectionEnd) {
      const value = text.substring(0, dom_input.selectionStart) + str + text.substring(dom_input.selectionEnd, text.length)
      // event.target.value = value
      this.text = value
      // } else {
      //   clipboardWriteText(text.substring(dom_input.selectionStart, dom_input.selectionEnd))
      // }
    },
    async handleSearch() {
      if (!this.text.length) return this.resultList = []
      this.resultList = await window.lx.worker.main.searchListMusic(toRaw(this.list), this.text)
    },
  },
}
