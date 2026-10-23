/* Run the built application with a disposable profile and a real SQLite list. */
const { app, BrowserWindow, webContents, globalShortcut } = require('electron')
const { promises: fs, mkdtempSync, mkdirSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '../..')
const profile = mkdtempSync(path.join(os.tmpdir(), 'lx-full-app-smoke-'))
mkdirSync(path.join(profile, 'LxDatas'))
app.commandLine.appendSwitch('user-data-dir', profile); app.setPath('userData', profile)
app.getVersion = () => require(path.join(root, 'package.json')).version
app.setAsDefaultProtocolClient = () => false
// Keep the installed app's protocol and hotkeys untouched during this fixture.
globalShortcut.register = () => false
const rendererErrors = []
app.on('browser-window-created', (_event, win) => {
  if (global.lx?.appSetting) { global.lx.appSetting['common.isAgreePact'] = true; global.lx.appSetting['common.langId'] = 'zh-cn' }
  win.webContents.on('console-message', event => {
    if (event.level === 'error') { rendererErrors.push(event.message); console.error('APP', event.message) }
  })
})
const waitFor = async(fn, label) => {
  const until = Date.now() + 30000
  while (Date.now() < until) { try { const value = await fn(); if (value) return value } catch {} await new Promise(resolve => setTimeout(resolve, 100)) }
  throw new Error(`Timed out: ${label}`)
}
require(path.join(root, 'dist/main.js'))
app.whenReady().then(async() => {
  const host = await waitFor(() => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('index.html')), 'built application window')
  host.webContents.setBackgroundThrottling(false)
  await waitFor(() => host.webContents.executeJavaScript("Boolean(document.getElementById('root')?.__vue_app__)"), 'real Vue app mount')
  const installErrorHandler = () => host.webContents.executeJavaScript("if(!window.__fixtureConsoleError){window.__fixtureConsoleError = console.error.bind(console);console.error=(...args)=>window.__fixtureConsoleError(...args.map(value=>value?.stack||value));}document.getElementById('root').__vue_app__.config.errorHandler = error => console.error(error.stack);window.addEventListener('unhandledrejection',event=>console.error(event.reason?.stack||event.reason));void 0")
  await installErrorHandler()
  const songs = Array.from({ length: 120 }, (_, i) => ({ id: `fixture-local-${i}`, name: `Local fixture ${i}`, singer: 'Fixture artist', source: 'local', interval: '03:00', meta: { albumName: 'Fixture album', filePath: '/nonexistent/fixture.mp3', ext: 'mp3', picUrl: '' } }))
  await global.lx.event_list.list_music_add('default', songs, 'bottom', false)
  await host.webContents.executeJavaScript("document.getElementById('root').__vue_app__.config.globalProperties.$router.push('/list?id=default')")
  await waitFor(() => host.webContents.executeJavaScript("Boolean(document.querySelector('[data-feature=list] table')) && document.body.textContent.includes('Local fixture 0')"), 'default original list layout')
  assert.equal(webContents.getAllWebContents().some(contents => contents.getURL().startsWith('lxplugin://')), false, 'default native layout does not replace the original list with an isolated view')
  const designEvidence = path.join(root, '.runtime/settings-design-20261020'); await fs.mkdir(designEvidence, { recursive: true })
  await host.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  await fs.writeFile(path.join(designEvidence, 'original-list-default.png'), (await host.webContents.capturePage()).toPNG())
  console.log('PASS original list layout is the default within the official feature plugin')
  const reloadWithPrefs = async(prefs) => {
    const initialized = new Promise(resolve => host.webContents.once('did-finish-load', resolve))
    await host.webContents.executeJavaScript(`(async()=>{ localStorage.setItem('lx.collection.providers.v1', ${JSON.stringify(JSON.stringify(prefs))}); const ipc=require('electron').ipcRenderer; ipc.send('winMain_save_data',{path:'viewPrevState',data:{url:'/list',query:{id:'default'}}}); await ipc.invoke('winMain_get_data','viewPrevState') })()`)
    host.webContents.reload()
    await initialized
    await waitFor(() => host.webContents.executeJavaScript("Boolean(document.getElementById('root')?.__vue_app__)"), 'new document mount')
    await installErrorHandler()
    console.log('PASS fresh document mount')
  }
  const prefs = { enabled: true, globalProviderId: null, surfaceProviders: {} }
  await reloadWithPrefs(prefs)
  await waitFor(() => host.webContents.executeJavaScript("Boolean(document.getElementById('root')?.__vue_app__)"), 'reload')
  await host.webContents.executeJavaScript("document.getElementById('root').__vue_app__.config.globalProperties.$router.push('/list?id=default')")
  const official = await waitFor(async() => {
    const views = webContents.getAllWebContents().filter(contents => contents.getURL().startsWith('lxplugin://lx.official-list/'))
    for (const view of views) if (await view.executeJavaScript("document.body.textContent.includes('Local fixture 0')")) return view
  }, 'real list adapter renders database songs')
  assert.equal(await official.executeJavaScript("document.querySelectorAll('.row').length < 60"), true)
  await official.executeJavaScript("Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Select all').click()")
  await waitFor(() => official.executeJavaScript("document.querySelector('.check')?.checked === true"), 'real controller selection')
  await host.webContents.executeJavaScript("document.getElementById('root').classList.add('show-modal')")
  await waitFor(() => host.contentView.children.find(view => view.webContents?.id === official.id)?.getVisible() === false, 'host overlay hides native view')
  await host.webContents.executeJavaScript("document.getElementById('root').classList.remove('show-modal')")
  await waitFor(() => host.contentView.children.find(view => view.webContents?.id === official.id)?.getVisible() === true, 'host overlay restores native view')
  await host.webContents.executeJavaScript("document.getElementById('root').__vue_app__.config.globalProperties.$router.push('/setting')")
  await waitFor(() => host.contentView.children.find(view => view.webContents?.id === official.id)?.getVisible() === false, 'route change hides native view')
  await host.webContents.executeJavaScript("document.getElementById('root').__vue_app__.config.globalProperties.$router.push('/list?id=default')")
  await waitFor(() => host.contentView.children.find(view => view.webContents?.id === official.id)?.getVisible() === true, 'route return reuses view')
  await waitFor(() => official.executeJavaScript("document.querySelector('.check')?.checked === true"), 'route return preserves host selection')
  console.log('PASS list, selection, overlay and route restore')
  const next = { enabled: true, globalProviderId: 'lx.card-gallery/card-gallery', surfaceProviders: {} }
  await reloadWithPrefs(next)
  await waitFor(() => host.webContents.executeJavaScript("Boolean(document.getElementById('root')?.__vue_app__)"), 'card reload')
  await host.webContents.executeJavaScript("document.getElementById('root').__vue_app__.config.globalProperties.$router.push('/list?id=default')")
  const cards = await waitFor(async() => {
    for (const view of webContents.getAllWebContents().filter(contents => contents.getURL().startsWith('lxplugin://lx.card-gallery/'))) {
      if (await view.executeJavaScript("document.querySelectorAll('.card').length > 0 && document.body.textContent.includes('Local fixture 0')")) return view
    }
  }, 'real card provider renders database songs')
  const evidence = path.join(root, '.runtime/settings-design-20261020'); await fs.mkdir(evidence, { recursive: true })
  await fs.writeFile(path.join(evidence, 'full-app-cards.png'), (await cards.capturePage()).toPNG())
  const featureEvidence = path.join(root, '.runtime/settings-design-20261020'); await fs.mkdir(featureEvidence, { recursive: true })
  const run = script => host.webContents.executeJavaScript(script)
  await run("if(!window.__fixtureConsoleError){window.__fixtureConsoleError = console.error.bind(console);console.error=(...args)=>window.__fixtureConsoleError(...args.map(value=>value?.stack||value));}document.getElementById('root').__vue_app__.config.errorHandler = error => console.error(error.stack);window.addEventListener('unhandledrejection',event=>console.error(event.reason?.stack||event.reason));void 0")
  const settleFrame = async() => {
    host.webContents.sendInputEvent({ type: 'mouseMove', x: 700, y: 25 })
    await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 120))))')
  }
  const menuContrast = () => run(`(() => {
    const color = value => { const values = value.match(/[0-9.]+/g).map(Number); return [values[0], values[1], values[2], values[3] ?? 1] };
    const blend = (top,bottom) => [0,1,2].map(i=>top[i]*top[3]+bottom[i]*(1-top[3]));
    const linear = value => { const v=value/255; return v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4 };
    const luminance = rgb => .2126*linear(rgb[0])+.7152*linear(rgb[1])+.0722*linear(rgb[2]);
    const selected=document.querySelector('.settings-menu-item.is-selected');
    const path=[];let current=selected;while(current){path.unshift(current);current=current.parentElement}
    let background=[255,255,255];for(const element of path)background=blend(color(getComputedStyle(element).backgroundColor),background);
    const foreground=blend(color(getComputedStyle(selected).color),background);
    const a=luminance(foreground),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  })()`)

  const navigate = route => run(`document.getElementById('root').__vue_app__.config.globalProperties.$router.push(${JSON.stringify(route)})`)
  const togglePackage = async id => {
    const selector = `[data-plugin-id='${id}'] input`
    await waitFor(() => run(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), `package control ${id}`)
    await run(`document.querySelector(${JSON.stringify(selector)}).click()`)
  }
  await run(`window.__suiteRoute = () => document.getElementById('root').__vue_app__.config.globalProperties.$router.currentRoute.value.matched.at(-1)?.instances.default;
    window.__suiteFind = (vnode, name) => {
      if (!vnode) return null;
      if (vnode.component) {
        if ((vnode.component.type.__name || vnode.component.type.name) === name) return vnode.component;
        const found = window.__suiteFind(vnode.component.subTree, name); if (found) return found;
      }
      if (vnode.suspense) { const found = window.__suiteFind(vnode.suspense.activeBranch, name); if (found) return found; }
      if (Array.isArray(vnode.children)) for (const child of vnode.children) { const found = window.__suiteFind(child, name); if (found) return found; }
      return null;
    };void 0`)
  await navigate('/extensions')
  await waitFor(() => run('document.querySelectorAll(".feature-row").length === 33'), 'all function contributions')
  await run(`window.__suiteManager = window.__suiteFind(window.__suiteRoute().$.subTree, 'FeatureManagement').exposed;void 0`)
  await require('./page-design-fixture.cjs')({ run, navigate, waitFor, host, evidence: featureEvidence, settleFrame, songs })
  const playerRect = await run(`(()=>{const r=document.getElementById('player').getBoundingClientRect();return {height:r.height,width:r.width}})()`)
  assert.ok(playerRect.height > 30 && playerRect.height < 160, 'native view root preserves player layout')
  await navigate('/dj')
  await waitFor(() => run('Boolean(document.querySelector("[data-feature=dj] textarea"))'), 'DJ function')
  const djUid = await run(`window.__suiteRoute().inputMessage = 'state survives rendering change'; window.__suiteRoute().$.uid`)
  await run(`window.__suiteManager.setFeatureView('dj','compact')`)
  await waitFor(() => run('Boolean(document.querySelector(".suite-dj-conversation"))'), 'independent DJ conversation template')
  assert.equal(await run('window.__suiteRoute().$.uid'), djUid)
  assert.equal(await run('document.querySelector(".suite-dj-conversation textarea").value'), 'state survives rendering change')
  await run(`window.__suiteManager.setFeatureView('dj','classic')`)
  await waitFor(() => run('document.querySelector("[data-feature=dj]")?.dataset.renderer === "classic"'), 'DJ default restored')
  assert.equal(await run('window.__suiteRoute().$.uid'), djUid)
  // DJ settings retain their original modal split, using the same radio form model.
  await run('window.__suiteRoute().showSettingModal = true')
  await waitFor(() => run(`Boolean(document.querySelector('[aria-label="AI 电台设置"] .radio-settings-fields'))`), 'DJ settings modal')
  const radioCategories = ['llm', 'djPrompt', 'chatPrompt', 'tts', 'weather', 'data']
  assert.ok(await menuContrast() >= 4.5, 'DJ settings selected menu text contrast')
  const contrastRatios = { popup: await menuContrast() }
  const modalRadioUid = await run(`window.__suiteFind(window.__suiteRoute().$.subTree,'Feature_settings_radio').uid`)
  await run(`window.__suiteFind(window.__suiteRoute().$.subTree,'Feature_settings_radio').proxy.form.city = '未保存的城市'`)
  for (const category of radioCategories) {
    await run(`window.__suiteFind(window.__suiteRoute().$.subTree,'DjSettingModal').proxy.activeCategory = ${JSON.stringify(category)}`)
    await waitFor(() => run(`document.querySelector('.radio-settings-fields')?.dataset.radioSection === ${JSON.stringify(category)}`), `DJ category ${category}`)
    assert.equal(await run(`window.__suiteFind(window.__suiteRoute().$.subTree,'Feature_settings_radio').uid`), modalRadioUid)
    assert.equal(await run(`window.__suiteFind(window.__suiteRoute().$.subTree,'Feature_settings_radio').proxy.form.city`), '未保存的城市')
    if (['llm','tts'].includes(category)) { await settleFrame(); await fs.writeFile(path.join(featureEvidence, `dj-modal-${category}.png`), (await host.webContents.capturePage()).toPNG()) }
  }
  await run(`document.querySelector('[aria-label="AI 电台设置"] [aria-label="关闭"]').click()`)
  await waitFor(() => run(`!document.querySelector('[role="dialog"][aria-label="AI 电台设置"]')`), 'DJ modal closes')
  await navigate('/setting')
  await waitFor(() => run('Boolean(window.__suiteRoute()?.toggleTab)'), 'settings function')
  const settingsUid = await run('window.__suiteRoute().$.uid')
  assert.equal(await run('document.querySelectorAll(".settings-group-button").length'), 6)
  assert.ok(await menuContrast() >= 4.5, 'settings selected menu text contrast')
  contrastRatios.settings = await menuContrast()
  const layoutMetrics = []
  const settingIds = ['SettingBasic', 'SettingPlay', 'SettingPlayDetail', 'SettingDesktopLyric', 'SettingSearch', 'SettingList', 'SettingDownload', 'SettingRadio', 'SettingHotKey', 'SettingSync', 'SettingOpenAPI', 'SettingNetwork', 'SettingOdc', 'SettingBackup', 'SettingOther', 'SettingUpdate', 'SettingAbout']
  const settingContributions = (await Promise.all(['official', 'radio'].map(async name => JSON.parse(await fs.readFile(path.join(root, `src/common/bundles/${name}.json`), 'utf8'))))).flatMap(bundle => bundle.settings)
  for (const id of settingIds) {
    await run(`window.__suiteRoute().toggleTab(${JSON.stringify(id)})`)
    const featureId = settingContributions.find(item => item.id === id).featureId
    await waitFor(() => run(`Boolean(window.__suiteFind(window.__suiteRoute().$.subTree, ${JSON.stringify('Feature_' + featureId.replace(/\W/g, '_'))}))`), `setting contribution ${id}`)
    const metric = await run(`(() => { const root = document.querySelector('.settings-content .settings-form'); const body = root.querySelector('.settings-parameters'); const style = getComputedStyle(body); return { fontSize:style.fontSize,paddingLeft:style.paddingLeft,footerHeight:root.querySelector('.settings-actions').getBoundingClientRect().height } })()`)
    layoutMetrics.push({ id, ...metric })
    if (['SettingBasic','SettingPlay','SettingNetwork'].includes(id)) { await settleFrame(); await fs.writeFile(path.join(featureEvidence, `${id}.png`), (await host.webContents.capturePage()).toPNG()) }
    if (id === 'SettingRadio') {
      await waitFor(() => run(`Boolean(document.querySelector('.radio-settings-fields'))`), 'embedded radio settings form')
      await waitFor(() => run(`(() => { const button = Array.from(document.querySelectorAll('button')).find(button => button.textContent === '保存配置'); if (!button) return false; const bounds = button.getBoundingClientRect(); return bounds.bottom <= document.getElementById('view').getBoundingClientRect().bottom && bounds.height > 0 })()`), 'radio save button fits settings viewport')
      assert.equal(await run('document.querySelectorAll(".settings-navigation").length'), 1, 'radio embeds no extra navigation')
      const radioUid = await run(`window.__suiteFind(window.__suiteRoute().$.subTree,'Feature_settings_radio').uid`)
      await run(`window.__suiteFind(window.__suiteRoute().$.subTree,'Feature_settings_radio').proxy.form.city = '跨菜单保留'`)
      for (const category of radioCategories) {
        await run(`window.__suiteRoute().toggleTab(${JSON.stringify('SettingRadio:') } + ${JSON.stringify(category)})`)
        await waitFor(() => run(`document.querySelector('.radio-settings-fields')?.dataset.radioSection === ${JSON.stringify(category)}`), `unified radio category ${category}`)
        assert.equal(await run(`window.__suiteFind(window.__suiteRoute().$.subTree,'Feature_settings_radio').uid`), radioUid)
        assert.equal(await run(`window.__suiteFind(window.__suiteRoute().$.subTree,'Feature_settings_radio').proxy.form.city`), '跨菜单保留')
      }
      assert.equal(await run(`document.querySelector('[data-radio-section="profile"]')`), null, 'user profile settings are removed')
      assert.equal(await run(`Boolean(document.querySelector('[data-radio-section="data"]'))`), true, 'radio backup data remains available')
      await run(`window.__suiteRoute().toggleTab('SettingRadio:llm')`)
      await settleFrame()
      await fs.writeFile(path.join(featureEvidence, 'radio-settings.png'), (await host.webContents.capturePage()).toPNG())
      host.setSize(760,650)
      await settleFrame()
      assert.equal(await run('document.querySelector(".settings-content").scrollWidth <= document.querySelector(".settings-content").clientWidth'), true, 'narrow settings content fits')
      await fs.writeFile(path.join(featureEvidence, 'settings-narrow.png'), (await host.webContents.capturePage()).toPNG())
      host.setSize(1114,718)
      await settleFrame()
    }
  }
  assert.equal(new Set(layoutMetrics.map(metric => metric.fontSize)).size, 1)
  assert.equal(new Set(layoutMetrics.map(metric => metric.paddingLeft)).size, 1)
  assert.equal(new Set(layoutMetrics.map(metric => metric.footerHeight)).size, 1)
  await fs.writeFile(path.join(featureEvidence,'settings-layout.json'),JSON.stringify(layoutMetrics,null,2))
  await run(`window.__suiteRoute().toggleTab('SettingBasic')`)
  await waitFor(() => run(`Boolean(window.__suiteFind(window.__suiteRoute().$.subTree,'Feature_settings_basic')?.proxy.toggleTheme)`), 'dark theme available')
  const lightBackground = await run('getComputedStyle(document.querySelector(".settings-workspace")).backgroundColor')
  await run(`(()=>{const basic=window.__suiteFind(window.__suiteRoute().$.subTree,'Feature_settings_basic').proxy;basic.toggleTheme({id:'black'})})()`)
  await waitFor(async() => await run('getComputedStyle(document.querySelector(".settings-workspace")).backgroundColor') !== lightBackground, 'dark settings theme')
  contrastRatios.dark = await menuContrast()
  assert.ok(contrastRatios.dark >= 4.5, 'dark settings menu contrast')
  await settleFrame()
  await fs.writeFile(path.join(featureEvidence,'settings-dark.png'),(await host.webContents.capturePage()).toPNG())
  await run(`(()=>{const basic=window.__suiteFind(window.__suiteRoute().$.subTree,'Feature_settings_basic').proxy;basic.toggleTheme({id:'green'})})()`)
  await waitFor(async() => await run('getComputedStyle(document.querySelector(".settings-workspace")).backgroundColor') === lightBackground, 'light settings theme restored')
  await fs.writeFile(path.join(featureEvidence,'settings-contrast.json'),JSON.stringify(contrastRatios,null,2))
  await run(`window.__suiteRoute().toggleTab('FeatureManagement:packages')`)
  await waitFor(() => run('Boolean(document.querySelector("[data-plugin-id=\'lx.radio\']"))'), 'plugin package submenu')
  assert.equal(await run('document.querySelectorAll(".feature-row").length'), 0, 'plugin management hides unrelated feature controls')
  await run(`window.__suiteRoute().toggleTab('SettingBasic');window.__suiteManager.setFeatureView('settings','compact')`)
  await waitFor(() => run('Boolean(document.querySelector(".suite-settings-tabs dl dt"))'), 'independent settings tab template')
  assert.equal(await run('window.__suiteRoute().$.uid'), settingsUid)
  assert.equal(await run('window.__suiteRoute().avtiveComponentName'), 'SettingBasic')
  await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 120))))')
  await waitFor(() => run('Array.from(document.querySelectorAll("#left img")).every(image => image.complete && image.naturalWidth > 0)'), 'signed sidebar plugin icons')
  await fs.writeFile(path.join(featureEvidence, 'settings-tabs-dom.json'), JSON.stringify(await run('({html:document.querySelector(".suite-settings-tabs").outerHTML.slice(0,600),renderer:document.querySelector("[data-feature=settings]").dataset.renderer,navHeight:document.querySelector(".suite-settings-tabs nav").getBoundingClientRect().height})'),null,2))
  await fs.writeFile(path.join(featureEvidence, 'settings-tabs.png'), (await host.webContents.capturePage()).toPNG())
  await navigate('/download')
  await waitFor(() => run('Boolean(window.__suiteRoute()?.handleListBtnClick)'), 'download function')
  const downloadUid = await run('window.__suiteRoute().$.uid')
  await run(`window.__suiteManager.setFeatureView('download','compact')`)
  await waitFor(() => run('Boolean(document.querySelector(".suite-download-cards"))'), 'independent download cards template')
  assert.equal(await run('window.__suiteRoute().$.uid'), downloadUid)
  await navigate('/extensions')
  await waitFor(() => run('Boolean(document.querySelector("[data-feature-id=dj] input"))'), 'host recovery management')
  await run('document.querySelector("[data-feature-id=dj] input").click()')
  await navigate('/dj')
  assert.equal(await run('location.hash.startsWith("#/extensions")'), true, 'disabled function blocks direct route')
  await run('document.querySelector("[data-feature-id=dj] input").click()')
  // The radio package owns its route, settings and runtime independently.
  const radioStoredSettings = await run(`localStorage.getItem('lx_ai_dj_settings_v1')`)
  assert.ok(radioStoredSettings, 'legacy radio settings are retained')
  await waitFor(() => run('Boolean(document.querySelector("[data-service-id=\'lx.radio.runtime\']"))'), 'radio runtime enabled')
  await togglePackage('lx.radio')
  await waitFor(() => run('!document.querySelector("[data-service-id=\'lx.radio.runtime\']") && document.querySelector("[data-feature-id=dj] input")?.disabled === true'), 'radio plugin service detached')
  assert.equal(await run('Boolean(document.getElementById("player"))'), true, 'radio disable preserves ordinary player')
  await navigate('/dj')
  assert.equal(await run('location.hash.startsWith("#/extensions")'), true, 'disabled radio blocks direct route')
  await navigate('/setting')
  await waitFor(() => run('Boolean(window.__suiteRoute()?.tocList)'), 'settings after radio disable')
  assert.equal(await run('window.__suiteRoute().tocList.some(section => section.id === "SettingRadio")'), false)
  await navigate('/extensions')
  await togglePackage('lx.radio')
  await waitFor(() => run('Boolean(document.querySelector("[data-service-id=\'lx.radio.runtime\']"))'), 'radio runtime restored')
  assert.equal(await run("localStorage.getItem('lx_ai_dj_settings_v1')"), radioStoredSettings, 'radio enable/disable preserves settings')
  // A real plugin toggle goes through host-only IPC, store persistence and
  // renderer service unmount. The recovery page remains mounted throughout.
  await togglePackage('lx.official-suite')
  await waitFor(() => run('document.querySelector("[data-feature-id=dj] input")?.checked === false && !document.getElementById("player")'), 'suite disabled with host recovery intact')
  // Route persistence is throttled independently of package state. Wait for the
  // actual saved recovery location before testing document restart restoration.
  await waitFor(() => run("require('electron').ipcRenderer.invoke('winMain_get_data','viewPrevState').then(state=>state?.url==='/extensions')"), 'recovery route persisted')
  const disabledReload = new Promise(resolve => host.webContents.once('did-finish-load', resolve))
  host.webContents.reload()
  await disabledReload
  await waitFor(() => run('document.querySelectorAll(".feature-row").length === 33 && !document.getElementById("player") && location.hash.startsWith("#/extensions")'), 'disabled bundle survives document restart with independent recovery')
  await waitFor(() => run('Boolean(document.querySelector("[data-plugin-id=\'lx.official-suite\'] input"))'), 'disabled package management reload')
  await togglePackage('lx.official-suite')
  await waitFor(() => run('Boolean(document.getElementById("player"))'), 'suite reenabled with service lifetime restored')
  await navigate('/dj')
  await waitFor(() => run('Boolean(document.querySelector("[data-feature=dj]"))'), 'suite route recovered')
  assert.equal(await run("document.getElementById('root').__vue_app__.config.globalProperties.$router.currentRoute.value.meta.pluginId"), 'lx.radio')
  await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 120))))')
  await fs.writeFile(path.join(featureEvidence, 'radio-default.png'), (await host.webContents.capturePage()).toPNG())
  assert.deepEqual(rendererErrors, [], 'complete app flow has no renderer errors')
  await fs.writeFile(path.join(featureEvidence, 'native-suite.json'), JSON.stringify({ passed:true, functions:33, views:90, settings:17, checks:['default-bundle-enabled','default-original-list','player-layout','dj-independent-view-and-model-preserved','settings-contributions','settings-view-state-preserved','download-independent-view','function-disable-route-guard','bundle-disable-host-recovery','bundle-disabled-document-restart','bundle-reenable-service-and-route','signed-sidebar-icons','radio-independent-disable','radio-settings-contribution','radio-runtime-detach-and-reenable','hierarchical-settings-menu','consistent-form-layout','shared-radio-form','unsaved-radio-draft-preserved','narrow-window-layout','settings-menu-text-contrast','dark-settings-theme'], electron:process.versions.electron }, null, 2))
  console.log('PASS native suite, 33 functions, 90 render registrations, 17 settings, view state and bundle recovery')
  await fs.writeFile(path.join(evidence, 'app-smoke.json'), JSON.stringify({ passed: true, realSqliteSongs: 120, checks: ['built-app-vue-mount','real-list-adapter','official-list-provider','selection','overlay-hide-and-restore','route-instance-and-selection-restore','card-provider'], profile: 'disposable', electron: process.versions.electron }, null, 2))
  console.log('PASS built application + real SQLite + both providers (7 checks)')
  global.lx.isSkipTrayQuit = true
  for (const win of BrowserWindow.getAllWindows()) win.destroy()
  await fs.rm(profile, { recursive: true, force: true })
  app.exit(0)
}).catch(async error => {
  console.error(error)
  for (const contents of webContents.getAllWebContents()) {
    try { console.error('DIAGNOSTIC', contents.getURL().split('?')[0], await contents.executeJavaScript('document.body.innerText.slice(0, 2000)')) } catch {}
  }
  await fs.rm(profile, { recursive: true, force: true }); app.exit(1)
})
setTimeout(() => { console.error('Full application smoke exceeded 180 seconds'); app.exit(1) }, 180000).unref()
