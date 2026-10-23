import { watch, shallowRef, ref, computed, onBeforeUnmount } from '@common/utils/vueTools'
import { historyList } from '@renderer/store/search/state'
import { getHistoryList, removeHistoryWord, clearHistoryList } from '@renderer/store/search/action'
import { getList } from '@renderer/store/hotSearch'
import { appSetting } from '@renderer/store/setting'
import { createLatestLoader } from '@renderer/core/latestLoader'
import { getSearchSuggestions, getSearchActions, executeSearchAction } from '@renderer/core/pluginExtensions'
import PluginUiSurface from '@renderer/components/plugin/PluginUiSurface.vue'
import { useRouter } from '@common/utils/vueRouter'


export default {
  __name: 'BlankView',
  components: { PluginUiSurface },
  props: {
    visible: Boolean,
    source: {
      type: String,
      required: true,
    },
  },
  setup(__props, { expose: __expose }) {
    __expose()

    const props = __props

    const hotSearchList = shallowRef([])
    const pluginSuggestions = shallowRef([])
    /** @type {import('vue').ShallowRef<import('@common/plugin/types').PluginActionInfo[]>} */
    const pluginActions = shallowRef([])
    const uiInput = computed(() => ({ source: props.source, suggestions: pluginSuggestions.value.slice(0, 12), actions: pluginActions.value.slice(0, 12).map(({ id, title }) => ({ id, title })) }))
    const uiAction = async(id) => {
      const action = pluginActions.value.find(action => action.id === id)
      if (action) await handleAction(action)
    }
    const actionBusy = ref(false)
    const actionError = ref('')
    let contextRevision = 0
    let destroyed = false
    let deferredReload = false
    const suggestionLoader = createLatestLoader(async source => {
      const [suggestions, actions] = await Promise.all([getSearchSuggestions(source), getSearchActions()])
      return { suggestions, actions }
    }, result => { pluginSuggestions.value = result.suggestions; pluginActions.value = result.actions }, error => { console.warn('[search] suggestions unavailable', error.message) })
    const reloadSuggestions = () => {
      if (actionBusy.value) { deferredReload = true; return }
      pluginSuggestions.value = []; pluginActions.value = []
      if (!props.visible) { suggestionLoader.cancel(); return }
      suggestionLoader.request(props.source)
    }
    const contextChanged = () => {
      contextRevision++; actionError.value = ''
      pluginSuggestions.value = []; pluginActions.value = []
      suggestionLoader.cancel()
      reloadSuggestions()
    }
    watch(() => [props.visible, props.source], contextChanged, { immediate: true })
    const settingsChanged = event => { if (event.detail.targets?.some(target => ['lx.official-suite/search.suggestions', 'lx.official-suite/search.suggestions.next'].includes(target))) contextChanged() }
    const handleAction = async action => {
      if (actionBusy.value || !props.visible || destroyed) return
      const revision = contextRevision
      actionBusy.value = true; actionError.value = ''
      suggestionLoader.cancel()
      try {
        const suggestions = await executeSearchAction(action.id, props.source)
        if (!destroyed && revision === contextRevision && props.visible) pluginSuggestions.value = suggestions
      } catch (error) {
        console.warn('[search] action failed', error.message)
        if (!destroyed && revision === contextRevision && props.visible) actionError.value = window.i18n.t('search__action_failed')
      } finally {
        if (!destroyed) {
          actionBusy.value = false
          if (deferredReload) { deferredReload = false; reloadSuggestions() }
        }
      }
    }
    window.addEventListener('lx:plugin-settings-changed', settingsChanged)
    window.addEventListener('lx:collection-catalog-changed', reloadSuggestions)
    onBeforeUnmount(() => { destroyed = true; contextRevision++; suggestionLoader.dispose(); window.removeEventListener('lx:plugin-settings-changed', settingsChanged); window.removeEventListener('lx:collection-catalog-changed', reloadSuggestions) })

    if (appSetting['search.isShowHotSearch']) {
      watch(() => props.visible, (visible) => {
        if (!visible) return
        void getList(props.source).then(list => {
          hotSearchList.value = list
        })
      }, {
        immediate: true,
      })

      watch(() => props.source, (source) => {
        if (!props.visible) return
        void getList(source).then(list => {
          if (source != props.source) return
          hotSearchList.value = list
        })
      })
    }

    if (appSetting['search.isShowHistorySearch']) {
      void getHistoryList()
    }

    const router = useRouter()
    const handleSearch = (text) => {
      void router.replace({
        path: '/search',
        query: {
          text,
        },
      })
    }


    const __returned__ = { props, uiInput, uiAction, hotSearchList, pluginSuggestions, pluginActions, actionBusy, actionError, handleAction, router, handleSearch, get watch() { return watch }, get shallowRef() { return shallowRef }, get historyList() { return historyList }, get getHistoryList() { return getHistoryList }, get removeHistoryWord() { return removeHistoryWord }, get clearHistoryList() { return clearHistoryList }, get getList() { return getList }, get appSetting() { return appSetting }, get useRouter() { return useRouter } }

    return __returned__
  },

}
