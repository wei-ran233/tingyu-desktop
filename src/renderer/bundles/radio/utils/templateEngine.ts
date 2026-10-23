/**
 * 本地模板引擎（Template Engine）
 *
 * 核心功能：在无需 LLM API 的情况下，基于规则（时间、天气、用户偏好）
 * 生成有质量的电台内容、推荐语和问候。
 *
 * 当用户配置了 API Key 时，LLM 层优先使用此引擎作为降级方案。
 */

import { analyzeUserProfile, matchesMusicPreference, isMusicExcluded, getFavoriteSongs } from '@renderer/bundles/radio/utils/userProfile'
import { djSettings } from '@renderer/bundles/radio/store'
import type { DjMode, TimePeriod, WeatherType, MusicGenre, DjIntroText, RecommendResult } from './types'

// ─── 时段检测 ───────────────────────────────────────────

export const getTimePeriod = (): TimePeriod => {
  const h = new Date().getHours()
  if (h >= 5 && h < 7) return 'dawn'
  if (h >= 7 && h < 11) return 'morning'
  if (h >= 11 && h < 13) return 'noon'
  if (h >= 13 && h < 18) return 'afternoon'
  if (h >= 18 && h < 21) return 'evening'
  if (h >= 21 && h < 24) return 'night'
  return 'lateNight'
}

export const getTimePeriodLabel = (p: TimePeriod): string => {
  const map: Record<TimePeriod, string> = {
    dawn: '清晨',
    morning: '早晨',
    noon: '正午',
    afternoon: '下午',
    evening: '傍晚',
    night: '夜晚',
    lateNight: '深夜',
  }
  return map[p]
}

// ─── 天气类型检测 ───────────────────────────────────────

export const detectWeatherType = (weatherText: string): WeatherType => {
  const w = weatherText.toLowerCase()
  if (w.includes('雨') || w.includes('rain') || w.includes('drizzle') || w.includes('thunder')) return 'rainy'
  if (w.includes('雪') || w.includes('snow') || w.includes('sleet')) return 'snowy'
  if (w.includes('云') || w.includes('cloud') || w.includes('阴') || w.includes('overcast')) return 'cloudy'
  if (w.includes('夜') || w.includes('night') || w.includes('晚')) return 'night'
  return 'sunny'
}

// ─── 1. 时段问候语模板 ─────────────────────────────────

const greetingTemplates: Record<DjMode, Partial<Record<TimePeriod, string[]>>> = {
  dj: {
    dawn: [
      '清晨的第一缕阳光刚刚升起，我是你的 AI 音乐 DJ，为你送上今日的早安旋律。',
      '破晓时分，万物苏醒。这里是听域 AI 音乐调频，用一首温暖的歌唤醒你的耳朵。',
    ],
    morning: [
      '☀早上好！这里是听域 AI 音乐调频，为你开启今日的好心情。',
      '阳光正好，微风不燥。我是你的 AI 音乐 DJ，准备了一份元气满满的歌单。',
      '早安！新的一天已经开始，让我用音乐为你注入满满活力。',
    ],
    noon: [
      '正午时分，该休息一下了。我是你的 AI 音乐 DJ，陪你度过午间时光。',
      '☕ 午安，来杯咖啡，戴上耳机，让音乐陪你度过这个午后。',
    ],
    afternoon: [
      '下午好，我是你的 AI 音乐 DJ。愿这段旋律能为你带来一份轻松惬意。',
      '午后的时光最适合放空，让音乐成为你此刻的背景色。',
    ],
    evening: [
      '傍晚时分，天边的晚霞正美。我是 AI 音乐 DJ，陪你一起告别今天。',
      '落日余晖，华灯初上。用一首歌的时间，让心情慢慢沉淀。',
    ],
    night: [
      '晚上好，夜色已深。我是你的 AI 音乐 DJ，为你播送夜间情绪特调。',
      '✨ 夜幕降临，星光点点。这里有一份为你准备的夜间歌单，请查收。',
      '晚安调频现在开始，让温柔的旋律陪你度过这个夜晚。',
    ],
    lateNight: [
      '深夜了，还没睡吗？我是你的 AI 音乐 DJ，用音乐陪你守夜。',
      '⭐ 凌晨的时光格外安静，特别适合听一些走心的旋律。',
    ],
  },
  chat: {
    dawn: [
      '这么早就醒了呀，今天有什么计划吗？让我陪你一起迎接清晨吧。',
      '清晨的空气最清新，你现在心情如何？',
    ],
    morning: [
      '早上好！今天有什么想聊的？或者想听点什么样的音乐？',
      '☀早安！新的一天开始了，想和我聊聊今天的计划吗？',
    ],
    noon: [
      '午安！午饭吃了吗？想听点什么还是想聊聊今天的事？',
      '☕ 中午好，休息时间到！有什么想聊的或者想听的歌吗？',
    ],
    afternoon: [
      '下午好！今天过得怎么样？想和我聊聊还是想听点音乐？',
      '午后的时光最适合聊天了，你今天遇到了什么有趣的事吗？',
    ],
    evening: [
      '傍晚好！一天的工作结束了，来聊聊今天的心情吧。',
      '下班路上辛苦了，想听首歌放松一下吗？',
    ],
    night: [
      '晚上好！结束了一天的工作，来聊聊今晚的心情吧。',
      '夜深了，今天的你过得怎么样？有什么想和我分享的吗？',
    ],
    lateNight: [
      '这么晚还没睡，是有心事还是舍不得结束这一天？',
      '深夜是和自己对话的最好时间，想聊聊什么吗？',
    ],
  },
}

// ─── 2. 天气场景模板 ───────────────────────────────────

const weatherSceneTemplates: Record<WeatherType, string[]> = {
  sunny: [
    '窗外阳光明媚，微风轻拂，这样的好天气最适合听一首轻快的旋律了。',
    '晴空万里，阳光洒在窗台上，仿佛每一缕光线都在打着节拍。',
    '今日天气晴好，阳光透过树叶洒下斑驳的光影，是让人心情愉悦的一天。',
  ],
  rainy: [
    '窗外飘着细雨，空气里弥漫着湿润的泥土气息，这样的天气特别适合听一些有故事感的歌。',
    '雨滴敲打着窗户，像是大自然在演奏一首舒缓的钢琴曲。',
    '下雨天，把世界关在窗外，让音乐成为你最好的陪伴。',
  ],
  snowy: [
    '雪花纷纷扬扬地飘落，整个世界都安静了下来，仿佛只剩下音乐和你。',
    '银装素裹的世界里，每一片雪花都在为这个冬天配乐。',
  ],
  cloudy: [
    '天空有些阴沉，但这样的天气反而最适合窝在沙发里，戴上耳机，让音乐填满整个空间。',
    '云层低垂，微风不燥，这样的天气最适合听一些有氛围感的音乐。',
  ],
  night: [
    '夜色温柔，星光点点，城市的灯火在远处闪烁。',
    '夜空如墨，远处的霓虹灯为这个城市画上了温柔的妆容。',
  ],
  unknown: [
    '不管外面的天气如何，这里有音乐，就有一份好心情。',
    '天气变幻莫测，但好音乐永远不会缺席。',
  ],
}

// ─── 3. 情绪铺垫模板 ───────────────────────────────────

const moodSetupTemplates: Record<DjMode, Partial<Record<TimePeriod, string[]>>> = {
  dj: {
    morning: [
      '为你精选了一首元气满满的歌曲，希望能给你带来一天的好心情。',
      '用一首充满活力的歌开启今天的旅程吧。',
    ],
    afternoon: [
      '选一首轻柔的旋律，希望能帮你赶走午后的小困倦。',
      '来一首轻松惬意的歌，让下午的时光慢下来。',
    ],
    evening: [
      '用一首歌的时间，让今天的疲惫随着旋律慢慢消散。',
      '天色渐暗，来一首温暖的歌，给今天画上圆满的句号。',
    ],
    night: [
      '夜深人静时，最能听出歌曲里的故事。',
      '选一首温柔的歌，伴你度过这个宁静的夜晚。',
    ],
    lateNight: [
      '深夜的旋律最有穿透力，希望这首歌能触动你的心弦。',
      '凌晨的时光，每一首歌都像是一个老朋友在轻声诉说。',
    ],
  },
  chat: {},
}

// ─── 4. 推荐理由模板 ───────────────────────────────────

const byGenreTemplates: Record<string, string> = {
  pop: '这首流行歌曲旋律朗朗上口，节奏轻快，很适合现在的心情。',
  rock: '摇滚的力量总是能直击人心，这首歌的编曲非常有张力。',
  'r&b': 'R&B 的律动感总能让人不自觉地跟着摇摆，这首歌的转音尤其迷人。',
  jazz: '爵士乐的即兴与自由，就像此刻不需要被定义的时光。',
  classical: '古典音乐的魅力在于，每一次聆听都能发现新的细节与感动。',
  electronic: '电子音乐的律动感很强，能带你进入一个充满想象力的空间。',
  hiphop: '这首歌的节奏和 flow 都很棒，歌词也很有态度。',
  folk: '民谣总是充满了故事感，每一句歌词都像在讲述一个真实的故事。',
  ambient: '氛围音乐像是一幅用声音绘制的画，能带你进入深度放松的状态。',
  citypop: 'CityPop 的复古质感让人仿佛置身于都市的霓虹灯下，既浪漫又时尚。',
  bossanova: 'Bossa Nova 的慵懒节奏，像是巴西海滩上的一阵微风，让人心旷神怡。',
  acoustic: '不插电的编曲让音乐回归最纯粹的样子，吉他的每一个和弦都清晰可辨。',
  chinese: '国风音乐的意境之美，在于它用音符勾勒出了一幅幅山水画卷。',
  kpop: 'K-Pop 的编曲总是充满巧思，副歌部分让人一听就上瘾。',
  edm: 'EDM 的节奏让人忍不住想跟着律动，释放一整天的压力。',
}

const byWeatherTemplates: Record<string, string> = {
  sunny: '阳光正好，这首歌的旋律就像窗外的阳光一样明媚温暖。',
  rainy: '雨天的氛围和这首歌的意境很搭，让人沉浸在一种安静的情绪里。',
  snowy: '雪天的静谧与这首歌的气质完美契合，像是一首写给冬天的情诗。',
  cloudy: '阴天的慵懒配上这首歌的节奏，一切都刚刚好。',
  night: '夜晚的静谧让这首歌的细节更加动人，可以听到之前忽略的很多小细节。',
}

const byTimeTemplates: Record<string, string> = {
  morning: '早晨听这首歌，感觉整个人都充满了活力，节奏感刚刚好。',
  afternoon: '午后的时光里，这首歌的旋律像是一杯温热的茶，暖到心里。',
  evening: '傍晚时分听这首歌，仿佛能看到夕阳慢慢沉入地平线的画面。',
  night: '深夜听这首歌，感觉整个世界都安静了下来，只剩下旋律在流淌。',
  lateNight: '凌晨的时光里，这首歌有一种特别的治愈力，能抚平一天的疲惫。',
}

const genericReasonTemplates = [
  '这首歌的旋律很有画面感，让人一听就忍不住单曲循环。',
  '歌手的声音非常有辨识度，每一个音符都充满了情感。',
  '这首歌的编曲层次非常丰富，每听一遍都能发现新的细节。',
  '推荐这首歌给你，希望它能成为你今天的背景音乐。',
  '这首歌的歌词写得特别好，每一句都值得细细品味。',
  '无论是在通勤路上还是独处时，这首歌都是绝佳的陪伴。',
  '前奏一响，故事感就来了，很适合此刻的氛围。',
  '它的节奏不紧不慢，刚好能给现在的心情留出呼吸的空间。',
  '副歌部分特别有记忆点，听一次就会在脑海里停留很久。',
  '这首歌像是一杯温热的饮品，慢慢喝才最有味道。',
  '编曲里藏着很多小心思，戴上耳机才能听出其中的质感。',
  '如果你此刻想找个情绪的出口，这首歌就是最好的引子。',
  '歌手把情绪拿捏得恰到好处，值得反复品味。',
  '这首歌像是为当下的时刻量身定做，一切刚刚好。',
]

// ─── 5. 建议标签模板 ───────────────────────────────────

const suggestionTemplates: Record<DjMode, string[]> = {
  dj: [
    '推荐一首好听的歌',
    '随便听听，随机播放',
    '来点摇滚',
    '听点纯音乐',
    '推荐最近热门歌曲',
    '来一首治愈系的歌',
    '推荐一首经典老歌',
    '想要节奏感强的歌',
  ],
  chat: [
    '聊聊今天的心情',
    '推荐几首适合放松的歌',
    '☕ 推荐一首适合下午听的歌',
    '推荐一首适合夜晚的歌',
    '推荐一首最近很火的歌',
    '帮我推荐一首励志歌曲',
  ],
}

// ─── 工具函数 ───────────────────────────────────────────

/** 从数组中随机选取一个元素 */
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

// ─── 公开 API ───────────────────────────────────────────

/**
 * 生成 DJ 或聊天模式的问候语
 */
export const generateGreeting = (mode: DjMode, weatherStr?: string): string => {
  const period = getTimePeriod()
  const templates = greetingTemplates[mode]?.[period]
  if (!templates || templates.length === 0) {
    return mode === 'dj'
      ? '欢迎来到听域 AI 音乐调频，我是你的专属音乐 DJ'
      : '你好，我是你的音乐知心伙伴'
  }
  let greeting = pick(templates)

  // 如果是 DJ 模式，末尾加上城市问候
  if (mode === 'dj') {
    const city = djSettings.city || '北京'
    greeting = greeting.replace(/为你/, `为${city}的你`)
  }

  return greeting
}

/**
 * 生成天气场景描述
 */
export const generateWeatherScene = (weatherStr?: string): string => {
  if (!weatherStr) return ''
  const type = detectWeatherType(weatherStr)
  const templates = weatherSceneTemplates[type] || weatherSceneTemplates.unknown
  return pick(templates)
}

/**
 * 生成情绪铺垫
 */
export const generateMoodSetup = (mode: DjMode): string => {
  if (mode === 'chat') return ''
  const period = getTimePeriod()
  const templates = moodSetupTemplates.dj[period]
  if (!templates || templates.length === 0) return ''
  return pick(templates)
}

/**
 * 生成完整的 DJ 开场文本
 */
export const buildDjIntroText = (mode: DjMode, weatherStr?: string): DjIntroText => {
  const greeting = generateGreeting(mode, weatherStr)
  const weatherScene = generateWeatherScene(weatherStr)
  const moodSetup = generateMoodSetup(mode)
  const parts = [greeting, weatherScene, moodSetup].filter(Boolean)
  return {
    greeting,
    weatherScene,
    moodSetup,
    fullText: parts.join(' '),
  }
}

/**
 * 生成推荐理由
 */
export const getMusicRecommendReason = (
  singer?: string,
  genre?: MusicGenre,
  weatherType?: WeatherType,
  timePeriod?: TimePeriod,
): string => {
  // 按优先级组合：曲风 > 天气 > 时段 > 通用
  const reasons: string[] = []

  if (genre && byGenreTemplates[genre]) {
    reasons.push(byGenreTemplates[genre])
  }

  if (weatherType && byWeatherTemplates[weatherType]) {
    reasons.push(byWeatherTemplates[weatherType])
  }

  if (timePeriod && byTimeTemplates[timePeriod]) {
    reasons.push(byTimeTemplates[timePeriod])
  }

  if (reasons.length > 0) {
    return reasons.join(' ')
  }

  return pick(genericReasonTemplates)
}

/**
 * 生成建议标签（完全本地，无需 API）
 */
export const generateSuggestChips = (mode: DjMode, weatherStr?: string): string[] => {
  const base = [...suggestionTemplates[mode]]
  const period = getTimePeriod()
  const weatherType = weatherStr ? detectWeatherType(weatherStr) : 'unknown'

  // 根据时段追加上下文标签
  if (period === 'morning') base.push('☀来点元气满满的歌')
  if (period === 'afternoon') base.push('☕ 推荐一首适合下午听的歌')
  if (period === 'evening') base.push('推荐一首下班听的歌')
  if (period === 'night' || period === 'lateNight') base.push('推荐一首适合深夜听的歌')

  // 根据天气追加上下文标签
  if (weatherType === 'rainy') base.push('推荐一首适合雨天听的歌')
  if (weatherType === 'snowy') base.push('❄推荐一首适合雪天听的歌')
  if (weatherType === 'sunny') base.push('☀推荐一首适合晴天听的歌')

  // 如果有用户画像，追加个性化标签
  const profile = analyzeUserProfile()
  if (profile.topArtists.length > 0) {
    base.push(`来一首 ${profile.topArtists[0]} 的歌`)
    if (profile.topArtists.length > 1) {
      base.push(`来一首 ${profile.topArtists[1]} 的歌`)
    }
  }

  // 去重后返回前 6 个
  return [...new Set(base)].slice(0, 6)
}

/**
 * 从用户喜爱歌单中推荐歌曲（基于规则）
 * 返回 [{ name, singer, reason, confidence }]
 */
export const recommendFromLoveList = (
  weatherType?: WeatherType,
  mode: DjMode = 'dj',
  options: { query?: string, limit?: number } = {},
): RecommendResult[] => {
  const songs = getFavoriteSongs()
  if (songs.length === 0) return []

  const period = getTimePeriod()
  const wt = weatherType ?? 'unknown'
  const profile = analyzeUserProfile()
  const topArtistsSet = new Set(profile.topArtists.map(a => a.toLowerCase()))

  // 多维评分：偏好歌手 + 历史播放频次 + 天气/时段关键词匹配度
  const scored = songs.filter((song: any) => !isMusicExcluded(song) && matchesMusicPreference(song.name || '', song.singer || '', options.query ?? '')).map((song: any) => {
    let score = 0.5 // 基础分
    const name = String(song.name || '').toLowerCase()
    const singer = String(song.singer || '').toLowerCase()
    const playKey = song.singer ? `${song.singer} - ${song.name}` : song.name
    const playCount = profile.playCounts?.[playKey] || 0

    if (singer && topArtistsSet.has(singer)) score += 0.2
    if (playCount > 0) score += Math.min(0.15, playCount * 0.03)
    if (wt === 'rainy' && /(雨|静|柔|夜|慢|folk|民谣)/.test(name)) score += 0.15
    if (wt === 'sunny' && /(晴|阳光|夏|风|pop|快乐)/.test(name)) score += 0.15
    if ((period === 'night' || period === 'lateNight') && /(夜|晚|星|月|眠|静)/.test(name)) score += 0.15
    if (period === 'morning' && /(早|晨|光|醒|日)/.test(name)) score += 0.15

    return { song, score, tieBreaker: Math.random() }
  })

  // 仅在同分歌曲之间随机排序，保留偏好与场景评分的优先级。
  scored.sort((a: any, b: any) => b.score - a.score || a.tieBreaker - b.tieBreaker)
  const limit = Number.isFinite(options.limit) ? Math.min(10, Math.max(1, Math.floor(options.limit!))) : 5
  const sampled = scored.slice(0, limit)

  return sampled.map((item: any) => {
    const s = item.song
    const reason = getMusicRecommendReason(s.singer, undefined, wt, period)
    return {
      name: s.name || '',
      singer: s.singer || '',
      reason,
      confidence: Math.min(1, item.score + 0.3),
    }
  })
}

/**
 * 为 AI 回复生成串词
 * 当 LLM 响应中未包含推荐理由时，用模板补充
 */
export const generateDjCommentary = (
  songName: string,
  singer?: string,
  weatherType?: WeatherType,
): string => {
  const wt = weatherType ?? 'unknown'
  const period = getTimePeriod()
  const reason = getMusicRecommendReason(singer, undefined, wt, period)
  const artist = singer ? `，来自 ${singer}` : ''
  const artistShort = singer ? `（${singer}）` : ''

  const templates = [
    `接下来为您播送《${songName}》${artist}。${reason}`,
    `让我把这首《${songName}》${artistShort}送给你。${reason}`,
    `特别推荐这首《${songName}》${artistShort}。${reason}`,
    `此刻，让我们一同聆听《${songName}》${artistShort}。${reason}`,
    `调频到这里，为 ${getTimePeriodLabel(period)}的您带来《${songName}》${artistShort}。${reason}`,
    `这一首《${songName}》${artistShort}，我想正合您此刻的心境。${reason}`,
    `把耳朵交给这首《${songName}》${artistShort}吧。${reason}`,
    `为您特别编排的下一首——《${songName}》${artistShort}。${reason}`,
  ]

  return pick(templates)
}

/**
 * 为聊天模式生成推荐回复
 */
export const generateChatRecommendation = (
  query: string,
  songName: string,
  singer?: string,
): string => {
  const artist = singer ? `（${singer}）` : ''
  const templates = [
    `听到你提到"${query}"，我想到了一首特别适合的歌——《${songName}》${artist}，希望能触动你的心。`,
    `关于"${query}"，我推荐你听听《${songName}》${singer ? `— ${singer} ` : ''}，这首歌的意境很契合。`,
    `说到"${query}"，我脑海里立刻浮现出《${songName}》${artist}，希望你会喜欢。`,
    `聊到"${query}"，这首《${songName}》${artist}忽然浮上心头，很适合此刻的你。`,
    `如果用一个旋律来形容"${query}"，我想非《${songName}》${artist}莫属了。`,
    `关于"${query}"的情绪，让我用这首《${songName}》${artist}来回应你。`,
  ]
  return pick(templates)
}
