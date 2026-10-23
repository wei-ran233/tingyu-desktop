const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const events = [], urls = [], volumes = []
let playError = null
class Audio {
  constructor() { this.src='';this.currentTime=0;this.listeners={} }
  addEventListener(name,fn) {this.listeners[name]=fn}
  removeAttribute(){this.src=''}
  load(){}
  pause(){events.push('pause')}
  play(){events.push('play');return playError?Promise.reject(playError):Promise.resolve()}
}
const settings={ttsLang:'zh-CN',ttsSpeed:1,ttsPitch:1,duckingVolume:20}
const exportsObject={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/renderer/bundles/radio/player/djAudio.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports:exportsObject, require:n=>({
    '@renderer/plugins/player':{setVolume:v=>volumes.push(v)},
    '@renderer/store/setting':{appSetting:{'player.volume':0.8}},
    '@renderer/bundles/radio/store':{djSettings:settings},
    '@renderer/bundles/radio/composables/useDjChat':{autoContinueRecommend:()=>false},
  })[n], Audio, window:{}, URL:{revokeObjectURL:u=>urls.push(u)}, console,setTimeout,clearTimeout,setInterval,clearInterval,
})
;(async()=>{
  let started=false
  const first=exportsObject.playDjSpeech('blob:success').then(()=>{started=true})
  assert.equal(started,false);assert.equal(events.filter(e=>e==='play').length,0)
  await first;assert.equal(started,true);assert.equal(events.filter(e=>e==='play').length,1)
  assert(Math.abs(volumes.at(-1)-0.16)<1e-8)
  console.log('PASS automatic speech waits for audio playback, after ducking')
  exportsObject.stopDjSpeech();assert.equal(volumes.at(-1),0.8);assert(urls.includes('blob:success'))
  console.log('PASS stop restores music volume and revokes generated audio')
  playError=new Error('fixture decoder failure')
  await assert.rejects(exportsObject.playDjSpeech('blob:bad'),/音频播放失败.*decoder/)
  console.log('PASS failed audio playback rejects to the UI instead of silent fallback')
  playError=null
  const stopped=exportsObject.playDjSpeech('blob:cancelled')
  exportsObject.stopDjSpeech()
  await assert.rejects(stopped,{name:'AbortError'})
  const count=events.filter(e=>e==='play').length
  await new Promise(r=>setTimeout(r,450));assert.equal(events.filter(e=>e==='play').length,count)
  console.log('PASS stopping during ducking cancels scheduled playback')
  const superseded=exportsObject.playDjSpeech('blob:old')
  const rejected=assert.rejects(superseded,{name:'AbortError'})
  const replacement=exportsObject.playDjSpeech('blob:new')
  await rejected;await replacement;assert.equal(events.filter(e=>e==='play').length,count+1)
  exportsObject.stopDjSpeech()
  console.log('PASS a replacement speech starts once and cancels old startup')
  const serviceExports={}
  let timeoutMs=0
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/main/bundles/radio/tts.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports:serviceExports, AbortController, crypto:require('node:crypto'), console,
    setTimeout:(fn,ms)=>{timeoutMs=ms;return setTimeout(fn,0)},clearTimeout,
  })
  const service=serviceExports.createTtsService({ttsEngine:'volcengine-v3-tts',ttsApiKey:'fixture',ttsSpeed:1},async(_url,init)=>new Promise((resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})))}))
  await assert.rejects(service.synthesize('固定测试'),/语音合成超时（60 秒）/)
  assert.equal(timeoutMs,60000)
  console.log('PASS provider timeout waits sixty seconds and reports a retryable error')
})().catch(e=>{console.error(e);process.exitCode=1})
