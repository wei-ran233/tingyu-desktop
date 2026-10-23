import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// Compile the application boundary and keep the real pi-ai SDK. The player is
// isolated so tests cannot search the network or change the user's playback.
const temporary = await mkdtemp(join(tmpdir(), 'lx-dj-ai-'))
const source = new URL('../../src/renderer/bundles/radio/utils/ai/', import.meta.url)
for (const file of ['modelsManager', 'tools', 'streamHandler']) {
  const code = ts.transpileModule(await readFile(file === 'modelsManager' ? new URL('../../src/common/dj/models.ts', import.meta.url) : new URL(`${file}.ts`, source), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/from "(@earendil-works\/pi-ai[^\"]*)"/g, (_, specifier) => `from ${JSON.stringify(import.meta.resolve(specifier))}`)
    .replace(/from '(@earendil-works\/pi-ai[^']*)'/g, (_, specifier) => `from ${JSON.stringify(import.meta.resolve(specifier))}`)
    .replace(/from ['"]\.\/(tools|modelsManager|toolExecutor)['"]/g, (_, module) => `from './${module}.mjs'`)
  const streamAdapter = file === 'modelsManager' ? `
export async function streamModelTurn(settings, context, sessionId, signal, onEvent) {
  const {models,model,apiKey}=await resolveConfiguredModel(settings,signal);
  const stream=models.streamSimple(model,context,{apiKey,sessionId,signal,headers:modelRequestHeaders(model,sessionId),maxTokens:Math.min(model.maxTokens,4096)});
  for await(const event of stream) onEvent(event);
  return stream.result();
}` : ''
  await writeFile(join(temporary, `${file}.mjs`), code + streamAdapter)
}
await writeFile(join(temporary, 'toolExecutor.mjs'), `export const calls = []; export async function executeToolAction(name, args) { calls.push({name,args}); return {found:true,name:'晴天'} }`)
const { resolveActiveModel, normalizeBaseUrl, hasLlmConfiguration, completeModelText, getProviderModels, fetchProviderModels } = await import(pathToFileURL(join(temporary, 'modelsManager.mjs')))
const { runPiAiConversation } = await import(pathToFileURL(join(temporary, 'streamHandler.mjs')))
const { calls } = await import(pathToFileURL(join(temporary, 'toolExecutor.mjs')))
let count = 0
const check = async(name, fn) => { await fn(); console.log(`PASS ${name}`); count++ }
const config = (overrides = {}) => ({ selectedModel: 'openai-compatible', customModelName: 'fixture-model', activeModel: '', baseUrl: '', apiKey: 'fixture-key', ...overrides })
const requests = []
let scenario = 'text'
const server = createServer(async(req, res) => {
  if (req.method === 'GET') {
    if (req.headers.authorization !== 'Bearer fixture-key') { res.writeHead(401); res.end('{}'); return }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ data: [{ id: 'glm-5.2' }, { id: 'kimi-k2.6' }, { id: 'gemini-4-argon-contributor' }, { id: 'omen-alpha' }, { id: 'glm-5.2' }, { bad: true }] })); return
  }
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = JSON.parse(raw)
  requests.push({ url: req.url, body, authorization: req.headers.authorization, session: req.headers['x-opencode-session'], apiKey: req.headers['x-api-key'] })
  if (scenario === 'error') { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Fixture unauthorized' } })); return }
  if (scenario === 'slow') { req.on('close', () => res.end()); return }
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  if (req.url.includes(':streamGenerateContent')) {
    res.end(`data: ${JSON.stringify({ candidates: [{ index: 0, content: { role: 'model', parts: [{ text: '连接成功' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } })}\n\n`)
    return
  }
  if (req.url.split('?')[0].endsWith('/messages')) {
    const event = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
    event('message_start', { message: { id: 'fixture', type: 'message', role: 'assistant', content: [], model: body.model, usage: { input_tokens: 1, output_tokens: 0 } } })
    event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
    event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: '连接成功' } })
    event('content_block_stop', { index: 0 })
    event('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } })
    event('message_stop', {}); res.end(); return
  }
  if (req.url.split('?')[0].endsWith('/responses')) {
    const response = { id: 'resp_fixture', object: 'response', status: 'in_progress', model: body.model, output: [] }
    const item = { id: 'msg_fixture', type: 'message', role: 'assistant', content: [], status: 'in_progress' }
    const event = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
    event('response.created', { response })
    event('response.output_item.added', { output_index: 0, item })
    event('response.content_part.added', { item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } })
    event('response.output_text.delta', { item_id: item.id, output_index: 0, content_index: 0, delta: '连接成功' })
    item.content = [{ type: 'output_text', text: '连接成功', annotations: [] }]; item.status = 'completed'
    event('response.output_item.done', { output_index: 0, item })
    event('response.completed', { response: { ...response, status: 'completed', output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } })
    res.end(); return
  }
  const chunk = (delta, finish_reason = null) => res.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
  chunk({ role: 'assistant' })
  if ((scenario === 'tool' || scenario === 'invalid' || scenario === 'loop') && (scenario === 'loop' || !body.messages.some(m => m.role === 'tool'))) {
    chunk({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'search_and_play', arguments: scenario === 'invalid' ? '{}' : '{"keyword":"晴天","immediatePlay":false}' } }] })
    chunk({}, 'tool_calls')
  } else { chunk({ content: '连接成功' }); chunk({}, 'stop') }
  res.end('data: [DONE]\n\n')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`
try {
  await check('normalize copied endpoints and local API roots', () => {
    assert.equal(normalizeBaseUrl(`${baseUrl}/chat/completions/`), baseUrl)
    assert.equal(normalizeBaseUrl(baseUrl, true), baseUrl)
    assert.equal(normalizeBaseUrl('http://localhost:11434', true), 'http://localhost:11434/v1')
    assert.throws(() => normalizeBaseUrl('file:///tmp/key'))
    assert.throws(() => normalizeBaseUrl('https://example.com?key=secret'))
  })
  await check('local models work without a key and use the selected host/model', () => {
    const settings = config({ selectedModel: 'lmstudio', baseUrl, apiKey: '', localAiModel: 'old-model' })
    assert.ok(hasLlmConfiguration(settings))
    assert.equal(resolveActiveModel(settings).model.id, 'fixture-model')
    assert.equal(resolveActiveModel(settings).model.baseUrl, baseUrl)
  })
  await check('native providers retain their wire protocol and endpoint overrides', () => {
    for (const [provider, api] of [['openai', 'openai-responses'], ['anthropic', 'anthropic-messages'], ['google', 'google-generative-ai'], ['deepseek', 'openai-completions'], ['groq', 'openai-completions'], ['openrouter', 'openai-completions']]) {
      const { model } = resolveActiveModel(config({ selectedModel: provider, baseUrl }))
      assert.equal(model.api, api); assert.equal(model.baseUrl, baseUrl)
    }
  })
  await check('OpenCode Go catalog selects model-specific protocols and normalizes prefixed IDs', () => {
    assert.ok(getProviderModels('opencode-go').some(model => model.id === 'glm-5.2'))
    for (const [id, api] of [['glm-5.2', 'openai-completions'], ['kimi-k3', 'openai-completions'], ['minimax-m3', 'anthropic-messages'], ['minimax-m2.7', 'anthropic-messages'], ['gpt-5.6-luna', 'openai-responses']]) {
      const { model } = resolveActiveModel(config({ selectedModel: 'opencode-go', customModelName: `opencode-go/${id}`, baseUrl }))
      assert.equal(model.id, id); assert.equal(model.api, api)
      assert.equal(model.baseUrl, api === 'anthropic-messages' ? baseUrl.replace(/\/v1$/, '') : baseUrl)
    }
    assert.throws(() => resolveActiveModel(config({ selectedModel: 'opencode-go', customModelName: 'unknown-model' })), /模型不在当前目录/)
    assert.equal(resolveActiveModel(config({ selectedModel: 'opencode-go', customModelName: '' })).model.baseUrl, 'https://opencode.ai/zen/go/v1')
  })
  await check('OpenCode Go streams through all three endpoints with a session routing header', async() => {
    for (const [id, endpoint] of [['glm-5.2', '/v1/chat/completions'], ['minimax-m3', '/v1/messages'], ['minimax-m2.7', '/v1/messages'], ['gpt-5.6-luna', '/v1/responses']]) {
      assert.equal(await completeModelText(config({ selectedModel: 'opencode-go', customModelName: id, baseUrl }), 'ping'), '连接成功')
      const request = requests.at(-1)
      assert.equal(request.url.split('?')[0], endpoint); assert.equal(request.body.model, id)
      assert.match(request.session, /^[0-9a-f-]{36}$/)
      assert.ok(request.authorization === 'Bearer fixture-key' || request.apiKey === 'fixture-key')
    }
  })
  await check('live model discovery authenticates, deduplicates, and registers models absent from the bundled catalog', async() => {
    assert.equal(await completeModelText(config({ selectedModel: 'opencode-go', customModelName: 'kimi-k2.6', baseUrl }), 'ping'), '连接成功')
    const list = await fetchProviderModels(config({ selectedModel: 'opencode-go', baseUrl }))
    assert.equal(list.length, 4)
    assert.ok(list.find(model => model.id === 'kimi-k2.6').supported)
    assert.equal(list.find(model => model.id === 'gemini-4-argon-contributor').api, 'google-generative-ai')
    assert.equal(list.find(model => model.id === 'omen-alpha').supported, false)
    assert.equal(resolveActiveModel(config({ selectedModel: 'opencode-go', customModelName: 'kimi-k2.6', baseUrl })).model.api, 'openai-completions')
    await assert.rejects(() => fetchProviderModels(config({ selectedModel: 'opencode-go', baseUrl, apiKey: 'wrong' })), /401/)
  })
  await check('live Google model uses its native Go protocol and model endpoint', async() => {
    assert.equal(await completeModelText(config({ selectedModel: 'opencode-go', customModelName: 'gemini-4-argon-contributor', baseUrl }), 'ping'), '连接成功')
    assert.equal(requests.at(-1).url.split('?')[0], '/v1/models/gemini-4-argon-contributor:streamGenerateContent')
    assert.ok(requests.at(-1).session)
  })
  await check('connection probe sends a real pi-ai streaming request', async() => {
    assert.equal(await completeModelText(config({ baseUrl }), 'ping'), '连接成功')
    assert.equal(requests.at(-1).url, '/v1/chat/completions')
    assert.equal(requests.at(-1).authorization, 'Bearer fixture-key')
  })
  const conversation = (extra = {}) => runPiAiConversation({
    settings: config({ baseUrl }), mode: 'chat', weatherStr: '', weatherType: 'sunny', systemPrompt: 'test',
    messages: [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi' }, { role: 'user', content: '推荐音乐' }],
    callbacks: { onToken() {}, onComplete() {}, onError(error) { throw error } }, ...extra,
  })
  await check('tool executes once and its result is sent back before completion', async() => {
    scenario = 'tool'; calls.length = 0
    let text = ''; let completions = 0
    await conversation({ callbacks: { onToken(token) { text += token }, onComplete() { completions++ }, onError(error) { throw error } } })
    assert.equal(calls.length, 1); assert.equal(text, '连接成功'); assert.equal(completions, 1)
    assert.ok(requests.at(-1).body.messages.some(m => m.role === 'tool' && m.tool_call_id === 'call_1'))
  })
  await check('OpenCode Go tool continuation preserves the same session header', async() => {
    scenario = 'tool'; calls.length = 0
    const first = requests.length
    await conversation({ settings: config({ selectedModel: 'opencode-go', customModelName: 'glm-5.2', baseUrl }) })
    assert.equal(calls.length, 1)
    assert.equal(requests.length - first, 2)
    assert.equal(requests[first].session, requests[first + 1].session)
    assert.ok(requests[first].session)
  })
  await check('generation reports search and response stages and preserves a caller conversation ID', async() => {
    scenario = 'tool'
    const phases = []
    const start = requests.length
    await conversation({ sessionId: 'lx-dj-conversation', callbacks: { onStatus(status) { phases.push(status.phase) }, onToken() {}, onComplete() {}, onError(error) { throw error } }, settings: config({ selectedModel: 'opencode-go', customModelName: 'glm-5.2', baseUrl }) })
    assert.ok(phases.includes('connecting')); assert.ok(phases.includes('searching')); assert.ok(phases.includes('generating'))
    assert.ok(requests.slice(start).every(request => request.session === 'lx-dj-conversation'))
  })
  await check('invalid tool arguments are reported to the model without execution', async() => {
    scenario = 'invalid'; calls.length = 0
    await conversation()
    assert.equal(calls.length, 0)
    assert.match(requests.at(-1).body.messages.find(m => m.role === 'tool').content, /keyword/)
  })
  await check('HTTP authentication failures reach the caller', async() => {
    scenario = 'error'
    await assert.rejects(() => completeModelText(config({ baseUrl }), 'ping'), /401|unauthorized/i)
  })
  await check('aborted conversations do not complete or execute tools', async() => {
    scenario = 'slow'; calls.length = 0
    const controller = new AbortController(); setTimeout(() => controller.abort(), 60)
    await assert.rejects(() => conversation({ signal: controller.signal, callbacks: { onToken() {}, onComplete() { assert.fail('completed after cancellation') }, onError() {} } }), /abort|取消/i)
    assert.equal(calls.length, 0)
  })
  await check('agent loop has a finite budget and reports exhaustion', async() => {
    scenario = 'loop'; calls.length = 0
    await assert.rejects(() => conversation(), /上限/)
    assert.equal(calls.length, 5)
  })
  console.log(`${count} AI integration checks passed`)
} finally {
  server.closeAllConnections(); server.close()
  await rm(temporary, { recursive: true, force: true })
}
