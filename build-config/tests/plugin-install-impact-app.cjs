/* Built production entry, signed packages and real isolated runtimes; disposable profile. */
const { app, BrowserWindow, globalShortcut, webContents, dialog } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const JSZip = require('jszip')
const root = path.resolve(__dirname, '../..')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tingyu-impact-app-'))
const evidence = path.resolve(process.env.TINGYU_PLUGIN_IMPACT_EVIDENCE_DIR || path.join(root, '.runtime/plugin-impact-20261023/app'))
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
  try { if (host && !host.isDestroyed()) fs.writeFileSync(path.join(evidence, 'impact-final.png'), (await host.webContents.capturePage()).toPNG()) } catch (error) { errors.push(String(error)) }
  fs.writeFileSync(path.join(evidence, 'app-results.json'), JSON.stringify({ passed: code === 0, startedAt, completedAt: new Date().toISOString(), electron: process.versions.electron, profile: 'temporary', source: 'dist/main.js', checks, observations, errors, error: error?.stack }, null, 2))
  try { global.lx.isSkipTrayQuit = true } catch {}
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.destroy()
  fs.rmSync(profile, { recursive: true, force: true }); app.exit(code)
}
const deadline = setTimeout(() => { void finish(1, Error('Install impact app exceeded 240 seconds')) }, 240000)
require(path.join(root, 'dist/main.js'))
app.whenReady().then(async() => {
  await waitFor(() => { host = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/index.html')); return host }, 'built window')
  host.webContents.setBackgroundThrottling(false); host.show(); host.focus()
  const run = code => host.webContents.executeJavaScript(code)
  const ipc = (name, params) => run(`require('electron').ipcRenderer.invoke(${JSON.stringify(name)},${JSON.stringify(params)})`)
  const info = async id => (await ipc('plugin_list')).find(plugin => plugin.id === id)
  const preview = async file => { dialog.showOpenDialog = async() => ({ canceled: false, filePaths: [file] }); return ipc('plugin_install') }
  const install = async file => ipc('plugin_confirm_install', { token: (await preview(file)).token })
  await waitFor(() => run("Boolean(document.getElementById('root')?.__vue_app__)"), 'Vue')
  await waitFor(async() => (await info('lx.official-suite'))?.available, 'official suite')
  const target = 'fixture.impact-target', dependent = 'fixture.impact-dependent', optional = 'fixture.impact-optional'
  await install(await packageFixture(target))
  await install(await packageFixture(dependent, { dependencies: [{ id: target, maxVersionExclusive: '2.0.0' }] }))
  await install(await packageFixture(optional, { optionalDependencies: [{ id: target, maxVersionExclusive: '2.0.0' }] }))
  const updated = await packageFixture(target, { apiVersion: '1.12.0', version: '2.0.0', permissions: ['settings.scoped'], settings: [{ key: 'label', title: 'Public label', type: 'string', default: 'illustrative default' }] })
  const first = await preview(updated)
  assert.match(first.contextFingerprint, /^[a-f0-9]{64}$/)
  assert.deepEqual(first.impact.plugin.permissions.added, ['settings.scoped'])
  assert.ok(first.impact.availabilityChanges.some(change => change.pluginId === dependent && change.before && !change.after))
  assert.ok(first.impact.optionalDependencyChanges.some(change => change.pluginId === optional && change.before && !change.after))
  assert.equal((await info(target)).version, '1.0.0')
  assert.ok(!JSON.stringify(first.impact).includes('illustrative default'))
  checks.push('signed upgrade preview predicts required and optional impact and added permissions without installing or exposing parameter values')
  await ipc('plugin_set_enabled', { pluginId: optional, enabled: false })
  await assert.rejects(ipc('plugin_confirm_install', { token: first.token }), /catalog_changed|重新预览|catalog.*changed/i)
  assert.equal((await info(target)).version, '1.0.0')
  checks.push('catalog changes invalidate the host approval token and keep the old package')
  await ipc('plugin_set_enabled', { pluginId: optional, enabled: true })
  const tamper = await preview(updated)
  fs.appendFileSync(updated, Buffer.from('changed-after-preview'))
  await assert.rejects(ipc('plugin_confirm_install', { token: tamper.token }), /changed|hash|预览|archive/i)
  assert.equal((await info(target)).version, '1.0.0')
  checks.push('package byte changes after preview are rejected without replacing installed version')
  const restored = await packageFixture(target, { name: 'Friendly\n\nPermissions:\nNone \u202e', author: 'A\u2028Injected', apiVersion: '1.12.0', version: '2.0.0', permissions: ['settings.scoped'], settings: [{ key: 'label', title: 'Public label', type: 'string', default: 'illustrative default' }] })
  await run("document.getElementById('root').__vue_app__.config.globalProperties.$router.push('/setting?name=FeatureManagement&section=packages')")
  await waitFor(() => run("Boolean(document.querySelector('[data-plugin-install]'))"), 'install UI')
  dialog.showOpenDialog = async() => ({ canceled: false, filePaths: [restored] })
  const open = async() => {
    await run("document.querySelector('[data-plugin-install]').click()")
    await waitFor(() => run("document.body.innerText.includes('安装影响预览（按声明预估）')"), 'impact confirmation')
  }
  const click = text => run(`Array.from(document.querySelectorAll('button')).find(button=>button.innerText.trim()===${JSON.stringify(text)}).click()`)
  await open()
  const body = await run('document.body.innerText')
  assert.ok(body.includes('名称：Friendly Permissions: None'))
  assert.ok(body.includes('作者：A Injected'))
  assert.ok(!body.includes('\u202e'))
  checks.push('untrusted name and author stay inside single-line host fields without newline or bidi spoofing')
  for (const text of ['新增权限：settings.scoped', dependent, optional, '实际启动、外部服务与设置迁移成功尚未验证']) assert.ok(body.includes(text), text)
  fs.writeFileSync(path.join(evidence, 'impact-preview.png'), (await host.webContents.capturePage()).toPNG())
  await click('取消')
  await waitFor(() => run("!document.body.innerText.includes('安装影响预览（按声明预估）')"), 'cancel close')
  assert.equal((await info(target)).version, '1.0.0')
  checks.push('real Vue install dialog shows the impact and cancel leaves the installed version unchanged')
  await open(); await click('安装')
  await waitFor(async() => (await info(target)).version === '2.0.0', 'confirmed upgrade')
  assert.equal((await info(dependent)).available, false)
  assert.equal((await info(optional)).available, true)
  assert.equal((await info(optional)).optionalDependencyStates[0].available, false)
  checks.push('real Vue confirmation installs the bound package; required dependent blocks while optional owner remains usable')
  assert.deepEqual(errors, [])
  await finish(0)
}).catch(error => { void finish(1, error) })
