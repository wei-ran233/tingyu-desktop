/* Native plugin ownership, playback detach and cancellation contracts. No real providers. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const Vue = require('vue')
const root = path.resolve(__dirname, '../..')
const cache = new Map()
const storage = new Map()
let enabledBundles = ['lx.official-suite', 'lx.radio']
const load = (file, overrides = {}) => {
  if (!Object.keys(overrides).length && cache.has(file)) return cache.get(file)
  const exports = {}
  const localRequire = name => {
    if (name in overrides) return overrides[name]
    if (name === '@common/utils/vueTools') return Vue
    if (name === '@common/rendererIpc') return { rendererInvoke: async() => enabledBundles }
    const target = name.startsWith('@common/') ? path.join(root, 'src/common', name.slice(8)) : name.startsWith('.') ? path.resolve(path.dirname(file), name) : null
    if (!target) throw new Error(`Unexpected dependency: ${name}`)
    const resolved = [target, `${target}.ts`, path.join(target, 'index.ts')].find(file => fs.existsSync(file) && fs.statSync(file).isFile())
    return resolved.endsWith('.json') ? JSON.parse(fs.readFileSync(resolved, 'utf8')) : load(resolved)
  }
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(source, { exports, require: localRequire, console, AbortController, AbortSignal, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } })
  if (!Object.keys(overrides).length) cache.set(file, exports)
  return exports
}
;(async() => {
  const state = load(path.join(root, 'src/renderer/core/features/state.ts'))
  await state.refreshNativeBundles()
  assert.equal(state.featureEnabled('dj'), true)
  assert.equal(state.featureEnabled('settings.radio'), true)
  enabledBundles = ['lx.official-suite']
  await state.refreshNativeBundles()
  assert.equal(state.featureEnabled('dj'), false)
  assert.equal(state.featureEnabled('settings.radio'), false)
  assert.equal(state.featureEnabled('list'), true)
  assert.equal(state.featureEnabled('playback'), true)
  console.log('PASS radio feature and settings follow their owner without disabling library/player')
  enabledBundles = ['lx.radio']
  await state.refreshNativeBundles()
  assert.equal(state.featureEnabled('dj'), false)
  enabledBundles = ['lx.official-suite', 'lx.radio']
  await state.refreshNativeBundles()
  state.setFeatureEnabled('playback', false)
  assert.equal(state.featureEnabled('dj'), false)
  state.setFeatureEnabled('playback', true)
  assert.equal(state.featureEnabled('dj'), true)
  console.log('PASS bundle and function dependencies stop radio and recover without losing preferences')
  const extensions = load(path.join(root, 'src/renderer/core/player/extensions.ts'))
  let ticks = 0
  const dispose = extensions.registerPlaybackExtension('radio-fixture', { ended: () => true, observe: () => ticks++ })
  assert.equal(extensions.notifyPlaybackEnded(), true)
  extensions.notifyPlaybackObservation('tick')
  assert.equal(ticks, 1)
  dispose()
  assert.equal(extensions.notifyPlaybackEnded(), false)
  extensions.notifyPlaybackObservation('tick')
  assert.equal(ticks, 1)
  console.log('PASS detaching an extension restores normal next-track behavior and stops observations')
  const listeners = new Set()
  let resolveRequest
  const sent = []
  let events = 0
  const bridge = load(path.join(root, 'src/renderer/bundles/radio/utils/serviceBridge.ts'), {
    electron: { ipcRenderer: { invoke: () => new Promise(resolve => { resolveRequest = resolve }), send: (...args) => sent.push(args), on: (_name, fn) => listeners.add(fn), off: (_name, fn) => listeners.delete(fn) } },
  })
  const request = bridge.djRequest('stream', {}, undefined, () => events++)
  const rejected = assert.rejects(request, error => error.name === 'AbortError')
  bridge.cancelRadioRequests()
  assert.equal(sent[0][0], 'lx-dj-service-cancel')
  for (const listener of listeners) listener(null, sent[0][1], { delta: 'stale' })
  resolveRequest({ value: 'late response' })
  await rejected
  assert.equal(events, 0)
  assert.equal(listeners.size, 0)
  console.log('PASS cancelling radio IPC suppresses stale replies and removes streaming listeners')
  const originalFetch = global.fetch
  // Weather is renderer-owned; cancellation must also stop its direct HTTP work.
  const weatherPath = path.join(root, 'src/renderer/bundles/radio/utils/weatherService.ts')
  let observedSignal
  const weatherCalls = []
  const source = fs.readFileSync(weatherPath, 'utf8')
  const weatherExports = {}
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: weatherExports, require: name => { assert.equal(name, '@renderer/bundles/radio/store'); return { djSettings: { city: 'fixture' } } }, AbortController, setTimeout, clearTimeout, console,
    fetch: (_url, init) => new Promise((resolve, reject) => { weatherCalls.push({ resolve, signal: init.signal }); observedSignal = init.signal; init.signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }))) }),
  })
  const weather = weatherExports.fetchCurrentWeather()
  const weatherRejected = assert.rejects(weather, error => error.name === 'AbortError')
  weatherExports.cancelWeatherRequests()
  await weatherRejected
  assert.equal(observedSignal.aborted, true)
  assert.equal(global.fetch, originalFetch)
  console.log('PASS disabling radio cancels direct weather HTTP work without fallback requests')
  const oldWeather = weatherExports.fetchCurrentWeather()
  const oldRejected = assert.rejects(oldWeather, error => error.name === 'AbortError')
  weatherExports.cancelWeatherRequests()
  const newWeather = weatherExports.fetchCurrentWeather()
  await oldRejected
  const coalescedWeather = weatherExports.fetchCurrentWeather()
  assert.equal(weatherCalls.length, 3, 'old cancellation must not clear the new in-flight request')
  weatherCalls.at(-1).resolve({ ok: true, json: async() => ({ current_condition: [{ temp_C: '20', weatherDesc: [{ value: 'clear' }] }] }) })
  const results = await Promise.all([newWeather, coalescedWeather])
  assert.equal(results[0].temp, '20°C')
  assert.equal(results[1].temp, '20°C')
  console.log('PASS rapid radio reenable retains new weather request coalescing after old cancellation')
  console.log('6 radio plugin lifecycle contracts passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
