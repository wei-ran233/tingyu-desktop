/* Actual Vue renderer + actual feature registry/component; no Electron or network. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const Vue = require('vue')
const { compile } = require('@vue/compiler-dom')
const root = path.resolve(__dirname, '../..')
const featurePreferences = Vue.ref({ disabled: [], views: {} })
const cache = new Map()
const warnings = []
const load = file => {
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }; cache.set(file, module)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const requireLocal = name => {
    if (name === './state') return { featurePreferences }
    let target = name.startsWith('@common/') ? path.join(root, 'src/common', name.slice(8)) : name.startsWith('.') ? path.resolve(path.dirname(file), name) : null
    if (!target) return require(name)
    target = [target, target + '.ts', path.join(target, 'index.ts')].find(file => fs.existsSync(file) && fs.statSync(file).isFile())
    return load(target)
  }
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { console: { ...console, warn: (...args) => warnings.push(args) } }, { filename: file })(requireLocal, module, module.exports)
  return module.exports
}
const { registerFunction, registerFeature, registerFeatureView } = load(path.join(root, 'src/renderer/core/features/registry.ts'))
const { loadFeatureComponent, preloadFeatureViews } = load(path.join(root, 'src/renderer/core/features/component.ts'))
const node = (type, text = '') => ({ type, text, children: [], props: {}, parent: null })
const renderer = Vue.createRenderer({
  createElement: type => node(type),
  createText: text => node('text', text),
  createComment: text => node('comment', text),
  setText: (target, text) => { target.text = text },
  setElementText: (target, text) => { target.text = text },
  patchProp: (target, key, _prev, next) => { target.props[key] = next },
  insert: (target, parent, anchor) => { target.parent = parent; const index = parent.children.indexOf(anchor); index < 0 ? parent.children.push(target) : parent.children.splice(index, 0, target) },
  remove: target => { const index = target.parent?.children.indexOf(target); if (index >= 0) target.parent.children.splice(index, 1) },
  parentNode: target => target.parent,
  nextSibling: target => target.parent?.children[target.parent.children.indexOf(target) + 1],
})
const flush = async() => { for (let i = 0; i < 5; i++) { await Promise.resolve(); await Vue.nextTick() } }
const run = async() => {
  let setups = 0
  let disposals = 0
  registerFunction({ id: 'fixture', pluginId: 'official', displayName: 'Fixture', defaultView: 'classic', load: async() => ({ setup() { setups++; Vue.onUnmounted(() => { disposals++ }); return { counter: Vue.ref(3) } } }) })
  const view = (id, label) => ({ id, featureId: 'fixture', pluginId: 'independent.renderer', displayName: label, mode: 'classic', load: async() => ({ render(ctx, renderCache) { renderCache[0] ??= label; return Vue.h('section', null, renderCache[0] + ':' + ctx.counter) } }) })
  registerFeatureView(view('classic', 'default'))
  const component = await loadFeatureComponent('fixture')
  const container = node('root')
  const app = renderer.createApp(component)
  const instance = app.mount(container)
  const uid = instance.$.uid
  instance.counter = 8; await flush()
  assert.equal(container.children[0].text, 'default:8')
  registerFeatureView(view('late', 'alternative'))
  featurePreferences.value.views.fixture = 'late'; await flush()
  assert.equal(container.children[0].text, 'alternative:8')
  assert.equal(instance.$.uid, uid)
  assert.equal(setups, 1)
  assert.equal(disposals, 0)
  assert.equal(container.children[0].type, 'section', 'native roots keep their layout without wrappers')
  featurePreferences.value.views.fixture = 'classic'; await flush()
  let prepared
  const { themeViewOverrides } = load(path.join(root, 'src/renderer/core/theme/state.ts'))
  const readyView = view('prepared', 'prepared')
  registerFeatureView({ ...readyView, load: async() => { await new Promise(resolve => { prepared = resolve }); return readyView.load() } })
  const preparation = preloadFeatureViews({ fixture: 'prepared' }); await flush()
  assert.equal(container.children[0].text, 'default:8')
  prepared(); await preparation
  themeViewOverrides.value = { fixture: 'prepared' }; await flush()
  assert.equal(container.children[0].text, 'prepared:8'); assert.equal(instance.$.uid, uid)
  themeViewOverrides.value = {}; await flush()
  assert.equal(container.children[0].text, 'default:8', 'template event/vnode caches do not cross views')
  themeViewOverrides.value = { fixture: 'late' }; await flush()
  assert.equal(container.children[0].text, 'alternative:8')
  assert.equal(featurePreferences.value.views.fixture, 'classic', 'theme view overrides never overwrite user preferences')
  assert.equal(instance.$.uid, uid)
  themeViewOverrides.value = { fixture: 'missing' }; await flush()
  assert.equal(container.children[0].text, 'default:8', 'missing theme views fall back to the user view')
  themeViewOverrides.value = {}; await flush()
  const { activeAppearance } = load(path.join(root, 'src/renderer/core/theme/state.ts'))
  registerFeatureView({ ...view('theme-signal', 'scoped'), themeIdentity: 'signal' })
  featurePreferences.value.views.fixture = 'theme-signal'; await flush()
  assert.equal(container.children[0].text, 'default:8', 'theme renderers remain unavailable outside their identity')
  activeAppearance.value = { identity: 'signal', layout: 'rail', background: 'signal', detail: 'sleeve', content: 'full' }; await flush()
  assert.equal(container.children[0].text, 'scoped:8'); assert.equal(instance.$.uid, uid)
  activeAppearance.value = null; await flush()
  assert.equal(container.children[0].text, 'default:8')
  featurePreferences.value.views.fixture = 'classic'; await flush()
  for (const [id, template] of [
    ['blocks', '<section><div>{{ counter }}</div><strong>{{ counter + 1 }}</strong></section>'],
    ['other-blocks', '<section><article v-if="counter > 0"><b>{{ counter }}</b></article></section>'],
  ]) {
    // Evaluate only these fixed test templates, matching Vue's runtime compiler.
    // eslint-disable-next-line no-new-func
    const render = new Function('Vue', compile(template, { mode: 'function', prefixIdentifiers: true }).code)(Vue)
    registerFeatureView({ ...view(id, id), load: async() => ({ render }) })
    featurePreferences.value.views.fixture = id; await flush()
    assert.equal(container.children[0].props['data-renderer'], id)
    assert.equal(instance.$.uid, uid)
  }
  registerFeatureView({ ...view('broken', 'broken'), load: async() => { throw new Error('fixture renderer unavailable') } })
  featurePreferences.value.views.fixture = 'broken'; await flush()
  assert.equal(container.children[0].text, 'default:8')
  assert.equal(warnings.length, 1)
  assert.throws(() => registerFeatureView(view('late', 'duplicate')), /duplicate/)
  assert.throws(() => registerFeature({ id: 'duplicates', pluginId: 'p', displayName: 'bad', defaultView: 'same', load: async() => ({}) }, [{ ...view('same', 'a'), featureId: 'duplicates' }, { ...view('same', 'b'), featureId: 'duplicates' }]), /duplicate/)
  app.unmount(); await flush()
  assert.equal(disposals, 1)
  console.log('PASS independent function/view registration, atomic theme preparation and ownership preserve preferences and model, template cache, layout and disposal (19 checks)')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
