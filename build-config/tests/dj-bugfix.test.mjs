import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
const dir = await mkdtemp(join(tmpdir(), 'lx-bugfix-'))
const compile = async(path, replacements = {}) => {
  let source = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8')
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to)
  const file = join(dir, `${Math.random()}.mjs`)
  await writeFile(file, ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText)
  return import(pathToFileURL(file))
}
let checks = 0
const check = async(name, fn) => {await fn(); checks++; console.log('PASS '+name)}
const originalFetch = globalThis.fetch
try {
  const {createTtsService} = await compile('src/main/bundles/radio/tts.ts')
  const base = {ttsSpeed:1.2,ttsPitch:1,ttsLang:'zh-CN',ttsVoice:'',ttsApiKey:'fixture-key',ttsRegion:'eastasia'}
  let request
  globalThis.fetch = async(url, init) => {request={url,...init};return new Response(new Uint8Array([73,68,51,1]), {headers:{'Content-Type':'audio/mpeg'}})}
  await check('OpenAI TTS uses its own key and honors configured voice and speed', async() => {
    const result = await createTtsService({...base,ttsEngine:'openai-tts',ttsVoice:'nova'}).synthesize('测试')
    assert.equal(result.audio.length,4)
    assert.deepEqual(JSON.parse(request.body),{model:'tts-1',input:'测试',voice:'nova',speed:1.2,response_format:'mp3'})
    await assert.rejects(()=>createTtsService({...base,ttsEngine:'openai-tts',ttsApiKey:'',apiKey:'fixture-chat-key'}).synthesize('测试'),/专用/)
  })
  await check('custom TTS sends the advertised OpenAI compatible schema', async() => {
    await createTtsService({...base,ttsEngine:'custom-tts',ttsCustomUrl:'http://127.0.0.1/speech'}).synthesize('测试')
    assert.equal(request.url,'http://127.0.0.1/speech')
    assert.equal(JSON.parse(request.body).input,'测试')
    assert.equal(JSON.parse(request.body).model,'tts-1')
    assert.equal(JSON.parse(request.body).text,undefined)
  })
  await check('Azure SSML escapes text and attributes and applies prosody', async() => {
    await createTtsService({...base,ttsEngine:'azure-tts',ttsVoice:"voice'<&"}).synthesize('A & B < C')
    assert.ok(request.body.includes('voice&apos;&lt;&amp;'))
    assert.ok(request.body.includes('A &amp; B &lt; C'))
    assert.ok(request.body.includes("rate='20%'"))
    assert.ok(request.url.includes('eastasia.tts.speech.microsoft.com'))
  })
  await check('provider auth errors and non-audio payloads are visible without silent fallback', async() => {
    globalThis.fetch = async()=>new Response('{}',{status:401,headers:{'Content-Type':'application/json'}})
    await assert.rejects(()=>createTtsService({...base,ttsEngine:'azure-tts'}).synthesize('测试'),/401/)
    globalThis.fetch = async()=>new Response('{}',{headers:{'Content-Type':'application/json'}})
    await assert.rejects(()=>createTtsService({...base,ttsEngine:'custom-tts',ttsCustomUrl:'http://localhost/speech'}).synthesize('测试'),/非音频/)
    await assert.rejects(()=>createTtsService({...base,ttsEngine:'youdao-tts'}).synthesize('字'.repeat(101)),/100/)
  })
  await check('Volcengine v1 decodes top-level base64 audio', async() => {
    globalThis.fetch = async()=>new Response(JSON.stringify({code:3000,data:Buffer.from([73,68,51,1]).toString('base64')}),{headers:{'Content-Type':'application/json'}})
    const result = await createTtsService({...base,ttsAppId:'fixture-app',ttsEngine:'volcengine-tts'}).synthesize('测试')
    assert.deepEqual([...result.audio],[73,68,51,1])
  })
  await check('Volcengine v3 uses API Key auth, selected voice and merges JSON/SSE chunks', async() => {
    globalThis.fetch = async(url,init)=>{request={url,...init};return new Response('data: '+JSON.stringify({code:0,data:Buffer.from([73,68]).toString('base64')})+'\n'+JSON.stringify({code:0,data:Buffer.from([51,1]).toString('base64')})+'\n'+JSON.stringify({code:20000000,data:null}),{headers:{'Content-Type':'text/event-stream'}})}
    const result=await createTtsService({...base,ttsEngine:'volcengine-v3-tts',ttsVoice:'zh_male_m191_uranus_bigtts',ttsResourceId:'seed-tts-2.0'}).synthesize('测试')
    assert.deepEqual([...result.audio],[73,68,51,1])
    assert.equal(request.headers['X-Api-Key'],'fixture-key')
    assert.equal(request.headers['X-Api-Resource-Id'],'seed-tts-2.0')
    assert.equal(JSON.parse(request.body).req_params.speaker,'zh_male_m191_uranus_bigtts')
    assert.equal(JSON.parse(request.body).req_params.audio_params.speech_rate,20)
    assert.equal(request.headers.Authorization,undefined)
  })
  await check('Volcengine v3 rejects permission errors, truncated streams and empty audio', async() => {
    globalThis.fetch=async()=>new Response(JSON.stringify({code:55000000,message:'speaker permission denied'}))
    await assert.rejects(()=>createTtsService({...base,ttsEngine:'volcengine-v3-tts'}).synthesize('测试'),/55000000/)
    globalThis.fetch=async()=>new Response(JSON.stringify({code:0,data:'SUQzAQ=='}))
    await assert.rejects(()=>createTtsService({...base,ttsEngine:'volcengine-v3-tts'}).synthesize('测试'),/不完整/)
    globalThis.fetch=async()=>new Response(JSON.stringify({code:20000000,data:null}))
    await assert.rejects(()=>createTtsService({...base,ttsEngine:'volcengine-v3-tts'}).synthesize('测试'),/没有音频/)
  })
  const voices = await compile('src/common/dj/voices.ts')
  await check('official voice dropdown catalog contains distinct selectable TTS 2.0 voices',()=>{
    assert.equal(voices.VOLCENGINE_VOICES.length,27)
    assert.equal(new Set(voices.VOLCENGINE_VOICES.map(v=>v.id)).size,27)
    assert.ok(voices.VOLCENGINE_VOICES.some(v=>v.name==='Vivi 2.0'&&v.id==='zh_female_vv_uranus_bigtts'))
  })
  const catalog=await compile('src/common/dj/voiceCatalog.ts')
  await check('dynamic voice parsing accepts new official rows and excludes S2S/1.0 tables',()=>{
    const tables=[
      {section:'豆包语音合成模型2.0、S2S-O2.0 音色列表',rows:[['场景','音色名称','voice_type','语种'],['通用','新音色','zh_female_newvoice_uranus_bigtts','中文'],['行合并音色','ICL_uranus_en_male_new_tob','英语']]},
      {section:'豆包语音合成模型2.0 外语音色',rows:[['音色名称','voice_type','语种'],['新印尼音色','id_female_new_uranus_bigtts','印尼语']]},
      {section:'S2S-O版本',rows:[['音色名称','voice_type','语种'],['S2S专用','zh_female_vv_jupiter_bigtts','中文']]},
      {section:'语音合成1.0',rows:[['音色名称','voice_type','语种'],['旧音色','zh_female_old_mars_bigtts','中文']]},
    ]
    assert.deepEqual(catalog.parseVolcengineVoiceTables(tables).map(v=>v.name),['新音色','行合并音色','新印尼音色'])
  })
  await check('voice cache strips invalid and duplicate rows and handles legacy markup safely',()=>{
    assert.equal(catalog.sanitizeVoiceList([{id:'javascript:bad',name:'bad',language:'zh'},{id:'zh_female_new_uranus_bigtts',name:'New',language:'zh'},{id:'zh_female_new_uranus_bigtts',name:'duplicate',language:'zh'}]).length,1)
    const parsed=catalog.parseVolcengineVoiceTables([{section:'',rows:[['音色名称','voice_type','语种'],['Zero width','zh_female_new_uranus_bigtts\u200B','中文']]}])
    assert.equal(parsed[0].id,'zh_female_new_uranus_bigtts')
  })
  globalThis.document = {getElementsByTagName:()=>[{}]}
  const utils = await compile('src/renderer/utils/index.ts', {
    "import { dateFormat } from '@common/utils/common'": 'const dateFormat=()=>""',
    "export * from '@common/utils/renderer'": '', "export * from '@common/utils/nodejs'": '',
    "export * from '@common/utils/common'": '', "export * from '@common/utils/tools'": '',
  })
  await check('page scale honors selection, clamps invalid values and scales layout tokens', () => {
    assert.equal(utils.normalizePageScale(1.25),1.25)
    assert.equal(utils.normalizePageScale(NaN),1)
    assert.equal(utils.normalizePageScale(0),.75)
    assert.equal(utils.normalizePageScale(9),1.5)
    assert.equal(utils.getEffectiveFontSize(16,1.25,false,1920),20)
    const tokens={};globalThis.window={innerWidth:1020,innerHeight:660,screen:{width:1920}}
    globalThis.document={documentElement:{style:{setProperty:(k,v)=>tokens[k]=v},classList:{toggle:()=>{}}}}
    utils.applyAppScale(16,1.25,false)
    assert.equal(tokens['--app-scale'],'1.25')
    assert.equal(tokens['--layout-toolbar-height'],'68px')
  })
  console.log(`${checks} bugfix checks passed`)
} finally {globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true})}
