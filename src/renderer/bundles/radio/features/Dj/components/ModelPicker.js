import { ref, computed, watch, onUnmounted } from '@common/utils/vueTools'
import DjIcon from '@renderer/components/common/SvgIcon.vue'
import { getProviderModels, fetchProviderModels } from '@renderer/bundles/radio/utils/ai/modelsManager'

export default {
  name: 'ModelPicker',
  components: { DjIcon },
  props: { settings: { type: Object, required: true }, modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(props) {
    const query = ref('')
    const entries = ref([])
    const loading = ref(false)
    const statusText = ref('')
    const normalizedValue = computed(() => props.modelValue.replace(/^opencode-go\//, ''))
    const filteredModels = computed(() => entries.value.filter(model => `${model.id} ${model.name}`.toLowerCase().includes(query.value.trim().toLowerCase())))
    let controller = null
    let refreshTimer = null
    let sequence = 0

    const refresh = async() => {
      const request = ++sequence
      controller?.abort()
      controller = new AbortController()
      const active = controller
      const timeout = setTimeout(() => { active.abort() }, 12000)
      loading.value = true
      statusText.value = '正在读取服务端模型列表…'
      try {
        const list = await fetchProviderModels({ ...props.settings }, active.signal)
        if (request !== sequence) return
        entries.value = list
        statusText.value = `在线列表 · ${list.length} 个模型 · 已更新`
      } catch (error) {
        if (request !== sequence) return
        statusText.value = active.signal.aborted ? '读取超时，可重试；仍可使用内置目录' : `${error.message}；保留已有模型列表`
      } finally {
        clearTimeout(timeout)
        if (request === sequence) loading.value = false
      }
    }

    watch(() => [props.settings.selectedModel, props.settings.baseUrl, props.settings.apiKey], () => {
      sequence++
      controller?.abort()
      if (refreshTimer) clearTimeout(refreshTimer)
      query.value = ''
      entries.value = getProviderModels(props.settings.selectedModel)
      loading.value = false
      statusText.value = `内置目录 · ${entries.value.length} 个模型`
      if (props.settings.selectedModel === 'opencode-go' && props.settings.apiKey.trim()) refreshTimer = setTimeout(() => { void refresh() }, 600)
    }, { immediate: true })

    onUnmounted(() => {
      sequence++
      controller?.abort()
      if (refreshTimer) clearTimeout(refreshTimer)
    })
    const protocolLabel = api => ({ 'openai-completions': 'Chat', 'openai-responses': 'Responses', 'anthropic-messages': 'Messages', 'google-generative-ai': 'Gemini' }[api] ?? '自定义')
    return { query, loading, statusText, normalizedValue, filteredModels, refresh, protocolLabel }
  },
}
