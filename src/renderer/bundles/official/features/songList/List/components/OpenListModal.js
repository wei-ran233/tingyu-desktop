import { openSongListInputInfo } from '@renderer/store/songList/state'
import { setOpenSongListInputInfo } from '@renderer/store/songList/action'
import { ref, watch } from '@common/utils/vueTools'
import { useRoute, useRouter } from '@common/utils/vueRouter'
import { openUrl } from '@common/utils/electron'


export default {
  __name: 'OpenListModal',
  props: {
    modelValue: Boolean,
    sourceList: {
      type: Array,
      required: true,
    },
  },
  emits: ['update:model-value'],
  setup(__props, { expose: __expose, emit: __emit }) {
    __expose()

    const props = __props

    const emit = __emit

    const router = useRouter()
    const route = useRoute()
    const text = ref('')
    const source = ref('')

    watch(() => props.modelValue, (visible) => {
      if (!visible) return
      source.value = openSongListInputInfo.source || route.query.source
      // text.value = openSongListInputInfo.text
    })

    const handleSubmit = () => {
      if (!text.value.length) return
      setOpenSongListInputInfo(text.value, source.value)
      void router.push({
        path: '/songList/detail',
        query: {
          source: source.value,
          id: text.value,
          refresh: 'true',
        },
      })
    }


    const __returned__ = { props, emit, router, route, text, source, handleSubmit, get openSongListInputInfo() { return openSongListInputInfo }, get setOpenSongListInputInfo() { return setOpenSongListInputInfo }, get ref() { return ref }, get watch() { return watch }, get useRoute() { return useRoute }, get useRouter() { return useRouter }, get openUrl() { return openUrl } }

    return __returned__
  },

}
