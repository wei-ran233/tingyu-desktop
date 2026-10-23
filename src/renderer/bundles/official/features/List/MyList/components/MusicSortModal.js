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
    selectedNum: {
      type: Number,
      default: 0,
    },
  },
  emits: ['update:show', 'confirm'],
  data() {
    return {
      sortNum: '',
    }
  },
  watch: {
    show(n) {
      if (n) {
        this.sortNum = ''
      }
    },
  },
  methods: {
    handleClose() {
      this.$emit('update:show', false)
    },
    verify() {
      let num = /^[1-9]\d*/.exec(this.sortNum)
      num = num ? parseInt(num[0]) : ''
      this.sortNum = num.toString()
      return num
    },
    handleSubmit() {
      let num = this.verify()
      if (this.sortNum == '') return
      this.handleClose()
      this.$emit('confirm', num)
    },
  },
}
