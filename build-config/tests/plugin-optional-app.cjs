/* Built production entry, signed packages and real isolated runtimes; disposable profile. */
const { app, BrowserWindow, globalShortcut, webContents, dialog } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const JSZip = require('jszip')
const root = path.resolve(__dirname, '../..')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-optional-app-'))
const evidence = path.resolve(process.env.LX_PLUGIN_OPTIONAL_EVIDENCE_DIR || path.join(root, '.runtime/plugin-optional-20261022/app'))
fs.mkdirSync(evidence, { recursive: true }); fs.mkdirSync(path.join(profile, 'LxDatas'))
app.commandLine.appendSwitch('user-data-dir', profile); app.setPath('userData', profile)
app.getVersion = () => require(path.join(root, 'package.json')).version
app.setAsDefaultProtocolClient = () => false
globalShortcut.register = () => false
const startedAt = new Date().toISOString()
const errors = []; const checks = []; const observations = {}; let host; let finished = false
app.on('browser-window-created', (_event, win) => {
  Object.assign(global.lx?.appSetting ?? {}, { 'common.isAgreePact': true, 'common.langId': 'zh-cn', 'player.startupAutoPlay': false })
  win.webContents.on('console-message', event => {
    if (event.level === 'error' && /TypeError|ReferenceError|Unhandled|uncaught/.test(event.message) && win.webContents.getURL().includes('/index.html')) errors.push(event.message)
  })
})
process.on('unhandledRejection', error => errors.push(String(error?.stack ?? error)))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const waitFor = async(fn, label) => { const end = Date.now() + 30000; while (Date.now() < end) { if (await fn()) return; await delay(50) } throw Error('Timed out: ' + label) }
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => [key, canonical(value[key])])) : value
const key = crypto.generateKeyPairSync('ed25519')
const packageFixture = async(id, overrides = {}, script = 'void lxRuntime.start({handlers:{}})') => {
  const manifest = { id, name: id, version: '1.0.0', apiVersion: '1.9.0', main: 'index.html', permissions: [], runtime: { entry: 'runtime.html', timeoutMs: 5000 }, ...overrides, publicKey: key.publicKey.export({ type: 'spki', format: 'der' }).toString('base64') }
  const files = new Map([['index.html', Buffer.from('<h1>Optional fixture</h1>')], ['runtime.html', Buffer.from('<!doctype html><html><meta charset="utf-8"><body><script src="runtime.js"></script></body></html>')], ['runtime.js', Buffer.from(script)]])
  const digests = [...files].map(([path, data]) => ({ path, sha256: crypto.createHash('sha256').update(data).digest('hex') })).sort((a, b) => a.path.localeCompare(b.path))
  manifest.signature = crypto.sign(null, Buffer.from(JSON.stringify(canonical({ format: 'lxplugin-signature/1', manifest, files: digests }))), key.privateKey).toString('base64')
  const zip = new JSZip(); zip.file('manifest.json', JSON.stringify(manifest)); for (const [name, data] of files) zip.file(name, data)
  const file = path.join(profile, id + '-' + manifest.version + '.lxplugin'); fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' })); return file
}
const finish = async(code, error) => {
  if (finished) return
  finished = true; clearTimeout(deadline)
  if (error) console.error(error)
  try { if (host && !host.isDestroyed()) fs.writeFileSync(path.join(evidence, 'optional-final.png'), (await host.webContents.capturePage()).toPNG()) } catch (error) { errors.push(String(error)) }
  fs.writeFileSync(path.join(evidence, 'app-results.json'), JSON.stringify({ passed: code === 0, startedAt, completedAt: new Date().toISOString(), electron: process.versions.electron, profile: 'temporary', source: 'dist/main.js', checks, observations, errors, error: error?.stack }, null, 2))
  try { global.lx.isSkipTrayQuit = true } catch {}
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.destroy()
  fs.rmSync(profile, { recursive: true, force: true }); app.exit(code)
}
const deadline = setTimeout(() => { void finish(1, Error('Optional app exceeded 240 seconds')) }, 240000)
require(path.join(root, 'dist/main.js'))
app.whenReady().then(async() => {
  await waitFor(() => { host = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/index.html')); return host }, 'built window')
  host.webContents.setBackgroundThrottling(false); host.show(); host.focus()
  const run = code => host.webContents.executeJavaScript(code)
  const ipc = (name, params) => run(`require('electron').ipcRenderer.invoke(${JSON.stringify(name)},${JSON.stringify(params)})`)
  const info = async id => (await ipc('plugin_list')).find(plugin => plugin.id === id)
  const toggle = (id, enabled) => ipc('plugin_set_enabled', { pluginId: id, enabled })
  const contents = id => webContents.getAllWebContents().find(wc => wc.getURL().startsWith(`lxplugin://${id}/runtime.html`))
  const install = async file => {
    dialog.showOpenDialog = async() => ({ canceled: false, filePaths: [file] })
    const preview = await ipc('plugin_install')
    await ipc('plugin_confirm_install', { token: preview.token })
    return preview
  }
  const aId = 'fixture.optional-core'; const bId = 'fixture.optional-target'
  const schema = { type: 'object', properties: { text: { type: 'string', maxLength: 100 } } }
  const event = id => ({ id, kind: 'event', version: '1.0.0', input: schema, output: { type: 'object', properties: {} } })
  const core = await packageFixture(aId, {
    permissions: ['events.publish', 'extensions.subscribe', 'settings.scoped'],
    optionalDependencies: [{ id: bId, minVersion: '1.0.0', maxVersionExclusive: '2.0.0' }],
    extensionPoints: [event('core')],
    extensions: [{ id: 'receive', target: bId + '/ping', version: '1.0.0', handler: 'receive' }],
    settings: [{ key: 'independent', title: 'Independent setting', type: 'boolean', default: true }],
  }, `void lxRuntime.start({activate:context=>{window.__core=()=>context.publishEvent('${aId}/core',{text:'alive'});document.body.dataset.started='yes'},handlers:{receive:value=>{document.body.dataset.last=value.text;return {}}}})`)
  const targetScript = `void lxRuntime.start({activate:context=>{window.__ping=text=>context.publishEvent('${bId}/ping',{text})},handlers:{}})`
  const target = version => packageFixture(bId, { version, permissions: ['events.publish'], extensionPoints: [event('ping')] }, targetScript)
  await waitFor(() => run("Boolean(document.getElementById('root')?.__vue_app__)"), 'Vue')
  await waitFor(async() => (await info('lx.official-suite'))?.available, 'official suite')
  const preview = await install(core)
  assert.deepEqual(preview.optionalDependencies, [{ id: bId, minVersion: '1.0.0', maxVersionExclusive: '2.0.0' }])
  assert.deepEqual(preview.conflicts, [])
  const a = contents(aId); assert.ok(a)
  const aContentsId = a.id
  const initialCoreActivations = (await ipc('plugin_runtime_events')).filter(event => event.pluginId === aId && event.state === 'activating').length
  assert.equal(initialCoreActivations, 1)
  assert.equal((await info(aId)).available, true)
  assert.equal((await info(aId)).optionalDependencyStates[0].available, false)
  assert.deepEqual(await a.executeJavaScript('window.__core()'), { delivered: 0, failed: 0, skipped: 0 })
  assert.deepEqual(await a.executeJavaScript('({node:typeof require,host:typeof window.lxPlugin})'), { node: 'undefined', host: 'undefined' })
  checks.push('signed A starts with missing optional B; independent event and setting remain available in sandbox')

  await install(await target('1.0.0'))
  assert.equal((await info(aId)).optionalDependencyStates[0].available, true)
  await run("document.getElementById('root').__vue_app__.config.globalProperties.$router.push('/setting?name=FeatureManagement&section=packages')")
  await waitFor(() => run(`document.querySelector('[data-plugin-id="${aId}"] [data-plugin-optional-status="${bId}"]')?.textContent.includes('当前已接入')`), 'management shows connected optional integration')
  await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  fs.writeFileSync(path.join(evidence, 'optional-connected.png'), (await host.webContents.capturePage()).toPNG())
  assert.deepEqual(await contents(bId).executeJavaScript("window.__ping('first')"), { delivered: 1, failed: 0, skipped: 0 })
  assert.equal(await a.executeJavaScript('document.body.dataset.last'), 'first')
  await toggle(bId, false)
  await waitFor(() => run(`document.querySelector('[data-plugin-id="${aId}"] [data-plugin-optional-status="${bId}"]')?.textContent.includes('未接入')`), 'management shows disconnected optional integration')
  assert.equal(contents(aId).id, aContentsId)
  assert.equal((await info(aId)).optionalDependencyStates[0].available, false)
  await ipc('plugin_set_setting', { pluginId: aId, key: 'independent', value: false })
  assert.deepEqual(await a.executeJavaScript('window.__core()'), { delivered: 0, failed: 0, skipped: 0 })
  await toggle(bId, true)
  assert.deepEqual(await contents(bId).executeJavaScript("window.__ping('returned')"), { delivered: 1, failed: 0, skipped: 0 })
  assert.equal(contents(aId).id, aContentsId)
  checks.push('installing B attaches event subscription and management shows connected/disconnected status; B disable/reenable preserves A webContents and independent settings')

  await run("document.getElementById('root').__vue_app__.config.globalProperties.$router.push('/extensions')")
  await toggle('lx.official-suite', false)
  await waitFor(() => run(`document.querySelector('[data-plugin-id="${aId}"] [data-plugin-optional-status="${bId}"]')?.textContent.includes('当前已接入')`), 'recovery management connected without official suite')
  await toggle(bId, false)
  await waitFor(() => run(`document.querySelector('[data-plugin-id="${aId}"] [data-plugin-optional-status="${bId}"]')?.textContent.includes('未接入')`), 'recovery management disconnected without official suite')
  await toggle(bId, true)
  await waitFor(() => run(`document.querySelector('[data-plugin-id="${aId}"] [data-plugin-optional-status="${bId}"]')?.textContent.includes('当前已接入')`), 'recovery management reconnected without official suite')
  assert.equal(contents(aId).id, aContentsId)
  await toggle('lx.official-suite', true)
  checks.push('standalone extensions recovery page tracks optional status while the official suite is disabled and keeps A core alive')

  await install(await target('2.0.0'))
  assert.match((await info(aId)).optionalDependencyStates[0].reason, /版本/)
  assert.deepEqual(await contents(bId).executeJavaScript("window.__ping('mismatch')"), { delivered: 0, failed: 0, skipped: 0 })
  assert.equal(await a.executeJavaScript('document.body.dataset.last'), 'returned')
  await ipc('plugin_rollback', { pluginId: bId })
  assert.deepEqual(await contents(bId).executeJavaScript("window.__ping('rollback')"), { delivered: 1, failed: 0, skipped: 0 })
  assert.equal(contents(aId).id, aContentsId)
  checks.push('B upgrade outside range removes only integration; rollback reconnects without restarting A')

  contents(bId).forcefullyCrashRenderer()
  await waitFor(async() => (await info(bId)).lifecycleState === 'failed', 'B quarantine')
  assert.equal((await info(aId)).available, true)
  assert.equal((await info(aId)).optionalDependencyStates[0].available, false)
  assert.deepEqual(await a.executeJavaScript('window.__core()'), { delivered: 0, failed: 0, skipped: 0 })
  await toggle(bId, true)
  assert.deepEqual(await contents(bId).executeJavaScript("window.__ping('recovered')"), { delivered: 1, failed: 0, skipped: 0 })
  await ipc('plugin_uninstall', { pluginId: bId })
  assert.equal((await info(aId)).available, true)
  assert.equal(contents(aId).id, aContentsId)
  assert.equal((await info(aId)).optionalDependencyStates[0].available, false)
  checks.push('B crash quarantines B only; explicit recovery reconnects and uninstall leaves A core alive')

  await run(`document.getElementById('root').__vue_app__.config.globalProperties.$router.push('/setting?name=PluginSettings&section=${aId}')`)
  await waitFor(() => run("document.querySelector('.plugin-settings-info')?.textContent.includes('可选依赖')"), 'optional settings details')
  const detail = await run("document.querySelector('.plugin-settings-info').textContent")
  assert.match(detail, /未接入/)
  assert.match(detail, /fixture.optional-target/)
  await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  fs.writeFileSync(path.join(evidence, 'optional-settings.png'), (await host.webContents.capturePage()).toPNG())
  observations.optionalSettings = detail
  checks.push('real Vue settings shows declared optional range and nonfatal missing-target reason')

  const x = 'fixture.conflict-x'; const y = 'fixture.conflict-y'
  await install(await packageFixture(x, { conflicts: [{ id: y, minVersion: '1.0.0' }] }))
  const conflictPreview = await install(await packageFixture(y))
  assert.deepEqual(conflictPreview.conflicts, [])
  for (const id of [x, y]) { const p = await info(id); assert.equal(p.enabled, true); assert.equal(p.available, false); assert.match(p.blockedReason, /冲突/) }
  assert.ok(!contents(x)); assert.ok(!contents(y))
  await toggle(y, false)
  assert.equal((await info(x)).available, true)
  assert.equal((await info(y)).lifecycleState, 'disabled')
  assert.equal(contents(aId).id, aContentsId)
  observations.coreRuntimeId = aContentsId
  observations.initialCoreActivations = initialCoreActivations
  observations.finalCoreRuntimeId = contents(aId).id
  assert.equal(observations.finalCoreRuntimeId, aContentsId)
  checks.push('one-sided conflict blocks both enabled cores; disabling one side restores the other without changing switches')
  const previewId = 'fixture.preview-only'
  const previewFile = await packageFixture(previewId, {
    dependencies: [{ id: 'lx.official-suite' }],
    optionalDependencies: [{ id: bId, minVersion: '1.0.0', maxVersionExclusive: '2.0.0' }],
    conflicts: [{ id: 'fixture.legacy', maxVersionExclusive: '3.0.0' }],
  })
  dialog.showOpenDialog = async() => ({ canceled: false, filePaths: [previewFile] })
  await run("document.getElementById('root').__vue_app__.config.globalProperties.$router.push('/setting?name=FeatureManagement&section=packages')")
  await waitFor(() => run("Array.from(document.querySelectorAll('button')).some(button=>button.textContent.includes('安装 .lxplugin'))"), 'plugin manager install button')
  await run("Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes('安装 .lxplugin')).click();void 0")
  await waitFor(() => run("Array.from(document.querySelectorAll('main')).some(main=>main.textContent.includes('Required dependencies:')&&main.textContent.includes('fixture.preview-only'))"), 'real install confirmation')
  const confirmation = await run("Array.from(document.querySelectorAll('main')).find(main=>main.textContent.includes('Required dependencies:')).textContent")
  for (const expected of ['Ed25519 fingerprint:', 'Permissions:', 'Required dependencies:', 'lx.official-suite', 'Optional dependencies:', bId + ' >= 1.0.0, < 2.0.0', 'Conflicts:', 'fixture.legacy < 3.0.0']) assert.ok(confirmation.includes(expected), expected)
  observations.confirmation = confirmation
  await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,300))))')
  fs.writeFileSync(path.join(evidence, 'optional-install-preview.png'), (await host.webContents.capturePage()).toPNG())
  await run("Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Cancel').click();void 0")
  await waitFor(() => run("!Array.from(document.querySelectorAll('main')).some(main=>main.textContent.includes('Required dependencies:'))"), 'preview cancellation')
  assert.equal(await info(previewId), undefined)
  checks.push('real management install confirmation shows fingerprint, permissions and all three relationships; cancel leaves package uninstalled')
  assert.deepEqual(errors, [])
  await finish(0)
}).catch(error => { void finish(1, error) })
