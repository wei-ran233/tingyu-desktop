/* Real theme contracts/controller with an in-memory DOM and IPC boundary. */
const assert = require('node:assert/strict')
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm'); const ts = require('typescript'); const Vue = require('vue')
const root = path.resolve(__dirname, '../..')
const storage = new Map(); const attrs = {}; const elements = []; const events = new Map(); const pushes = []
let catalog = []; let listRequest = async() => catalog
let prepareViews = async() => {}
const documentElement = { style: { setProperty: (key, value) => { documentElement.style[key] = value }, removeProperty: key => { delete documentElement.style[key] } }, dataset: {}, setAttribute: (key, value) => { attrs[key] = value }, removeAttribute: key => { delete attrs[key]; if (key === 'data-lx-theme') delete documentElement.dataset.lxTheme } }
const document = { documentElement, contains: el => elements.includes(el), createElement: () => ({ textContent: '' }), head: { appendChild: el => elements.push(el) } }
const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
const window = { addEventListener: (key, callback) => events.set(key, callback), removeEventListener: key => events.delete(key) }
const loader = () => {
  const cache = new Map()
  const load = file => {
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }; cache.set(file, module)
    const requireLocal = name => {
      if (name === '@renderer/core/features/component') return { preloadFeatureViews: async() => prepareViews() }
      if (name === '@renderer/store') return { themeId: Vue.ref('green'), themeShouldUseDarkColors: Vue.ref(false) }
      if (name === '@common/rendererIpc') return { rendererInvoke: async(name, value) => { if (name.endsWith('list')) return listRequest(); pushes.push(value); return null } }
      const target = name.startsWith('@common/') ? path.join(root, 'src/common', name.slice(8)) : name.startsWith('@renderer/') ? path.join(root, 'src/renderer', name.slice(10)) : name.startsWith('.') ? path.resolve(path.dirname(file), name) : null
      if (!target) return require(name)
      const resolved = [target, target + '.ts', target + '.json'].find(item => fs.existsSync(item) && fs.statSync(item).isFile())
      if (resolved.endsWith('.json')) return JSON.parse(fs.readFileSync(resolved))
      return load(resolved)
    }
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { document, localStorage, window, console }, { filename: file })(requireLocal, module, module.exports)
    return module.exports
  }
  return load
}
;(async() => {
  const load = loader()
  const common = load(path.join(root, 'src/common/plugin/security.ts'))
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin-samples/theme-studio/manifest.json')))
  const parsed = common.validatePluginManifest(manifest)
  assert.equal(parsed.themes.length, 3)
  const invalid = mutate => { const value = structuredClone(manifest); mutate(value); assert.throws(() => common.validatePluginManifest(value)) }
  invalid(m => { m.permissions = ['theme.contribute'] })
  invalid(m => { m.themes[0].appearance.layout = 'script' })
  invalid(m => { m.themes[0].appearance.identity = 'unknown' })
  invalid(m => { m.themes[0].appearance.css = 'body{display:none}' })
  invalid(m => { m.themes[0].appearance.views = { settings: '../../file' } })
  invalid(m => { m.themes[0].tokens['--lx-background'] = 'url(https://example.invalid/track)' })
  invalid(m => { m.themes[0].tokens['--lx-background'] = 'red</style><script>' })
  invalid(m => { m.themes[1].id = m.themes[0].id })
  console.log('PASS appearance permission, enum/schema bounds, view references, token injection and duplicate identities')
  const controller = load(path.join(root, 'src/renderer/core/theme.ts'))
  const state = load(path.join(root, 'src/renderer/core/theme/state.ts'))
  const plugin = { ...parsed, enabled: true, compatible: true }
  catalog = [plugin]
  controller.applyThemeSnapshot({}, 'green', false)
  await controller.loadPluginThemes()
  await controller.selectPluginTheme('plugin:lx.theme-studio:tide')
  const identity = load(path.join(root, 'src/renderer/core/theme/identity.ts'))
  const { themeGlyphs } = load(path.join(root, 'src/renderer/core/theme/icons.ts'))
  assert.equal(identity.themeIconRef('#icon-play'), '#lx-icon-tide-play')
  assert.notEqual(themeGlyphs.tide.search.path, themeGlyphs.signal.search.path)
  assert.notEqual(themeGlyphs.signal.search.path, themeGlyphs.petals.search.path)
  for (const name of ['search-2', 'album', 'leaderboard', 'love', 'dj', 'setting', 'skin', 'play', 'pause', 'comment', 'refresh']) assert.ok(themeGlyphs.tide[name] && themeGlyphs.signal[name] && themeGlyphs.petals[name])
  assert.equal(state.activeAppearance.value.layout, 'sidebar')
  assert.equal(controller.getThemeSnapshot().isDark, true)
  assert.equal(controller.getThemeSnapshot().themeId, 'plugin:lx.theme-studio:tide')
  assert.equal(storage.get('lx.theme.plugin.v1'), 'plugin:lx.theme-studio:tide')
  assert.match(elements.at(-1).textContent, /--color-nav-font:#e2eff0/)
  assert.match(elements.at(-1).textContent, /--background-image:none/)
  assert.ok(!storage.has('lx.features.v1'))
  console.log('PASS selecting a theme publishes the full palette, saves identity and leaves feature preferences intact')
  await controller.selectPluginTheme('plugin:lx.theme-studio:petals')
  assert.equal(state.activeAppearance.value.layout, 'topbar'); assert.equal(controller.getThemeSnapshot().isDark, false)
  assert.ok(!elements.at(-1).textContent.includes('#e2eff0'))
  controller.setThemeMotionEnabled(false); assert.equal(documentElement.dataset.lxMotion, 'off')
  const restored = loader()(path.join(root, 'src/renderer/core/theme.ts'))
  restored.applyThemeSnapshot({}, 'green', false); await restored.loadPluginThemes()
  assert.equal(restored.selectedPluginTheme.value, 'plugin:lx.theme-studio:petals'); assert.equal(restored.themeMotionEnabled.value, false)
  console.log('PASS changing dark/light themes removes old tokens; theme and motion choices survive a fresh controller')
  catalog = [{ ...plugin, enabled: false }]
  await controller.loadPluginThemes()
  assert.equal(controller.selectedPluginTheme.value, ''); assert.equal(state.activeAppearance.value, null)
  assert.equal(Object.keys(state.themeViewOverrides.value).length, 0); assert.ok(!storage.has('lx.theme.plugin.v1'))
  assert.equal(controller.getThemeSnapshot().themeId, 'green'); assert.equal(attrs['data-lx-layout'], undefined)
  assert.equal(identity.themeIconRef('#icon-play'), '#icon-play')
  assert.ok(!elements[0].textContent.includes('--color-nav-font:'))
  await assert.rejects(controller.selectPluginTheme('plugin:lx.theme-studio:tide'))
  console.log('PASS disabling or removing a theme restores base palette/layout and rejects stale selections')
  let slow
  listRequest = () => new Promise(resolve => { slow = resolve })
  const outdated = controller.loadPluginThemes()
  for (let n = 0; n < 20 && !slow; n++) await Promise.resolve()
  assert.equal(typeof slow, 'function')
  listRequest = async() => []
  const latest = controller.loadPluginThemes()
  slow([plugin]); await Promise.all([outdated, latest])
  assert.equal(controller.pluginThemeCatalog.value.length, 0)
  listRequest = async() => [plugin]; await controller.loadPluginThemes(); await controller.selectPluginTheme('plugin:lx.theme-studio:signal')
  controller.removeContributedTheme('plugin:lx.theme-studio:signal')
  assert.equal(state.activeAppearance.value, null); assert.equal(controller.selectedPluginTheme.value, '')
  let ready
  prepareViews = () => new Promise(resolve => { ready = resolve })
  const preparing = controller.selectPluginTheme('plugin:lx.theme-studio:tide')
  for (let n = 0; n < 20; n++) { if (ready) break; await Promise.resolve() }
  assert.equal(state.activeAppearance.value, null, 'old layout remains active while theme templates prepare')
  controller.resetPluginTheme(); ready(); await preparing
  assert.equal(controller.selectedPluginTheme.value, '', 'reset cancels a pending theme selection')
  prepareViews = async() => { throw Error('template unavailable') }
  await assert.rejects(controller.selectPluginTheme('plugin:lx.theme-studio:signal'), /template unavailable/)
  assert.equal(state.activeAppearance.value, null); assert.equal(controller.themeLoadingKey.value, '')
  prepareViews = async() => {}
  console.log('PASS theme preparation is atomic; reset and load failures preserve the previous usable layout')
  // Custom identities share a complete host 24px fallback set, then override declared glyphs.
  state.activeAppearance.value = { identity: 'custom-paper', layout: 'sidebar', background: 'none', detail: 'sleeve', content: 'full' }
  state.activeThemeResources.value = { icons: { search: { path: 'M1 1h2v2H1Z' } } }
  assert.equal(identity.themeIconRef('#icon-search-2'), '#lx-icon-custom-paper-search')
  assert.equal(identity.activeThemeGlyphs.value.album.path, load(path.join(root, 'src/renderer/core/theme/icons.ts')).baseThemeGlyphs.album.path)
  assert.ok(identity.activeThemeGlyphs.value.leaderboard.path)
  controller.resetPluginTheme()
  console.log('PASS new identities retain complete host glyphs and resolve declared resource overrides through standard aliases')
  // A remains committed while a different plugin B is preparing.
  const other = { ...plugin, id: 'fixture.pending-theme', name: 'Pending theme' }
  listRequest = async() => [plugin, other]
  await controller.loadPluginThemes()
  await controller.selectPluginTheme('plugin:lx.theme-studio:signal')
  let releasePending
  let pendingEntered
  const entered = new Promise(resolve => { pendingEntered = resolve })
  prepareViews = () => { pendingEntered(); return new Promise(resolve => { releasePending = resolve }) }
  const pendingOther = controller.selectPluginTheme('plugin:fixture.pending-theme:tide')
  await entered
  listRequest = async() => [plugin]
  prepareViews = async() => {}
  await controller.loadPluginThemes()
  assert.equal(controller.selectedPluginTheme.value, 'plugin:lx.theme-studio:signal')
  assert.equal(storage.get('lx.theme.plugin.v1'), 'plugin:lx.theme-studio:signal')
  releasePending(); await pendingOther
  assert.equal(controller.selectedPluginTheme.value, 'plugin:lx.theme-studio:signal')
  console.log('PASS disappearing pending theme preserves the last committed theme and rejects late output')
  listRequest = async() => [plugin, other]
  await controller.loadPluginThemes()
  let releaseRemoved
  let removedEntered
  const removalEntered = new Promise(resolve => { removedEntered = resolve })
  prepareViews = () => { removedEntered(); return new Promise(resolve => { releaseRemoved = resolve }) }
  const pendingRemoved = controller.selectPluginTheme('plugin:fixture.pending-theme:tide')
  await removalEntered
  controller.removePluginThemes('fixture.pending-theme')
  assert.equal(controller.themeLoadingKey.value, '')
  assert.ok(!controller.pluginThemeCatalog.value.some(theme => theme.pluginId === 'fixture.pending-theme'))
  releaseRemoved(); await pendingRemoved
  assert.equal(controller.selectedPluginTheme.value, 'plugin:lx.theme-studio:signal')
  assert.equal(storage.get('lx.theme.plugin.v1'), 'plugin:lx.theme-studio:signal')
  prepareViews = async() => {}
  listRequest = async() => [plugin]
  console.log('PASS removing a pending plugin immediately revokes its generation without clearing the current theme')
  const dispose = controller.initializePluginThemes(); assert.ok(events.has('lx:collection-catalog-changed')); dispose(); assert.ok(!events.size)
  console.log('PASS stale catalog responses, explicit removal and listener disposal cannot reactivate an old theme')
})().catch(error => { console.error(error); process.exitCode = 1 })
