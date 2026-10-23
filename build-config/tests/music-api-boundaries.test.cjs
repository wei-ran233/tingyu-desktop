const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '../..')
const load = (relative, imports) => {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', code)(name => {
    if (name in imports) return imports[name]
    throw Error('Unexpected import ' + name)
  }, module, module.exports)
  return module.exports
}
const imports = {
  '../../request': {},
  '../../index': { decodeName: x => x, formatPlayTime: x => x, sizeFormate: x => x },
  '../utils': { formatSingerName: () => 'artist' },
}
const kg = load('src/renderer/utils/musicSdk/kg/musicSearch.js', imports).default
const song = (id, children) => ({ Audioid: id, FileHash: 'hash-' + id, OriSongName: 'Song ' + id, FileSize: 1024, Singers: [], Grp: children })
const second = song(2)
assert.deepEqual(kg.handleResult([song(1, [second, second]), second, song(3)]).map(x => x.songmid), [1, 2, 3])
console.log('PASS grouped search results retain unique child songs and accept absent groups')
;(async() => {
  let attempts = 0
  kg.musicSearch = async() => { attempts++; return { error_code: 0, data: { lists: null, total: 'invalid' } } }
  await assert.rejects(kg.search('test'), /try max num/)
  assert.equal(attempts, 3)
  console.log('PASS malformed successful HTTP bodies retry within a fixed bound')
  const request = load('src/renderer/utils/request.js', {
    needle: { default: { request() { throw Error('request setup failed') } } },
    './env': { debugRequest: false },
    './message': { requestMsg: {} },
    './musicSdk/options': { bHh: 'test' },
    zlib: require('node:zlib'),
    '@renderer/store': { proxy: {} },
    tunnel: {},
  })
  let timer
  try {
    await assert.rejects(Promise.race([
      request.httpFetch('invalid-url').promise,
      new Promise((_resolve, reject) => { timer = setTimeout(() => reject(Error('promise hung')), 100) }),
    ]), /request setup failed/)
  } finally { clearTimeout(timer) }
  console.log('PASS HTTP setup rejection settles the public promise instead of hanging')
  const settings = { city: '成都', weatherApiKey: 'saved-key', weatherApiHost: 'saved.example' }
  const calls = []
  const weather = load('src/renderer/bundles/radio/utils/weatherService.ts', {
    '@renderer/bundles/radio/store': { djSettings: settings },
  })
  const originalFetch = global.fetch
  global.fetch = async(url, options) => {
    calls.push({ url, key: options.headers['X-QW-Api-Key'] })
    return { ok: true, json: async() => url.includes('/weather/now') ? { code: '200', now: { text: '晴', temp: '20' } } : { code: '200', location: [{ id: '101010100', name: '北京' }] } }
  }
  try {
    const draft = { city: '北京', weatherApiKey: 'draft-key', weatherApiHost: 'draft.example' }
    assert.equal((await weather.fetchCurrentWeather(true, draft)).city, '北京')
    assert.ok(calls.every(call => call.url.startsWith('https://draft.example/') && call.key === 'draft-key'))
    assert.equal(settings.city, '成都')
    assert.equal(settings.weatherApiKey, 'saved-key')
    calls.length = 0
    await weather.searchCities('北京', draft)
    assert.ok(calls[0].url.startsWith('https://draft.example/'))
    calls.length = 0
    await weather.fetchCurrentWeather(false)
    assert.ok(calls.every(call => call.url.startsWith('https://saved.example/') && call.key === 'saved-key'))
    console.log('PASS weather tests and city lookup use unsaved parameters without changing persisted settings or sharing their cache')
  } finally { global.fetch = originalFetch }

  const vault = load('src/main/bundles/radio/vault.ts', {
    electron: { app: { getPath: () => '/unused-test-profile' }, safeStorage: { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'gnome_libsecret', decryptString() { throw Error('native ciphertext error') } } },
    'node:fs': { default: { readFileSync: () => JSON.stringify({ 'model:test': 'invalid' }) } },
    'node:path': { default: path },
    'node:crypto': require('node:crypto'),
    '@common/dj/ipc': { VAULT_PREFIX: 'lx-vault:' },
  })
  assert.throws(() => vault.readSecret('lx-vault:model:test'), /密钥无法解密/)
  console.log('PASS unavailable ciphertext returns an actionable message without native cryptographic detail')
})().catch(error => { console.error(error); process.exitCode = 1 })
