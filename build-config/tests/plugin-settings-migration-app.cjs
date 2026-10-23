/* Built production entry, signed packages and real isolated runtimes; disposable profile. */
const { app, BrowserWindow, globalShortcut, webContents, dialog } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const JSZip = require('jszip')
const root = path.resolve(__dirname, '../..')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-settings-migration-app-'))
const evidence = path.resolve(process.env.LX_PLUGIN_SETTINGS_MIGRATION_EVIDENCE_DIR || path.join(root, '.runtime/plugin-settings-migration-20261022/app'))
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
  try { if (host && !host.isDestroyed()) fs.writeFileSync(path.join(evidence, 'settings-migration-final.png'), (await host.webContents.capturePage()).toPNG()) } catch (error) { errors.push(String(error)) }
  fs.writeFileSync(path.join(evidence, 'app-results.json'), JSON.stringify({ passed: code === 0, startedAt, completedAt: new Date().toISOString(), electron: process.versions.electron, profile: 'temporary', source: 'dist/main.js', checks, observations, errors, error: error?.stack }, null, 2))
  try { global.lx.isSkipTrayQuit = true } catch {}
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.destroy()
  fs.rmSync(profile, { recursive: true, force: true }); app.exit(code)
}
const deadline = setTimeout(() => { void finish(1, Error('Settings migration app exceeded 240 seconds')) }, 240000)
require(path.join(root, 'dist/main.js'))
app.whenReady().then(async() => {
  await waitFor(() => { host = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/index.html')); return host }, 'built window')
  host.webContents.setBackgroundThrottling(false); host.show(); host.focus()
  const run = code => host.webContents.executeJavaScript(code)
  const ipc = (name, params) => run(`require('electron').ipcRenderer.invoke(${JSON.stringify(name)},${JSON.stringify(params)})`)
  const info = async id => (await ipc('plugin_list')).find(plugin => plugin.id === id)
  const get = id => ipc('plugin_get_settings', { pluginId: id })
  const set = (pluginId, key, value) => ipc('plugin_set_setting', { pluginId, key, value })
  const install = async file => {
    dialog.showOpenDialog = async() => ({ canceled: false, filePaths: [file] })
    const preview = await ipc('plugin_install'); return ipc('plugin_confirm_install', { token: preview.token })
  }
  const capture = async name => {
    await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    fs.writeFileSync(path.join(evidence, name), (await host.webContents.capturePage()).toPNG())
  }
  await waitFor(() => run("Boolean(document.getElementById('root')?.__vue_app__)"), 'Vue')
  await waitFor(async() => (await info('lx.official-suite'))?.available, 'official suite')
  const id = 'fixture.settings-migration'
  const settingsRoot = path.join(global.lxDataPath, 'plugins/settings')
  const registryFile = path.join(global.lxDataPath, 'plugins/registry.json')
  const entry = () => JSON.parse(fs.readFileSync(registryFile, 'utf8')).plugins.find(plugin => plugin.id === id)
  const stateFile = () => path.join(settingsRoot, entry().settingsFile || id + '.json')
  const runtime = () => webContents.getAllWebContents().find(wc => wc.getURL().startsWith(`lxplugin://${id}/runtime.html`))
  const script = `void lxRuntime.start({activate:context=>{document.body.dataset.initial=JSON.stringify(context.settings)},handlers:{process:(value,context)=>({text:(context.settings.label??context.settings.title)+':'+value.text})}})`
  const base = {
    apiVersion: '1.10.0', settingsVersion: 1, permissions: ['settings.scoped', 'extensions.process'], dependencies: [{ id: 'lx.official-suite' }],
    settings: [
      { key: 'title', title: 'Title before migration', type: 'string', default: 'old default', maxLength: 100, exportable: true },
      { key: 'level', title: 'Level', type: 'number', default: 2, min: 0, max: 10, exportable: true },
      { key: 'obsolete', title: 'Legacy option', type: 'boolean', default: true },
    ],
    extensions: [{ id: 'process', handler: 'process', target: 'lx.official-suite/search.query', version: '1.0.0' }],
  }
  const modern = { ...base, apiVersion: '1.11.0', version: '3.0.0', settingsVersion: 3, settings: [
    { key: 'label', title: 'Migrated label', type: 'string', default: 'new default', maxLength: 100, exportable: true },
    { key: 'level', title: 'Level', type: 'number', default: 3, min: 0, max: 10, exportable: true },
    { key: 'extra', title: 'New option', type: 'boolean', default: true },
  ], settingsMigrations: [{ fromVersion: 1, toVersion: 2, rename: { title: 'middle' }, remove: ['obsolete'] }, { fromVersion: 2, toVersion: 3, rename: { middle: 'label' } }] }
  const originalPackage = await packageFixture(id, base, script)
  await install(originalPackage)
  await set(id, 'title', 'custom profile'); await set(id, 'level', 7); await set(id, 'obsolete', false)
  const originalFile = stateFile(); const originalBytes = fs.readFileSync(originalFile)
  const originalRegistry = fs.readFileSync(registryFile)
  const oldBackup = path.join(profile, 'old-backup.json')
  dialog.showSaveDialog = async() => ({ canceled: false, filePath: oldBackup })
  await ipc('plugin_export_settings', { pluginId: id })
  await run(`document.getElementById('root').__vue_app__.config.globalProperties.$router.push('/setting?name=PluginSettings&section=${id}')`)
  await waitFor(() => run("document.querySelector('[data-setting-key=title]')?.value==='custom profile'"), 'legacy form')
  const missingPath = await packageFixture(id, { ...modern, settingsMigrations: [] }, script)
  await assert.rejects(install(missingPath))
  assert.equal((await info(id)).version, '1.0.0')
  assert.equal((await info(id)).available, true)
  assert.deepEqual(fs.readFileSync(originalFile), originalBytes)
  assert.deepEqual(fs.readFileSync(registryFile), originalRegistry)
  assert.deepEqual(await ipc('plugin_process_search', { text: 'failure recovery' }), { text: 'custom profile:failure recovery' })
  checks.push('missing migration path rejects before commit; old signed package, parameter bytes and processor remain usable')

  const upgradedPackage = await packageFixture(id, modern, script)
  await install(upgradedPackage)
  const migratedFile = stateFile()
  assert.notEqual(migratedFile, originalFile)
  assert.match(entry().settingsFile, /^fixture\.settings-migration\.[a-f0-9]{24}\.json$/)
  assert.equal(fs.statSync(migratedFile).mode & 0o777, 0o600)
  assert.deepEqual(await get(id), { label: 'custom profile', level: 7, extra: true })
  assert.deepEqual(fs.readFileSync(originalFile), originalBytes)
  assert.deepEqual(JSON.parse(await runtime().executeJavaScript('document.body.dataset.initial')), { label: 'custom profile', level: 7, extra: true })
  assert.deepEqual(await ipc('plugin_process_search', { text: 'song' }), { text: 'custom profile:song' })
  await waitFor(() => run("document.querySelector('[data-setting-key=label]')?.value==='custom profile'&&!document.querySelector('[data-setting-key=title]')"), 'open form migrated without navigation')
  await run("document.querySelector('[data-plugin-settings-import]').scrollIntoView({block:'center'});void 0")
  await capture('settings-migration-form.png')
  checks.push('two-step signed rename/remove migration adds defaults, activates with new settings and refreshes the open Vue form without losing old snapshot')

  dialog.showOpenDialog = async() => ({ canceled: false, filePaths: [oldBackup] })
  await assert.rejects(ipc('plugin_import_settings', { pluginId: id }), /version|schema/)
  const newBackup = path.join(profile, 'new-backup.json')
  dialog.showSaveDialog = async() => ({ canceled: false, filePath: newBackup })
  await ipc('plugin_export_settings', { pluginId: id })
  await set(id, 'label', 'edited v3')
  dialog.showOpenDialog = async() => ({ canceled: false, filePaths: [newBackup] })
  dialog.showMessageBox = async() => ({ response: 0 })
  await ipc('plugin_import_settings', { pluginId: id })
  assert.equal((await get(id)).label, 'custom profile')
  await ipc('plugin_reset_settings', { pluginId: id })
  assert.deepEqual(await get(id), { label: 'new default', level: 3, extra: true })
  await set(id, 'label', 'persisted v3')
  assert.deepEqual(fs.readFileSync(originalFile), originalBytes)
  const loaded = new Promise(resolve => host.webContents.once('did-finish-load', resolve)); host.webContents.reload(); await loaded
  await waitFor(() => run("Boolean(document.getElementById('root')?.__vue_app__)"), 'renderer reload')
  await run(`document.getElementById('root').__vue_app__.config.globalProperties.$router.push('/setting?name=PluginSettings&section=${id}')`)
  await waitFor(() => run("document.querySelector('[data-setting-key=label]')?.value==='persisted v3'"), 'snapshot values after renderer reload')
  checks.push('ordinary saves, same-schema import and reset use only the current snapshot; old-schema file rejects and renderer reload keeps current values')

  await ipc('plugin_rollback', { pluginId: id })
  assert.equal((await info(id)).version, '1.0.0')
  assert.deepEqual(await get(id), { title: 'custom profile', level: 7, obsolete: false })
  assert.equal(stateFile(), originalFile)
  assert.ok(!fs.existsSync(migratedFile))
  await waitFor(() => run("document.querySelector('[data-setting-key=title]')?.value==='custom profile'&&!document.querySelector('[data-setting-key=label]')"), 'rollback updates open form')
  assert.deepEqual(await ipc('plugin_process_search', { text: 'rollback' }), { text: 'custom profile:rollback' })
  checks.push('rollback restores the verified old package and exact pre-upgrade parameter values, cleans the new snapshot and updates runtime and form')

  const beforeFailure = fs.readFileSync(registryFile)
  const beforeListing = fs.readdirSync(settingsRoot).sort()
  const rename = fs.promises.rename
  const uncommittedPackage = await packageFixture(id, {
    ...modern, permissions: [...modern.permissions, 'plugin.pages'],
    pages: [{ id: 'uncommitted-page', title: 'Only after commit', entry: 'index.html', placement: 'primary' }],
  }, script)
  let entered; let release
  const enteredPromise = new Promise(resolve => { entered = resolve })
  const gate = new Promise(resolve => { release = resolve })
  Object.defineProperty(fs.promises, 'rename', { configurable: true, writable: true, value: async(...args) => {
    if (String(args[1]) === registryFile) { entered(); await gate; throw new Error('simulated migration registry failure') }
    return rename(...args)
  } })
  try {
    const upgrading = assert.rejects(install(uncommittedPackage), /simulated migration registry failure/)
    await Promise.race([enteredPromise, upgrading.then(() => { throw new Error('Registry gate was not reached') })])
    const visible = await info(id)
    assert.equal(visible.version, '1.0.0')
    assert.ok(visible.settings.some(field => field.key === 'title'))
    assert.ok(!visible.pages.some(page => page.id === 'uncommitted-page'))
    let readFinished = false
    const reading = get(id).then(value => { readFinished = true; return value })
    await delay(20); assert.equal(readFinished, false)
    release(); await upgrading
    assert.deepEqual(await reading, { title: 'custom profile', level: 7, obsolete: false })
  } finally { release(); Object.defineProperty(fs.promises, 'rename', { configurable: true, writable: true, value: rename }) }
  assert.deepEqual(fs.readFileSync(registryFile), beforeFailure)
  assert.deepEqual(fs.readdirSync(settingsRoot).sort(), beforeListing)
  assert.deepEqual(await get(id), { title: 'custom profile', level: 7, obsolete: false })
  assert.equal((await info(id)).available, true)
  checks.push('blocked registry commit exposes only the old package/schema/pages; settings readers wait and rename failure discards staging while preserving old values')

  await install(upgradedPackage)
  const stableRegistry = fs.readFileSync(registryFile)
  const stableFile = stateFile(); const stableValues = fs.readFileSync(stableFile)
  await assert.rejects(install(originalPackage), /回滚|downgrade|降低/)
  const drift = await packageFixture(id, { ...modern, version: '3.0.1', settings: modern.settings.map(field => field.key === 'label' ? { ...field, default: 'unversioned default drift' } : field) }, script)
  await assert.rejects(install(drift))
  assert.deepEqual(fs.readFileSync(registryFile), stableRegistry)
  assert.deepEqual(fs.readFileSync(stableFile), stableValues)
  assert.equal((await info(id)).version, '3.0.0')
  checks.push('direct settings-version downgrade and same-version schema drift reject without changing committed state')

  const fourthPackage = await packageFixture(id, { ...modern, version: '4.0.0', settingsVersion: 4, settingsMigrations: [{ fromVersion: 3, toVersion: 4 }] }, script)
  await set(id, 'label', 'v3 snapshot')
  await install(fourthPackage)
  const fourthFile = stateFile()
  await set(id, 'label', 'v4 current')
  assert.equal(JSON.parse(fs.readFileSync(stableFile, 'utf8')).label, 'v3 snapshot')
  assert.ok(!fs.existsSync(originalFile), 'unreferenced legacy snapshot is collected')
  await ipc('plugin_uninstall', { pluginId: id })
  assert.ok(!fs.existsSync(stableFile)); assert.ok(!fs.existsSync(fourthFile))
  assert.ok(!fs.readdirSync(settingsRoot).some(name => name.startsWith(id + '.')))
  assert.equal((await info('lx.official-suite')).available, true)
  observations.migratedVersion = 3
  observations.rollbackVersion = 1
  observations.snapshotMode = 'registry pointer; temporary profile'
  checks.push('later migration keeps only current and one rollback snapshot; uninstall removes snapshots and leaves unrelated native suite active')
  assert.deepEqual(errors, [])
  await finish(0)
}).catch(error => { void finish(1, error) })
