import { markRaw } from '@common/utils/vueTools'
import musicSdk from '@renderer/utils/musicSdk'
import { toNewMusicInfo } from '@renderer/utils'
import { getPicPath } from '@renderer/core/music'
import { handlePlay, playNext, playPrev, pause } from '@renderer/core/player'
import { setPlayMusicInfo } from '@renderer/store/player/action'
import { playInfo } from '@renderer/store/player/state'
import { addListMusics } from '@renderer/store/list/action'
import { LIST_IDS } from '@common/constants'
import { recommendFromLoveList } from '@renderer/bundles/radio/utils/templateEngine'
import type { MusicCard, WeatherType, DjMode, GenerationStatus } from '@renderer/bundles/radio/utils/types'

const isNonOriginal = (name: string, singer?: string): boolean => {
  const text = `${name} ${singer ?? ''}`
  return /(翻唱|翻自|\bcover\b|\blive\b|现场|伴奏|instrumental|remix|DJ版|官方版MV|演奏版|合唱版|对唱版)/i.test(text)
}

export const normalizeSongName = (name = ''): string => name.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')

export const songIdentity = (song: { name?: string }): string => normalizeSongName(song.name)

const pickBestOriginal = (results: any[], keyword: string, singerHint?: string): any => {
  if (!results?.length) return null
  const candidates: any[] = []
  for (const r of results) {
    if (r?.list?.length) candidates.push(...r.list)
  }
  if (!candidates.length) return null
  // A search hit is not proof of a match. Reject unrelated titles and covers.
  const title = normalizeSongName(keyword)
  const artist = normalizeSongName(singerHint)
  return candidates.find(c => normalizeSongName(c.name) === title &&
    (!artist || normalizeSongName(c.singer).includes(artist)) && !isNonOriginal(c.name, c.singer)) ?? null
}

interface MusicSearchCacheEntry {
  data: LX.Music.MusicInfo | null
  expiresAt: number
}

const MUSIC_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000
const MUSIC_SEARCH_CACHE_MAX_SIZE = 80
const musicSearchCache = new Map<string, MusicSearchCacheEntry>()
const pendingMusicSearches = new Map<string, Promise<LX.Music.MusicInfo | null>>()

const getMusicSearchCacheKey = (kw: string, singer?: string) => {
  return `${kw.trim().toLowerCase()}::${(singer ?? '').trim().toLowerCase()}`
}

const getCachedMusicSearch = (key: string): MusicSearchCacheEntry | null => {
  const entry = musicSearchCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    musicSearchCache.delete(key)
    return null
  }
  return entry
}

const setCachedMusicSearch = (key: string, data: LX.Music.MusicInfo | null) => {
  musicSearchCache.set(key, {
    data,
    expiresAt: Date.now() + MUSIC_SEARCH_CACHE_TTL_MS,
  })
  if (musicSearchCache.size > MUSIC_SEARCH_CACHE_MAX_SIZE) {
    const firstKey = musicSearchCache.keys().next().value
    if (firstKey) musicSearchCache.delete(firstKey)
  }
}

const doSearchMusicTrack = async(kw: string, singerHint?: string): Promise<LX.Music.MusicInfo | null> => {
  const results = await musicSdk.searchMusic({ name: kw, singer: singerHint ?? '', source: undefined, limit: 5 })
  const topSong = pickBestOriginal(results, kw, singerHint)
  if (topSong) {
    const musicInfo = toNewMusicInfo(topSong)
    try {
      const picUrl = await getPicPath({ musicInfo })
      if (picUrl) musicInfo.meta.picUrl = picUrl
    } catch { /* ignore */ }
    return markRaw(musicInfo)
  }
  return null
}

export async function searchMusicTrack(kw: string, singerHint?: string): Promise<LX.Music.MusicInfo | null> {
  kw = kw.trim()
  singerHint = singerHint?.trim()
  if (!kw) return null
  const cacheKey = getMusicSearchCacheKey(kw, singerHint)
  const cached = getCachedMusicSearch(cacheKey)
  if (cached) return cached.data

  const pending = pendingMusicSearches.get(cacheKey)
  if (pending) return pending

  const promise = doSearchMusicTrack(kw, singerHint).then((result) => {
    setCachedMusicSearch(cacheKey, result)
    return result
  }).catch((err) => {
    // 网络失败不缓存，允许用户立即重试；正常的空结果仍使用 TTL。
    console.error('[ToolExecutor] 搜歌异常:', err)
    return null
  }).finally(() => {
    pendingMusicSearches.delete(cacheKey)
  })
  pendingMusicSearches.set(cacheKey, promise)
  return promise
}

export async function playMusicTrack(musicInfo: LX.Music.MusicInfo) {
  const currentListId = playInfo.playerListId
  if (currentListId && currentListId !== LIST_IDS.PLAY_LATER) {
    await addListMusics(currentListId, [musicInfo])
    setPlayMusicInfo(currentListId, musicInfo, false)
    handlePlay()
    return
  }
  setPlayMusicInfo(LIST_IDS.PLAY_LATER, musicInfo, true)
  handlePlay()
}

export interface ToolExecutionContext {
  weatherType?: WeatherType
  mode?: DjMode
  onStatus?: (status: GenerationStatus) => void
  signal?: AbortSignal
  onFoundMusicCard?: (card: MusicCard) => void
  excludedSongNames?: Set<string>
}

/**
 * 执行 AI 工具调用并返回结构化结果供大模型继续推理
 */
export async function executeToolAction(
  name: string,
  args: any,
  context?: ToolExecutionContext,
): Promise<Record<string, any>> {
  switch (name) {
    case 'search_and_play': {
      const { keyword, singer, reason, immediatePlay } = args
      const musicInfo = await searchMusicTrack(keyword, singer)
      if (context?.signal?.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' })
      if (!musicInfo) {
        return {
          found: false,
          keyword,
          singer,
          message: `未能在音乐库中找到歌曲《${keyword}》${singer ? ` - ${singer}` : ''}`,
        }
      }

      const identity = songIdentity(musicInfo)
      if (context?.excludedSongNames?.has(identity)) {
        return { found: false, keyword, message: '这首歌曲已经推荐过，请选择另一首大众熟悉的不同歌曲' }
      }
      context?.excludedSongNames?.add(identity)
      const card: MusicCard = {
        track: markRaw(musicInfo),
        name: musicInfo.name,
        singer: musicInfo.singer,
        reason: reason || '',
        pic: musicInfo.meta?.picUrl ?? undefined,
        source: musicInfo.source,
        id: musicInfo.id,
      }

      let played = false
      let playbackError: string | undefined
      if (immediatePlay === true) {
        context?.onStatus?.({ phase: 'playing', text: '正在准备播放歌曲' })
        try {
          await playMusicTrack(musicInfo)
          played = true
        } catch (playErr: any) {
          playbackError = playErr.message || '播放失败'
        }
      }

      card.played = played
      context?.onFoundMusicCard?.(card)

      return {
        found: true,
        name: musicInfo.name,
        singer: musicInfo.singer,
        source: musicInfo.source,
        reason: reason || '精选推荐',
        played,
        playbackError,
      }
    }

    case 'get_user_favorites': {
      const weatherType = context?.weatherType ?? 'sunny'
      const mode = context?.mode ?? 'dj'
      const limit = Number.isFinite(args.limit) ? Math.min(10, Math.max(1, Math.floor(args.limit))) : 5
      const selected = recommendFromLoveList(weatherType, mode, {
        query: typeof args.moodOrGenre === 'string' ? args.moodOrGenre : '',
        limit,
      })

      return {
        count: selected.length,
        songs: selected.map(s => ({
          name: s.name,
          singer: s.singer,
          reason: s.reason,
        })),
      }
    }

    case 'control_player': {
      const action = args.action
      switch (action) {
        case 'play':
          handlePlay()
          return { success: true, action: 'play', message: '已继续播放音乐' }
        case 'pause':
          pause()
          return { success: true, action: 'pause', message: '已暂停音乐播放' }
        case 'next':
          await playNext(true)
          return { success: true, action: 'next', message: '已切换至下一首歌曲' }
        case 'prev':
          await playPrev(true)
          return { success: true, action: 'prev', message: '已切换至上一首歌曲' }
        default:
          return { success: false, action, message: `不支持的操作: ${action}` }
      }
    }

    default:
      throw new Error(`未知的工具名称: ${name}`)
  }
}
