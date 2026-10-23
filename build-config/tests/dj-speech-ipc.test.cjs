const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const handlers={},listeners={},timers=new Set()
let serviceMode='pending'
const sender={id:1,once(){},removeListener(){},isDestroyed:()=>false}
const exportsObject={}
const ipc={request:'request',cancel:'cancel',credentials:'credentials'}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/main/bundles/radio/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports:exportsObject,AbortController,console,
  setTimeout:(fn,ms)=>{const t={fn,ms};timers.add(t);return t},clearTimeout:t=>timers.delete(t),
  require:n=>({
    electron:{ipcMain:{handle:(k,fn)=>handlers[k]=fn,on:(k,fn)=>listeners[k]=fn}},
    '@common/dj/ipc':{DJ_IPC:ipc},'@common/dj/models':{},
    './vault':{hydrateSettings:s=>s,protectSettings:s=>s},
    '@main/modules/winMain/main':{getWebContents:()=>sender},
    './voices':{},'./tts':{createTtsService:()=>({synthesize:async(text,signal)=>serviceMode==='success'?{audio:[1,2,3]}:new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('TTS request aborted'))))})},
  })[n],
})
let enabled = true
const cancelPluginRequests = exportsObject.default(() => enabled)
;(async()=>{
  const request=id=>handlers.request({sender},{id,operation:'tts',payload:{settings:{ttsApiKey:'fixture-secret'},text:'固定合成测试'}})
  const first=request('timeout')
  const timer=[...timers][0];assert.equal(timer.ms,65000);timer.fn()
  const timeout=await first;assert.equal(timeout.error.name,'Error');assert.match(timeout.error.message,/语音合成服务超时/);assert.equal(timers.size,0)
  console.log('PASS TTS IPC budget exceeds inner sixty-second timeout and remains a visible error')
  const second=request('cancel');listeners.cancel({sender},'cancel')
  const cancelled=await second;assert.equal(cancelled.error.name,'AbortError');assert.equal(timers.size,0)
  console.log('PASS explicit user cancellation remains AbortError and clears service timer')
  const third=request('plugin-disable');enabled=false;cancelPluginRequests()
  assert.equal((await third).error.name,'AbortError');assert.equal(timers.size,0)
  assert.equal((await request('disabled')).error.name,'AbortError')
  assert.throws(()=>handlers.credentials({sender},{}),/不允许/)
  console.log('PASS radio disable aborts pending requests and blocks services and credential access')
  enabled=true
  serviceMode='success'
  const success=await request('success');assert.equal(success.value.audio.length,3);assert.equal(timers.size,0)
  console.log('PASS completed TTS service returns audio and releases pending timeout')
})().catch(e=>{console.error(e);process.exitCode=1})
