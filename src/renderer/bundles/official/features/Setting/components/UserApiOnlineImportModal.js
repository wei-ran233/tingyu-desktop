import { dialog } from '@renderer/plugins/Dialog'
import { httpFetch } from '@renderer/utils/request'

export default {
  props: {
    show: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:show', 'import'],
  data() {
    return {
      url: '',
      disabled: false,
      btnText: '',
    }
  },
  watch: {
    show(n) {
      if (n) {
        this.url = ''
        this.disabled = false
        this.btnText = this.$t('user_api_import_online__input_confirm')
      }
    },
  },
  methods: {
    handleClose() {
      this.$emit('update:show', false)
    },
    verify() {
      if (!/^https?:\/\//.test(this.url)) this.url = ''
      return this.url
    },
    async handleSubmit() {
      let url = this.verify()
      if (!url) return
      this.disabled = true
      this.btnText = this.$t('user_api_import_online__input_loading')
      let script
      try {
        script = await httpFetch(url, { follow_max: 3 }).promise.then(resp => resp.body)
      } catch (err) {
        void dialog(this.$t('user_api_import__failed', { message: err.message }))
        return
      } finally {
        this.disabled = false
        this.btnText = this.$t('user_api_import_online__input_confirm')
      }
      if (script.length > 9_000_000) {
        void dialog(this.$t('user_api_import__failed', {
          message: 'Too large script',
          confirm: this.$t('ok'),
        }))
        return
      }
      this.$emit('import', script)
      this.handleClose()
    },
  },
}
