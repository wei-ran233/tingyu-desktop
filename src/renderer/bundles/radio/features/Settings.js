import { RADIO_BUNDLE } from '@common/bundles'
import SettingsForm from '@renderer/components/settings/SettingsForm.vue'
import ModelPicker from '@renderer/bundles/radio/views/Dj/components/ModelPicker.vue'
import DjIcon from '@renderer/components/common/SvgIcon.vue'
import { completeModelText, isLocalModel } from '@renderer/bundles/radio/utils/ai/modelsManager'
import { ref, reactive, computed, watch, onUnmounted } from '@common/utils/vueTools'
import { djSettings, saveDjSettings, credentialStorage, getDjBackupData, applyDjBackupData } from '@renderer/bundles/radio/store'
import { sanitizeVoiceList } from '@common/dj/voiceCatalog'
import { djRequest } from '@renderer/bundles/radio/utils/serviceBridge'
import { VOLCENGINE_VOICES } from '@common/dj/voices'
import { synthesizeSpeech } from '@renderer/bundles/radio/utils/ttsService'
import { searchCities, fetchCurrentWeather } from '@renderer/bundles/radio/utils/weatherService'
import { getModelPresets } from '@renderer/bundles/radio/utils/llmService'
import { detectAllLocalEngines } from '@renderer/bundles/radio/utils/ai/localDiscovery'
import { showSelectDialog, openSaveDir } from '@renderer/utils/ipc'
import { dialog } from '@renderer/plugins/Dialog'

const defaultDjPrompts = {
  djPromptRole: '你是一名拥有丰富音乐知识与极客精神的专业电台音乐 DJ。你的声音性感优雅，性格热情幽默且充满都市感。你不仅精通各种音乐类型（如 R&B、CityPop、爵士、摇滚、纯音乐），还能通过富有感染力的语言将音乐与用户当前的环境相连接。',
  djPromptOpening: '结合用户所在城市的天气、实时时间段（早晨/午后/傍晚/深夜）以及气温，生成极具仪式感与氛围感的广播频道开场白。',
  djPromptSelection: '选歌算法需精准契合环境与节奏：早晨优先 110-125 BPM 活力音乐；午后选择 80-100 BPM 轻爵士、Bossa Nova 或 CityPop；雨天优先慢板民谣与治愈系钢琴；深夜精选 Ambient 纯音乐或感性 R&B。',
  djPromptRecommendation: '推歌时输出具象化、富有画面感的串词，讲述歌曲的创作故事、词曲意境、音色与编曲亮点。串词控制在 100-180 字。',
  chatPromptRole: '你是一个温暖、体贴、懂得倾听的知心音乐伙伴。你善于通过文字给予用户情感上的开导与抚慰，引导用户分享生活故事，并用音乐作为连接心灵的桥梁。',
  chatPromptOpening: '开场白需体现关怀与温情。结合当下时间与天气自然发起问候，询问用户今天过得怎么样、心情如何。',
  chatPromptSelection: '根据用户倾诉的心事与情感状态推荐歌曲：焦虑时推荐舒缓治愈系；兴奋喜悦时推荐昂扬热烈的歌；低落时推荐温柔共情、陪伴感强的曲目。',
  chatPromptRecommendation: '乐评探讨需真诚深入。从歌词意境、歌手演唱时的情感流露、个人听感体会等角度展开交流，形成双向的情感互动。',
}

export default {
  name: 'RadioSettingsFeature',
  components: { DjIcon, ModelPicker, SettingsForm },
  props: {
    visible: { type: Boolean, default: true },
    embedded: { type: Boolean, default: true },
    section: { type: String, default: 'llm' },
  },
  emits: ['update:visible', 'save'],
  setup(props, { emit }) {
    const activeCategory = ref('llm')
    const saveStatus = ref('')
    const showApiKey = ref(false)
    const showPopularCity = ref(false)
    const weatherTesting = ref(false)
    const weatherTestResult = ref('')
    const testWeather = async() => {
      weatherTesting.value = true
      weatherTestResult.value = ''
      try {
        const data = await fetchCurrentWeather(true, form)
        weatherTestResult.value = `成功：${data.fullText}`
      } catch (err) {
        weatherTestResult.value = `测试失败：${err.message}`
      } finally { weatherTesting.value = false }
    }
    const testing = ref(false)
    const testResult = ref(null)
    let searchTimer = null
    let citySearchSeq = 0

    const categories = RADIO_BUNDLE.settings[0].children.map(category => ({ ...category, name: category.title }))
    watch(() => props.section, section => {
      activeCategory.value = categories.some(category => category.id === section) ? section : 'llm'
    }, { immediate: true })

    const quickPresets = [
      { id: 'opencode-go', label: 'OpenCode Go' },
      { id: 'openai', label: 'OpenAI' },
      { id: 'anthropic', label: 'Anthropic' },
      { id: 'google', label: 'Gemini' },
      { id: 'deepseek', label: 'DeepSeek' },
      { id: 'ollama', label: 'Ollama 本地' },
      { id: 'lmstudio', label: 'LM Studio' },
      { id: 'glm-4.7-flash', label: '智谱 GLM' },
      { id: 'qwen-turbo', label: '通义千问' },
    ]

    const popularCities = ['北京', '上海', '广州', '深圳', '成都', '杭州', '西安', '武汉']

    const ttsChannels = [
      { id: 'web-speech', label: '本地语音（免 Key）', hint: '依赖系统已安装的语音音色；Ubuntu/Electron 可能没有中文音色，请先测试，失败时改用云端语音' },
      { id: 'youdao-tts', label: '有道翻译语音（免 Key）', hint: '非正式公共接口，仅限 100 字短句，不保证可用；长篇播报请选择正式云端服务' },
      { id: 'azure-tts', label: 'Azure 神经语音', hint: '微软云神经语音，音质自然，需 Speech 资源专用 Key，区域必须与资源一致；中文音色可填 zh-CN-XiaoxiaoNeural' },
      { id: 'openai-tts', label: 'OpenAI TTS', hint: 'OpenAI tts-1 模型，需 OpenAI API Key' },
      { id: 'iflytek-tts', label: '讯飞 TTS', hint: '科大讯飞语音合成，需开放平台 AppID + ApiKey + ApiSecret' },
      { id: 'volcengine-v3-tts', label: '火山引擎 · 豆包语音 2.0（新版 API Key）', hint: '新版控制台 API Key，无需 AppID；资源默认 seed-tts-2.0，音色可从官方列表选择并试听' },
      { id: 'volcengine-tts', label: '火山引擎 TTS', hint: '字节跳动语音合成，需火山引擎 AppID 和 Access Token' },
      { id: 'custom-tts', label: '自定义 TTS', hint: '填写完整的 OpenAI 兼容 /v1/audio/speech 地址，发送 tts-1 / input / voice / speed，接口必须返回音频' },
    ]

    const ttsChannelsMap = Object.fromEntries(ttsChannels.map(c => [c.id, c]))
    const ttsChannelHint = computed(() => ttsChannelsMap[form.ttsEngine]?.hint ?? '')
    const needsApiKey = computed(() => {
      return ['openai-tts', 'azure-tts', 'volcengine-tts', 'volcengine-v3-tts', 'iflytek-tts', 'custom-tts'].includes(form.ttsEngine)
    })
    const voicePlaceholder = computed(() => {
      switch (form.ttsEngine) {
        case 'azure-tts': return 'zh-CN-XiaoxiaoNeural'
        case 'iflytek-tts': return 'xiaoyan'
        case 'volcengine-tts': return 'BV001_streaming'
        case 'volcengine-v3-tts': return 'zh_female_vv_uranus_bigtts'
        case 'openai-tts': return 'alloy'
        default: return 'zh-CN-XiaoxiaoNeural'
      }
    })

    const djPromptFields = [
      { key: 'djPromptRole', label: '角色设定', rows: 3, placeholder: '设定 DJ 的性格与说话语气...' },
      { key: 'djPromptOpening', label: '开场白规则', rows: 2, placeholder: '结合城市天气、时间段的广播开场白...' },
      { key: 'djPromptSelection', label: '选歌逻辑', rows: 2, placeholder: '基于场景 BPM、曲风渐进的选歌算法...' },
      { key: 'djPromptRecommendation', label: '串词推荐', rows: 2, placeholder: '讲出歌曲创作背景与听感故事...' },
    ]

    const chatPromptFields = [
      { key: 'chatPromptRole', label: '角色设定', rows: 3, placeholder: '设定知心伙伴人设与倾听语气...' },
      { key: 'chatPromptOpening', label: '开场关怀', rows: 2, placeholder: '如何根据时间发起关怀问候...' },
      { key: 'chatPromptSelection', label: '情绪推歌', rows: 2, placeholder: '根据用户情绪状态推荐歌曲...' },
      { key: 'chatPromptRecommendation', label: '乐评交流', rows: 2, placeholder: '与用户就音乐审美展开交流...' },
    ]

    const form = reactive({ ...djSettings, modelList: djSettings.modelList.map(model => ({ ...model })) })
    watch(form, () => { saveStatus.value = '' }, { deep: true })
    const voiceCacheKey = 'lx_dj_volcengine_voice_catalog_v1'
    const volcengineVoices = ref([...VOLCENGINE_VOICES])
    const voiceCatalogQuery = ref('')
    const visibleVolcengineVoices = computed(() => {
      const query = voiceCatalogQuery.value.trim().toLowerCase()
      const matches = volcengineVoices.value.filter(voice => !query || `${voice.name} ${voice.id} ${voice.language}`.toLowerCase().includes(query))
      const selected = volcengineVoices.value.find(voice => voice.id === form.ttsVoice)
      if (selected && !matches.some(voice => voice.id === selected.id)) matches.unshift(selected)
      return matches
    })
    const voiceCatalogLoading = ref(false)
    const voiceCatalogStatus = ref('内置音色目录；点击刷新可读取官网新增音色')
    let voiceCatalogUpdatedAt = 0
    let voiceCatalogController = null
    try {
      const cached = JSON.parse(localStorage.getItem(voiceCacheKey) ?? 'null')
      const voices = sanitizeVoiceList(cached?.voices)
      if (voices.length) {
        volcengineVoices.value = voices
        voiceCatalogUpdatedAt = Date.parse(cached.updatedAt) || 0
        voiceCatalogStatus.value = `已读取缓存，更新时间：${new Date(voiceCatalogUpdatedAt).toLocaleString()}`
      }
    } catch { /* retain built-in catalog */ }
    const refreshVoiceCatalog = async() => {
      if (voiceCatalogLoading.value) return
      const controller = new AbortController()
      voiceCatalogController = controller
      voiceCatalogLoading.value = true
      voiceCatalogStatus.value = '正在读取火山官网公开音色，不会发送 API Key'
      try {
        const result = await djRequest('tts-voices', { settings: {} }, controller.signal)
        const voices = sanitizeVoiceList(result.voices)
        if (!voices.length) throw new Error('官网未返回有效的豆包 2.0 音色')
        if (controller.signal.aborted) return
        volcengineVoices.value = voices
        voiceCatalogUpdatedAt = Date.parse(result.updatedAt) || Date.now()
        localStorage.setItem(voiceCacheKey, JSON.stringify({ voices, updatedAt: new Date(voiceCatalogUpdatedAt).toISOString() }))
        voiceCatalogStatus.value = `已从官网更新 ${voices.length} 个音色，${new Date(voiceCatalogUpdatedAt).toLocaleString()}`
      } catch (error) {
        if (!controller.signal.aborted) voiceCatalogStatus.value = `刷新失败，保留当前列表：${error.message}`
      } finally {
        if (voiceCatalogController === controller) {
          voiceCatalogController = null
          voiceCatalogLoading.value = false
        }
      }
    }
    watch(() => [props.visible, activeCategory.value, form.ttsEngine], () => {
      if (props.visible && activeCategory.value === 'tts' && form.ttsEngine === 'volcengine-v3-tts' && Date.now() - voiceCatalogUpdatedAt > 24 * 60 * 60 * 1000) void refreshVoiceCatalog()
    })
    const ttsTesting = ref(false)
    const ttsTestResult = ref('')
    let ttsController = null
    let previewAudio = null
    let previewUrl = null
    const stopTtsTest = () => {
      ttsController?.abort()
      ttsController = null
      if (previewAudio) { previewAudio.pause(); previewAudio.removeAttribute('src'); previewAudio.load(); previewAudio = null }
      if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null }
      window.speechSynthesis?.cancel()
    }
    const testTts = async() => {
      stopTtsTest()
      const controller = new AbortController()
      ttsController = controller
      ttsTesting.value = true
      ttsTestResult.value = ''
      try {
        const url = await synthesizeSpeech('你好，这是音乐电台的语音测试。', { settings: { ...form }, signal: controller.signal })
        if (controller.signal.aborted) { if (url.startsWith('blob:')) URL.revokeObjectURL(url); return }
        if (url.startsWith('speech:')) {
          const utterance = new SpeechSynthesisUtterance(decodeURIComponent(url.slice(7)))
          utterance.lang = form.ttsLang
          utterance.voice = window.speechSynthesis.getVoices().find(v => v.name === form.ttsVoice) ?? window.speechSynthesis.getVoices().find(v => v.lang.replace('_', '-').toLowerCase() === form.ttsLang.toLowerCase())
          utterance.rate = form.ttsSpeed
          utterance.pitch = form.ttsPitch
          utterance.onerror = () => { if (!controller.signal.aborted) ttsTestResult.value = '系统语音播放失败，请选择云端语音服务' }
          window.speechSynthesis.speak(utterance)
        } else {
          previewUrl = url.startsWith('blob:') ? url : null
          previewAudio = new Audio(url)
          previewAudio.onerror = () => { if (!controller.signal.aborted) ttsTestResult.value = '音频播放失败，请检查服务返回格式和系统音量' }
          previewAudio.onended = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null }
          await previewAudio.play()
        }
        ttsTestResult.value = '语音已开始播放；请确认扬声器可以听到声音。'
      } catch (error) {
        if (!controller.signal.aborted) ttsTestResult.value = `测试失败：${error.message}`
      } finally {
        if (ttsController === controller) ttsTesting.value = false
      }
    }
    watch(() => form.ttsEngine, () => {
      form.ttsVoice = ''
      ttsTestResult.value = ''
      stopTtsTest()
      ttsTesting.value = false
    })
    let editingModelId = form.selectedModel
    let connectionController = null
    const cityResults = ref([])
    const showCityDropdown = ref(false)

    const isLocalProvider = computed(() => isLocalModel(form.selectedModel))

    const modelNamePlaceholder = computed(() => {
      const presets = getModelPresets()
      const preset = presets.find(p => p.id === form.selectedModel)
      return preset?.defaultModel ?? 'gpt-4o-mini'
    })

    watch(
      () => props.visible,
      (newVal) => {
        if (newVal) {
          Object.assign(form, djSettings, { modelList: djSettings.modelList.map(model => ({ ...model })) })
          editingModelId = form.selectedModel
          showCityDropdown.value = false
          showPopularCity.value = false
          testResult.value = null
          if (!props.embedded && isLocalModel(form.selectedModel)) void scanLocalModels()
        }
      },
      { immediate: true },
    )

    const onCityInput = () => {
      if (searchTimer) clearTimeout(searchTimer)
      searchTimer = setTimeout(() => {
        const query = form.city.trim()
        const seq = ++citySearchSeq
        if (!query) {
          cityResults.value = []
          showCityDropdown.value = false
          return
        }
        searchCities(query, form).then(results => {
          if (seq !== citySearchSeq || query !== form.city.trim()) return
          cityResults.value = results
          showCityDropdown.value = results.length > 0
        }).catch(() => {})
      }, 300)
    }

    const onCityFocus = () => {
      if (form.city.trim()) onCityInput()
    }

    const selectCity = (cityItem) => {
      form.city = cityItem.name
      showCityDropdown.value = false
    }

    /** 将当前填写的配置缓存到 modelList（切换模型前调用，防止 key 丢失） */
    const cacheCurrentModelConfig = () => {
      if (!form.modelList || !Array.isArray(form.modelList)) return
      const currentId = editingModelId
      const target = form.modelList.find(m => m.id === currentId)
      const cfg = {
        id: currentId,
        name: currentId,
        baseUrl: form.baseUrl,
        modelName: form.customModelName,
        apiKey: form.apiKey,
      }
      if (target) {
        Object.assign(target, cfg)
      } else {
        form.modelList.push(cfg)
      }
    }

    /** 从 modelList 加载目标模型的配置（含 API Key），用户已自定义过的配置优先 */
    const applyModelConfig = (presetId) => {
      const presets = getModelPresets()
      const preset = presets.find(p => p.id === presetId)
      const savedModel = form.modelList?.find(m => m.id === presetId)
      const savedBaseUrl = savedModel?.baseUrl ?? ''
      const presetBaseUrl = preset?.defaultBaseUrl ?? ''
      const savedModelName = savedModel?.modelName ?? ''
      const presetModelName = preset?.defaultModel ?? ''
      form.baseUrl = savedBaseUrl || presetBaseUrl
      form.customModelName = savedModelName || presetModelName
      form.apiKey = savedModel?.apiKey ?? ''
      form.localAiModel = ''
      form.activeModel = ''
      editingModelId = presetId
      testResult.value = null
      connectionController?.abort()
    }

    const onModelSelectChange = () => {
      // 切换前先缓存当前模型的配置
      cacheCurrentModelConfig()
      connectionController?.abort()
      testResult.value = null
      applyModelConfig(form.selectedModel)
      if (isLocalModel(form.selectedModel)) void scanLocalModels()
    }

    /** 快速填入模型预设 */
    const applyQuickPreset = (presetId) => {
      // 切换前先缓存当前模型的配置
      cacheCurrentModelConfig()
      form.selectedModel = presetId
      applyModelConfig(presetId)
      if (isLocalModel(presetId)) void scanLocalModels()
    }

    const detectingLocal = ref(false)
    const localDiscoveredModels = ref([])
    const detectStatusText = ref('')

    const scanLocalModels = async() => {
      detectingLocal.value = true
      detectStatusText.value = '正在探测本地 Ollama (11434) 和 LM Studio (1234)...'
      try {
        const statuses = await detectAllLocalEngines()
        const allModels = []
        let onlineCount = 0
        statuses.forEach((s) => {
          if (s.online) {
            onlineCount++
            allModels.push(...s.models)
          }
        })
        localDiscoveredModels.value = allModels
        if (onlineCount > 0 && allModels.length > 0) {
          detectStatusText.value = `已探测到 ${onlineCount} 个本地引擎，共 ${allModels.length} 个可用模型`
        } else if (onlineCount > 0) {
          detectStatusText.value = '本地引擎在线，但尚未下载任何模型 (可在终端运行 ollama pull <model>)'
        } else {
          detectStatusText.value = '未检测到运行中的 Ollama 或 LM Studio，请先在本地启动服务'
        }
      } catch (err) {
        detectStatusText.value = `探测异常: ${err.message}`
      } finally {
        detectingLocal.value = false
      }
    }

    const selectDiscoveredModel = (m) => {
      cacheCurrentModelConfig()
      form.selectedModel = m.source
      applyModelConfig(m.source)
      form.customModelName = m.id
      form.localAiModel = m.id
      form.apiKey = ''
    }

    /** 恢复默认 prompt */
    const resetField = (mode, key) => {
      const defaultVal = defaultDjPrompts[key]
      if (defaultVal !== undefined) {
        form[key] = defaultVal
      }
    }

    /** 导出 DJ 数据（设置、历史与偏好学习数据，不含密钥） */
    const exportDjData = () => {
      void openSaveDir({
        title: '导出 AI 电台配置',
        defaultPath: 'ai_dj_data.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      }).then(result => {
        if (result.canceled || !result.filePath) return
        void window.lx.worker.main.saveLxConfigFile(result.filePath, getDjBackupData())
      })
    }

    /** 导入 DJ 数据 */
    const importDjData = () => {
      void showSelectDialog({
        title: '导入 AI 电台配置',
        properties: ['openFile'],
        filters: [
          { name: 'JSON', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      }).then(result => {
        if (result.canceled || !result.filePaths?.length) return
        void dialog.confirm({
          message: '导入后将覆盖当前 AI 电台的设置、历史记录与偏好学习数据，确定继续吗？',
          cancelButtonText: '取消',
          confirmButtonText: '确定导入',
        }).then(confirm => {
          if (!confirm) return
          void window.lx.worker.main.readLxConfigFile(result.filePaths[0]).then(async data => {
            if (await applyDjBackupData(data)) {
              Object.assign(form, djSettings, { modelList: djSettings.modelList.map(model => ({ ...model })) })
              editingModelId = form.selectedModel
            } else {
              void dialog({ message: '导入失败：文件格式不正确' })
            }
          })
        })
      })
    }

    /** 测试连接 */
    const testConnection = async() => {
      if (testing.value) return
      testing.value = true
      testResult.value = null
      const controller = new AbortController()
      connectionController = controller
      const timer = setTimeout(() => { controller.abort() }, 15000)
      try {
        await completeModelText({ ...form }, '请简短回复：连接成功', controller.signal)
        if (!controller.signal.aborted) testResult.value = { ok: true, msg: '连接成功，模型已返回响应' }
      } catch (err) {
        if (connectionController !== controller || !props.visible) return
        testResult.value = { ok: false, msg: controller.signal.aborted ? '测试已取消或超时，请检查服务地址' : `连接失败：${err.message}` }
      } finally {
        clearTimeout(timer)
        if (connectionController === controller) connectionController = null
        testing.value = false
      }
    }

    const close = () => {
      voiceCatalogController?.abort()
      stopTtsTest()
      ttsTesting.value = false
      connectionController?.abort()
      if (searchTimer) {
        clearTimeout(searchTimer)
        searchTimer = null
      }
      citySearchSeq++
      showCityDropdown.value = false
      showPopularCity.value = false
      connectionController = null
      emit('update:visible', false)
    }

    onUnmounted(() => {
      voiceCatalogController?.abort()
      stopTtsTest()
      connectionController?.abort()
      if (searchTimer) clearTimeout(searchTimer)
      citySearchSeq++
    })

    const save = async() => {
      showCityDropdown.value = false
      showPopularCity.value = false
      const selectedPreset = form.selectedModel === 'custom'
        ? null
        : (getModelPresets().find(p => p.id === form.selectedModel) ?? null)
      const presetModel = selectedPreset?.defaultModel ?? ''
      const activeModel = form.selectedModel === 'custom'
        ? form.customModelName
        : (form.customModelName || presetModel || form.selectedModel)
      form.activeModel = activeModel

      // 将当前 API Key 保存到对应模型配置中，便于下次切换时恢复
      if (form.modelList && Array.isArray(form.modelList)) {
        const target = form.modelList.find(m => m.id === form.selectedModel)
        if (target) {
          target.apiKey = form.apiKey
        } else {
          form.modelList.push({
            id: form.selectedModel,
            name: form.selectedModel,
            baseUrl: form.baseUrl,
            modelName: activeModel,
            apiKey: form.apiKey,
          })
        }
      }

      cacheCurrentModelConfig()
      try { await saveDjSettings(form) } catch {
        testResult.value = { ok: false, msg: '密钥保存失败，原配置已保留，请重试' }
        return
      }
      saveStatus.value = '配置已保存'
      emit('save', { ...form })
      close()
    }

    return {
      saveStatus,
      weatherTesting,
      weatherTestResult,
      testWeather,
      activeCategory,
      credentialStorage,
      categories,
      form,
      cityResults,
      showCityDropdown,
      showApiKey,
      showPopularCity,
      popularCities,
      quickPresets,
      djPromptFields,
      chatPromptFields,
      volcengineVoices,
      visibleVolcengineVoices,
      voiceCatalogQuery,
      voiceCatalogLoading,
      voiceCatalogStatus,
      refreshVoiceCatalog,
      ttsTesting,
      ttsTestResult,
      testTts,
      ttsChannels,
      ttsChannelHint,
      needsApiKey,
      voicePlaceholder,
      testing,
      testResult,
      modelNamePlaceholder,
      isLocalProvider,
      onCityInput,
      onCityFocus,
      selectCity,
      onModelSelectChange,
      applyQuickPreset,
      detectingLocal,
      localDiscoveredModels,
      detectStatusText,
      scanLocalModels,
      selectDiscoveredModel,
      resetField,
      exportDjData,
      importDjData,
      testConnection,
      close,
      save,
    }
  },
}
