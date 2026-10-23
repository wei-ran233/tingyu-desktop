/* Real Electron integration smoke: isolated data, real sandbox/preload/protocol/view. */
const { app, BrowserWindow, ipcMain } = require('electron')
const { promises: fs, readFileSync, existsSync, mkdtempSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const ts = require('typescript')
const root = path.resolve(__dirname, '../..')
const cache = new Map()
let host
const profile = mkdtempSync(path.join(os.tmpdir(), 'lx-electron-profile-'))
app.commandLine.appendSwitch('user-data-dir', profile); app.setPath('userData', profile)
const load = file => {
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }; cache.set(file, module)
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const localRequire = name => {
    if (name === '@main/modules/winMain/main') return { getMainWindow: () => host, getWebContents: () => host.webContents }
    let target = name.startsWith('@common/') ? path.join(root, 'src/common', name.slice(8)) : name.startsWith('@main/') ? path.join(root, 'src/main', name.slice(6)) : name.startsWith('.') ? path.resolve(path.dirname(file), name) : null
    if (!target) {
      // Match the production webpack mapping for the ESM-only model SDK.
      if (name.startsWith('@earendil-works/pi-ai')) return require(path.join(root, 'node_modules/@earendil-works/pi-ai/dist', (name.slice('@earendil-works/pi-ai'.length) || '/index') + '.js'))
      return require(name)
    }
    target = [target, `${target}.ts`, `${target}.js`, path.join(target, 'index.ts')].find(f => existsSync(f) && !require('node:fs').statSync(f).isDirectory())
    if (!target) throw new Error(`Cannot resolve ${name} from ${file}`)
    return target.endsWith('.json') ? JSON.parse(readFileSync(target, 'utf8')) : load(target)
  }
  vm.runInThisContext(`(function(require,module,exports,__filename,__dirname){${source}\n})`, { filename: file })(localRequire, module, module.exports, file, file.endsWith('/plugin/views.ts') ? path.join(root, 'dist') : path.dirname(file))
  return module.exports
}
const { registerPluginScheme, installPluginProtocol } = load(path.join(root, 'src/main/modules/plugin/protocol.ts'))
const { PluginViewManager } = load(path.join(root, 'src/main/modules/plugin/views.ts'))
const { PluginService } = load(path.join(root, 'src/main/modules/plugin/service.ts'))
const { PLUGIN_EVENT_NAME } = load(path.join(root, 'src/common/ipcNames.ts'))
const { authorizePluginRequest } = load(path.join(root, 'src/common/plugin/requests.ts'))
registerPluginScheme()
const waitFor = async(fn, label) => {
  const until = Date.now() + 12000
  while (Date.now() < until) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 50)) }
  throw new Error(`Timed out: ${label}`)
}
let temp
app.whenReady().then(async() => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'lx-electron-smoke-'))
  global.lxDataPath = temp
  global.staticPath = path.join(root, 'src/static')
  host = new BrowserWindow({ width: 1100, height: 760, show: true, title: 'LX collection integration validation', webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false } })
  const hostFile = path.join(temp, 'host.html')
  await fs.writeFile(hostFile, '<body style="background:#fafafa">LX integration validation host</body>')
  host.webContents.on('console-message', event => { console.error('HOST', event.message) })
  await host.loadFile(hostFile)
  const { registerPluginModule, ensurePluginService } = load(path.join(root, 'src/main/modules/plugin/index.ts'))
  registerPluginModule()
  const service = await ensurePluginService()
  const { pluginViews: views } = load(path.join(root, 'src/main/modules/plugin/views.ts'))
  // This fixture replaces only music data and navigation, and executes the
  // production renderer IPC, gateway and controller in the actual host process.
  await host.webContents.executeJavaScript(`
    (() => {
      const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
      const root = ${JSON.stringify(root)}
      const ts = require(path.join(root, 'node_modules/typescript'))
      const cache = new Map()
      window.i18n = { t: () => '', locale: 'en-us' }
      const load = file => {
        if (cache.has(file)) return cache.get(file)
        const exports = {}; cache.set(file, exports)
        const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
        const localRequire = name => {
          if (name === '@renderer/router') return { default: { push: async() => {} } }
          if (name === '@common/utils/vueTools') return { watch: (get, callback) => { callback(get()); return () => {} } }
          let target = name.startsWith('@common/') ? path.join(root, 'src/common', name.slice(8)) : name.startsWith('@renderer/') ? path.join(root, 'src/renderer', name.slice(10)) : name.startsWith('.') ? path.resolve(path.dirname(file), name) : null
          if (!target) return require(name)
          target = [target, target + '.ts', target + '.js', target + '.json', path.join(target, 'index.ts')].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
          if (!target) throw new Error('Cannot resolve test module ' + name)
          return target.endsWith('.json') ? JSON.parse(fs.readFileSync(target, 'utf8')) : load(target)
        }
        vm.runInThisContext('(function(require,exports){' + source + String.fromCharCode(10) + '})', { filename: file })(localRequire, exports)
        return exports
      }
      const { CollectionController } = load(path.join(root, 'src/renderer/core/collection/controller.ts'))
      const { COLLECTION_SURFACE_COMMANDS } = load(path.join(root, 'src/common/collection/types.ts'))
      const { installCollectionGateway, registerCollectionController } = load(path.join(root, 'src/renderer/core/collection/gateway.ts'))
      const adapter = {
        surfaceId: 'list-music', commands: COLLECTION_SURFACE_COMMANDS['list-music'], supportsSort: false, supportsFilters: false,
        hasKey: key => /^opaque-[0-9]+$/.test(key),
        refresh: async() => ({ total: 10000, page: 1, pageCount: 1, pageSize: 100, facets: [], status: 'ready', title: '10,000 songs integration test' }),
        getItems: async(offset, limit) => Array.from({ length: Math.min(limit, 10000 - offset) }, (_, i) => ({ key: 'opaque-' + (offset + i), name: 'Song ' + (offset + i), singer: 'Test artist', available: true })),
        dispatch: async() => true, getOptions: async() => null,
      }
      const provider = { pluginId: 'lx.official-list', id: 'official-list', qualifiedId: 'lx.official-list/official-list' }
      window.smokeController = new CollectionController({ surfaceId: 'list-music', contextId: 'smoke', params: {}, adapter, provider })
      installCollectionGateway()
      window.stopSmoke = registerCollectionController(window.smokeController)
      window.resetSmokeSurface = async(surfaceId, provider) => {
        window.stopSmoke(); window.smokeController.dispose()
        window.smokeController = new CollectionController({ surfaceId, contextId: 'smoke:' + surfaceId, params: {}, adapter: { ...adapter, surfaceId, commands: COLLECTION_SURFACE_COMMANDS[surfaceId] }, provider })
        window.stopSmoke = registerCollectionController(window.smokeController)
        await window.smokeController.refresh()
      }
      return window.smokeController.refresh()
    })()
  `)
  const presentation = (pluginId, providerId) => ({ ownerId: pluginId, kind: 'collection', identity: { pluginId, providerId, surfaceId: 'list-music', contextId: 'smoke' }, entry: 'index.html', bounds: { x: 0, y: 0, width: 1100, height: 720 } })
  const show = p => host.webContents.executeJavaScript(`require('electron').ipcRenderer.invoke(${JSON.stringify(PLUGIN_EVENT_NAME.show_view)}, ${JSON.stringify({ ...p.identity, ownerId: p.ownerId, kind: p.kind, bounds: p.bounds })})`)
  const first = await show(presentation('lx.official-list', 'official-list'))
  const { webContents } = require('electron')
  const list = webContents.fromId(first.webContentsId)
  list.on('console-message', event => { if (event.level === 'error') console.error('PLUGIN', event.message) })
  await waitFor(() => list.executeJavaScript("document.querySelectorAll('.row').length > 0 && document.body.textContent.includes('Song 0')"), 'official list renders through custom session protocol')
  assert.equal(await list.executeJavaScript('typeof require'), 'undefined')
  assert.equal(await list.executeJavaScript('typeof process'), 'undefined')
  assert.ok(await list.executeJavaScript("document.querySelectorAll('.row').length < 100"))
  await list.executeJavaScript("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Select all').click()")
  await waitFor(() => list.executeJavaScript("document.querySelector('.check')?.checked === true"), 'all-selected state returns from host')
  await host.webContents.executeJavaScript("window.smokeController.attachProvider({pluginId:'lx.card-gallery',id:'card-gallery',qualifiedId:'lx.card-gallery/card-gallery'})")
  const card = await show(presentation('lx.card-gallery', 'card-gallery'))
  const cards = webContents.fromId(card.webContentsId)
  await waitFor(() => cards.executeJavaScript("document.querySelectorAll('.card').length > 0 && document.body.textContent.includes('Song 0')"), 'cards render')
  assert.ok(await cards.executeJavaScript("document.querySelectorAll('.card').length < 100"))
  assert.equal(await cards.executeJavaScript("document.querySelector('.check').checked"), true)
  await cards.executeJavaScript("document.querySelector('.scroller').scrollTop=document.querySelector('.scroller').scrollHeight")
  await waitFor(() => cards.executeJavaScript("document.body.textContent.includes('Song 9999')"), 'cards virtualize end of 10,000-song library')
  await host.webContents.executeJavaScript("window.smokeController.attachProvider({pluginId:'lx.official-list',id:'official-list',qualifiedId:'lx.official-list/official-list'})")
  const same = await show(presentation('lx.official-list', 'official-list'))
  assert.equal(same.webContentsId, first.webContentsId)
  views.hide('stale-owner')
  assert.equal(host.contentView.children.find(v => v.webContents?.id === first.webContentsId).getVisible(), true)
  views.hide('lx.official-list')
  assert.equal(host.contentView.children.find(v => v.webContents?.id === first.webContentsId).getVisible(), false)
  const hiddenWrite = await list.executeJavaScript("window.lxPlugin.dispatch({revision:1,command:'clearSelection'}).then(()=>false,error=>String(error.message).includes('Inactive rendering'))")
  assert.equal(hiddenWrite, true, 'cached hidden views cannot issue commands')
  views.show(presentation('lx.official-list', 'official-list'))
  views.pushTheme({ revision: 2, themeId: 'smoke', isDark: true, tokens: { '--lx-background': '#121212', '--lx-text': '#eeeeee' } })
  await waitFor(() => list.executeJavaScript("getComputedStyle(document.body).backgroundColor === 'rgb(18, 18, 18)'"), 'live theme')
  const evidence = path.join(root, '.runtime/collection-validation-20261019'); await fs.mkdir(evidence, { recursive: true })
  await list.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  await fs.writeFile(path.join(evidence, 'electron-list.png'), (await list.capturePage()).toPNG())
  for (const surfaceId of ['search-music', 'list-music', 'songlist-detail-music', 'leaderboard-music']) {
    for (const [pluginId, providerId] of [['lx.official-list', 'official-list'], ['lx.card-gallery', 'card-gallery']]) {
      await host.webContents.executeJavaScript(`window.resetSmokeSurface(${JSON.stringify(surfaceId)}, ${JSON.stringify({ pluginId, id: providerId, qualifiedId: pluginId + '/' + providerId })})`)
      const p = presentation(pluginId, providerId); p.identity.surfaceId = surfaceId; p.identity.contextId = 'smoke:' + surfaceId
      const result = await show(p)
      const contents = webContents.fromId(result.webContentsId)
      await waitFor(() => contents.executeJavaScript("document.body.textContent.includes('Song 0')"), surfaceId + '/' + pluginId)
    }
  }
  await fs.writeFile(path.join(evidence, 'smoke.json'), JSON.stringify({ passed: true, checks: ['custom-session-protocol','sandbox-no-node','list-virtualization','real-ipc-gateway-controller-selection','cards-virtualization-10000','view-instance-reuse','owner-scoped-hide','hidden-view-action-denial','live-theme','both-providers-four-surfaces'], electron: process.versions.electron }, null, 2))
  console.log('PASS real Electron plugin view integration (10 checks, including 8 surface/provider combinations)')
  views.destroyForPlugin('lx.official-list'); views.destroyForPlugin('lx.card-gallery'); host.destroy()
}).then(async() => { if (temp) await fs.rm(temp, { recursive: true, force: true }); await fs.rm(profile, { recursive: true, force: true }); app.exit(0) }).catch(async error => {
  console.error(error); if (host && !host.isDestroyed()) host.destroy(); if (temp) await fs.rm(temp, { recursive: true, force: true }); await fs.rm(profile, { recursive: true, force: true }); app.exit(1)
})
setTimeout(() => { console.error('Electron smoke exceeded 60 seconds'); app.exit(1) }, 60000).unref()
