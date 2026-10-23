/* Built production entry, signed packages and real isolated runtimes; disposable profile. */
const { app, BrowserWindow, globalShortcut, webContents, dialog } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const JSZip = require('jszip')
const root = path.resolve(__dirname, '../..')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-settings-transfer-app-'))
const evidence = path.resolve(process.env.LX_PLUGIN_SETTINGS_TRANSFER_EVIDENCE_DIR || path.join(root, '.runtime/plugin-settings-transfer-20261022/app'))
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
  const manifest = { id, name: id, version: '1.0.0', apiVersion: '1.10.0', main: 'index.html', permissions: [], runtime: { entry: 'runtime.html', timeoutMs: 5000 }, ...overrides, publicKey: key.publicKey.export({ type: 'spki', format: 'der' }).toString('base64') }
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
  try { if (host && !host.isDestroyed()) fs.writeFileSync(path.join(evidence, 'settings-transfer-final.png'), (await host.webContents.capturePage()).toPNG()) } catch (error) { errors.push(String(error)) }
  fs.writeFileSync(path.join(evidence, 'app-results.json'), JSON.stringify({ passed: code === 0, startedAt, completedAt: new Date().toISOString(), electron: process.versions.electron, profile: 'temporary', source: 'dist/main.js', checks, observations, errors, error: error?.stack }, null, 2))
  try { global.lx.isSkipTrayQuit = true } catch {}
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.destroy()
  fs.rmSync(profile, { recursive: true, force: true }); app.exit(code)
}
const deadline = setTimeout(() => { void finish(1, Error('Settings transfer app exceeded 240 seconds')) }, 240000)
const developmentId = 'fixture.unsigned-settings'
const developmentRoot = path.join(profile, 'LxDatas', 'plugins')
const development = path.join(developmentRoot, developmentId)
fs.mkdirSync(development, { recursive: true })
fs.writeFileSync(path.join(development, 'index.html'), '<h1>Unsigned development fixture</h1>')
fs.writeFileSync(path.join(development, 'manifest.json'), JSON.stringify({
  id: developmentId, name: developmentId, version: '1.0.0', apiVersion: '1.10.0', main: 'index.html',
  permissions: ['settings.scoped'], settings: [{ key: 'local', title: 'Development local', type: 'number', default: 2, exportable: true }],
}))
// Production webpack deliberately removes LX_PLUGIN_DEV_DIR. Restore a temporary
// development registry entry, as an unpackaged app can load after a dev session.
const developmentManifest = JSON.parse(fs.readFileSync(path.join(development, 'manifest.json'), 'utf8'))
fs.writeFileSync(path.join(developmentRoot, 'registry.json'), JSON.stringify({ version: 1, plugins: [{
  id: developmentId, path: developmentId, source: 'development', enabled: true,
  publicKey: '', publicKeyFingerprint: '', manifest: developmentManifest,
  fileDigests: { 'index.html': crypto.createHash('sha256').update(fs.readFileSync(path.join(development, 'index.html'))).digest('hex') },
  installedAt: Date.now(),
}] }))
require(path.join(root, 'dist/main.js'))
app.whenReady().then(async() => {
  await waitFor(() => { host = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/index.html')); return host }, 'built window')
  host.webContents.setBackgroundThrottling(false); host.show(); host.focus()
  const run = code => host.webContents.executeJavaScript(code)
  const ipc = (name, params) => run(`require('electron').ipcRenderer.invoke(${JSON.stringify(name)},${JSON.stringify(params)})`)
  const info = async id => (await ipc('plugin_list')).find(plugin => plugin.id === id)
  const get = id => ipc('plugin_get_settings', { pluginId: id })
  const set = (pluginId, key, value) => ipc('plugin_set_setting', { pluginId, key, value })
  const contents = id => webContents.getAllWebContents().find(wc => wc.getURL().startsWith(`lxplugin://${id}/runtime.html`))
  const observe = promise => promise.then(value => ({ value }), error => ({ error: String(error.message) }))
  const install = async file => {
    dialog.showOpenDialog = async() => ({ canceled: false, filePaths: [file] })
    const preview = await ipc('plugin_install'); return ipc('plugin_confirm_install', { token: preview.token })
  }
  const navigate = id => run(`document.getElementById('root').__vue_app__.config.globalProperties.$router.push('/setting?name=PluginSettings&section=${id}')`)
  const capture = async name => {
    await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    fs.writeFileSync(path.join(evidence, name), (await host.webContents.capturePage()).toPNG())
  }
  await waitFor(() => run("Boolean(document.getElementById('root')?.__vue_app__)"), 'Vue')
  await waitFor(async() => (await info('lx.official-suite'))?.available, 'official suite')
  const id = 'fixture.settings-transfer'
  const file = await packageFixture(id, {
    permissions: ['settings.scoped', 'extensions.process'], dependencies: [{ id: 'lx.official-suite' }], settingsVersion: 3,
    settings: [
      { key: 'title', title: 'Portable title', type: 'string', default: 'First', maxLength: 100, exportable: true },
      { key: 'count', title: 'Portable count', type: 'number', default: 2, min: 0, max: 10, exportable: true },
      { key: 'localOnly', title: 'Local only', type: 'string', default: 'local-default', maxLength: 100 },
    ],
    extensions: [{ id: 'process', target: 'lx.official-suite/search.query', version: '1.0.0', handler: 'process' }],
  }, `void lxRuntime.start({handlers:{process:(value,context)=>{if(value.text==='pending'){document.body.dataset.pending='yes';context.onCancel(()=>{document.body.dataset.cancelled='yes'});return new Promise(resolve=>{window.__release=()=>resolve({text:'obsolete'})})}return {text:context.settings.title+':'+value.text}}}})`)
  await install(file)
  const runtime = contents(id); assert.ok(runtime)
  const runtimeId = runtime.id
  await set(id, 'title', 'Portable backup'); await set(id, 'count', 7); await set(id, 'localOnly', 'fictional local secret')
  const developmentInfo = await info(developmentId)
  assert.equal(developmentInfo.source, 'development')
  assert.equal(developmentInfo.publicKeyFingerprint, '')
  await set(developmentId, 'local', 9)
  await navigate(developmentId)
  await waitFor(() => run(`Boolean(document.querySelector('[data-plugin-settings="${developmentId}"]'))`), 'unsigned development settings page')
  assert.equal(await run("Boolean(document.querySelector('[data-plugin-settings-export]'))"), false)
  for (const channel of ['plugin_export_settings', 'plugin_import_settings']) await assert.rejects(ipc(channel, { pluginId: developmentId }), /已验证签名/)
  assert.deepEqual(await get(developmentId), { local: 9 })
  checks.push('unsigned development directory keeps ordinary settings but hides transfer controls and rejects both transfer IPC operations')
  const sibling = await get('lx.card-gallery')
  await navigate('lx.card-gallery')
  await waitFor(() => run("Boolean(document.querySelector('[data-plugin-settings=\"lx.card-gallery\"]'))"), 'legacy settings page')
  assert.equal(await run("Boolean(document.querySelector('[data-plugin-settings-export]'))"), false)
  await assert.rejects(ipc('plugin_export_settings', { pluginId: 'lx.card-gallery' }), /未声明/)
  await navigate(id)
  await waitFor(() => run("Boolean(document.querySelector('[data-plugin-settings-export]:not(:disabled)'))"), 'export opt-in button')
  const exported = path.join(profile, 'settings-backup.json')
  dialog.showSaveDialog = async() => ({ canceled: false, filePath: exported })
  await run("document.querySelector('[data-plugin-settings-export]').click()")
  await waitFor(() => run("document.querySelector('[data-plugin-settings-transfer-status]')?.textContent.includes('已导出')"), 'export feedback')
  const document = JSON.parse(fs.readFileSync(exported, 'utf8'))
  assert.equal(document.pluginId, id); assert.equal(document.settingsVersion, 3)
  assert.match(document.signerFingerprint, /^[a-f0-9]{64}$/)
  assert.match(document.schemaFingerprint, /^[a-f0-9]{64}$/)
  assert.deepEqual(document.values, { title: 'Portable backup', count: 7 })
  assert.ok(!fs.readFileSync(exported, 'utf8').includes('fictional local secret'))
  assert.equal(fs.statSync(exported).mode & 0o777, 0o600)
  const originalBytes = fs.readFileSync(exported)
  const rename = fs.promises.rename
  Object.defineProperty(fs.promises, 'rename', { configurable: true, writable: true, value: async(...args) => {
    if (String(args[1]) === exported) throw new Error('simulated export rename failure')
    return rename(...args)
  } })
  try { await assert.rejects(ipc('plugin_export_settings', { pluginId: id }), /simulated export rename failure/) } finally { Object.defineProperty(fs.promises, 'rename', { configurable: true, writable: true, value: rename }) }
  assert.deepEqual(fs.readFileSync(exported), originalBytes)
  assert.ok(!fs.readdirSync(profile).some(name => name.startsWith('settings-backup.json.') && name.endsWith('.tmp')))
  checks.push('real export button creates a private bounded identity/schema-bound file with opted-in fields only; failed export preserves prior bytes and legacy parameters cannot export')

  await set(id, 'title', 'Local changed'); await set(id, 'count', 1); await set(id, 'localOnly', 'local preserved')
  const choose = () => { dialog.showOpenDialog = async() => ({ canceled: false, filePaths: [exported] }) }
  const confirmations = []
  choose()
  dialog.showMessageBox = async(_win, options) => { confirmations.push(options); return { response: 1 } }
  await run("document.querySelector('[data-plugin-settings-import]').click()")
  await waitFor(() => run("!document.querySelector('[data-plugin-settings-import]').disabled"), 'cancelled import finishes')
  assert.equal(confirmations.length, 1)
  assert.match(confirmations[0].detail, /Local changed.*Portable backup/)
  assert.ok(!confirmations[0].detail.includes('local preserved'))
  assert.equal(confirmations[0].defaultId, 1)
  assert.deepEqual(await get(id), { title: 'Local changed', count: 1, localOnly: 'local preserved' })
  checks.push('native import confirmation previews only allowed changes and cancellation preserves every current value')

  const pending = observe(ipc('plugin_process_search', { text: 'pending' }))
  await waitFor(() => runtime.executeJavaScript("document.body.dataset.pending==='yes'"), 'pending old-snapshot handler')
  choose(); dialog.showMessageBox = async(_win, options) => { confirmations.push(options); return { response: 0 } }
  await run("document.querySelector('[data-plugin-settings-import]').click()")
  await waitFor(() => run("document.querySelector('[data-plugin-settings-transfer-status]')?.textContent.includes('已导入')&&!document.querySelector('[data-plugin-settings-import]').disabled"), 'import feedback')
  await waitFor(() => run("document.querySelector('[data-setting-key=title]')?.value==='Portable backup'"), 'form updated by notification')
  assert.deepEqual(await get(id), { title: 'Portable backup', count: 7, localOnly: 'local preserved' })
  assert.match((await pending).error, /cancelled/)
  await waitFor(() => runtime.executeJavaScript("document.body.dataset.cancelled==='yes'"), 'runtime cancellation notification')
  await runtime.executeJavaScript('window.__release();void 0')
  assert.equal(contents(id).id, runtimeId)
  assert.deepEqual(await ipc('plugin_process_search', { text: 'song' }), { text: 'Portable backup:song' })
  assert.deepEqual(await get('lx.card-gallery'), sibling)
  await run("document.querySelector('[data-plugin-settings-import]').scrollIntoView({block:'center'});void 0")
  await capture('settings-transfer-import.png')
  checks.push('confirmed import atomically merges allowed fields, preserves local/sibling values, updates Vue and cancels stale runtime work without restart')

  const before = await get(id)
  let asks = 0
  dialog.showMessageBox = async() => { asks++; return { response: 0 } }
  const invalid = [
    { ...document, pluginId: 'lx.card-gallery' },
    { ...document, settingsVersion: 4 },
    { ...document, signerFingerprint: 'f'.repeat(64) },
    { ...document, schemaFingerprint: '0'.repeat(64) },
    { ...document, values: { title: 'valid first', count: 100 } },
    { ...document, values: { localOnly: 'attempt override' } },
  ]
  for (const value of invalid) {
    fs.writeFileSync(exported, JSON.stringify(value)); choose()
    await assert.rejects(ipc('plugin_import_settings', { pluginId: id }))
  }
  fs.writeFileSync(exported, 'not json'); choose(); await assert.rejects(ipc('plugin_import_settings', { pluginId: id }), /有效JSON/)
  fs.writeFileSync(exported, ' '.repeat(256 * 1024 + 1)); choose(); await assert.rejects(ipc('plugin_import_settings', { pluginId: id }), /过大/)
  if (process.platform === 'linux') {
    const fifo = path.join(profile, 'not-a-regular-file.json')
    require('node:child_process').execFileSync('mkfifo', [fifo])
    dialog.showOpenDialog = async() => ({ canceled: false, filePaths: [fifo] })
    await assert.rejects(ipc('plugin_import_settings', { pluginId: id }), /不是普通文件/)
  }
  assert.equal(asks, 0, 'invalid files rejected before confirmation')
  assert.deepEqual(await get(id), before)
  checks.push('foreign identity, signer/schema/version mismatches, protected values, bad values, malformed JSON and oversized files are rejected without partial writes')

  fs.writeFileSync(exported, JSON.stringify({ ...document, values: { title: 'import candidate' } })); choose()
  dialog.showMessageBox = async() => { await set(id, 'count', 8); return { response: 0 } }
  await assert.rejects(ipc('plugin_import_settings', { pluginId: id }), /预览后/)
  assert.deepEqual(await get(id), { ...before, count: 8 })
  choose(); dialog.showMessageBox = async() => {
    fs.writeFileSync(exported, JSON.stringify({ ...document, values: { title: 'changed file after preview' } }))
    return { response: 0 }
  }
  await ipc('plugin_import_settings', { pluginId: id })
  assert.equal((await get(id)).title, 'import candidate', 'approved in-memory snapshot is used even if file changes')
  checks.push('concurrent settings write invalidates confirmation, while replacing selected file after preview cannot replace the approved payload')

  dialog.showSaveDialog = async() => ({ canceled: true })
  assert.deepEqual(await ipc('plugin_export_settings', { pluginId: id }), { cancelled: true })
  dialog.showOpenDialog = async() => ({ canceled: true, filePaths: [] })
  assert.deepEqual(await ipc('plugin_import_settings', { pluginId: id }), { cancelled: true })
  let release; let entered = false
  dialog.showSaveDialog = async() => { entered = true; return new Promise(resolve => { release = resolve }) }
  const first = ipc('plugin_export_settings', { pluginId: id })
  await waitFor(() => entered, 'export dialog in flight')
  await assert.rejects(ipc('plugin_import_settings', { pluginId: id }), /正在进行/)
  release({ canceled: true }); await first
  assert.equal(contents(id).id, runtimeId)
  assert.equal((await info(id)).available, true)
  const outsider = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false } })
  try {
    await outsider.loadURL('about:blank')
    for (const channel of ['plugin_export_settings', 'plugin_import_settings']) {
      await assert.rejects(outsider.webContents.executeJavaScript(`require('electron').ipcRenderer.invoke(${JSON.stringify(channel)},${JSON.stringify({ pluginId: id })})`), /Only the host window/)
    }
  } finally { outsider.destroy() }
  assert.deepEqual(await runtime.executeJavaScript('({node:typeof require,exportSettings:typeof window.lxRuntime.exportSettings,importSettings:typeof window.lxRuntime.importSettings})'), { node: 'undefined', exportSettings: 'undefined', importSettings: 'undefined' })
  observations.runtimeId = runtimeId
  observations.finalRuntimeId = contents(id).id
  observations.exportedKeys = Object.keys(document.values)
  observations.confirmationCount = confirmations.length
  checks.push('dialog cancellation and transfer backpressure release capacity; host-only transfer leaves the signed runtime healthy')
  assert.deepEqual(errors, [])
  await finish(0)
}).catch(error => { void finish(1, error) })
