const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '../..')
let effects = []
const songs = Array.from({ length: 90 }, (_, i) => ({ id: `internal-id-${i}`, source: 'kw', name: `Song ${i}`, singer: 'Test', meta: {} }))
const music = {
  musicKey: info => `${info.source}:${info.id}`,
  toMusicSummary: info => ({ key: info.id, name: info.name, available: true }),
  addToNext: items => effects.push(items), addToLater: items => effects.push(items),
  toggleLoveInfo: async items => effects.push(items), dislikeMusic: async items => effects.push(items),
}
const listInfos = { kw: { key: '', total: 90, limit: 30, maxPage: 3 } }
const imports = {
  '../music': music,
  '@common/utils/vueRouter': { useRouter: () => ({ push() {} }) },
  '@renderer/store/search/state': { searchText: { value: '' } },
  '@renderer/store/search/music': { listInfos, search: async(text, page) => { listInfos.kw.key = `${page}__${text}`; return songs.slice((page - 1) * 30, page * 30) } },
}
const cache = new Map()
const load = file => {
  if (cache.has(file)) return cache.get(file)
  const exports = {}; cache.set(file, exports)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const requireLocal = name => {
    if (imports[name]) return imports[name]
    const target = name.startsWith('@common/') ? path.join(root, 'src/common', name.slice(8)) : name.startsWith('.') ? path.resolve(path.dirname(file), name) : null
    if (target) return load(`${target}.ts`)
    throw new Error(`Unexpected import ${name}`)
  }
  vm.runInNewContext(source, { exports, require: requireLocal, console, TextEncoder, crypto: require('node:crypto').webcrypto, window: { i18n: { t: key => key } } }, { filename: file })
  return exports
}
const { SearchCollectionAdapter } = load(path.join(root, 'src/renderer/core/collection/adapters/search.ts'))
const { CollectionController } = load(path.join(root, 'src/renderer/core/collection/controller.ts'))
const test = async() => {
  const adapter = new SearchCollectionAdapter({ source: 'kw', text: 'test', page: '2' })
  const controller = new CollectionController({ surfaceId: 'search-music', contextId: 'adapter-test', params: {}, adapter, provider: null })
  const dispatch = (command, extra = {}) => controller.dispatch({ revision: controller.snapshot().revision, command, ...extra })
  await controller.refresh(); assert.equal(controller.snapshot().page, 2)
  const page = await controller.getItems({ revision: controller.snapshot().revision, offset: 30, limit: 30 })
  assert.equal(page.items[0].name, 'Song 30'); assert.ok(!page.items[0].key.includes('internal-id'))
  await dispatch('setPage', { value: 3 }); assert.equal(controller.snapshot().page, 3)
  await dispatch('refresh'); assert.equal(controller.snapshot().page, 3)
  await dispatch('selectAll')
  await dispatch('select', { target: { kind: 'item', keys: [page.items[0].key] }, value: 'remove' })
  for (const command of ['playNext', 'playLater', 'toggleLove', 'dislike']) {
    await dispatch(command, { target: { kind: 'selection' } })
    const last = effects.at(-1)
    assert.equal(last.length, 89); assert.ok(last.every(item => item.id !== 'internal-id-30'))
  }
  console.log('PASS adapter initial page, page changes, refresh, opaque keys and cross-page batch exclusions (8 checks)')
}
test().catch(error => { console.error(error); process.exitCode = 1 })
