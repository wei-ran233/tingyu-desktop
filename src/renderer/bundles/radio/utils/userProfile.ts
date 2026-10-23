/** Local music preferences: explicit choices, favorites and effective listening. */
import { ref } from '@common/utils/vueTools'
import { getListMusics, getListMusicsFromCache } from '@renderer/store/list/action'
import { LIST_IDS } from '@common/constants'
import { addProfileLog } from '@renderer/bundles/radio/store'
import type { UserTasteProfile, MusicGenre, TimePeriod } from './types'
import { genreLabels, getGenreEvidence, getListeningPeriod, normalizeGenres, periodLabels, splitArtists, trackIdentity, type ListeningEvent } from './listeningProfile'

const PROFILE_STORAGE_KEY = 'lx_ai_user_profile_v1' // Preserve legacy data; it has no reliable timestamps.
const EVENTS_STORAGE_KEY = 'lx_ai_listening_events_v2'
const AI_SUMMARY_STORAGE_KEY = 'lx_ai_user_profile_summary_v1'
const USER_TAGS_STORAGE_KEY = 'lx_ai_user_tags_v1'
const RETENTION_MS = 90 * 86400000
const profileRevision = ref(0)
export const getFavoriteSongs = () => getListMusicsFromCache(LIST_IDS.LOVE)
export const refreshUserProfileFavorites = async() => {
  await getListMusics(LIST_IDS.LOVE)
  profileRevision.value++
}
interface UserTags { genres: string[], artists: string[], excludedGenres?: string[], excludedArtists?: string[] }
const cleanTags = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string').map(v => v.trim().slice(0, 100)).filter(Boolean))].slice(0, 40) : []
export const getUserTags = (): UserTags => {
  try {
    const data = JSON.parse(localStorage.getItem(USER_TAGS_STORAGE_KEY) ?? '{}')
    return { genres: cleanTags(data.genres), artists: cleanTags(data.artists), excludedGenres: cleanTags(data.excludedGenres), excludedArtists: cleanTags(data.excludedArtists) }
  } catch { return { genres: [], artists: [], excludedGenres: [], excludedArtists: [] } }
}
export const saveUserTags = (tags: UserTags) => {
  localStorage.setItem(USER_TAGS_STORAGE_KEY, JSON.stringify({ genres: cleanTags(tags.genres), artists: cleanTags(tags.artists), excludedGenres: cleanTags(tags.excludedGenres), excludedArtists: cleanTags(tags.excludedArtists) }))
  profileRevision.value++
}
export const setProfileTagExcluded = (type: 'artists' | 'genres', tag: string, excluded: boolean) => {
  const tags = getUserTags()
  const key = type === 'artists' ? 'excludedArtists' : 'excludedGenres'
  tags[key] = excluded ? [...new Set([...(tags[key] ?? []), tag])] : (tags[key] ?? []).filter(t => t !== tag)
  if (excluded) tags[type] = tags[type].filter(t => t !== tag)
  saveUserTags(tags)
}
const readEvents = (): ListeningEvent[] => {
  try {
    const data = JSON.parse(localStorage.getItem(EVENTS_STORAGE_KEY) ?? '{}')
    if (data.version !== 2 || !Array.isArray(data.events)) return []
    return data.events.filter((e: ListeningEvent) => e && typeof e.name === 'string' && typeof e.singer === 'string' && typeof e.sessionId === 'string' && Number.isFinite(e.at) && e.at <= Date.now() && e.at >= Date.now() - RETENTION_MS)
      .slice(-5000).map((e: ListeningEvent) => ({ ...e, genres: normalizeGenres(e.genres), genreHints: normalizeGenres(e.genreHints), period: getListeningPeriod(e.at) }))
  } catch { return [] }
}
/** Called only after an effective listen; tools must not record merely requesting playback. */
export const recordPlayedSong = (name: string, singer = '', options: { sessionId?: string, at?: number, track?: { name: string, meta?: { genre?: unknown } } } = {}) => {
  if (!name.trim()) return
  const events = readEvents()
  const sessionId = options.sessionId ?? crypto.randomUUID()
  if (events.some(e => e.sessionId === sessionId)) return
  const at = options.at ?? Date.now()
  const evidence = getGenreEvidence(options.track ?? { name })
  events.push({ sessionId, name: name.slice(0, 300), singer: singer.slice(0, 500), genres: evidence.genres, genreHints: evidence.hints, at, period: getListeningPeriod(at) })
  localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify({ version: 2, events: events.slice(-5000) }))
  profileRevision.value++
  addProfileLog(`有效收听：${name} · ${periodLabels[getListeningPeriod(at)]}`)
}

const genreKeywords: Record<MusicGenre, string[]> = {
  pop: ['流行', 'pop', 'Pop'],
  rock: ['摇滚', 'rock', 'Rock', '乐队', 'band'],
  'r&b': ['r&b', 'R&B', '节奏布鲁斯', 'rnb'],
  jazz: ['爵士', 'jazz', 'Jazz'],
  classical: ['古典', 'classical', '交响', '钢琴曲', '小提琴'],
  electronic: ['电子', 'electronic', '电音', 'dj', 'remix'],
  hiphop: ['嘻哈', 'hiphop', 'hip hop', 'rap', '说唱'],
  folk: ['民谣', 'folk', 'folk', '吉他'],
  ambient: ['氛围', 'ambient', '环境', '轻音乐', '纯音乐', 'new age'],
  citypop: ['citypop', 'city pop', '都市'],
  bossanova: ['bossanova', 'bossa nova', 'bossa'],
  acoustic: ['acoustic', '不插电', 'unplugged', '吉他'],
  chinese: ['国风', '古风', '民乐', '古筝', '二胡', '琵琶', '中国风'],
  kpop: ['kpop', 'k-pop', '韩流'],
  edm: ['edm', '电子舞曲', 'house', 'trance', 'dubstep'],
  country: ['country', '乡村', 'country'],
  blues: ['blues', '蓝调', '布鲁斯'],
  metal: ['metal', '金属', '重金属', '摇滚'],
}

// ─── 情绪标签推断（从歌名关键词） ──────────────────────

const moodKeywords: Array<{ mood: string, keywords: string[] }> = [
  { mood: '治愈', keywords: ['治愈', '温暖', '温柔', '心安', '拥抱', '暖'] },
  { mood: '燃', keywords: ['燃', '热血', '奋斗', '冲', '燃爆', '逆袭', '追梦'] },
  { mood: '伤感', keywords: ['伤', '泪', '离别', '遗憾', '痛', '孤独', '想念', '心碎'] },
  { mood: '欢快', keywords: ['快乐', '开心', '阳光', '欢', '跳', '舞', '恋爱', '甜蜜'] },
  { mood: '安静', keywords: ['安静', '夜深', '入睡', '放空', '冥想', '静'] },
  { mood: '励志', keywords: ['梦', '未来', '希望', '前行', '相信', '勇气', '加油'] },
]

/** 按歌名/歌手及可推断的情绪、曲风匹配，不使用随机生成的推荐文案。 */
export const matchesMusicPreference = (name: string, singer: string, query: string): boolean => {
  const filter = query.trim().toLowerCase()
  if (!filter) return true
  const text = `${name} ${singer}`.toLowerCase()
  if (text.includes(filter)) return true
  for (const [genre, keywords] of Object.entries(genreKeywords)) {
    if ((genre === filter || keywords.some(keyword => keyword.toLowerCase() === filter)) &&
      keywords.some(keyword => text.includes(keyword.toLowerCase()))) return true
  }
  return moodKeywords.some(({ mood, keywords }) =>
    (mood === filter || keywords.includes(filter)) && keywords.some(keyword => text.includes(keyword)),
  )
}


export const isMusicExcluded = (song: { name: string, singer: string, meta?: { genre?: unknown } }): boolean => {
  const tags = getUserTags()
  const artists = new Set((tags.excludedArtists ?? []).map(a => a.toLowerCase()))
  const genres = new Set(normalizeGenres(tags.excludedGenres))
  return splitArtists(song.singer).some(a => artists.has(a.toLowerCase())) || getGenreEvidence(song).genres.some(g => genres.has(g))
}

let cachedProfile: UserTasteProfile | null = null
let lastProfileKey = ''
export const analyzeUserProfile = (): UserTasteProfile => {
  // This dependency makes computed settings update when new listening evidence arrives.
  const revision = profileRevision.value
  const songs = getFavoriteSongs()
  const key = JSON.stringify([revision, songs, localStorage.getItem(EVENTS_STORAGE_KEY), localStorage.getItem(USER_TAGS_STORAGE_KEY), new Date().toDateString()])
  if (cachedProfile && key === lastProfileKey) return cachedProfile
  const tags = getUserTags()
  const events = readEvents()
  const blockedArtist = new Set((tags.excludedArtists ?? []).map(a => a.toLowerCase()))
  const blockedGenre = new Set([...(tags.excludedGenres ?? []), ...normalizeGenres(tags.excludedGenres).map(g => genreLabels[g])])
  const artists = new Map<string, { name: string, score: number, favorites: number, listens: number }>()
  const genres = new Map<MusicGenre, number>()
  const hints = new Set<MusicGenre>()
  const known = new Set<string>()
  const tracks = new Set<string>()
  const countedFavorites = new Set<string>()
  const playCounts: Record<string, number> = {}
  const periods = new Map<TimePeriod, Map<string, { name: string, singer: string, count: number, lastPlayedAt: number }>>()
  const addArtists = (singer: string, score: number, favorite: boolean) => {
    const names = splitArtists(singer)
    for (const name of names) {
      const id = name.toLowerCase()
      if (blockedArtist.has(id)) continue
      const entry = artists.get(id) ?? { name, score: 0, favorites: 0, listens: 0 }
      entry.score += score / names.length
      if (favorite) entry.favorites++
      else entry.listens++
      artists.set(id, entry)
    }
  }
  const addGenres = (name: string, singer: string, gs: MusicGenre[], hs: MusicGenre[], weight: number) => {
    const id = trackIdentity(name, singer)
    tracks.add(id)
    if (gs.length) known.add(id)
    for (const genre of gs) {
      if (!blockedGenre.has(genreLabels[genre])) genres.set(genre, (genres.get(genre) ?? 0) + weight / gs.length)
    }
    for (const hint of hs) if (!blockedGenre.has(genreLabels[hint])) hints.add(hint)
  }
  for (const song of songs) {
    const id = trackIdentity(song.name, song.singer)
    if (countedFavorites.has(id)) continue
    countedFavorites.add(id)
    addArtists(song.singer, 2, true)
    const evidence = getGenreEvidence(song)
    addGenres(song.name, song.singer, evidence.genres, evidence.hints, 2)
  }
  for (const event of events) {
    const weight = Math.pow(0.5, (Date.now() - event.at) / (30 * 86400000))
    addArtists(event.singer, weight, false)
    addGenres(event.name, event.singer, event.genres, event.genreHints, weight)
    const legacyKey = event.singer ? `${event.singer} - ${event.name}` : event.name
    playCounts[legacyKey] = (playCounts[legacyKey] ?? 0) + 1
    const group = periods.get(event.period) ?? new Map()
    const id = trackIdentity(event.name, event.singer)
    const song = group.get(id) ?? { name: event.name, singer: event.singer, count: 0, lastPlayedAt: 0 }
    song.count++
    song.lastPlayedAt = Math.max(song.lastPlayedAt, event.at)
    group.set(id, song)
    periods.set(event.period, group)
  }
  const automaticArtists = [...artists.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 8)
  const sortedGenres = [...genres.entries()].sort((a, b) => b[1] - a[1])
  const totalGenres = sortedGenres.reduce((sum, [, value]) => sum + value, 0) || 1
  const totalArtists = [...artists.values()].reduce((sum, a) => sum + a.score, 0) || 1
  const profile: UserTasteProfile = {
    topArtists: [...new Set([...tags.artists.filter(a => !blockedArtist.has(a.toLowerCase())), ...automaticArtists.map(a => a.name)])].slice(0, 8),
    topGenres: [...new Set([...normalizeGenres(tags.genres), ...sortedGenres.map(([g]) => g)])].filter(g => !blockedGenre.has(genreLabels[g])).slice(0, 8),
    genreTags: [...new Set([...tags.genres, ...sortedGenres.map(([g]) => genreLabels[g])])].filter(g => !blockedGenre.has(g)).slice(0, 8),
    genreDistribution: sortedGenres.slice(0, 5).map(([g, score]) => ({ name: genreLabels[g], percent: Math.round(score / totalGenres * 100) })),
    artistDistribution: automaticArtists.map(a => ({ name: a.name, percent: Math.round(a.score / totalArtists * 100) })),
    sampleCount: countedFavorites.size,
    automaticArtists,
    inferredGenreTags: [...hints].filter(g => !genres.has(g)).map(g => genreLabels[g]),
    knownGenreCount: known.size,
    analyzedSongCount: tracks.size,
    listeningCount: events.length,
    timePeriodSongs: (Object.keys(periodLabels) as TimePeriod[]).map(period => ({ period, label: periodLabels[period], songs: [...(periods.get(period)?.values() ?? [])].sort((a, b) => b.count - a.count || b.lastPlayedAt - a.lastPlayedAt).slice(0, 5) })),
    moodTags: [],
    langTags: [],
    playCounts,
    lastAnalyzedTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }
  cachedProfile = profile
  lastProfileKey = key
  return profile
}

export const getUserProfilePromptString = (): string => {
  const profile = analyzeUserProfile()
  const tags = getUserTags()
  const period = profile.timePeriodSongs.find(p => p.period === getListeningPeriod())
  const parts = ['【音乐偏好（本地证据；优先满足用户本轮明确要求）】']
  if (profile.topArtists.length) parts.push(`收藏或有效收听较多的歌手：${profile.topArtists.join('、')}`)
  if (profile.genreTags.length) parts.push(`明确设置或歌曲标签支持的曲风：${profile.genreTags.join('、')}`)
  if (period?.songs.length) parts.push(`当前时段常听（仅用于理解偏好，避免反复推荐相同歌曲）：${period.songs.map(s => `${s.name} / ${s.singer}`).join('；')}`)
  if (tags.excludedArtists?.length) parts.push(`不推荐歌手：${tags.excludedArtists.join('、')}`)
  if (tags.excludedGenres?.length) parts.push(`不推荐曲风：${tags.excludedGenres.join('、')}`)
  if (parts.length === 1) parts.push('偏好数据不足，请根据当前请求推荐，不要假设个人偏好。')
  return parts.join('\n')
}

/** Learned period genres only; no hard-coded time-of-day taste. */
export const getTimePeriodRecommendation = (): { period: TimePeriod, label: string, genres: string[] } => {
  const period = getListeningPeriod()
  const weights = new Map<MusicGenre, number>()
  for (const event of readEvents().filter(e => e.period === period)) for (const genre of event.genres) weights.set(genre, (weights.get(genre) ?? 0) + 1)
  const blocked = new Set(getUserTags().excludedGenres ?? [])
  return { period, label: periodLabels[period], genres: [...weights.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => genreLabels[g]).filter(g => !blocked.has(g)).slice(0, 5) }
}

// Legacy summaries are kept for recovery but no longer injected as psychological traits.
export const getAiProfileSummary = (): string => localStorage.getItem(AI_SUMMARY_STORAGE_KEY) ?? ''
export const saveAiProfileSummary = (summary: string) => { localStorage.setItem(AI_SUMMARY_STORAGE_KEY, summary) }
export const getLegacyProfileAvailable = (): boolean => !!localStorage.getItem(PROFILE_STORAGE_KEY)
