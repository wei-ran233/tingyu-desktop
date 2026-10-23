import { ref, computed, watch, nextTick, onMounted, onUnmounted } from '@common/utils/vueTools'
import DjIcon from '@renderer/components/common/SvgIcon.vue'
import { hasLlmConfiguration } from '@renderer/bundles/radio/utils/ai/modelsManager'
import MessageContent from '@renderer/bundles/radio/views/Dj/components/MessageContent.vue'
import DjSettingModal from '@renderer/bundles/radio/views/Dj/components/DjSettingModal.vue'
import { djSettings, saveDjSettings } from '@renderer/bundles/radio/store'
import { fetchDynamicSuggestions } from '@renderer/bundles/radio/utils/llmService'
import { synthesizeSpeech } from '@renderer/bundles/radio/utils/ttsService'
import { playDjSpeech, stopDjSpeech, setDjActionHandler } from '@renderer/bundles/radio/player/djAudio'
import { onDjAction } from '@renderer/utils/ipc'
import { clipboardWriteText } from '@common/utils/electron'
import { musicInfo, isPlay } from '@renderer/store/player/state'
import { useDjChat, setDjMode, setDjPageActive } from '@renderer/bundles/radio/composables/useDjChat'
import { useDjHistory } from '@renderer/bundles/radio/composables/useDjHistory'
import { useDjWeather } from '@renderer/bundles/radio/composables/useDjWeather'
import { generateGreeting } from '@renderer/bundles/radio/utils/templateEngine'
import { analyzeUserProfile } from '@renderer/bundles/radio/utils/userProfile'
import { dialog } from '@renderer/plugins/Dialog'

// Keep mode with the module-level messages and active history when revisiting.
const mode = ref('dj')

export default {
  name: 'DjChatGPTIntegratedView',
  components: { DjSettingModal, DjIcon, MessageContent },
  setup() {
    const streamRef = ref(null)
    const followStream = ref(true)
    const renameTarget = ref(null)
    const renameTitle = ref('')
    const resizeComposer = (event) => {
      const input = event.target
      input.style.height = 'auto'
      input.style.height = `${Math.min(input.scrollHeight, 144)}px`
    }
    const onComposerKeydown = (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return
      event.preventDefault()
      handleSendClick()
    }
    const onStreamScroll = () => {
      const el = streamRef.value
      if (el) followStream.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    const jumpToLatest = () => {
      followStream.value = true
      const el = streamRef.value
      if (el) el.scrollTop = el.scrollHeight
    }
    const beginRename = (item) => { renameTarget.value = item; renameTitle.value = item.title }
    const commitRename = () => { if (renameTarget.value) renameHistory(renameTarget.value, renameTitle.value); renameTarget.value = null }
    const isSidebarOpen = ref(true)
    const showSettingModal = ref(false)
    const currentDateStr = ref('')
    const aiOpeningGreeting = ref('')
    const suggestionChips = ref([])
    let removeDjActionListener = null
    let currentTimeTimer = null

    // 使用 composables
    const chat = useDjChat()
    const history = useDjHistory()
    const weather = useDjWeather()

    const {
      messageList,
      inputMessage,
      isGenerating,
      generationStatus,
      setConversationId,
      enqueueMusicCard,
      isMusicCardLoved,
      favoriteMusicCard,
      hasMessages,
      activeFeatureTag,
      showPlusMenu,
      sendMessage: chatSendMessage,
      toggleMusicPlay: chatToggleMusicPlay,
      deleteMessage: chatDeleteMessage,
      clearMessages,
      attachFeatureTag: chatAttachFeatureTag,
      preloadMusicCardCovers,
      stopGeneration,
    } = chat

    const {
      historyCategory,
      historyQuery,
      groupedHistory,
      renameHistory,
      activeHistoryId,
      currentHistoryList,
      saveCurrentSession,
      addSongsToRecommend,
      selectHistory,
      directPlay: historyDirectPlay,
      deleteHistory: rawDeleteHistory,
      clearCurrentCategoryHistory,
      startNewChat: historyStartNewChat,
    } = history

    const {
      weatherType,
      weatherDisplay,
      refreshWeather,
    } = weather

    const city = computed(() => djSettings.city || '北京')
    const activeModelName = computed(() => {
      return hasLlmConfiguration(djSettings) ? ([djSettings.customModelName, djSettings.localAiModel, djSettings.activeModel, djSettings.selectedModel].find(value => !!value)) : '本地推荐 · 配置模型后开始聊天'
    })

    watch(() => [messageList.value.length, messageList.value.at(-1)?.text, messageList.value.at(-1)?.thinkingText, messageList.value.at(-1)?.musicCards?.length], async() => {
      if (!followStream.value) return
      await nextTick()
      jumpToLatest()
    })
    watch(inputMessage, async(value) => {
      if (value) return
      await nextTick()
      document.querySelectorAll('textarea[aria-label="消息内容"]').forEach(input => { input.style.height = 'auto' })
    })

    // Persist streaming, stopped, and automatic turns as well as completed replies.
    let active = true
    let historySaveTimer = null
    const flushSession = () => {
      clearTimeout(historySaveTimer)
      historySaveTimer = null
      saveCurrentSession(messageList.value, mode.value)
    }
    watch(messageList, () => {
      clearTimeout(historySaveTimer)
      historySaveTimer = setTimeout(flushSession, 500)
    }, { deep: true, flush: 'sync' })

    // 自动刷新天气
    const initEnvironment = async() => {
      await refreshWeather()
      if (active) analyzeUserProfile()
    }

    const generateAiGreeting = () => {
      aiOpeningGreeting.value = generateGreeting(mode.value, weatherDisplay.value)
    }

    const generateDynamicSuggestions = () => {
      if (hasMessages.value) return
      void refreshSuggestions()
    }

    const refreshSuggestions = async() => {
      if (hasMessages.value || isGenerating.value) return
      suggestionChips.value = ['正在思考推荐...']
      const chips = await fetchDynamicSuggestions(weatherDisplay.value, mode.value)
      if (active) suggestionChips.value = chips
    }

    const updateCurrentTime = () => {
      const now = new Date()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const hours = String(now.getHours()).padStart(2, '0')
      const minutes = String(now.getMinutes()).padStart(2, '0')
      currentDateStr.value = `${now.getFullYear()}-${month}-${day} ${hours}:${minutes}`
      generateAiGreeting()
      generateDynamicSuggestions()
    }

    // 处理开放 API 的 DJ 动作（推荐 / 点歌 / 切歌等）
    const handleDjAction = (data) => {
      const action = data?.action
      const keyword = data?.keyword ?? ''
      if (action === 'play' && keyword) {
        // 指定关键词点歌
        inputMessage.value = keyword
        handleSendClick()
        return
      }
      // 默认 recommend / continue：触发一次推荐
      if (mode.value !== 'dj') switchMode('dj')
      handleSendClick({ silent: true, query: keyword ? `推荐 ${keyword} 相关的歌曲` : '请推荐一首好听的歌' })
    }

    onMounted(() => {
      window.addEventListener('beforeunload', flushSession)
      updateCurrentTime()
      void initEnvironment()
      preloadMusicCardCovers(messageList.value)
      // 标记 DJ 页面活跃，仅在进入本页面且模式为 dj 时才允许自动连播
      setDjPageActive(true)
      setDjMode(mode.value)
      setDjActionHandler(handleDjAction)
      // 监听开放 API 触发的 DJ 动作
      removeDjActionListener = onDjAction(({ params }) => {
        handleDjAction(params)
      })

      currentTimeTimer = setInterval(() => {
        updateCurrentTime()
      }, 60000)
    })

    onUnmounted(() => {
      active = false
      stopGeneration()
      flushSession()
      window.removeEventListener('beforeunload', flushSession)
      cancelMessageSpeech()
      stopDjSpeech()
      // 离开页面标记为非活跃，避免未使用 DJ 时也触发自动连播
      setDjPageActive(false)
      setDjActionHandler(null)
      removeDjActionListener?.()
      if (currentTimeTimer) {
        clearInterval(currentTimeTimer)
        currentTimeTimer = null
      }
      if (copyResetTimer) {
        clearTimeout(copyResetTimer)
        copyResetTimer = null
      }
    })

    // 切换模式
    const switchMode = (newMode) => {
      if (newMode === mode.value) return
      stopGeneration()
      cancelMessageSpeech()
      stopDjSpeech()
      flushSession()
      mode.value = newMode
      setDjMode(newMode)
      // 切换模式时开始新对话
      historyStartNewChat()
      clearMessages()
      generateAiGreeting()
      generateDynamicSuggestions()
    }

    // 新对话
    const startNewChat = (save = true) => {
      stopGeneration()
      cancelMessageSpeech()
      stopDjSpeech()
      if (save) flushSession()
      else clearTimeout(historySaveTimer)
      historyStartNewChat()
      clearMessages()
      generateAiGreeting()
    }

    // 删除历史记录（带确认；若删除的是当前会话则回到新对话）
    const deleteHistory = async(item) => {
      const confirm = await dialog.confirm({
        message: `确定删除「${item.title}」这条记录吗？`,
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      })
      if (!confirm) return
      const wasActive = activeHistoryId.value === item.id
      rawDeleteHistory(item)
      if (wasActive) {
        startNewChat(false)
      }
    }

    // 选择历史记录
    const onDirectPlayHistory = (item) => {
      historyDirectPlay(item, (card) => {
        chatToggleMusicPlay(card).catch(err => { void dialog({ message: err.message }) })
      })
    }

    const onSelectHistory = (item) => {
      if (item.type === 'recommend') {
        onDirectPlayHistory(item)
        return
      }
      stopGeneration()
      cancelMessageSpeech()
      stopDjSpeech()
      flushSession()
      setConversationId(item.id)
      const messages = selectHistory(item)
      if (messages) {
        messageList.value = messages
        preloadMusicCardCovers(messageList.value)
      }
      if (item.mode) {
        mode.value = item.mode
        setDjMode(item.mode)
      }
    }

    // 清空当前分类历史
    const clearCategoryHistory = async() => {
      const catNames = { dj: 'DJ 调频', chat: '聊天历史', recommend: '推荐点播' }
      const confirm = await dialog.confirm({
        message: `确定清空「${catNames[historyCategory.value]}」下的全部记录吗？`,
        confirmButtonText: '清空',
        cancelButtonText: '取消',
      })
      if (!confirm) return
      const wasActive = currentHistoryList.value.some(item => item.id === activeHistoryId.value)
      clearCurrentCategoryHistory()
      if (wasActive) startNewChat(false)
    }

    // 快捷控制：连播开关、语音播报开关、DJ 一键切歌
    const isSpeechEnabled = computed(() => mode.value === 'dj' ? djSettings.enableDjSpeech : djSettings.enableChatSpeech)
    let speechController = null
    const cancelMessageSpeech = () => {
      speechController?.abort()
      speechController = null
    }
    const toggleSpeechEnabled = () => {
      cancelMessageSpeech()
      if (mode.value === 'dj') {
        djSettings.enableDjSpeech = !djSettings.enableDjSpeech
        if (!djSettings.enableDjSpeech) stopDjSpeech()
      } else {
        djSettings.enableChatSpeech = !djSettings.enableChatSpeech
        if (!djSettings.enableChatSpeech) stopDjSpeech()
      }
      void saveDjSettings(djSettings)
    }

    const toggleAutoContinue = () => {
      djSettings.autoContinue = !djSettings.autoContinue
      void saveDjSettings(djSettings)
    }

    const requestNextDjSong = () => {
      if (isGenerating.value) return
      handleSendClick({ query: '请根据当前氛围继续推荐并播放下一首好听的歌' })
    }

    // 判断某张音乐卡片是否正在由主播放器播放
    const isCardCurrentlyPlaying = (card) => {
      if (!isPlay.value || !musicInfo.name) return false
      if (card.id && musicInfo.id) return musicInfo.id === card.id
      return musicInfo.name === card.name && (!card.singer || musicInfo.singer === card.singer)
    }

    // 收藏音乐卡片到“我的喜爱”
    const onFavoriteMusic = async(card) => {
      try {
        await favoriteMusicCard(card)
      } catch (err) {
        void dialog({ message: err.message })
      }
    }

    // 消息工具栏：复制文本、朗读单条消息
    const copiedMsgIndex = ref(-1)
    let copyResetTimer = null
    const copyMessageText = (text, index) => {
      if (!text) return
      clipboardWriteText(text)
      copiedMsgIndex.value = index
      if (copyResetTimer) clearTimeout(copyResetTimer)
      copyResetTimer = setTimeout(() => { copiedMsgIndex.value = -1 }, 1800)
    }

    const speakMessageText = async(text) => {
      if (!text) return
      cancelMessageSpeech()
      stopDjSpeech()
      const controller = new AbortController()
      speechController = controller
      try {
        const audioUrl = await synthesizeSpeech(text, { signal: controller.signal })
        if (controller.signal.aborted) {
          if (audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl)
          return
        }
        await playDjSpeech(audioUrl)
      } catch (err) {
        if (err.name !== 'AbortError') void dialog({ message: `朗读失败：${err.message}` })
      } finally {
        if (speechController === controller) speechController = null
      }
    }

    // 播放音乐卡片（包装：播放后加入推荐历史）
    const toggleMusicPlay = async(card) => {
      try {
        await chatToggleMusicPlay(card)
        if (card?.name) addSongsToRecommend([card])
      } catch (err) {
        void dialog({ message: err.message })
      }
    }

    // 发送消息（包装，自动保存历史）
    const handleSendClick = (options) => {
      followStream.value = true
      void chatSendMessage(
        mode.value,
        weatherDisplay.value,
        weatherType.value,
        () => {
          saveCurrentSession(messageList.value, mode.value)
        },
        options,
      )
    }

    const handleComposerButtonClick = () => {
      if (isGenerating.value) {
        stopGeneration()
        return
      }
      handleSendClick()
    }

    // 应用建议标签
    const applySuggestion = (text) => {
      inputMessage.value = text
      handleSendClick()
    }

    // 删除消息
    const deleteMessage = (index) => {
      chatDeleteMessage(index)
      saveCurrentSession(messageList.value, mode.value)
    }

    const enqueueMusic = async(card) => {
      try {
        await enqueueMusicCard(card)
      } catch (error) { void dialog({ message: error.message }) }
    }
    const retryMessage = (index) => {
      const previousUser = messageList.value.slice(0, index).map((message, position) => ({ message, position })).reverse().find(item => item.message.sender === 'user')
      if (!previousUser) return
      const query = previousUser.message.text
      messageList.value.splice(previousUser.position)
      handleSendClick({ query })
    }

    // 附加功能标签
    const attachFeatureTag = (type) => {
      chatAttachFeatureTag(type)
    }

    // 设置保存
    const onSaveSetting = () => {
      generateAiGreeting()
      generateDynamicSuggestions()
      void initEnvironment()
    }

    return {
      djSettings,
      historyQuery,
      groupedHistory,
      streamRef,
      followStream,
      renameTarget,
      renameTitle,
      resizeComposer,
      onComposerKeydown,
      onStreamScroll,
      jumpToLatest,
      beginRename,
      commitRename,
      isSidebarOpen,
      enqueueMusic,
      retryMessage,
      generationStatus,
      mode,
      showSettingModal,
      currentDateStr,
      aiOpeningGreeting,
      suggestionChips,
      city,
      activeModelName,
      weatherType,
      weatherDisplay,
      messageList,
      inputMessage,
      isGenerating,
      hasMessages,
      activeFeatureTag,
      showPlusMenu,
      historyCategory,
      activeHistoryId,
      currentHistoryList,
      switchMode,
      startNewChat,
      onSelectHistory,
      onDirectPlayHistory,
      deleteHistory,
      clearCategoryHistory,
      isSpeechEnabled,
      toggleSpeechEnabled,
      toggleAutoContinue,
      requestNextDjSong,
      isCardCurrentlyPlaying,
      isMusicCardLoved,
      onFavoriteMusic,
      copiedMsgIndex,
      copyMessageText,
      speakMessageText,
      handleSendClick,
      handleComposerButtonClick,
      refreshSuggestions,
      applySuggestion,
      toggleMusicPlay,
      deleteMessage,
      attachFeatureTag,
      onSaveSetting,
    }
  },
}
