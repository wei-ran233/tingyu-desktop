/* Production Electron + real SDK, disposable interface configuration. */
const { app, BrowserWindow, globalShortcut } = require('electron')
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os')
const root = path.resolve(__dirname, '../..'); const evidence = process.env.LX_DETAIL_EVIDENCE_DIR ? path.resolve(process.env.LX_DETAIL_EVIDENCE_DIR) : path.join(root, '.runtime/play-detail-20261020')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-detail-live-'))
const original = path.join(os.homedir(), '.config/lx-music-desktop/LxDatas')
fs.mkdirSync(path.join(profile, 'LxDatas'), { recursive: true }); fs.mkdirSync(evidence, { recursive: true })
const config = JSON.parse(fs.readFileSync(path.join(original, 'config_v2.json')))
const setting = { 'common.apiSource': config.setting['common.apiSource'], 'common.isAgreePact': true, 'common.langId': 'zh-cn', 'player.startupAutoPlay': false, 'common.quitWhenClose': true }
fs.writeFileSync(path.join(profile, 'LxDatas/config_v2.json'), JSON.stringify({ version: config.version, setting }), { mode: 0o600 })
fs.copyFileSync(path.join(original, 'user_api.json'), path.join(profile, 'LxDatas/user_api.json'))
app.commandLine.appendSwitch('user-data-dir', profile); app.setPath('userData', profile); app.setAsDefaultProtocolClient = () => false; globalShortcut.register = () => false
app.getVersion = () => require(path.join(root, 'package.json')).version
const results = []; const errors = []
const output = process.env.LX_DETAIL_UI_ONLY ? 'ui-live-results.json' : 'api-results.json'
app.on('browser-window-created', (_event, win) => { if (global.lx?.appSetting) Object.assign(global.lx.appSetting, setting); win.webContents.on('console-message', event => { if (event.level === 'error' && /TypeError|ReferenceError|Unhandled|uncaught/i.test(event.message)) errors.push(event.message) }) })
const waitFor = async(fn, label, timeout = 30000) => { const until = Date.now() + timeout; while (Date.now() < until) { try { const value = await fn(); if (value) return value } catch {} await new Promise(resolve => setTimeout(resolve, 100)) } throw Error('Timed out: ' + label) }
require(path.join(root, 'dist/main.js'))
app.whenReady().then(async() => {
  const host = await waitFor(() => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('index.html')), 'built app')
  host.webContents.setBackgroundThrottling(false)
  if (!process.env.LX_DETAIL_API_ONLY) { host.show(); host.focus() }
  const run = code => host.webContents.executeJavaScript(code)
  await waitFor(() => run("Boolean(document.getElementById('root')?.__vue_app__)"), 'Vue')
  await run(`window.__detailRouter=document.getElementById('root').__vue_app__.config.globalProperties.$router;
    window.__detailFind=(vnode,name)=>{if(!vnode)return null;if(vnode.component){if((vnode.component.type.__name||vnode.component.type.name)===name)return vnode.component;const found=window.__detailFind(vnode.component.subTree,name);if(found)return found;}if(vnode.suspense){const found=window.__detailFind(vnode.suspense.activeBranch,name);if(found)return found;}if(Array.isArray(vnode.children))for(const child of vnode.children){const found=window.__detailFind(child,name);if(found)return found;}return null;};
    window.__detailRoot=()=>document.getElementById('root').__vue_app__._instance.subTree;
    window.webpackChunklx_music_desktop.push([[Date.now()],{},req=>window.__detailRequire=req]);
    for(const [id,factory] of Object.entries(window.__detailRequire.m)){const code=factory.toString();if(!code.includes('酷我音乐')||!code.includes('searchMusic'))continue;const exports=window.__detailRequire(id);const sdk=Object.values(exports).find(v=>v?.kw&&v?.sources&&v?.searchMusic);if(sdk){window.__detailSdk=sdk;break;}}
    window.__detailSongs={};void 0`)
  const probe = async(id, code, timeout = 22000) => {
    const start = Date.now()
    const result = await run(`(async()=>{let timer;try{return await Promise.race([(async()=>{${code}})(),new Promise(resolve=>timer=setTimeout(()=>resolve({status:'timeout'}),${timeout}))]);}catch(error){return {status:'error',message:String(error?.message||error).replace(/https?:\\/\\/[^\\s)]+/g,'[endpoint]').slice(0,180)};}finally{clearTimeout(timer)}})()`)
    const row = { id, elapsedMs: Date.now() - start, ...result }; results.push(row); fs.writeFileSync(path.join(evidence, output), JSON.stringify({ results, errors }, null, 2)); console.log('DETAIL', JSON.stringify(row)); return row
  }
  if (!process.env.LX_DETAIL_UI_ONLY) {
    for (const source of ['kw', 'kg', 'tx', 'wy', 'mg']) {
      await probe('search.' + source, `const result=await window.__detailSdk[${JSON.stringify(source)}].musicSearch.search('成都',1,3);window.__detailSongs[${JSON.stringify(source)}]=result.list;return {status:result.list?.length?'ok':'empty',count:result.list?.length};`)
      if (source === 'kg' && !await run('Boolean(window.__detailSongs.kg?.length)')) {
        await probe('fallback.kg.leaderboard', "const result=await window.__detailSdk.kg.leaderboard.getList('8888',1);window.__detailSongs.kg=result.list;return {status:result.list?.length?'ok':'empty',count:result.list?.length};")
      }
      if (!await run(`Boolean(window.__detailSongs[${JSON.stringify(source)}]?.length)`)) continue
      await probe('lyric.' + source, `const request=window.__detailSdk[${JSON.stringify(source)}].getLyric(window.__detailSongs[${JSON.stringify(source)}][0]);const result=await(request.promise||request);return {status:result.lyric?'ok':'empty',characters:result.lyric?.length,translated:!!result.tlyric,wordTimed:!!result.lxlyric};`)
      for (const kind of ['getHotComment', 'getComment']) await probe('comments.' + source + '.' + kind, `const result=await window.__detailSdk[${JSON.stringify(source)}].comment[${JSON.stringify(kind)}](window.__detailSongs[${JSON.stringify(source)}][0],1,5);return {status:Array.isArray(result.comments)?'ok':'invalid',count:result.comments?.length,total:result.total};`)
    }
  }
  if (process.env.LX_DETAIL_THEME) {
    if (!['tide', 'signal', 'petals'].includes(process.env.LX_DETAIL_THEME)) throw Error('Unknown fixture theme')
    await run("window.__detailRouter.push('/themes')")
    await waitFor(() => run(`Boolean(document.querySelector('[data-theme-choice="${process.env.LX_DETAIL_THEME}"]'))`), 'theme selection page')
    await run(`document.querySelector('[data-theme-choice="${process.env.LX_DETAIL_THEME}"]').click()`)
    await waitFor(() => run(`document.documentElement.dataset.lxTheme==='plugin:lx.theme-studio:${process.env.LX_DETAIL_THEME}'`), 'selected theme')
    await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,500))))')
    fs.writeFileSync(path.join(evidence, 'theme-gallery.png'), (await host.webContents.capturePage()).toPNG())
  }
  if (!process.env.LX_DETAIL_API_ONLY) await require('./play-detail-ui.cjs')({ run, host, waitFor, probe, evidence, results, errors })
  fs.writeFileSync(path.join(evidence, output), JSON.stringify({ results, errors }, null, 2))
  host.destroy(); fs.rmSync(profile, { recursive: true, force: true }); app.exit(errors.length ? 2 : 0)
}).catch(error => { console.error('DETAIL HARNESS', error.message); fs.writeFileSync(path.join(evidence, 'failure.json'), JSON.stringify({ message: error.message, results, errors }, null, 2)); fs.rmSync(profile, { recursive: true, force: true }); app.exit(1) })
