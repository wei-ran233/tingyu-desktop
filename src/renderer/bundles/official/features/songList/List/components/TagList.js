import { watch, shallowReactive, ref, onMounted, onBeforeUnmount, computed, reactive } from '@common/utils/vueTools'
import { setTags, getTags } from '@renderer/store/songList/action'
import { tags } from '@renderer/store/songList/state'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import { useI18n } from '@renderer/plugins/i18n'


export default {
  __name: 'TagList',
  props: {
    source: {
      type: String,
      required: true,
    },
    tagId: {
      type: String,
      required: true,
    },
    sortId: {
      type: [String, undefined],
      default: undefined,
    },
  },
  setup(__props, { expose: __expose }) {
    __expose()

    const props = __props

    const router = useRouter()
    const route = useRoute()
    const t = useI18n()

    const list = shallowReactive([])
    const handleToggleTag = (id) => {
      void router.replace({
        path: route.path,
        query: {
          source: props.source,
          tagId: id,
          sortId: props.sortId,
        },
      })
      handleHide()
    }
    watch(() => props.source, async(source) => {
      if (!source) return
      // const source = (await getLeaderboardSetting()).source as LX.OnlineSource
      let tagInfo = tags[source]
      // console.log(await getTags(source))
      if (tagInfo == null) setTags(tagInfo = await getTags(source), source)

      list.splice(0, list.length, ...[{ name: window.i18n.t('songlist__tag_info_hot_tag'), list: [...tagInfo.hotTag] }, ...tagInfo.tags])
    }, {
      immediate: true,
    })
    const tagName = computed(() => {
      if (!props.tagId) return t('default')
      for (const tags of list) {
        const tag = tags.list.find(t => t.id == props.tagId)
        if (tag) return tag.name
      }
      return props.tagId
    })

    const popupStyle = reactive({
      width: '645px',
      maxHeight: '250px',
    })

    const setTagPopupWidth = () => {
      window.setTimeout(() => {
        const dom_view = document.getElementById('view')
        popupStyle.width = dom_view.clientWidth * 0.96 + 'px'
        popupStyle.maxHeight = dom_view.clientHeight * 0.65 + 'px'
      }, 50)
    }

    const dom_btn = ref(null)
    const popupVisible = ref(false)
    const handleShow = () => popupVisible.value = !popupVisible.value
    const handleHide = (evt) => {
      // if (e && e.target.parentNode != this.$refs.dom_popup && this.show) return this.show = false
      // console.log(this.$refs)
      if (evt && (evt.target == dom_btn.value || dom_btn.value?.contains(evt.target))) return
      popupVisible.value = false
    }


    onMounted(() => {
      setTagPopupWidth()
      document.addEventListener('click', handleHide)
      window.addEventListener('resize', setTagPopupWidth)
    })

    onBeforeUnmount(() => {
      document.removeEventListener('click', handleHide)
      window.removeEventListener('resize', setTagPopupWidth)
    })


    const __returned__ = { props, router, route, t, list, handleToggleTag, tagName, popupStyle, setTagPopupWidth, dom_btn, popupVisible, handleShow, handleHide, get watch() { return watch }, get shallowReactive() { return shallowReactive }, get ref() { return ref }, get onMounted() { return onMounted }, get onBeforeUnmount() { return onBeforeUnmount }, get computed() { return computed }, get reactive() { return reactive }, get setTags() { return setTags }, get getTags() { return getTags }, get tags() { return tags }, get useRouter() { return useRouter }, get useRoute() { return useRoute }, get useI18n() { return useI18n } }

    return __returned__
  },

}
