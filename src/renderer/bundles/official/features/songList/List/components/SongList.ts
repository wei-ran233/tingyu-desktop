import { defineComponent as _defineComponent } from 'vue'
import { ref } from '@common/utils/vueTools'
import type { ListInfoItem } from '@renderer/store/songList/state'
import { useRoute, useRouter } from '@common/utils/vueRouter'


export default /* #__PURE__ */_defineComponent({
  __name: 'SongList',
  props: {
    listInfo: { type: null, required: true },
    visibleSource: { type: Boolean, required: false, default: false },
  },
  emits: ['toggle-page'],
  setup(__props: any, { expose: __expose, emit: __emit }) {
    const props = __props

    const router = useRouter()
    const route = useRoute()

    const dom_list_ref = ref<HTMLElement | null>(null)

    const emit = __emit


    const togglePage = (page: number) => {
      emit('toggle-page', page)
    }

    const toDetail = (info: ListInfoItem) => {
      void router.push({
        path: '/songList/detail',
        query: {
          source: info.source,
          id: info.id,
          picUrl: info.img,
          fromName: route.name as string,
        },
      })
    }

    __expose({
      scrollTo(top: number) {
        dom_list_ref.value?.scrollTo({
          top,
          // behavior: 'smooth',
        })
      },
      getScrollTop() {
        return dom_list_ref.value?.scrollTop ?? 0
      },
    })


    const __returned__ = { props, router, route, dom_list_ref, emit, togglePage, toDetail }

    return __returned__
  },

})
