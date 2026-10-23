/**
 * AI DJ / 电台功能核心类型定义
 */

/** 对话模式 */
export type DjMode = 'dj' | 'chat'

/** 消息发送者 */
export type MessageSender = 'user' | 'ai'

/** 天气类型 */
export type WeatherType = 'sunny' | 'rainy' | 'snowy' | 'cloudy' | 'night' | 'unknown'

/** 天气数据 */
export interface WeatherData {
  city: string
  weather: string
  temp: string
  feelsLike?: string
  windDir?: string
  fullText: string
  type: WeatherType
}

/** 时段类型 */
export type TimePeriod = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night' | 'lateNight'

/** 曲风分类 */
export type MusicGenre =
  | 'pop' | 'rock' | 'r&b' | 'jazz' | 'classical' | 'electronic'
  | 'hiphop' | 'folk' | 'country' | 'blues' | 'metal' | 'ambient'
  | 'citypop' | 'bossanova' | 'acoustic' | 'chinese' | 'kpop' | 'edm'

/** 音乐推荐卡片 */
export interface MusicCard {
  track?: LX.Music.MusicInfo
  played?: boolean
  name: string
  singer?: string
  reason?: string
  pic?: string
  source?: string
  meta?: { picUrl?: string }
  id?: string | number
}

/** 对话消息 */
export interface ChatMessage {
  failed?: boolean
  sender: MessageSender
  text: string
  thinkingText?: string
  isThinkingFolded?: boolean
  musicCards?: MusicCard[]
  musicCard?: MusicCard
}

/** 历史记录条目 */
export interface HistoryItem {
  updatedAt?: number
  customTitle?: boolean
  id: string
  type: 'history' | 'recommend'
  mode: DjMode
  title: string
  singer?: string
  date: string
  messages?: ChatMessage[]
}

/** 用户画像日志 */
export interface ProfileLogItem {
  time: string
  content: string
}

/** 用户品味画像 */
export interface UserTasteProfile {
  topArtists: string[]
  topGenres: MusicGenre[]
  sampleCount: number
  automaticArtists: Array<{ name: string, score: number, favorites: number, listens: number }>
  inferredGenreTags: string[]
  knownGenreCount: number
  analyzedSongCount: number
  listeningCount: number
  timePeriodSongs: Array<{ period: TimePeriod, label: string, songs: Array<{ name: string, singer: string, count: number, lastPlayedAt: number }> }>
  genreTags: string[]
  /** 曲风占比（0-100，按播放次数加权） */
  genreDistribution: Array<{ name: string, percent: number }>
  /** 歌手占比 */
  artistDistribution: Array<{ name: string, percent: number }>
  /** 情绪标签（如：治愈、燃、伤感、欢快） */
  moodTags: string[]
  /** 语言/语种偏好（国语、粤语、英语、日语等） */
  langTags: string[]
  playCounts: Record<string, number>
  lastAnalyzedTime: string
  /** 时段偏好: 时段 -> 曲风列表 */
  timePeriodPrefs?: Partial<Record<TimePeriod, MusicGenre[]>>
  /** 常用 BPM 范围 */
  preferredBpmRange?: [number, number]
}

/** LLM 模型提供商预设 */
export interface ModelPreset {
  id: string
  name: string
  baseUrl: string
  modelName: string
  apiKey: string
}

/** LLM 工具调用 */
export interface ToolCall {
  name: string
  arguments: Record<string, any>
}

export interface GenerationStatus {
  phase: 'idle' | 'queued' | 'connecting' | 'thinking' | 'generating' | 'searching' | 'playing' | 'speaking' | 'complete' | 'error' | 'stopped'
  text: string
}

/** 流式回调 */
export interface StreamCallbacks {
  onStatus?: (status: GenerationStatus) => void
  onToken: (token: string) => void
  onThinkingDelta?: (token: string) => void
  onThinkingEnd?: () => void
  onToolCall?: (toolCall: ToolCall) => void | Promise<void>
  onComplete: (fullText: string, toolCall?: ToolCall) => void | Promise<void>
  onError: (error: Error) => void
}

/** 模板引擎输出：完整的 DJ 开场 */
export interface DjIntroText {
  greeting: string // 问候语
  weatherScene: string // 天气场景描述
  moodSetup: string // 情绪铺垫
  fullText: string // 组合完整开场
}

/** 推荐结果 */
export interface RecommendResult {
  name: string
  singer?: string
  reason: string
  confidence: number // 0-1 推荐置信度
}

/** 城市搜索结果 */
export interface CitySearchResult {
  id: string
  name: string
  adm1: string
  adm2: string
  country: string
  displayLabel: string
}

/** 设置状态 */
export interface DjSettingsState {
  selectedModel: string
  customModelName: string
  activeModel: string
  baseUrl: string
  apiKey: string
  concurrencyLimit: number
  activeModelId: string
  modelList: ModelPreset[]

  localAiType?: 'ollama' | 'lmstudio' | 'custom'
  localAiHost?: string
  localAiModel?: string

  djPromptRole: string
  djPromptOpening: string
  djPromptSelection: string
  djPromptRecommendation: string
  djPromptProfileLearning: string

  chatPromptRole: string
  chatPromptOpening: string
  chatPromptSelection: string
  chatPromptRecommendation: string
  chatPromptProfileLearning: string

  ttsEngine: 'web-speech' | 'youdao-tts' | 'openai-tts' | 'azure-tts' | 'iflytek-tts' | 'volcengine-tts' | 'volcengine-v3-tts' | 'custom-tts'
  ttsApiKey: string
  ttsCustomUrl: string
  ttsLang: 'zh-CN' | 'en-US' | 'zh-TW'
  ttsVoice: string
  ttsAppId: string
  ttsRegion: string
  ttsResourceId?: string
  ttsSpeed: number
  ttsPitch: number
  enableChatSpeech: boolean
  enableDjSpeech: boolean
  duckingVolume: number

  autoContinue: boolean
  djAutoPlay: boolean

  weatherApiKey: string
  weatherApiHost: string
  city: string
}
