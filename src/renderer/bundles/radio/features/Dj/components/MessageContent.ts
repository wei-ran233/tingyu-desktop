import { defineComponent as _defineComponent } from 'vue'
import { computed } from '@common/utils/vueTools'
import { renderMarkdown, safeLink } from '@renderer/bundles/radio/utils/markdown'
import { openUrl } from '@common/utils/electron'

export default /* #__PURE__ */_defineComponent({
  __name: 'MessageContent',
  props: {
    text: { type: String, required: true },
  },
  setup(__props: any, { expose: __expose }) {
    __expose()

    const props = __props
    const html = computed(() => renderMarkdown(props.text))
    const openLink = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest('a')
      if (!link) return
      event.preventDefault()
      const url = safeLink(link.getAttribute('href') ?? '')
      if (url) void openUrl(url)
    }

    const __returned__ = { props, html, openLink }

    return __returned__
  },

})
