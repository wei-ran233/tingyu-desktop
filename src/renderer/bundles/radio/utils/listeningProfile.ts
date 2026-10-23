import type { MusicGenre, TimePeriod } from './types'

export interface ListeningEvent {
  sessionId: string
  name: string
  singer: string
  genres: MusicGenre[]
  genreHints: MusicGenre[]
  at: number
  period: TimePeriod
}

export const periodLabels: Record<TimePeriod, string> = {
  dawn: '清晨 05–07',
  morning: '上午 07–11',
  noon: '中午 11–13',
  afternoon: '下午 13–18',
  evening: '傍晚 18–21',
  night: '夜间 21–24',
  lateNight: '凌晨 00–05',
}
export const getListeningPeriod = (at = Date.now()): TimePeriod => {
  const h = new Date(at).getHours()
  if (h < 5) return 'lateNight'
  if (h < 7) return 'dawn'
  if (h < 11) return 'morning'
  if (h < 13) return 'noon'
  if (h < 18) return 'afternoon'
  if (h < 21) return 'evening'
  return 'night'
}
export const splitArtists = (singer: string): string[] => [...new Set(singer.split(/\s*(?:、|;|；|\sfeat\.?\s|\sfeaturing\s|\s&\s)\s*/i).map(s => s.trim()).filter(Boolean))]
export const trackIdentity = (name: string, singer = '') => `${name.normalize('NFKC').trim().toLowerCase()}|${splitArtists(singer).map(s => s.normalize('NFKC').toLowerCase()).sort().join('|')}`

export const genreLabels: Record<MusicGenre, string> = {
  pop: '流行',
  rock: '摇滚',
  'r&b': 'R&B',
  jazz: '爵士',
  classical: '古典',
  electronic: '电子',
  hiphop: '嘻哈',
  folk: '民谣',
  country: '乡村',
  blues: '蓝调',
  metal: '金属',
  ambient: '氛围音乐',
  citypop: 'CityPop',
  bossanova: 'Bossa Nova',
  acoustic: '不插电',
  chinese: '国风',
  kpop: 'K-Pop',
  edm: 'EDM',
}
const genreAliases: Record<MusicGenre, RegExp> = {
  pop: /^(?:pop|流行)$/i,
  rock: /^(?:rock|摇滚)$/i,
  'r&b': /^(?:r&b|rnb|rhythm and blues|节奏布鲁斯)$/i,
  jazz: /^(?:jazz|爵士)$/i,
  classical: /^(?:classical|古典)$/i,
  electronic: /^(?:electronic|电子|电音)$/i,
  hiphop: /^(?:hip[ -]?hop|rap|嘻哈|说唱)$/i,
  folk: /^(?:folk|民谣)$/i,
  country: /^(?:country|乡村)$/i,
  blues: /^(?:blues|蓝调)$/i,
  metal: /^(?:metal|heavy metal|金属|重金属)$/i,
  ambient: /^(?:ambient|new age|氛围|氛围音乐|纯音乐|轻音乐)$/i,
  citypop: /^(?:city[ -]?pop)$/i,
  bossanova: /^(?:bossa[ -]?nova)$/i,
  acoustic: /^(?:acoustic|unplugged|不插电)$/i,
  chinese: /^(?:国风|古风|民乐|中国风)$/i,
  kpop: /^(?:k[ -]?pop|韩流)$/i,
  edm: /^(?:edm|house|trance|dubstep|电子舞曲)$/i,
}
export const normalizeGenres = (value: unknown): MusicGenre[] => {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;；、/]/) : []
  return (Object.keys(genreAliases) as MusicGenre[]).filter(g => values.some(v => typeof v === 'string' && genreAliases[g].test(v.trim())))
}
export const getGenreEvidence = (track: { name: string, genre?: unknown, genres?: unknown, meta?: { genre?: unknown, genres?: unknown } }): { genres: MusicGenre[], hints: MusicGenre[] } => {
  const genres = [...new Set([...normalizeGenres(track.genre), ...normalizeGenres(track.genres), ...normalizeGenres(track.meta?.genre), ...normalizeGenres(track.meta?.genres)])]
  // Only explicit style markers in titles count as hints; never infer from an artist's name.
  const markers = track.name.match(/(?:\b(?:jazz|rock|acoustic|unplugged|city[ -]?pop|bossa[ -]?nova|edm|k[ -]?pop)\b|爵士|摇滚|不插电|民谣|国风)/gi) ?? []
  const hints = genres.length ? [] : [...new Set(markers.flatMap(normalizeGenres))]
  return { genres, hints }
}

/** One effective listen per playback session. Seeks, buffering and paused time do not count. */
export const createListeningTracker = (onListen: (at: number) => void) => {
  let previous: { position: number, at: number } | null = null
  let listened = 0
  let recorded = false
  return {
    reset() { previous = null; listened = 0; recorded = false },
    interrupt() { previous = null },
    tick(position: number, duration: number, playing: boolean, at = Date.now()) {
      if (!playing || !Number.isFinite(position) || position < 0) { previous = null; return }
      if (previous) {
        const elapsed = (at - previous.at) / 1000
        const progress = position - previous.position
        // A long gap may be suspended/background delivery, so do not assume it was audible.
        if (elapsed > 0 && elapsed <= 5 && progress > 0 && progress <= elapsed * 4 + 0.5) listened += Math.min(elapsed, progress)
      }
      previous = { position, at }
      const threshold = duration > 0 && Number.isFinite(duration) ? Math.min(30, duration * 0.3) : 30
      if (!recorded && listened >= threshold) { recorded = true; onListen(at) }
    },
  }
}
