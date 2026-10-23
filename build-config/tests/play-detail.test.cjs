const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path'); const ts = require('typescript')
const root = path.resolve(__dirname, '../..')
const load = (file, imports) => {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', source)(name => { if (name in imports) return imports[name]; throw Error(name) }, module, module.exports)
  return module.exports.default ?? module.exports
}
const pending = []
const api = { getComment: (...args) => new Promise((resolve, reject) => pending.push({ kind: 'new', args, resolve, reject })), getHotComment: (...args) => new Promise((resolve, reject) => pending.push({ kind: 'hot', args, resolve, reject })) }
const model = load('src/renderer/bundles/official/features/shell/PlayDetail/MusicComment.js', {
  '@renderer/utils': { toOldMusicInfo: info => info },
  '@renderer/utils/musicSdk': { default: { kw: { comment: api } } },
  '@renderer/components/layout/PlayDetail/components/MusicComment/CommentFloor.vue': {},
})
const song = id => ({ id, name: id, source: 'kw', meta: {} })
const view = () => {
  const c = { ...model.data(), show: true, musicInfo: song('a'), $refs: {}, $nextTick: callback => Promise.resolve().then(callback) }
  for (const [key, fn] of Object.entries(model.methods)) c[key] = fn.bind(c)
  return c
}
const response = value => ({ total: 1, maxPage: 1, comments: [{ text: value }] })
;(async() => {
  const c = view()
  const first = c.handleShowComment(); const firstRequests = pending.splice(0)
  c.musicInfo = song('b'); const second = c.handleShowComment(); const secondRequests = pending.splice(0)
  secondRequests.forEach(request => request.resolve(response('current b'))); await second
  firstRequests.forEach(request => request.resolve(response('stale a'))); await first
  assert.equal(c.currentMusicInfo.id, 'b'); assert.equal(c.hotComment.list[0].text, 'current b'); assert.equal(c.newComment.list[0].text, 'current b')
  assert.ok(model.watch.show.immediate)
  console.log('PASS opening loads both tabs; late responses from an old song cannot overwrite the new song')
  const generation = c.requestGeneration
  c.musicInfo = { ...song('b'), name: 'metadata updated' }; model.watch.musicInfo.call(c, c.musicInfo)
  assert.equal(c.requestGeneration, generation); assert.equal(pending.length, 0)
  assert.equal(c.currentMusicInfo.name, 'metadata updated'); assert.equal(c.hotComment.list[0].text, 'current b')
  console.log('PASS metadata replacement for the same song preserves loaded comments without refetching')
  const page2 = c.handleGetNewComment(c.musicInfo, 2, 20); const r2 = pending.pop()
  const page3 = c.handleGetNewComment(c.musicInfo, 3, 20); const r3 = pending.pop()
  r3.resolve(response('page 3')); await page3; r2.resolve(response('page 2')); await page2
  assert.equal(c.newComment.page, 3); assert.equal(c.newComment.list[0].text, 'page 3')
  console.log('PASS rapid pagination keeps the latest requested page')
  const closing = c.handleGetNewComment(c.musicInfo, 4, 20); const last = pending.pop()
  c.show = false; model.watch.show.handler.call(c, false); last.reject(Error('network failed')); await closing
  assert.equal(pending.length, 0); assert.equal(c.newComment.isLoading, false)
  console.log('PASS closing invalidates work and suppresses further retries')
  c.show = true; c.musicInfo = null; await c.handleShowComment(); assert.equal(c.available, false)
  c.musicInfo = { id: 'local', source: 'local' }; await c.handleShowComment(); assert.equal(c.available, false)
  assert.equal(pending.length, 0)
  console.log('PASS missing or local songs have a safe unavailable state')
  const disposing = view(); const request = disposing.handleShowComment(); const unfinished = pending.splice(0)
  global.window = { removeEventListener() {} }; model.beforeUnmount.call(disposing); delete global.window
  unfinished.forEach(item => item.resolve(response('late'))); await request
  assert.equal(disposing.hotComment.list.length, 0); assert.equal(disposing.newComment.list.length, 0)
  console.log('PASS unmount discards late data without accessing removed DOM')
  const retry = view(); retry.getComments = model.methods.getComments.bind(retry); let attempts = 0
  api.getComment = async() => { attempts++; throw Error('offline') }
  await retry.handleGetNewComment(song('a'), 1, 20)
  assert.equal(attempts, 3); assert.equal(retry.newComment.isLoadError, true); assert.equal(retry.newComment.isLoading, false)
  console.log('PASS failed requests retry within a bound and expose the error state')
  let songs = []; let playedIndex = -1
  const searchResults = [{ id: 'online-first', source: 'kw' }]
  const useSearchList = load('src/renderer/bundles/official/features/Search/MusicList/useList.ts', {
    '@common/constants': { LIST_IDS: { DEFAULT: 'default' } },
    '@common/utils/vueTools': { ref: value => ({ value }) },
    '@renderer/core/player/action': { playList: (id, index) => { playedIndex = index } },
    '@renderer/store/list/action': { getListMusics: async() => songs, addListMusics: async(id, added) => { songs = [...songs, ...added] } },
    '@renderer/store/search/action': { addHistoryWord: async() => {} },
    '@renderer/store/search/music': { search: async() => searchResults, listInfos: { kw: { list: searchResults } } },
    '@renderer/store/utils': { assertApiSupport: () => true },
  })
  const search = useSearchList(); search.search('成都', 'kw', 1); await search.handlePlayList(0)
  assert.equal(playedIndex, 0)
  console.log('PASS playing a first search result reads its index after the queue commit')
  const useOnlinePlay = load('src/renderer/components/material/OnlineList/usePlay.ts', {
    '@renderer/store/list/state': { defaultList: { id: 'default' } },
    '@renderer/store/list/action': { getListMusics: async() => songs, addListMusics: async(id, added) => { songs = [...songs, ...added] } },
    '@renderer/store/player/action': { addTempPlayList() {} },
    '@renderer/store/setting': { appSetting: {} },
    '@renderer/core/player': { playList: (id, index) => { playedIndex = index } },
    '@common/constants': { LIST_IDS: { DEFAULT: 'default' } },
  })
  const controls = useOnlinePlay({ selectedList: { value: [] }, props: { list: [{ id: 'second-online', source: 'kw' }] }, removeAllSelect() {}, emit() {} })
  playedIndex = -1; await controls.handlePlayMusic(0, true); assert.equal(playedIndex, 1)
  console.log('PASS online list play buttons resolve new songs against the committed queue')

  const metadata = load('src/renderer/utils/musicSdk/mg/musicInfo.js', {
    '../../index': { sizeFormate: value => value, formatPlayTime: value => value },
    './utils': { createHttpFetch: async() => ({ resource: [{ songId: 'mg-song', copyrightId: 'mg-copyright', songName: 'Example', artists: [], newRateFormats: [], lrcUrl: 'https://example.invalid/test.lrc' }] }) },
    '../utils': { formatSingerName: () => 'Artist' },
  })
  assert.equal((await metadata.getMusicInfo('mg-copyright')).songmid, 'mg-song')
  console.log('PASS Migu metadata awaits its existing batch promise once, allowing lyric lookup')


  const state = { isShowPlayerDetail: { value: false }, isShowPlayComment: { value: true }, musicInfo: {}, playMusicInfo: {} }
  const fullscreen = { value: true }; const watches = []; const unmount = []; let registered = 0; let removed = 0
  const imports = {
    '@common/utils/vueTools': { ref: value => ({ value }), watch: (sources, fn, options) => { watches.push(fn); if (options?.immediate) fn(sources.map(source => source.value)) }, onBeforeUnmount: fn => unmount.push(fn) },
    '@renderer/store': { isFullscreen: fullscreen },
    '@renderer/store/player/state': state,
    '@renderer/store/player/action': { setShowPlayerDetail: value => { state.isShowPlayerDetail.value = value }, setShowPlayComment: value => { state.isShowPlayComment.value = value }, setShowPlayLrcSelectContentLrc() {} },
    '@renderer/components/layout/PlayDetail/autoHideMounse': { registerAutoHideMounse: () => registered++, unregisterAutoHideMounse: () => removed++ },
    '@renderer/store/setting': { appSetting: {} },
    '@renderer/utils/ipc': {},
  }
  for (const name of ['LyricPlayer', 'PlayBar', 'ControlBtnsLeftHeader', 'ControlBtnsRightHeader']) imports['@renderer/components/layout/PlayDetail/' + name + '.vue'] = {}
  imports['@renderer/components/layout/PlayDetail/components/MusicComment/index.vue'] = {}
  const detail = load('src/renderer/bundles/official/features/shell/PlayDetail.js', imports).setup()
  assert.equal(registered, 0)
  state.isShowPlayerDetail.value = true; watches[0]([true, true]); detail.handleAfterEnter(); assert.equal(registered, 2)
  detail.handleAfterLeave(); assert.equal(detail.visibled.value, true)
  unmount.forEach(fn => fn()); assert.equal(state.isShowPlayerDetail.value, false); assert.equal(state.isShowPlayComment.value, false); assert.ok(removed >= 2)
  console.log('PASS hidden fullscreen pages do not lock the pointer; renderer changes and disabling clean up detail state')
})().catch(error => { console.error(error); process.exitCode = 1 })
