/* Built production entry, signed packages and real isolated runtimes; disposable profile. */
const { app, BrowserWindow, globalShortcut, webContents, dialog, safeStorage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const JSZip = require('jszip')
const root = path.resolve(__dirname, '../..')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-plugin-credentials-app-'))
const evidence = path.resolve(process.env.LX_PLUGIN_CREDENTIALS_EVIDENCE_DIR || path.join(root, '.runtime/plugin-credentials-20261022/app'))
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
  const file = path.join(profile, id + '-' + manifest.version + '-' + crypto.randomBytes(5).toString('hex') + '.lxplugin'); fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' })); return file
}
const finish = async(code, error) => {
  if (finished) return
  finished = true; clearTimeout(deadline)
  if (error) console.error(error)
  try { if (host && !host.isDestroyed()) fs.writeFileSync(path.join(evidence, 'credentials-final.png'), (await host.webContents.capturePage()).toPNG()) } catch (error) { errors.push(String(error)) }
  fs.writeFileSync(path.join(evidence, 'app-results.json'), JSON.stringify({ passed: code === 0, startedAt, completedAt: new Date().toISOString(), electron: process.versions.electron, profile: 'temporary', source: 'dist/main.js', checks, observations, errors, error: error?.stack }, null, 2))
  try { global.lx.isSkipTrayQuit = true } catch {}
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.destroy()
  fs.rmSync(profile, { recursive: true, force: true }); app.exit(code)
}
const deadline = setTimeout(() => { void finish(1, Error('Plugin credentials app exceeded 240 seconds')) }, 240000)
require(path.join(root, 'dist/main.js'))
app.whenReady().then(async() => {
  await waitFor(() => { host = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/index.html')); return host }, 'built window')
  host.webContents.setBackgroundThrottling(false); host.show(); host.focus()
  const run = code => host.webContents.executeJavaScript(code)
  const ipc = (name, params) => run(`require('electron').ipcRenderer.invoke(${JSON.stringify(name)},${JSON.stringify(params)})`)
  const info = async id => (await ipc('plugin_list')).find(plugin => plugin.id === id)
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
  const id = 'fixture.credentials'
  const runtime = pluginId => webContents.getAllWebContents().find(wc => wc.getURL().startsWith(`lxplugin://${pluginId}/runtime.html`))
  const script = `void lxRuntime.start({activate:async context=>{window.readOwn=key=>context.credentials.get(key);document.body.dataset.configured=String(Boolean(await context.credentials.get('token')))},handlers:{process:async(value,context)=>{if(value.text==='slow')await new Promise(r=>setTimeout(r,1000));return {text:(await context.credentials.get('token'))?'configured:'+value.text:'empty:'+value.text}}}})`
  const base = {
    apiVersion: '1.12.0', permissions: ['settings.scoped', 'credentials.scoped', 'extensions.process'],
    dependencies: [{ id: 'lx.official-suite' }], settingsVersion: 1,
    credentials: [{ key: 'token', title: 'Service token', description: 'Fictional credential for this disposable test', maxLength: 100 }],
    settings: [{ key: 'label', title: 'Public label', type: 'string', default: 'public default', exportable: true }],
    extensions: [{ id: 'process', handler: 'process', target: 'lx.official-suite/search.query', version: '1.0.0' }],
  }
  await install(await packageFixture(id, base, script))
  await run(`document.getElementById('root').__vue_app__.config.globalProperties.$router.push('/setting?name=PluginSettings&section=${id}')`)
  await waitFor(() => run("Boolean(document.querySelector('[data-credential-key=token]'))"), 'credential form')
  const fingerprint = (await info(id)).publicKeyFingerprint
  const set = value => ipc('plugin_set_credential', { pluginId: id, key: 'token', value, signerFingerprint: fingerprint })
  const remove = () => ipc('plugin_remove_credential', { pluginId: id, key: 'token', signerFingerprint: fingerprint })
  const status = () => ipc('plugin_credential_status', { pluginId: id })
  const nativeStatus = await status()
  observations.nativeEncryptionAvailable = nativeStatus.available
  observations.nativeBackend = process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : process.platform
  if (nativeStatus.available) {
    const available = safeStorage.isEncryptionAvailable
    Object.defineProperty(safeStorage, 'isEncryptionAvailable', { configurable: true, value: () => false })
    try {
      await assert.rejects(set('fictional-unavailable-token'))
      assert.equal((await status()).configured.token, false)
      await run("document.querySelector('[data-credential-refresh]').click()")
      await waitFor(() => run("Boolean(document.querySelector('[data-credential-unavailable]'))&&document.querySelector('[data-credential-key=token]').disabled"), 'simulated unavailable UI')
      observations.unavailableBranch = 'simulated unavailable safeStorage; native storage available'
    } finally { Object.defineProperty(safeStorage, 'isEncryptionAvailable', { configurable: true, value: available }) }
    await run("document.querySelector('[data-credential-refresh]').click()")
  }
  if (!nativeStatus.available) {
    observations.unavailableBranch = 'native storage unavailable'
    await assert.rejects(set('fictional-unavailable-token'))
    assert.equal((await status()).configured.token, false)
    await waitFor(() => run("Boolean(document.querySelector('[data-credential-unavailable]'))&&document.querySelector('[data-credential-key=token]').disabled"), 'unavailable UI')
    const cipherKey = crypto.randomBytes(32)
    Object.defineProperties(safeStorage, {
      isEncryptionAvailable: { configurable: true, value: () => true },
      getSelectedStorageBackend: { configurable: true, value: () => 'gnome_libsecret' },
      encryptString: { configurable: true, value: value => {
        const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',cipherKey,iv)
        const bytes=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes])
      } },
      decryptString: { configurable: true, value: value => {
        const cipher=crypto.createDecipheriv('aes-256-gcm',cipherKey,value.subarray(0,12));cipher.setAuthTag(value.subarray(12,28));return Buffer.concat([cipher.update(value.subarray(28)),cipher.final()]).toString('utf8')
      } },
    })
    observations.persistenceAdapter = 'test-only AES-GCM injected into Electron safeStorage; native unavailable branch verified'
    await run("document.querySelector('[data-credential-refresh]').click()")
  } else observations.persistenceAdapter = 'native Electron safeStorage'
  await waitFor(() => run("!document.querySelector('[data-credential-key=token]').disabled"), 'enabled credential input')
  checks.push('native encryption availability is reported; unavailable storage rejects save without plaintext/session fallback and disables the form')

  const secret = 'fictional-ui-secret-123'
  assert.equal((await info(id)).available, true, JSON.stringify(await info(id)))
  const initialRuntime = runtime(id).id
  await run(`(()=>{const input=document.querySelector('[data-credential-key=token]');input.value=${JSON.stringify(secret)};input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await waitFor(() => run("!document.querySelector('[data-credential-save=token]').disabled"), 'save enabled')
  await run("document.querySelector('[data-credential-save=token]').click()")
  await waitFor(() => run("document.querySelector('[data-credential-configured=token]')?.textContent==='已配置'"), 'saved form')
  assert.equal(await run("document.querySelector('[data-credential-key=token]').value"), '')
  assert.equal(await run("document.querySelector('[data-credential-key=token]').type"), 'password')
  assert.notEqual(runtime(id).id, initialRuntime)
  assert.equal(await runtime(id).executeJavaScript("document.body.dataset.configured"), 'true')
  assert.equal(await runtime(id).executeJavaScript("readOwn('token')"), secret)
  await assert.rejects(runtime(id).executeJavaScript("readOwn('undeclared')"))
  assert.deepEqual(await ipc('plugin_process_search', { text: 'song' }), { text: 'configured:song' })
  await run("document.querySelector('[data-plugin-credentials]').scrollIntoView({block:'center'});void 0")
  await capture('credentials-configured.png')
  checks.push('real password form saves without readback, clears draft, restarts the runtime and allows only the declared credential key')

  const credentialRoot=path.join(global.lxDataPath,'plugins/credentials')
  const files=fs.readdirSync(credentialRoot).filter(name=>name.endsWith('.json'))
  assert.equal(files.length,1)
  const encryptedFile=path.join(credentialRoot,files[0]);const savedBytes=fs.readFileSync(encryptedFile)
  assert.ok(!savedBytes.includes(Buffer.from(secret)));assert.equal(fs.statSync(encryptedFile).mode&0o777,0o600)
  const backup=path.join(profile,'ordinary-parameters.json')
  dialog.showSaveDialog=async()=>({canceled:false,filePath:backup})
  await ipc('plugin_export_settings',{pluginId:id})
  assert.deepEqual(JSON.parse(fs.readFileSync(backup,'utf8')).values,{label:'public default'})
  for(const value of [await ipc('plugin_list'),await ipc('plugin_get_settings',{pluginId:id}),await status()])assert.ok(!JSON.stringify(value).includes(secret))
  await ipc('plugin_reset_settings',{pluginId:id})
  assert.equal(await runtime(id).executeJavaScript("readOwn('token')"),secret)
  checks.push('0600 encrypted namespace contains no plaintext; catalog, settings, reset and parameter export do not expose or delete credentials')

  const loaded = new Promise(resolve => host.webContents.once('did-finish-load', resolve))
  host.webContents.reload(); await loaded
  await waitFor(() => run("Boolean(document.getElementById('root')?.__vue_app__)"), 'reloaded Vue')
  await run(`document.getElementById('root').__vue_app__.config.globalProperties.$router.push('/setting?name=PluginSettings&section=${id}')`)
  await waitFor(() => run("document.querySelector('[data-credential-configured=token]')?.textContent==='已配置'"), 'configured state after reload')
  assert.equal(await run("document.querySelector('[data-credential-key=token]').value"), '')
  assert.equal(await runtime(id).executeJavaScript("readOwn('token')"), secret)
  checks.push('renderer reload restores configured metadata with an empty password field while the runtime still decrypts its own stored value')

  await assert.rejects(ipc('plugin_set_credential',{pluginId:id,key:'token',value:'wrong signer',signerFingerprint:'0'.repeat(64)}))
  await assert.rejects(ipc('plugin_set_credential',{pluginId:id,key:'unknown',value:'bad',signerFingerprint:fingerprint}))
  await assert.rejects(set('x'.repeat(101)))
  const intruder=new BrowserWindow({show:false,webPreferences:{nodeIntegration:true,contextIsolation:false}})
  try {
    await intruder.loadURL('about:blank')
    for(const [name,params]of [['plugin_credential_status',{pluginId:id}],['plugin_set_credential',{pluginId:id,key:'token',value:'intruder',signerFingerprint:fingerprint}],['plugin_remove_credential',{pluginId:id,key:'token',signerFingerprint:fingerprint}],['plugin_clear_credentials',{pluginId:id,signerFingerprint:fingerprint}]]){
      await assert.rejects(intruder.webContents.executeJavaScript(`require('electron').ipcRenderer.invoke(${JSON.stringify(name)},${JSON.stringify(params)})`))
    }
    await assert.rejects(intruder.webContents.executeJavaScript("require('electron').ipcRenderer.invoke('lxruntime:request',{kind:'credential-get',key:'token'})"))
  }finally{intruder.destroy()}
  assert.deepEqual(fs.readFileSync(encryptedFile),savedBytes)
  checks.push('stale signer, undeclared keys, oversized values, non-host management and unregistered runtime readers are rejected without changing bytes')

  const sibling='fixture.credential-sibling'
  await install(await packageFixture(sibling,{apiVersion:'1.12.0',permissions:['credentials.scoped'],credentials:base.credentials},`void lxRuntime.start({activate:async context=>{window.readOwn=key=>context.credentials.get(key)},handlers:{}})`))
  assert.equal(await runtime(sibling).executeJavaScript("readOwn('token')"),undefined)
  const denied='fixture.credential-denied'
  await install(await packageFixture(denied,{apiVersion:'1.12.0'},`void lxRuntime.start({activate:async context=>{window.readOwn=key=>context.credentials.get(key)},handlers:{}})`))
  await assert.rejects(runtime(denied).executeJavaScript("readOwn('token')"))
  const obsolete=runtime(id)
  const pending=assert.rejects(ipc('plugin_process_search',{text:'slow'}))
  await delay(60)
  await set('fictional-rotated-secret')
  await pending
  assert.ok(obsolete.isDestroyed())
  assert.equal(await runtime(id).executeJavaScript("readOwn('token')"),'fictional-rotated-secret')
  checks.push('sibling and permissionless runtimes cannot obtain the owner secret; credential changes cancel old work and replace the old runtime')

  await ipc('plugin_set_enabled',{pluginId:id,enabled:false})
  assert.ok(!runtime(id))
  await set('fictional-disabled-edit')
  assert.equal((await status()).configured.token,true)
  await ipc('plugin_set_enabled',{pluginId:id,enabled:true})
  assert.equal(await runtime(id).executeJavaScript("readOwn('token')"),'fictional-disabled-edit')
  await install(await packageFixture(id,{...base,version:'2.0.0',settingsVersion:2,settingsMigrations:[{fromVersion:1,toVersion:2}]},script))
  assert.equal(await runtime(id).executeJavaScript("readOwn('token')"),'fictional-disabled-edit')
  await ipc('plugin_rollback',{pluginId:id})
  assert.equal(await runtime(id).executeJavaScript("readOwn('token')"),'fictional-disabled-edit')
  await remove()
  assert.equal((await status()).configured.token,false)
  assert.equal(await runtime(id).executeJavaScript("readOwn('token')"),undefined)
  await set('fictional-clear-secret')
  dialog.showMessageBox=async()=>({response:1})
  await run("document.querySelector('[data-credential-clear]').click()")
  await waitFor(()=>run("!document.querySelector('[data-credential-clear]').disabled"),'clear cancellation')
  assert.equal((await status()).configured.token,true)
  dialog.showMessageBox=async()=>({response:0})
  await run("document.querySelector('[data-credential-clear]').click()")
  await waitFor(()=>run("document.querySelector('[data-credential-status]')?.textContent==='全部凭据已删除。'"),'clear confirmed')
  assert.equal((await status()).configured.token,false)
  checks.push('disabled packages stay manageable; parameter migration and rollback retain stable keys; remove and confirmed clear delete values while cancelled clear keeps them')

  await set('fictional-corrupt-store-secret')
  fs.writeFileSync(encryptedFile, '{')
  const recoveryLoaded = new Promise(resolve => host.webContents.once('did-finish-load', resolve))
  host.webContents.reload(); await recoveryLoaded
  await waitFor(() => run("Boolean(document.getElementById('root')?.__vue_app__)"), 'recovery Vue')
  await run(`document.getElementById('root').__vue_app__.config.globalProperties.$router.push('/setting?name=PluginSettings&section=${id}')`)
  await waitFor(() => run("Boolean(document.querySelector('[data-credential-error]'))&&!document.querySelector('[data-credential-clear]').disabled"), 'corrupt recovery action')
  assert.equal(await run("document.querySelector('[data-credential-configured=token]').textContent"), '状态未知')
  await run("document.querySelector('[data-plugin-credentials]').scrollIntoView({block:'center'});void 0")
  await capture('credentials-corrupt-recovery.png')
  await run("document.querySelector('[data-credential-clear]').click()")
  await waitFor(() => run("document.querySelector('[data-credential-status]')?.textContent==='全部凭据已删除。'"), 'corrupt cleared')
  assert.equal((await status()).configured.token,false)
  assert.equal((await info(id)).available,true)
  assert.ok(!fs.existsSync(encryptedFile))
  checks.push('fresh settings view keeps confirmed clear enabled when corrupt JSON prevents status loading, then restores a healthy runtime with an empty namespace')

  await set('fictional-uninstall-secret')
  const beforeUninstall = fs.readFileSync(encryptedFile)
  const unlink = fs.promises.unlink
  Object.defineProperty(fs.promises,'unlink',{configurable:true,writable:true,value:async(...args)=>{
    if(String(args[0])===encryptedFile)throw Object.assign(new Error('simulated credential unlink failure'),{code:'EACCES'})
    return unlink(...args)
  }})
  try { await assert.rejects(ipc('plugin_uninstall',{pluginId:id})) } finally { Object.defineProperty(fs.promises,'unlink',{configurable:true,writable:true,value:unlink}) }
  assert.equal((await info(id)).available,true)
  assert.deepEqual(fs.readFileSync(encryptedFile),beforeUninstall)
  assert.equal(await runtime(id).executeJavaScript("readOwn('token')"),'fictional-uninstall-secret')
  checks.push('actual credential unlink failure preserves the registered package and encrypted values for retry')
  const registryFile = path.join(global.lxDataPath, 'plugins/registry.json')
  const registryBytes = fs.readFileSync(registryFile)
  const packagePath = JSON.parse(registryBytes.toString('utf8')).plugins.find(plugin => plugin.id === id).path
  const removeTree = fs.promises.rm
  Object.defineProperty(fs.promises,'rm',{configurable:true,writable:true,value:async(...args)=>{
    if(String(args[0])===packagePath)throw Object.assign(new Error('simulated package directory failure'),{code:'EACCES'})
    return removeTree(...args)
  }})
  try { await assert.rejects(ipc('plugin_uninstall',{pluginId:id}), /凭据已清理/) } finally { Object.defineProperty(fs.promises,'rm',{configurable:true,writable:true,value:removeTree}) }
  assert.equal((await info(id)).version,'1.0.0')
  assert.deepEqual(fs.readFileSync(registryFile),registryBytes)
  assert.equal((await status()).configured.token,false)
  assert.ok(fs.existsSync(packagePath))
  assert.equal(await runtime(id).executeJavaScript("readOwn('token')"),undefined)
  await ipc('plugin_uninstall',{pluginId:id})
  assert.equal(fs.readdirSync(credentialRoot).filter(name=>name.endsWith('.json')).length,0)
  assert.equal((await info('lx.official-suite')).available,true)
  checks.push('package directory cleanup failure keeps the persisted identity and reports cleared credentials; retry finishes cleanup and removes the registry entry')
  assert.deepEqual(errors,[])
  await finish(0)
}).catch(error=>{void finish(1,error)})
