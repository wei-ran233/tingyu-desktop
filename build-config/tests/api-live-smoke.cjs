/* Live integration probes: disposable profile, real configured APIs, redacted results. */
const { app, BrowserWindow, globalShortcut } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const root = path.resolve(__dirname, '../..')
const evidence = path.join(root, '.runtime/api-live-20261020')
const serviceOnly = process.argv.includes('--services')
const mediaOnly = process.argv.includes('--media')
const sources = (process.env.LX_LIVE_SOURCES || 'kw,kg,tx,wy,mg').split(',').filter(id => ['kw', 'kg', 'tx', 'wy', 'mg'].includes(id))
const ttsOnly = process.argv.includes('--tts')
const weatherOnly = process.argv.includes('--weather')
const testProxy = process.env.LX_LIVE_TEST_PROXY ? new URL(process.env.LX_LIVE_TEST_PROXY) : null
const resultFile = weatherOnly ? 'weather-results.json' : mediaOnly && sources.length === 1 ? sources[0] + '-media-results.json' : mediaOnly ? (testProxy ? 'media-proxy-results.json' : 'media-results.json') : ttsOnly ? 'tts-proxy-results.json' : serviceOnly ? 'service-results.json' : 'results.json'
app.setName('lx-music-desktop')
app.getVersion = () => require(path.join(root, 'package.json')).version
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-api-live-'))
const original = path.join(os.homedir(), '.config/lx-music-desktop')
fs.mkdirSync(evidence, { recursive: true })
fs.mkdirSync(path.join(profile, 'LxDatas'), { recursive: true })
// Copy interface settings and their storage partition locally; no history enters API prompts.
for (const name of ['Partitions/win-main/Local Storage', 'dj-credentials.json']) {
  const source = path.join(original, name)
  if (fs.existsSync(source)) fs.cpSync(source, path.join(profile, name), { recursive: true, filter: file => !file.endsWith('/LOCK') })
}
const previous = JSON.parse(fs.readFileSync(path.join(original, 'LxDatas/config_v2.json'), 'utf8'))
const setting = Object.fromEntries(Object.entries(previous.setting).filter(([key]) => key.startsWith('network.proxy.') || key === 'common.apiSource'))
if (testProxy)Object.assign(setting, { 'network.proxy.enable': true, 'network.proxy.host': testProxy.hostname, 'network.proxy.port': testProxy.port })
Object.assign(setting, { 'common.isAgreePact': true, 'common.langId': 'zh-cn', 'common.startInTray': false, 'sync.enable': false })
fs.writeFileSync(path.join(profile, 'LxDatas/config_v2.json'), JSON.stringify({ version: previous.version, setting }), { mode: 0o600 })
fs.copyFileSync(path.join(original, 'LxDatas/user_api.json'), path.join(profile, 'LxDatas/user_api.json'))
app.commandLine.appendSwitch('user-data-dir', profile); app.setPath('userData', profile)
app.setAsDefaultProtocolClient = () => false
globalShortcut.register = () => false
const results = []
const waitFor = async(fn, label, timeout = 30000) => { const until = Date.now() + timeout; while (Date.now() < until) { try { const result = await fn(); if (result) return result } catch {} await new Promise(resolve => setTimeout(resolve, 100)) } throw new Error('Timed out: ' + label) }
app.on('browser-window-created', (_event, win) => {
  if (global.lx?.appSetting) { Object.assign(global.lx.appSetting, setting) }
})
require(path.join(root, 'dist/main.js'))
app.whenReady().then(async() => {
  const host = await waitFor(() => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('index.html')), 'main window')
  const run = code => host.webContents.executeJavaScript(code)
  await waitFor(() => run("Boolean(document.getElementById('root')?.__vue_app__)"), 'Vue mount')
  await run(`window.__liveRouter=document.getElementById('root').__vue_app__.config.globalProperties.$router;
    window.__liveFind=(vnode,name)=>{if(!vnode)return null;if(vnode.component){if((vnode.component.type.__name||vnode.component.type.name)===name)return vnode.component;const found=window.__liveFind(vnode.component.subTree,name);if(found)return found;}if(vnode.suspense){const found=window.__liveFind(vnode.suspense.activeBranch,name);if(found)return found;}if(Array.isArray(vnode.children))for(const child of vnode.children){const found=window.__liveFind(child,name);if(found)return found;}return null;};
    window.webpackChunklx_music_desktop.push([[Date.now()],{},req=>window.__liveRequire=req]);
    for(const [id,factory] of Object.entries(window.__liveRequire.m)){const code=factory.toString();if(!code.includes('酷我音乐')||!code.includes('searchMusic'))continue;const exports=window.__liveRequire(id);const sdk=Object.values(exports).find(v=>v?.kw&&v?.sources&&v?.searchMusic);if(sdk){window.__liveSdk=sdk;break;}}
    window.__liveResults=[];window.__liveSongs={};window.__liveLists={};void 0`)
  await waitFor(() => run('Boolean(window.__liveSdk)'), 'loaded SDK')
  const probe = async(id, code, timeout = 22000) => {
    const start = Date.now()
    const result = await run(`(async()=>{let timer;try{return await Promise.race([(async()=>{${code}})(),new Promise(resolve=>timer=setTimeout(()=>resolve({status:'timeout'}),${timeout}))]);}catch(error){return {status:'error',message:String(error?.message||error).replace(/https?:\\/\\/[^\\s)]+/g,'[endpoint]').slice(0,220)};}finally{clearTimeout(timer)}})()`)
    const row = { id, elapsedMs: Date.now() - start, ...result }
    results.push(row); fs.writeFileSync(path.join(evidence, resultFile), JSON.stringify(results, null, 2), { mode: 0o600 }); console.log('LIVE', JSON.stringify(row)); return row
  }
  // Source requests use the production SDK, without mock responses or private search words.
  console.log('SOURCE', JSON.stringify({ selected: global.lx?.appSetting?.['common.apiSource'], apis: previous.setting['common.apiSource'] === global.lx?.appSetting?.['common.apiSource'] }))
  if (!serviceOnly) {
    for (const id of sources) {
      await probe('search.' + id, `const sdk=window.__liveSdk[${JSON.stringify(id)}];const result=await sdk.musicSearch.search('成都',1,5);if(!Array.isArray(result.list)||!Number.isFinite(Number(result.total)))throw Error('Invalid search response');window.__liveSongs[${JSON.stringify(id)}]=result.list;return {status:result.list.length?'ok':'empty',count:result.list.length,total:result.total};`)
    }
    if (!mediaOnly) {
      for (const id of sources) {
        await probe('songlists.' + id, `const sdk=window.__liveSdk[${JSON.stringify(id)}].songList;if(!sdk)return {status:'unsupported'};const sort=sdk.sortList[0].id;const result=await sdk.getList(sort,'',1);if(!Array.isArray(result.list))throw Error('Invalid playlist response');window.__liveLists[${JSON.stringify(id)}]=result.list;return {status:result.list.length?'ok':'empty',count:result.list.length,total:result.total};`)
        await probe('leaderboard.' + id, `const sdk=window.__liveSdk[${JSON.stringify(id)}].leaderboard;if(!sdk)return {status:'unsupported'};const boards=await sdk.getBoards();const board=boards.list[0];if(!board)return {status:'empty'};const result=await sdk.getList(board.bangid,1);if(!Array.isArray(result.list))throw Error('Invalid leaderboard response');return {status:result.list.length?'ok':'empty',boards:boards.list.length,count:result.list.length,total:result.total};`)
        if (await run(`Boolean(window.__liveLists[${JSON.stringify(id)}]?.length)`)) await probe('songlist-detail.' + id, `const result=await window.__liveSdk[${JSON.stringify(id)}].songList.getListDetail(window.__liveLists[${JSON.stringify(id)}][0].id,1);return {status:result.list?.length?'ok':'empty',count:result.list?.length,total:result.total};`)
      }
    }
  }
  if (!mediaOnly) {
    await run("window.__liveRouter.push('/setting')")
    await waitFor(() => run('Boolean(window.__liveRouter.currentRoute.value.matched.at(-1)?.instances.default?.toggleTab)'), 'settings model')
    await run("window.__liveRouter.currentRoute.value.matched.at(-1).instances.default.toggleTab('SettingRadio:llm')")
    await waitFor(() => run("Boolean(window.__liveFind(window.__liveRouter.currentRoute.value.matched.at(-1).instances.default.$.subTree,'Feature_settings_radio')?.proxy.form)"), 'radio parameters')
    const metadata = await run('(()=>{window.__liveRadio=window.__liveFind(window.__liveRouter.currentRoute.value.matched.at(-1).instances.default.$.subTree,\'Feature_settings_radio\').proxy;const f=window.__liveRadio.form;return {provider:f.selectedModel,model:f.customModelName||f.modelName,configured:!!f.apiKey,ttsEngine:f.ttsEngine,ttsConfigured:!!f.ttsApiKey,weatherConfigured:!!f.weatherApiKey,origin:f.baseUrl?new URL(f.baseUrl).origin:\'\'}})()')
    fs.writeFileSync(path.join(evidence, 'configuration.json'), JSON.stringify(metadata, null, 2)); console.log('CONFIG', JSON.stringify(metadata))
    await run('window.__liveDj=async(operation,args={})=>{const ipc=require(\'electron\').ipcRenderer,id=crypto.randomUUID();const reply=await ipc.invoke(\'lx-dj-service-request\',{id,operation,payload:{settings:JSON.parse(JSON.stringify(window.__liveRadio.form)),...args}});if(reply.error)throw Error(reply.error.message);return reply.value};void 0')
    if (!ttsOnly && !weatherOnly && (metadata.configured || /ollama|lmstudio/.test(metadata.provider))) {
      await probe('dj.models', 'const list=await window.__liveDj(\'models\');return {status:Array.isArray(list)&&list.length?\'ok\':\'empty\',count:list.length};', 35000)
      await probe('dj.complete', 'const text=await window.__liveDj(\'complete\',{prompt:\'这是接口连接测试，请只回复：连接成功。\'});return {status:text?.trim()?\'ok\':\'empty\',characters:text?.length};', 35000)
      await probe('dj.stream', 'let chunks=0;const ipc=require(\'electron\').ipcRenderer;const listener=()=>chunks++;ipc.on(\'lx-dj-service-event\',listener);try{const result=await window.__liveDj(\'stream\',{sessionId:\'api-live-test\',context:{messages:[{role:\'user\',content:\'这是接口连接测试，请只回复：连接成功。\',timestamp:Date.now()}]}});return {status:result.content?.some(c=>c.type===\'text\'&&c.text)?\'ok\':\'empty\',chunks,stopReason:result.stopReason};}finally{ipc.off(\'lx-dj-service-event\',listener)}', 45000)
    } else if (!metadata.configured) results.push({ id: 'dj', status: 'not-configured' })
    if (!weatherOnly && metadata.ttsEngine !== 'web-speech') await probe('tts.configured', 'const audio=await window.__liveDj(\'tts\',{text:\'你好，这是语音接口测试。\'});const context=new AudioContext();try{const decoded=await context.decodeAudioData(new Uint8Array(audio.audio).buffer);return {status:decoded.duration>0?\'ok\':\'empty\',mime:audio.mime,bytes:audio.audio.length,duration:decoded.duration,sampleRate:decoded.sampleRate};}finally{await context.close()};', 68000)
    else if (!weatherOnly) await probe('tts.web-speech', 'const voices=speechSynthesis.getVoices();return {status:voices.length?\'ok\':\'unavailable\',voices:voices.length};')
    // Use the same weather method exposed to the page.
    if (!ttsOnly) await probe('weather', 'const form=window.__liveRadio.form,city=form.city,saved=localStorage.getItem(\'lx_ai_dj_settings_v1\');form.city=city===\'北京\'?\'成都\':\'北京\';try{await window.__liveRadio.testWeather();const result=window.__liveRadio.weatherTestResult,draftPreserved=saved===localStorage.getItem(\'lx_ai_dj_settings_v1\');return {status:result.startsWith(\'成功\')&&draftPreserved?\'ok\':\'error\',message:result.slice(0,160),draftPreserved};}finally{form.city=city}')
  }
  const apiReady = await run('Promise.race([window.lx.apiInitPromise[0],new Promise(resolve=>setTimeout(()=>resolve(\'timeout\'),10000))])'); console.log('SOURCE READY', apiReady)
  // Production playback URL uses the installed custom source via its isolated worker.
  for (const id of sources) {
    if (!await run(`Boolean(window.__liveSongs[${JSON.stringify(id)}]?.length)`)) continue
    await probe('playback-url.' + id, `const info=window.__liveSongs[${JSON.stringify(id)}][0];const request=window.__liveSdk[${JSON.stringify(id)}].getMusicUrl(info,'128k');const result=await (request.promise||request);window.__liveUrls??={};window.__liveUrls[${JSON.stringify(id)}]=result?.url;return {status:result?.url?'ok':'empty',protocol:result?.url?new URL(result.url).protocol:undefined};`)
  }
  if (mediaOnly) {
    for (const id of sources) {
      if (!await run(`Boolean(window.__liveUrls?.[${JSON.stringify(id)}])`)) continue
      const url = await run(`window.__liveUrls[${JSON.stringify(id)}]`)
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000)
      let transport
      try {
        const response = await host.webContents.session.fetch(url, { headers: { Range: 'bytes=0-1023' }, signal: controller.signal })
        const reader = response.body?.getReader(); const chunk = await reader?.read(); await reader?.cancel()
        transport = { status: response.status, type: response.headers.get('content-type'), bytes: chunk?.value?.length, signature: chunk?.value ? Buffer.from(chunk.value.slice(0, 4)).toString('hex') : undefined }
      } catch (error) { transport = { error: error.name, message: String(error.message).replace(/https?:\/\/[^\s)]+/g, '[endpoint]').slice(0, 160) } } finally { clearTimeout(timer) }
      results.push({ id: 'audio-http.' + id, ...transport }); console.log('AUDIO HTTP', JSON.stringify({ source: id, ...transport }))
      await probe('audio-decode.' + id, `const audio=new Audio();audio.muted=true;audio.crossOrigin='anonymous';audio.preload='metadata';let timer;try{return await new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'timeout',readyState:audio.readyState,errorCode:audio.error?.code}),18000);audio.onerror=()=>resolve({status:'error',errorCode:audio.error?.code,message:audio.error?.message?.slice(0,180)});audio.onloadedmetadata=()=>audio.play().catch(()=>resolve({status:'play-rejected',readyState:audio.readyState}));audio.ontimeupdate=()=>{if(audio.currentTime>.15)resolve({status:'ok',duration:audio.duration,advanced:audio.currentTime})};audio.src=window.__liveUrls[${JSON.stringify(id)}];});}finally{clearTimeout(timer);audio.pause();audio.removeAttribute('src');audio.load()}`, 21000)
    }
  }
  fs.writeFileSync(path.join(evidence, resultFile), JSON.stringify(results, null, 2))
  console.log('LIVE COMPLETE', results.length)
  global.lx?.appSetting && (global.lx.appSetting['common.quitWhenClose'] = true)
  host.destroy(); fs.rmSync(profile, { recursive: true, force: true }); app.exit(results.some(row => ['error', 'timeout', 'empty', 'play-rejected', 'unavailable'].includes(row.status) || (typeof row.status === 'number' && row.status >= 400)) ? 2 : 0)
}).catch(error => { console.error('LIVE HARNESS', error?.message); fs.writeFileSync(path.join(evidence, resultFile), JSON.stringify(results, null, 2)); fs.rmSync(profile, { recursive: true, force: true }); app.exit(1) })
app.on('will-quit', () => { try { fs.rmSync(profile, { recursive: true, force: true }) } catch {} })
