/**
 * useDjChat — 聊天逻辑 composable
 *
 * 封装消息发送、流式响应、音乐搜索、推荐处理
 */

import { ref, computed, markRaw } from '@common/utils/vueTools'
import { djSettings } from '@renderer/bundles/radio/store'
import { hasLlmConfiguration } from '@renderer/bundles/radio/utils/ai/modelsManager'
import { sendLlmStreamMessage } from '@renderer/bundles/radio/utils/llmService'
import { synthesizeSpeech } from '@renderer/bundles/radio/utils/ttsService'
import { playDjSpeech } from '@renderer/bundles/radio/player/djAudio'
import {
  buildDjIntroText,
  generateDjCommentary,
  generateChatRecommendation,
  recommendFromLoveList,
} from '@renderer/bundles/radio/utils/templateEngine'
import { searchMusicTrack, playMusicTrack, songIdentity } from '@renderer/bundles/radio/utils/ai/toolExecutor'
import { addTempPlayList } from '@renderer/store/player/action'
import { tempPlayList } from '@renderer/store/player/state'
import { loveList } from '@renderer/store/list/state'
import { addListMusics } from '@renderer/store/list/action'
import { LIST_IDS } from '@common/constants'
import { getCurrentDjWeatherContext } from '@renderer/bundles/radio/composables/useDjWeather'
import type { DjMode, ChatMessage, MusicCard, WeatherType, GenerationStatus } from '@renderer/bundles/radio/utils/types'

// 模块级单例状态：页面卸载后仍存活，供 DJ 自动连播等跨页面逻辑使用
const messageList = ref<ChatMessage[]>([])
const inputMessage = ref('')
const isGenerating = ref(false)
const generationStatus = ref<GenerationStatus>({ phase: 'idle', text: '' })
let conversationSessionId: string = crypto.randomUUID()
const activeFeatureTag = ref<{ type: string, label: string, placeholder: string } | null>(null)
const showPlusMenu = ref(false)
// 当前模式（DJ / 聊天），模块级以便跨页面连播判断
// 默认非 DJ，避免未进入 DJ 页面时也触发自动连播
const djMode = ref<DjMode>('chat')
// DJ 页面是否处于活跃状态（进入页面置 true，离开置 false）
let isDjPageActive = false
let activeGenerationAbortController: AbortController | null = null
let activeGenerationId = 0

const clearActiveGeneration = (generationId: number, abortController: AbortController | null) => {
  if (generationId !== activeGenerationId) return
  if (!abortController || activeGenerationAbortController === abortController) {
    activeGenerationAbortController = null
  }
  isGenerating.value = false
}

const hasMessages = computed(() => messageList.value.length > 0)

/** 获取/设置当前模式（模块级） */
export const getDjMode = (): DjMode => djMode.value
export const setDjMode = (m: DjMode) => { djMode.value = m }

/** 标记 DJ 页面是否活跃（进入/离开 DJ 页面时由页面调用） */
export const setDjPageActive = (active: boolean) => {
  isDjPageActive = active
}

/** DJ 页面是否活跃（仅活跃且模式为 dj 时才允许自动连播） */
export const isDjActive = (): boolean => isDjPageActive && djMode.value === 'dj'

// 已推荐歌曲去重（模块级，最近 30 首），避免 DJ 连续推送重复歌曲
const recommendedHistory: string[] = []

const rememberRecommended = (name?: string) => {
  if (!name) return
  name = songIdentity({ name })
  const idx = recommendedHistory.indexOf(name)
  if (idx > -1) recommendedHistory.splice(idx, 1)
  recommendedHistory.unshift(name)
  if (recommendedHistory.length > 30) recommendedHistory.pop()
}

const hasBeenRecommended = (name?: string): boolean => {
  if (!name) return false
  return recommendedHistory.includes(songIdentity({ name }))
}

/** 重置去重记录（新建对话时调用） */
export const resetRecommendedHistory = () => {
  recommendedHistory.splice(0, recommendedHistory.length)
}

const isAbortError = (err: unknown): boolean => {
  return !!err && typeof err === 'object' && (err as Error).name === 'AbortError'
}

const MAX_LLM_CONTEXT_MESSAGES = 12
const MAX_LLM_CONTEXT_CHARS = 7000
const MAX_LLM_SINGLE_MESSAGE_CHARS = 1200

const trimContextText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

const formatContextMessage = (msg: ChatMessage): string => {
  let content = trimContextText(msg.text || '', MAX_LLM_SINGLE_MESSAGE_CHARS)
  const cards = msg.musicCards ?? (msg.musicCard ? [msg.musicCard] : [])
  const cardNames = cards
    .filter(card => !!card?.name)
    .slice(0, 4)
    .map(card => `《${card.name}》${card.singer ? `-${card.singer}` : ''}`)

  if (cardNames.length) {
    const appendix = `\n已推荐歌曲：${cardNames.join('、')}`
    content = trimContextText(`${content}${appendix}`, MAX_LLM_SINGLE_MESSAGE_CHARS)
  }
  return content
}

const buildLlmHistory = (messages: ChatMessage[]) => {
  const selected: Array<{ role: 'user' | 'assistant', content: string }> = []
  let totalLength = 0

  for (let i = messages.length - 1; i >= 0; i--) {
    if (selected.length >= MAX_LLM_CONTEXT_MESSAGES) break
    const msg = messages[i]
    if (!msg.text || msg.text === '...') continue

    const content = formatContextMessage(msg)
    if (!content) continue
    if (totalLength + content.length > MAX_LLM_CONTEXT_CHARS && selected.length > 0) break

    selected.unshift({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content,
    })
    totalLength += content.length
  }

  return selected
}

export function useDjChat() {
  /** 提取 AI 回复中的推荐歌曲列表 */
  const extractRecommendedSongList = (aiText: string): string[] => {
    const matches = Array.from(aiText.matchAll(/《([^》]+)》/g)).map(m => m[1].trim())
    if (matches.length > 0) return matches

    // 无《》匹配时，尝试 JSON 提取
    const jsonMatch = aiText.match(/\{"recommend_musics":\s*\[.*?\]\}/s)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.recommend_musics?.length) {
          return parsed.recommend_musics.map((m: any) => m.name)
        }
      } catch { /* ignore */ }
    }

    return []
  }

  /** 剥离 LLM 回复中附加的 JSON 数据块（{"recommend_musics": [...]} 或 ```json ... ```） */
  const stripJsonBlock = (text: string): string => {
    if (!text) return text
    let result = text
    // 剥离 ```json ... ``` 代码块
    result = result.replace(/```json[\s\S]*?```/g, '')
    // 剥离 {"recommend_musics": [...]} JSON 对象（含可能的尾随）
    result = result.replace(/\{"recommend_musics"\s*:\s*\[[\s\S]*?\}\]\s*/g, '')
    // 清理多余的换行和空格
    result = result.replace(/\n{3,}/g, '\n\n').trim()
    return result
  }

  /** 搜索音乐，返回精简卡片（用于展示） */
  const executeMusicSearch = async(kw: string, singer?: string): Promise<MusicCard | null> => {
    const full = await searchMusicTrack(kw, singer)
    if (!full) return null
    return markRaw({
      track: full,
      name: full.name,
      singer: full.singer,
      reason: '',
      pic: full.meta?.picUrl ?? undefined,
      source: full.source,
      meta: full.meta as unknown as { picUrl?: string },
      id: full.id,
    })
  }

  const executeMusicSearchFull = async(kw: string, singerHint?: string): Promise<LX.Music.MusicInfo | null> => {
    return searchMusicTrack(kw, singerHint)
  }

  /** 更新消息中的音乐卡片封面 */
  const preloadMusicCardCovers = (messages: ChatMessage[]) => {
    if (!messages?.length) return
    messages.forEach((msg) => {
      const cards = msg.musicCards ?? (msg.musicCard ? [msg.musicCard] : [])
      cards.forEach((card) => {
        if (card && !card.pic && !card.meta?.picUrl) {
          executeMusicSearch(card.name, card.singer).then((meta) => {
            if (meta?.pic) card.pic = meta.pic
            if (meta?.source) card.source = meta.source
          }).catch(() => { /* ignore */ })
        }
      })
    })
  }

  /** 发送消息 */
  const sendMessage = async(
    mode: DjMode,
    weatherStr: string,
    weatherType: WeatherType,
    onSaveSession?: () => void,
    options?: { silent?: boolean, query?: string },
  ) => {
    const silent = options?.silent ?? false
    const overrideQuery = options?.query?.trim()
    if (!overrideQuery && !inputMessage.value.trim() && !activeFeatureTag.value) return
    if (isGenerating.value) return

    let tagPrefix = ''
    if (activeFeatureTag.value) {
      tagPrefix = `[${activeFeatureTag.value.label}] `
    }

    const rawQuery = overrideQuery ?? inputMessage.value.trim()
    const userText = overrideQuery ? rawQuery : tagPrefix + rawQuery

    // 非静默模式才添加用户消息（自动连播等场景静默，不显示系统指令气泡）
    if (!silent) {
      messageList.value.push({ sender: 'user', text: userText })
    }
    inputMessage.value = ''
    activeFeatureTag.value = null
    isGenerating.value = true
    generationStatus.value = { phase: 'connecting', text: hasLlmConfiguration(djSettings) ? '正在连接模型' : '正在准备本地推荐' }
    const generationId = ++activeGenerationId

    // 添加 AI 占位
    const aiMsgIndex = messageList.value.length
    messageList.value.push({ sender: 'ai', text: '...', isThinkingFolded: true, musicCards: undefined })

    const abortController = new AbortController()
    activeGenerationAbortController = abortController
    try {
      // 未配置 API Key → 使用本地模板引擎
      if (!hasLlmConfiguration(djSettings)) {
        await handleLocalRecommendation(rawQuery, mode, weatherStr, weatherType, aiMsgIndex, onSaveSession, abortController.signal, generationId)
        return
      }

      // 配置了 API Key → 走 LLM
      await handleLlmStream(rawQuery, mode, weatherStr, weatherType, aiMsgIndex, onSaveSession, abortController.signal, generationId)
    } catch (err) {
      if (!isAbortError(err) && generationId === activeGenerationId) {
        generationStatus.value = { phase: 'error', text: '推荐失败，请稍后重试' }
        messageList.value[aiMsgIndex].text = '推荐请求未完成，请检查网络或服务配置后重试。'
        messageList.value[aiMsgIndex].failed = true
        onSaveSession?.()
      }
    } finally {
      if (generationId === activeGenerationId && generationStatus.value.phase !== 'error') generationStatus.value = { phase: 'complete', text: '本次回复已完成' }
      clearActiveGeneration(generationId, abortController)
    }
  }

  /** 本地推荐处理（无 API Key 时） */
  const handleLocalRecommendation = async(
    rawQuery: string,
    mode: DjMode,
    weatherStr: string,
    weatherType: WeatherType,
    aiMsgIndex: number,
    onSaveSession?: () => void,
    signal?: AbortSignal,
    generationId?: number,
  ) => {
    const isStaleGeneration = () => (signal?.aborted ?? false) || (generationId != null && generationId !== activeGenerationId)
    generationStatus.value = { phase: 'searching', text: '正在搜索推荐歌曲' }
    const lower = rawQuery.toLowerCase()
    const isGreeting = ['你好', 'hi', 'hello', '在吗', '哈啰', '早上好', '晚安'].includes(lower)

    // 尝试从喜爱歌单推荐
    const loveRecommendations = recommendFromLoveList(weatherType, mode)
    // 过滤掉已推荐过的歌曲，避免连续推送重复
    const freshRecommendations = loveRecommendations.filter(r => !hasBeenRecommended(r.name))

    // Recognizable catalog titles are only candidates; every displayed card must
    // still resolve to an exact title/artist match in the real music catalog.
    const classics = [
      { name: '晴天', singer: '周杰伦' }, { name: '稻香', singer: '周杰伦' },
      { name: '红豆', singer: '王菲' }, { name: '后来', singer: '刘若英' },
      { name: '倔强', singer: '五月天' }, { name: '平凡之路', singer: '朴树' },
      { name: '小幸运', singer: '田馥甄' }, { name: '十年', singer: '陈奕迅' },
      { name: '遇见', singer: '孙燕姿' }, { name: '隐形的翅膀', singer: '张韶涵' },
      { name: '起风了', singer: '买辣椒也用券' }, { name: '光年之外', singer: '邓紫棋' },
    ]
    const shuffled = [...classics].sort(() => Math.random() - 0.5)
    const targetKws = [
      ...(!isGreeting && !/推荐|继续|下一首|听歌|音乐|适合/.test(rawQuery) ? [{ name: rawQuery, singer: undefined }] : []),
      ...shuffled, ...freshRecommendations,
    ].filter(t => !hasBeenRecommended(t.name))
    const fullResults: LX.Music.MusicInfo[] = []
    const seen = new Set<string>()
    for (let offset = 0; offset < targetKws.length && fullResults.length < 2; offset += 3) {
      const batch = await Promise.all(targetKws.slice(offset, offset + 3).map(async t => executeMusicSearchFull(t.name, t.singer)))
      if (isStaleGeneration()) return
      for (const full of batch) {
        if (!full || seen.has(songIdentity(full)) || hasBeenRecommended(full.name)) continue
        seen.add(songIdentity(full))
        fullResults.push(full)
        if (fullResults.length === 2) break
      }
    }
    const songMetas = fullResults.map(full => markRaw({
      track: full,
      name: full.name,
      singer: full.singer,
      reason: '',
      pic: full.meta?.picUrl ?? undefined,
      source: full.source,
      meta: full.meta as unknown as { picUrl?: string },
      id: full.id,
    })) as MusicCard[]

    // 记录已推荐歌曲（去重）
    songMetas.forEach(s => { rememberRecommended(s.name) })

    // 生成 AI 回复文本
    let aiText = ''
    if (songMetas.length > 1) {
      const namesStr = songMetas.map((s, i) => {
        const reason = loveRecommendations[i]?.reason || ''
        return `《${s.name}》${reason ? '（' + reason + '）' : ''}`
      }).join('、')
      aiText = mode === 'dj'
        ? `【${djSettings.city || '北京'}电台】为您精心编排特别歌单！${namesStr}`
        : `听到关于"${rawQuery}"的倾诉，特别为您推介这几首温暖的曲目 ${namesStr}`
    } else if (songMetas.length === 1) {
      const reason = generateDjCommentary(songMetas[0].name, songMetas[0].singer, weatherType)
      aiText = mode === 'dj'
        ? `【${djSettings.city || '北京'}电台】${reason}`
        : `为您推荐这首《${songMetas[0].name}》：${reason}`
    } else {
      aiText = mode === 'dj'
        ? '暂未找到可核实且不重复的歌曲，请稍后重试或指定歌名和歌手。'
        : '暂未找到可核实且不重复的歌曲，请稍后重试或指定歌名和歌手。'
    }

    // 为歌曲补充推荐理由
    if (songMetas.length > 0 && loveRecommendations.length > 0) {
      songMetas.forEach((song, i) => {
        if (!song.reason && loveRecommendations[i]) {
          song.reason = loveRecommendations[i].reason
        }
      })
    }

    messageList.value[aiMsgIndex] = {
      sender: 'ai',
      text: aiText,
      musicCards: songMetas,
      musicCard: songMetas[0] ?? null,
    }

    if (isStaleGeneration()) return
    onSaveSession?.()

    // DJ 模式播放本轮推荐，并将剩余歌曲加入稍后播放队列。
    if (isStaleGeneration()) return
    if (mode === 'dj' && djSettings.djAutoPlay && fullResults.length > 0) {
      try {
        await playRecommendationBatch(songMetas, isStaleGeneration)
      } catch (err) {
        console.error('DJ 自动播放失败:', err)
      }
    }

    // TTS 播报
    if (
      (mode === 'dj' && djSettings.enableDjSpeech) ||
      (mode === 'chat' && djSettings.enableChatSpeech)
    ) {
      if (isStaleGeneration()) return
      try {
        generationStatus.value = { phase: 'speaking', text: '正在合成语音，长串词可能需要几十秒' }
        const audioUrl = await synthesizeSpeech(aiText, { signal })
        if (isStaleGeneration() || !(mode === 'dj' ? djSettings.enableDjSpeech : djSettings.enableChatSpeech)) {
          if (audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl)
          return
        }
        await playDjSpeech(audioUrl)
      } catch (err) {
        if (!isAbortError(err)) generationStatus.value = { phase: 'error', text: `语音播报失败：${(err as Error).message}` }
      }
    }
  }

  /** LLM 流式处理 */
  const handleLlmStream = async(
    rawQuery: string,
    mode: DjMode,
    weatherStr: string,
    weatherType: WeatherType,
    aiMsgIndex: number,
    onSaveSession?: () => void,
    signal?: AbortSignal,
    generationId?: number,
  ) => {
    const isStaleGeneration = () => (signal?.aborted ?? false) || (generationId != null && generationId !== activeGenerationId)
    const formattedHistory = buildLlmHistory(messageList.value.slice(0, -1))

    let accumulatedText = ''

    await sendLlmStreamMessage(
      formattedHistory,
      mode,
      weatherStr,
      {
        onStatus(status) { if (!isStaleGeneration()) generationStatus.value = status },
        onToken(token) {
          if (isStaleGeneration()) return
          accumulatedText += token
          messageList.value[aiMsgIndex].text = accumulatedText
        },
        onThinkingDelta(token) {
          if (isStaleGeneration()) return
          const current = messageList.value[aiMsgIndex].thinkingText ?? ''
          messageList.value[aiMsgIndex].thinkingText = current + token
        },
        async onComplete(fullText) {
          if (isStaleGeneration()) return
          // 剥离 JSON 数据块，只保留纯文案
          const cleanText = stripJsonBlock(fullText) || stripJsonBlock(messageList.value[aiMsgIndex].text || '')
          if (cleanText) messageList.value[aiMsgIndex].text = cleanText

          // 如果 LLM 回复中没有音乐卡片，尝试从文本提取（支持多首）
          if (!messageList.value[aiMsgIndex].musicCards?.length) {
            const songNames = extractRecommendedSongList(fullText)
            const uniqueNames = [...new Set(songNames)].filter(name => !hasBeenRecommended(name)).slice(0, 6)
            const seen = new Set<string>()
            const songMetas = (await Promise.all(
              uniqueNames.map(async name => executeMusicSearch(name)),
            )).filter((card): card is MusicCard => {
              if (!card || seen.has(songIdentity(card))) return false
              seen.add(songIdentity(card))
              return true
            })
            if (isStaleGeneration()) return
            if (songMetas.length) {
              messageList.value[aiMsgIndex].musicCards = songMetas
              messageList.value[aiMsgIndex].musicCard = songMetas[0]
            }
          }

          // 记录已推荐歌曲（去重）
          messageList.value[aiMsgIndex].musicCards?.forEach(c => { rememberRecommended(c.name) })

          // 若 LLM 只返回了 tool call、没有文本，则用模板生成 DJ 串词兜底
          const cards = messageList.value[aiMsgIndex].musicCards
          const currentText = messageList.value[aiMsgIndex].text
          if ((!currentText || currentText === '...') && cards?.length) {
            const intro = buildDjIntroText(mode, weatherStr)
            const firstCard = cards[0]
            const commentary = generateDjCommentary(firstCard.name, firstCard.singer, weatherType)
            const finalText = mode === 'dj'
              ? `${intro.greeting} ${commentary}`
              : generateChatRecommendation(rawQuery, firstCard.name, firstCard.singer)
            messageList.value[aiMsgIndex].text = finalText
          }

          onSaveSession?.()

          // DJ 模式播放本轮推荐，包括工具已经播放首曲的情况。
          if (isStaleGeneration()) return
          if (mode === 'dj' && djSettings.djAutoPlay && cards?.length) {
            try {
              generationStatus.value = { phase: 'playing', text: '正在准备播放歌曲' }
              await playRecommendationBatch(cards, isStaleGeneration)
            } catch (err) {
              console.error('DJ 自动播放失败:', err)
            }
          }

          // TTS 播报
          const textToSpeak = messageList.value[aiMsgIndex].text || fullText
          if (
            (mode === 'dj' && djSettings.enableDjSpeech) ||
              (mode === 'chat' && djSettings.enableChatSpeech)
          ) {
            try {
              generationStatus.value = { phase: 'speaking', text: '正在合成语音，长串词可能需要几十秒' }
              const audioUrl = await synthesizeSpeech(textToSpeak, { signal })
              if (isStaleGeneration() || !(mode === 'dj' ? djSettings.enableDjSpeech : djSettings.enableChatSpeech)) {
                if (audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl)
                return
              }
              await playDjSpeech(audioUrl)
            } catch (err) {
              if (!isAbortError(err) && !isStaleGeneration()) generationStatus.value = { phase: 'error', text: `语音播报失败：${(err as Error).message}。可点击回复下方的朗读按钮重试` }
            }
          }
        },
        onError(err) {
          if (isStaleGeneration()) return
          if (isAbortError(err)) {
            const currentText = messageList.value[aiMsgIndex]?.text
            if (!currentText || currentText === '...') {
              messageList.value[aiMsgIndex].text = '已停止生成'
            }
            return
          }
          generationStatus.value = { phase: 'error', text: '请求失败，请检查设置或重试' }
          messageList.value[aiMsgIndex].failed = true
          messageList.value[aiMsgIndex].text = `模型连接失败：${err.message}。请在设置中检查服务商、API Key 和 API 地址`
          onSaveSession?.()
        },
      },
      {
        sessionId: conversationSessionId,
        excludedSongNames: [...recommendedHistory],
        signal,
        weatherType,
        onFoundMusicCard(card: MusicCard) {
          if (isStaleGeneration()) return
          const currentCards = messageList.value[aiMsgIndex].musicCards ?? []
          if (!currentCards.some(c => songIdentity(c) === songIdentity(card)) && !hasBeenRecommended(card.name)) {
            messageList.value[aiMsgIndex].musicCards = [...currentCards, card]
            messageList.value[aiMsgIndex].musicCard = card
          }
        },
      },
    )
  }

  /** 播放音乐卡片（内部方法，供自动播放复用；优先使用传入的完整 musicInfo） */
  const playMusicCard = async(musicCard: MusicCard, musicInfo?: LX.Music.MusicInfo | null) => {
    const fullInfo = musicInfo ?? musicCard.track ?? await executeMusicSearchFull(musicCard.name, musicCard.singer)
    if (!fullInfo?.source) throw new Error('未找到可播放的歌曲，请换一首重试')
    musicCard.track = fullInfo
    musicCard.pic = fullInfo.meta?.picUrl ?? musicCard.pic
    musicCard.source = fullInfo.source
    musicCard.id = fullInfo.id
    await playMusicTrack(fullInfo)
    musicCard.played = true
  }

  /** 播放音乐卡片 */
  const toggleMusicPlay = async(musicCard: MusicCard) => playMusicCard(musicCard)

  const enqueueMusicCard = async(card: MusicCard) => {
    const info = card.track ?? await executeMusicSearchFull(card.name, card.singer)
    if (!info) throw new Error('未找到可加入队列的歌曲，请换一首重试')
    card.track = info
    addTempPlayList([{ listId: LIST_IDS.PLAY_LATER, musicInfo: info, isTop: false }])
  }

  const playRecommendationBatch = async(cards: MusicCard[], isStale: () => boolean) => {
    // 先解析完整批次，避免首曲结束时后续歌曲仍未入队。
    const tracks = await Promise.all(cards.map(async card => card.track ?? await executeMusicSearchFull(card.name, card.singer)))
    if (isStale()) return
    const playable = cards.filter((card, index) => {
      const track = tracks[index]
      if (!track?.source) return false
      card.track = track
      return true
    })
    if (!playable.length) throw new Error('未找到可播放的歌曲，请换一首重试')
    const alreadyPlaying = playable.some(card => card.played)
    if (!alreadyPlaying) {
      await playMusicCard(playable[0])
      if (isStale()) return
    }
    const remaining = playable.filter(card => !card.played)
    if (remaining.length) {
      addTempPlayList(remaining.map(card => ({
        listId: LIST_IDS.PLAY_LATER,
        musicInfo: card.track!,
        isTop: false,
      })))
    }
  }

  /** 判断音乐卡片是否已收藏到“我的喜爱” */
  const isMusicCardLoved = (card: MusicCard): boolean => {
    const list = (loveList as any)?.list ?? []
    return list.some((item: any) =>
      (card.id && item.id
        ? item.id === card.id
        : item.name === card.name && (!card.singer || item.singer === card.singer)),
    )
  }

  const favoriteMusicCard = async(card: MusicCard): Promise<boolean> => {
    if (isMusicCardLoved(card)) return true
    const info = card.track ?? await executeMusicSearchFull(card.name, card.singer)
    if (!info) throw new Error('未找到该歌曲资源，无法收藏')
    card.track = info
    card.id = info.id
    await addListMusics(LIST_IDS.LOVE, [info])
    return true
  }

  const setConversationId = (id?: string) => { conversationSessionId = id ? `lx-dj-${id}` : crypto.randomUUID() }

  /** 删除消息 */
  const deleteMessage = (index: number) => {
    // 流式回调按消息位置更新，删除前先终止，避免写入其他消息。
    stopGeneration()
    messageList.value.splice(index, 1)
  }

  /** 清空消息 */
  const clearMessages = () => {
    setConversationId()
    generationStatus.value = { phase: 'idle', text: '' }
    messageList.value = []
    activeFeatureTag.value = null
    resetRecommendedHistory()
  }

  /** 停止当前生成任务 */
  const stopGeneration = () => {
    if (!isGenerating.value && !activeGenerationAbortController) return
    activeGenerationId++
    generationStatus.value = { phase: 'stopped', text: '已停止生成' }
    activeGenerationAbortController?.abort()
    activeGenerationAbortController = null
    isGenerating.value = false

    const lastMsg = messageList.value[messageList.value.length - 1]
    if (lastMsg?.sender === 'ai' && (!lastMsg.text || lastMsg.text === '...')) {
      lastMsg.text = '已停止生成'
    }
  }

  /** 附加标签 */
  const attachFeatureTag = (type: 'search' | 'play') => {
    showPlusMenu.value = false
    if (type === 'search') {
      activeFeatureTag.value = {
        type: 'search',
        label: 'AI 聚合搜索',
        placeholder: '输入泛意图或想听的音乐类型...',
      }
    } else {
      activeFeatureTag.value = {
        type: 'play',
        label: '快捷点歌',
        placeholder: '输入歌名或歌手名...',
      }
    }
  }

  // 注入模块级引用，供 autoContinueRecommend 跨页面调用
  moduleSendMessage = sendMessage

  return {
    generationStatus,
    setConversationId,
    enqueueMusicCard,
    isMusicCardLoved,
    favoriteMusicCard,
    messageList,
    inputMessage,
    isGenerating,
    activeFeatureTag,
    showPlusMenu,
    hasMessages,
    sendMessage,
    toggleMusicPlay,
    deleteMessage,
    clearMessages,
    stopGeneration,
    attachFeatureTag,
    preloadMusicCardCovers,
    executeMusicSearch,
  }
}

// 模块级 sendMessage / executeMusicSearch 引用（由 useDjChat 调用时注入）
type ModuleSendMessage = (
  mode: DjMode,
  weatherStr: string,
  weatherType: WeatherType,
  onSaveSession?: () => void,
  options?: { silent?: boolean, query?: string },
) => Promise<void>
let moduleSendMessage: ModuleSendMessage | null = null

/**
 * 模块级 DJ 自动连播函数
 * 供播放器歌曲结束时调用（跨页面可用，不依赖组件实例）
 * @returns 是否已接管播放
 */
export const autoContinueRecommend = (): boolean => {
  // 仅 DJ 页面活跃且模式为 dj 时才允许自动连播
  if (!isDjActive() || isGenerating.value) return false
  if (!djSettings.autoContinue) return false
  // 先交给主播放器消耗已有队列，整批推荐播完后再发起下一轮对话。
  if (tempPlayList.length) return false
  if (!moduleSendMessage) return false
  const weather = getCurrentDjWeatherContext()
  // 静默推荐下一首
  void moduleSendMessage(
    'dj',
    weather.text,
    weather.type,
    undefined,
    { silent: true, query: '请继续推荐下一首好听的音乐' },
  )
  return true
}

/** Stop module-owned work even if the page was already removed. Preserve history. */
export const deactivateRadioSession = () => {
  setDjPageActive(false)
  activeGenerationId++
  activeGenerationAbortController?.abort()
  activeGenerationAbortController = null
  isGenerating.value = false
  generationStatus.value = { phase: 'stopped', text: '电台已停用' }
  moduleSendMessage = null
}
