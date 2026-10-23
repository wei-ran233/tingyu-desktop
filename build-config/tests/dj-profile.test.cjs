const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const crypto = require('node:crypto')
const { ref, reactive, computed } = require('vue')
const compile = (file, imports = {}) => {
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(source, { exports, require: name => { if (!(name in imports)) throw Error(name); return imports[name] }, localStorage: storage, console, Date, crypto })
  return exports
}
const data = new Map()
const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }
const listening = compile('src/renderer/bundles/radio/utils/listeningProfile.ts')
const loveList = reactive({ list: [] })
const loadProfile = () => compile('src/renderer/bundles/radio/utils/userProfile.ts', {
  '@common/utils/vueTools': { ref }, '@renderer/store/list/action': { getListMusicsFromCache: () => loveList.list, getListMusics: async() => loveList.list }, '@common/constants': { LIST_IDS: { LOVE: 'love' } }, '@renderer/bundles/radio/store': { addProfileLog() {} }, './listeningProfile': listening,
})
let profile = loadProfile()
const song = (name, singer, genre) => ({ id: name, name, singer, meta: { genre } })
let checks = 0
const check = (name, run) => { run(); checks++; console.log('PASS ' + name) }
const plain = v => JSON.parse(JSON.stringify(v))
check('empty and legacy-only profiles do not invent artists, genres or historical time periods', () => {
  storage.setItem('lx_ai_user_profile_v1', JSON.stringify({ 'artist:旧歌手': 999 }))
  const p = profile.analyzeUserProfile()
  assert.equal(p.topArtists.length, 0); assert.equal(p.genreTags.length, 0)
  assert(p.timePeriodSongs.every(g => !g.songs.length))
  assert(!profile.getUserProfilePromptString().includes('周杰伦'))
  assert(storage.getItem('lx_ai_user_profile_v1').includes('999'))
})
check('favorites deduplicate across providers and split collaborating artists without splitting AC/DC', () => {
  loveList.list = [song('合作曲', '甲、乙', ['Jazz']), { ...song('合作曲', '乙、甲', ['Jazz']), id: 'other-source' }, song('另曲', 'AC/DC')]
  const p = profile.analyzeUserProfile()
  assert.equal(p.sampleCount, 2)
  assert.deepEqual(plain(listening.splitArtists('AC/DC')), ['AC/DC'])
  assert.deepEqual(plain(p.topArtists).sort(), ['AC/DC', '乙', '甲'].sort())
  assert.equal(p.automaticArtists.find(a => a.name === '甲').favorites, 1)
})
check('genre metadata is evidence while title keywords remain unconfirmed hints', () => {
  loveList.list = [song('普通歌', 'Dream Rock Band', ['R&B']), song('Jazz Session', '歌手'), song('晴天', '歌手')]
  const p = profile.analyzeUserProfile()
  assert.deepEqual(plain(p.genreTags), ['R&B'])
  assert.deepEqual(plain(p.inferredGenreTags), ['爵士'])
  assert.equal(p.knownGenreCount, 1); assert.equal(p.analyzedSongCount, 3)
  assert.equal(p.langTags.length, 0); assert.equal(p.moodTags.length, 0)
})
check('effective listens deduplicate session IDs and persist real local time buckets across reload', () => {
  loveList.list = []
  const morning = new Date(); morning.setDate(morning.getDate() - 1); morning.setHours(8, 0, 0, 0)
  const night = new Date(morning); night.setHours(22)
  profile.recordPlayedSong('早曲', '甲', { sessionId: 'one', at: +morning, track: song('早曲', '甲', ['Folk']) })
  profile.recordPlayedSong('早曲', '甲', { sessionId: 'one', at: +morning })
  profile.recordPlayedSong('夜曲', '乙', { sessionId: 'two', at: +night })
  profile = loadProfile()
  const p = profile.analyzeUserProfile()
  assert.equal(p.listeningCount, 2)
  assert.equal(p.timePeriodSongs.find(g => g.period === 'morning').songs[0].name, '早曲')
  assert.equal(p.timePeriodSongs.find(g => g.period === 'night').songs[0].name, '夜曲')
  assert.equal(p.playCounts['甲 - 早曲'], 1)
})
check('profile computed values refresh immediately after new evidence and tag changes', () => {
  const view = computed(() => profile.analyzeUserProfile().listeningCount)
  const before = view.value
  profile.recordPlayedSong('响应式', '丙', { sessionId: 'three' })
  assert.equal(view.value, before + 1)
  profile.saveUserTags({ artists: ['手动歌手'], genres: ['爵士'] })
  assert.equal(profile.analyzeUserProfile().topArtists[0], '手动歌手')
})
check('ignored artists and genres stay excluded after reanalysis and can be restored', () => {
  loveList.list = [song('作品', '甲', ['Jazz'])]
  profile.setProfileTagExcluded('artists', '甲', true)
  profile.setProfileTagExcluded('genres', '爵士', true)
  assert(!profile.analyzeUserProfile().topArtists.includes('甲'))
  assert(!profile.analyzeUserProfile().genreTags.includes('爵士'))
  profile = loadProfile()
  assert(profile.isMusicExcluded(song('合作', '甲、其他')))
  assert(profile.isMusicExcluded(song('未知歌手作品', '新歌手', ['Jazz'])))
  profile.setProfileTagExcluded('artists', '甲', false)
  assert(profile.analyzeUserProfile().topArtists.includes('甲'))
})
check('all seven periods have explicit local-time boundaries', () => {
  for (const [hour, expected] of [[0,'lateNight'],[4,'lateNight'],[5,'dawn'],[7,'morning'],[11,'noon'],[13,'afternoon'],[18,'evening'],[21,'night'],[23,'night']]) {
    const date = new Date(); date.setHours(hour)
    assert.equal(listening.getListeningPeriod(+date), expected)
  }
})
check('resource readiness, paused playback, seeks, buffering gaps and reloads do not count as listening', () => {
  let count = 0
  const t = listening.createListeningTracker(() => count++)
  t.tick(0, 180, true, 0); t.tick(120, 180, true, 1000)
  t.tick(150, 180, false, 31000); t.tick(150, 180, true, 32000)
  t.tick(170, 180, true, 52000)
  assert.equal(count, 0)
  t.interrupt(); t.tick(0, 180, true, 53000)
  for (let i = 1; i <= 30; i++) t.tick(i, 180, true, 53000 + i * 1000)
  assert.equal(count, 1)
  t.interrupt(); t.tick(0, 180, true, 90000)
  for (let i = 1; i <= 35; i++) t.tick(i, 180, true, 90000 + i * 1000)
  assert.equal(count, 1)
  t.reset(); t.tick(0, 180, true, 130000)
  for (let i = 1; i <= 30; i++) t.tick(i, 180, true, 130000 + i * 1000)
  assert.equal(count, 2)
})
check('short tracks qualify by duration fraction and large seeks never meet that threshold', () => {
  let count = 0
  const t = listening.createListeningTracker(() => count++)
  t.tick(0, 20, true, 0)
  for (let i = 1; i <= 6; i++) t.tick(i, 20, true, i * 1000)
  assert.equal(count, 1)
  t.reset(); t.tick(0, 20, true, 0); t.tick(19, 20, true, 1000)
  assert.equal(count, 1)
})
check('invalid, expired and future records are ignored and storage stays bounded', () => {
  const now = Date.now()
  const event = { sessionId: 'base', name: '歌曲', singer: '歌手', genres: [], genreHints: [], at: now - 1000 }
  storage.setItem('lx_ai_listening_events_v2', JSON.stringify({ version: 2, events: [null, { ...event, at: now + 60000 }, { ...event, at: now - 91 * 86400000 }, ...Array.from({ length: 5001 }, (_, i) => ({ ...event, sessionId: 'valid-' + i }))] }))
  profile.recordPlayedSong('最后一首', '末位歌手', { sessionId: 'latest' })
  const saved = JSON.parse(storage.getItem('lx_ai_listening_events_v2'))
  assert.equal(saved.events.length, 5000)
  assert.equal(saved.events.at(-1).name, '最后一首')
})
console.log(`${checks} profile learning checks passed`)
