import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// Exercise the real recommendation/search/playback boundary with isolated SDK,
// storage and player ports. No external requests or changes to the user's lists.
const directory = await mkdtemp(join(tmpdir(), 'lx-dj-music-'))
let checks = 0
const check = async(name, fn) => { await fn(); console.log(`PASS ${name}`); checks++ }
const compile = async(path, replacements = {}) => {
  let code = ts.transpileModule(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const [from, to] of Object.entries(replacements)) code = code.replaceAll(from, to)
  const target = join(directory, `${Math.random().toString(36).slice(2)}.mjs`)
  await writeFile(target, code)
  return { url: pathToFileURL(target).href, module: await import(pathToFileURL(target)) }
}
const statePath = join(directory, 'ports.mjs')
await writeFile(statePath, `
export const loveList = {list:[]}; export const getListMusicsFromCache=()=>loveList.list; export const getListMusics=async()=>loveList.list; export const djSettings = {};
export {ref,computed} from ${JSON.stringify(import.meta.resolve('vue'))};
export let llmConfigured=true; export const setLlmConfigured=value=>{llmConfigured=value}; export const hasLlmConfiguration=()=>llmConfigured;
export let streamCallbacks; export let streamOptions; export let finishStream;
export const sendLlmStreamMessage=async(history,mode,weather,callbacks,options)=>{streamCallbacks=callbacks;streamOptions=options;await new Promise(resolve=>{finishStream=resolve})};
export let finishSpeech; export let speechStarted; export const spoken=[];
export const synthesizeSpeech=async()=>{const value=await new Promise(resolve=>{finishSpeech=resolve;speechStarted?.()});if(value instanceof Error)throw value;return value};
export const playDjSpeech=url=>spoken.push(url); export const setVolume=()=>{}; export const appSetting={};
export const tempPlayList=[]; export const addTempPlayList=items=>tempPlayList.push(...items);
export const getCurrentDjWeatherContext=()=>({text:'晴',type:'sunny'});
export const storage = new Map(); export const localStorage = {getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
export const addProfileLog = () => {};
export const markRaw = value => value;
export let searches=0; export let searchImpl=async()=>[];
export const setSearchImpl = fn => {searchImpl=fn};
export default {searchMusic:async args=>{searches++;return searchImpl(args)}};
export const toNewMusicInfo = value => ({...value,meta:{...value.meta}});
export const getPicPath = async()=> 'fixture-cover';
export const events=[]; export const handlePlay=()=>events.push('play');
export const playNext=()=>{}; export const playPrev=()=>{}; export const pause=()=>{};
export const setPlayMusicInfo=(...args)=>events.push(['set',...args]);
export const playInfo={playerListId:null}; export let failAdd=false; export const setFailAdd=value=>{failAdd=value};
export const addListMusics=async(...args)=>{if(failAdd)throw new Error('fixture add failed');events.push(['add',...args])};
export const LIST_IDS={LOVE:'love',PLAY_LATER:'later'};
`)
const portsUrl = pathToFileURL(statePath).href
const ports = await import(portsUrl)
const originalStorage = globalThis.localStorage
const originalNow = Date.now
try {
  globalThis.localStorage = ports.localStorage
  const listening = await compile('src/renderer/bundles/radio/utils/listeningProfile.ts')
  const profile = await compile('src/renderer/bundles/radio/utils/userProfile.ts', {
    "'./listeningProfile'": JSON.stringify(listening.url),
    "'@renderer/store/list/action'": JSON.stringify(portsUrl),
    "'@common/constants'": JSON.stringify(portsUrl),
    "'@common/utils/vueTools'": JSON.stringify(portsUrl),
    "'@renderer/store/list/state'": JSON.stringify(portsUrl),
    "'@renderer/bundles/radio/store'": JSON.stringify(portsUrl),
  })
  const template = await compile('src/renderer/bundles/radio/utils/templateEngine.ts', {
    "'@renderer/store/list/state'": JSON.stringify(portsUrl),
    "'@renderer/bundles/radio/store'": JSON.stringify(portsUrl),
    "'@renderer/bundles/radio/utils/userProfile'": JSON.stringify(profile.url),
  })
  const executor = await compile('src/renderer/bundles/radio/utils/ai/toolExecutor.ts', Object.fromEntries([
    '@common/utils/vueTools', '@renderer/utils/musicSdk', '@renderer/utils', '@renderer/core/music',
    '@renderer/core/player', '@renderer/store/player/action', '@renderer/store/player/state',
    '@renderer/store/list/action', '@common/constants',
  ].map(path => [`'${path}'`, JSON.stringify(portsUrl)]).concat([
    ["'@renderer/bundles/radio/utils/templateEngine'", JSON.stringify(template.url)],
    ["'@renderer/bundles/radio/utils/userProfile'", JSON.stringify(profile.url)],
  ])))
  const { searchMusicTrack, playMusicTrack, executeToolAction } = executor.module
  const song = (id, name, singer = '歌手') => ({ id, name, singer, source: 'kw', meta: {} })
  await check('search coalesces equivalent requests and caches the resolved cover', async() => {
    let release
    ports.setSearchImpl(() => new Promise(resolve => { release = resolve }))
    const before = ports.searches
    const first = searchMusicTrack(' Test ', ' Artist ')
    const second = searchMusicTrack('test', 'artist')
    release([{ list: [song('dedup', 'Test', 'Artist')] }])
    const [a, b] = await Promise.all([first, second])
    assert.equal(a, b)
    assert.equal(a.meta.picUrl, 'fixture-cover')
    assert.equal(await searchMusicTrack('TEST', 'ARTIST'), a)
    assert.equal(ports.searches - before, 1)
  })
  await check('search considers originals beyond the first result and matches singer', async() => {
    ports.setSearchImpl(async() => [{ list: [song('cover', '测试 COVER'), song('unknown', '测试', ''), song('original', '测试', '目标歌手')] }])
    assert.equal((await searchMusicTrack('测试', '目标歌手')).id, 'original')
    ports.setSearchImpl(async() => [{ list: [song('cover2', '另一首 LiVe'), song('original2', '另一首')] }])
    assert.equal((await searchMusicTrack('另一首')).id, 'original2')
    ports.setSearchImpl(async() => [{ list: [song('deliver', 'Deliver Me')] }])
    assert.equal((await searchMusicTrack('Deliver Me')).id, 'deliver')
  })
  await check('unrelated titles, wrong singers and cover-only hits never become verified cards', async() => {
    ports.setSearchImpl(async() => [{ list: [song('wrong-title', '另一首歌', '周杰伦')] }])
    assert.equal(await searchMusicTrack('晴天', '周杰伦'), null)
    ports.setSearchImpl(async() => [{ list: [song('wrong-singer', '红豆', '翻唱歌手')] }])
    assert.equal(await searchMusicTrack('红豆', '王菲'), null)
    ports.setSearchImpl(async() => [{ list: [song('cover-only', '专属歌曲 cover', '歌手')] }])
    assert.equal(await searchMusicTrack('专属歌曲'), null)
  })
  await check('tool rejects the same song across sources before immediate playback', async() => {
    ports.setSearchImpl(async() => [{ list: [song('unique', '唯一歌曲', '歌手')] }])
    const context = { excludedSongNames: new Set(), onFoundMusicCard: () => {} }
    assert.equal((await executeToolAction('search_and_play', {keyword:'唯一歌曲', singer:'歌手'}, context)).found, true)
    const before = ports.events.length
    assert.equal((await executeToolAction('search_and_play', {keyword:'唯一歌曲', singer:'歌手', immediatePlay:true}, context)).found, false)
    assert.equal(ports.events.length, before)
    assert.equal(executor.module.songIdentity({name:' 唯一 歌曲！'}), executor.module.songIdentity({name:'唯一歌曲'}))
  })
  await check('cache expires after five minutes and isolates singer hints', async() => {
    const before = ports.searches
    await searchMusicTrack('Test', 'Another Artist')
    assert.equal(ports.searches, before + 1)
    Date.now = () => originalNow() + 5 * 60 * 1000 + 1
    await searchMusicTrack('Test', 'Artist')
    assert.equal(ports.searches, before + 2)
    Date.now = originalNow
  })
  await check('failed searches can retry immediately and blank searches do not reach the SDK', async() => {
    const before = ports.searches
    ports.setSearchImpl(async() => { throw new Error('fixture network failure') })
    const originalError = console.error
    try {
      console.error = () => {}
      assert.equal(await searchMusicTrack('retry'), null)
    } finally { console.error = originalError }
    ports.setSearchImpl(async() => [{ list: [song('retry', 'retry')] }])
    assert.equal((await searchMusicTrack('retry')).id, 'retry')
    assert.equal(await searchMusicTrack('  '), null)
    assert.equal(ports.searches - before, 2)
  })
  await check('favorites filter the full library, support mood/genre aliases and respect limits', async() => {
    ports.loveList.list = Array.from({ length: 16 }, (_, i) => song(`pop-${i}`, `Pop ${i}`))
    ports.loveList.list.push(song('jazz', 'Jazz 午夜'), song('warm', '温暖的拥抱'))
    const jazz = await executeToolAction('get_user_favorites', { moodOrGenre: '爵士', limit: 10 })
    assert.deepEqual(jazz.songs.map(s => s.name), ['Jazz 午夜'])
    const warm = await executeToolAction('get_user_favorites', { moodOrGenre: '治愈' })
    assert.deepEqual(warm.songs.map(s => s.name), ['温暖的拥抱'])
    assert.equal((await executeToolAction('get_user_favorites', { moodOrGenre: '不匹配' })).count, 0)
    assert.equal((await executeToolAction('get_user_favorites', { limit: 10 })).count, 10)
    assert.equal((await executeToolAction('get_user_favorites', { limit: 0 })).count, 1)
    assert.equal((await executeToolAction('get_user_favorites', { limit: 'bad' })).count, 5)
  })
  await check('preference ranking survives random tie breaking and profile refreshes same-size edits', () => {
    ports.loveList.list = [song('favorite', '偏爱歌曲', '偏爱歌手'), ...Array.from({ length: 12 }, (_, i) => song(`other-${i}`, `普通歌曲 ${i}`, `歌手 ${i}`))]
    profile.module.recordPlayedSong('偏爱歌曲', '偏爱歌手')
    for (let i = 0; i < 10; i++) assert.equal(template.module.recommendFromLoveList('unknown')[0].name, '偏爱歌曲')
    ports.loveList.list = [song('one', 'one', '旧歌手')]
    assert.ok(profile.module.analyzeUserProfile().topArtists.includes('旧歌手'))
    ports.loveList.list = [song('two', 'two', '新歌手')]
    assert.ok(profile.module.analyzeUserProfile().topArtists.includes('新歌手'))
    assert.ok(!profile.module.analyzeUserProfile().topArtists.includes('旧歌手'))
    profile.module.saveUserTags({ artists: ['手动歌手'], genres: [] })
    assert.equal(profile.module.analyzeUserProfile().topArtists[0], '手动歌手')
  })
  await check('playback dispatch does not count a listen before audible progress and cancellation has no side effects', async() => {
    ports.storage.clear()
    ports.playInfo.playerListId = 'current'
    await playMusicTrack(song('played', '已播放'))
    assert.equal(profile.module.analyzeUserProfile().playCounts['歌手 - 已播放'], undefined)
    assert.deepEqual(ports.events.map(event => Array.isArray(event) ? event[0] : event), ['add', 'set', 'play'])
    ports.setFailAdd(true)
    await assert.rejects(() => playMusicTrack(song('failed', '失败歌曲')), /fixture add failed/)
    assert.equal(profile.module.analyzeUserProfile().playCounts['歌手 - 失败歌曲'], undefined)
    ports.setFailAdd(false)
    const controller = new AbortController(); controller.abort()
    const before = ports.events.length
    await assert.rejects(() => executeToolAction('search_and_play', { keyword: 'retry', immediatePlay: true }, { signal: controller.signal }), { name: 'AbortError' })
    assert.equal(ports.events.length, before)
  })
  const chat = await compile('src/renderer/bundles/radio/composables/useDjChat.ts', Object.fromEntries([
    '@common/utils/vueTools', '@renderer/bundles/radio/store', '@renderer/bundles/radio/utils/ai/modelsManager',
    '@renderer/bundles/radio/utils/llmService', '@renderer/bundles/radio/utils/ttsService', '@renderer/bundles/radio/player/djAudio',
    '@renderer/store/player/action', '@renderer/store/player/state', '@renderer/store/list/state', '@renderer/store/list/action',
    '@common/constants', '@renderer/bundles/radio/composables/useDjWeather',
  ].map(path => [`'${path}'`, JSON.stringify(portsUrl)]).concat([
    ["'@renderer/bundles/radio/utils/templateEngine'", JSON.stringify(template.url)],
    ["'@renderer/bundles/radio/utils/ai/toolExecutor'", JSON.stringify(executor.url)],
  ])))
  const c = chat.module.useDjChat()
  const audio = await compile('src/renderer/bundles/radio/player/djAudio.ts', {
    "'@renderer/plugins/player'": JSON.stringify(portsUrl),
    "'@renderer/store/setting'": JSON.stringify(portsUrl),
    "'@renderer/bundles/radio/store'": JSON.stringify(portsUrl),
    "'@renderer/bundles/radio/composables/useDjChat'": JSON.stringify(chat.url),
  })
  // Run the production ended handler and temporary-queue branch of playNext.
  const loadFunction = async(path, name, dependencies) => {
    const source = ts.createSourceFile(path, await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
    let initializer
    const visit = node => {
      if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) initializer = node.initializer.getText(source)
      ts.forEachChild(node, visit)
    }
    visit(source)
    assert.ok(initializer, `production function ${name} exists`)
    const js = ts.transpileModule(`const extracted = ${initializer}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
    return new Function(...Object.keys(dependencies), `${js}; return extracted`)(...Object.values(dependencies))
  }
  const nextTracks = []
  const playNext = await loadFunction('src/renderer/core/player/action.ts', 'playNext', {
    tempPlayList: ports.tempPlayList,
    removeTempPlayList: index => ports.tempPlayList.splice(index, 1),
    handlePlayNext: entry => nextTracks.push(entry.musicInfo.id),
    console: { log() {} },
  })
  const handleEnded = await loadFunction('src/renderer/bundles/official/services/runtime/usePlayer/usePlayer.ts', 'handleEnded', {
    setAllStatus() {}, t: value => value, window: { lx: { isPlayedStop: false } },
    notifyPlaybackEnded: audio.module.notifyDjSongEnded, notifyPlaybackObservation: () => {}, playNext,
    listeningTracker: { tick() {} }, resetListeningSession() {}, getCurrentTime: () => 0, getDuration: () => 180, isPlay: { value: true },
  })
  await check('deleting a message aborts the stream before stale callbacks can update shifted entries', async() => {
    const sending = c.sendMessage('chat', '晴', 'sunny', undefined, { query: 'hello' })
    const callbacks = ports.streamCallbacks
    c.deleteMessage(0)
    assert.equal(c.isGenerating.value, false)
    const text = c.messageList.value[0].text
    callbacks.onToken('stale text')
    assert.equal(c.messageList.value[0].text, text)
    ports.finishStream()
    await sending
    c.clearMessages()
  })
  await check('automatic DJ speech failure is visible and not overwritten by completion', async() => {
    ports.djSettings.enableDjSpeech = true
    ports.djSettings.djAutoPlay = false
    const sending = c.sendMessage('dj', '晴', 'sunny', undefined, { query: '测试播报错误' })
    const completion = ports.streamCallbacks.onComplete('播报测试回复')
    await new Promise(resolve => setImmediate(resolve))
    ports.finishSpeech(new Error('fixture TTS timeout'))
    await completion
    ports.finishStream()
    await sending
    assert.equal(c.generationStatus.value.phase, 'error')
    assert.match(c.generationStatus.value.text, /语音播报失败.*fixture TTS timeout/)
    ports.djSettings.enableDjSpeech = false
    c.clearMessages()
  })
  await check('muting while TTS is pending prevents delayed speech playback', async() => {
    ports.djSettings.enableChatSpeech = true
    const sending = c.sendMessage('chat', '晴', 'sunny', undefined, { query: 'hello' })
    const completion = ports.streamCallbacks.onComplete('普通回复')
    // onComplete yields once while checking music recommendations, then requests TTS.
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(typeof ports.finishSpeech, 'function')
    ports.djSettings.enableChatSpeech = false
    ports.finishSpeech('speech:late')
    await completion
    assert.equal(ports.spoken.length, 0)
    ports.finishStream()
    await sending
    c.clearMessages()
  })
  await check('local recommendations return two verified distinct mainstream songs and avoid the previous turn', async() => {
    ports.setLlmConfigured(false)
    ports.djSettings.enableChatSpeech = false
    ports.setSearchImpl(async({name,singer}) => [{list:[song(`catalog-${name}`,name,singer || '歌手')]}])
    c.clearMessages()
    await c.sendMessage('chat','晴','sunny',undefined,{query:'推荐两首好听的歌'})
    const first = c.messageList.value.at(-1).musicCards.map(card=>card.name)
    assert.equal(first.length,2)
    assert.equal(new Set(first).size,2)
    await c.sendMessage('chat','晴','sunny',undefined,{query:'继续推荐两首'})
    const second = c.messageList.value.at(-1).musicCards.map(card=>card.name)
    assert.equal(second.length,2)
    assert.ok(second.every(name=>!first.includes(name)))
    c.clearMessages()
  })
  await check('local DJ queues the second song and starts a new conversation only after the queue drains', async() => {
    ports.djSettings.djAutoPlay = true
    ports.djSettings.autoContinue = true
    chat.module.setDjMode('dj')
    chat.module.setDjPageActive(true)
    ports.tempPlayList.length = 0
    const before = ports.events.length
    await c.sendMessage('dj', '晴', 'sunny', undefined, { query: '推荐两首歌' })
    const cards = c.messageList.value.at(-1).musicCards
    assert.equal(cards.length, 2)
    assert.equal(ports.events.slice(before).filter(event => event === 'play').length, 1)
    assert.equal(cards[0].played, true)
    assert.equal(ports.tempPlayList.length, 1)
    assert.equal(ports.tempPlayList[0].musicInfo.id, cards[1].id)
    const messageCount = c.messageList.value.length
    assert.equal(chat.module.autoContinueRecommend(), false)
    assert.equal(c.messageList.value.length, messageCount)
    handleEnded()
    assert.equal(nextTracks.at(-1), cards[1].id)
    assert.equal(ports.tempPlayList.length, 0)
    assert.equal(c.messageList.value.length, messageCount)
    ports.setLlmConfigured(true)
    handleEnded()
    assert.equal(c.messageList.value.length, messageCount + 1)
    ports.finishStream()
    await new Promise(resolve => setImmediate(resolve))
    c.clearMessages()
  })
  await check('LLM DJ queues all remaining songs in recommendation order', async() => {
    const sending = c.sendMessage('dj', '晴', 'sunny', undefined, { query: '推荐三首歌' })
    const tracks = [song('batch-a', '批次甲'), song('batch-b', '批次乙'), song('batch-c', '批次丙')]
    for (const track of tracks) ports.streamOptions.onFoundMusicCard({ ...track, track })
    await ports.streamCallbacks.onComplete('为你推荐三首歌')
    assert.deepEqual(ports.tempPlayList.map(item => item.musicInfo.id), ['batch-b', 'batch-c'])
    ports.finishStream()
    await sending
    ports.tempPlayList.length = 0
    c.clearMessages()
  })
  await check('recommended song batch automatically synthesizes and starts narration', async() => {
    ports.djSettings.enableDjSpeech = true
    ports.djSettings.djAutoPlay = true
    const sending = c.sendMessage('dj', '晴', 'sunny', undefined, { query: '推荐歌曲并播报' })
    const tracks = [song('narrated-a', '播报甲'), song('narrated-b', '播报乙')]
    for (const track of tracks) ports.streamOptions.onFoundMusicCard({ ...track, track })
    const completion = ports.streamCallbacks.onComplete('这两首歌适合现在的心情')
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(c.generationStatus.value.phase, 'speaking')
    assert.equal(ports.tempPlayList.at(-1).musicInfo.id, 'narrated-b')
    ports.finishSpeech('blob:automatic-narration')
    await completion
    assert.equal(ports.spoken.at(-1), 'blob:automatic-narration')
    ports.finishStream()
    await sending
    ports.djSettings.enableDjSpeech = false
    ports.tempPlayList.length = 0
    c.clearMessages()
  })
  await check('tool-started first song is not restarted and the remaining song is still queued', async() => {
    const sending = c.sendMessage('dj', '晴', 'sunny', undefined, { query: '推荐两首歌' })
    const first = song('tool-a', '工具甲')
    const second = song('tool-b', '工具乙')
    ports.streamOptions.onFoundMusicCard({ ...first, track: first, played: true })
    ports.streamOptions.onFoundMusicCard({ ...second, track: second })
    const before = ports.events.length
    await ports.streamCallbacks.onComplete('两首已准备好')
    assert.equal(ports.events.length, before)
    assert.deepEqual(ports.tempPlayList.map(item => item.musicInfo.id), ['tool-b'])
    ports.finishStream()
    await sending
    ports.tempPlayList.length = 0
    c.clearMessages()
  })
  await check('disabled auto playback leaves recommendations out of the queue', async() => {
    ports.djSettings.djAutoPlay = false
    const sending = c.sendMessage('dj', '晴', 'sunny', undefined, { query: '推荐两首歌' })
    for (const track of [song('off-a', '关闭甲'), song('off-b', '关闭乙')]) ports.streamOptions.onFoundMusicCard({ ...track, track })
    const before = ports.events.length
    await ports.streamCallbacks.onComplete('两首推荐')
    assert.equal(ports.events.length, before)
    assert.equal(ports.tempPlayList.length, 0)
    ports.finishStream()
    await sending
    c.clearMessages()
  })
  console.log(`${checks} music search and recommendation checks passed`)
} finally {
  Date.now = originalNow
  if (originalStorage === undefined) delete globalThis.localStorage
  else globalThis.localStorage = originalStorage
  await rm(directory, { recursive: true, force: true })
}
