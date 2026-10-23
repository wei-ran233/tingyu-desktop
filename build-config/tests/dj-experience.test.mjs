import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const directory = await mkdtemp(join(tmpdir(), 'lx-dj-experience-'))
let checks = 0
const check = async(name, fn) => { await fn(); console.log(`PASS ${name}`); checks++ }
const compile = async(path, replacements = {}) => {
  let code = ts.transpileModule(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const [from, to] of Object.entries(replacements)) code = code.replaceAll(from, to)
  const target = join(directory, `${Math.random().toString(36).slice(2)}.mjs`)
  await writeFile(target, code)
  return import(pathToFileURL(target))
}
try {
  const { renderMarkdown, safeLink } = await compile('src/renderer/bundles/radio/utils/markdown.ts')
  await check('Markdown escapes raw HTML, scripts and attributes', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>\n<script>alert(1)</script>\n**<svg onload=alert(1)>**')
    assert.ok(!html.includes('<img')); assert.ok(!html.includes('<script')); assert.ok(!html.includes('<svg'))
    assert.ok(html.includes('&lt;img'))
  })
  await check('Markdown rejects executable links and keeps code literal', () => {
    assert.equal(safeLink('javascript:alert(1)'), null)
    assert.equal(safeLink('data:text/html,evil'), null)
    assert.equal(safeLink('https://user:pass@example.com'), null)
    assert.ok(!renderMarkdown('[click](javascript:alert(1))').includes('<a'))
    assert.ok(renderMarkdown('```html\n<script>evil</script>\n```').includes('&lt;script&gt;'))
    assert.ok(renderMarkdown('[文档](https://example.com)').includes('rel="noopener noreferrer"'))
    assert.ok(renderMarkdown('**重点**\n- 第一项\n- 第二项').includes('<ul>'))
  })
  const statePath = join(directory, 'history-state.mjs')
  await writeFile(statePath, `export const djHistoryList=[];export const chatHistoryList=[];export const recommendHistoryList=[];export let saves=0;export const saveHistory=()=>saves++;`)
  const state = await import(pathToFileURL(statePath))
  const vueUrl = import.meta.resolve('vue')
  const history = await compile('src/renderer/bundles/radio/composables/useDjHistory.ts', {
    "'@common/utils/vueTools'": JSON.stringify(vueUrl),
    "'@renderer/bundles/radio/store'": JSON.stringify(pathToFileURL(statePath).href),
    "import { recordPlayedSong } from '@renderer/bundles/radio/utils/userProfile';": 'const recordPlayedSong=()=>{};',
  })
  const h = history.useDjHistory()
  await check('history rename survives subsequent replies and stays separate by mode', () => {
    h.saveCurrentSession([{ sender: 'user', text: '第一条消息' }, { sender: 'ai', text: '回复', thinkingText: '思考内容', isThinkingFolded: true }], 'dj')
    const item = state.djHistoryList[0]
    h.renameHistory(item, '我的通勤电台')
    h.saveCurrentSession([{ sender: 'user', text: '第一条消息' }, { sender: 'ai', text: '下一条回复' }], 'dj')
    assert.equal(state.djHistoryList[0].title, '我的通勤电台')
    assert.equal(state.chatHistoryList.length, 0)
    assert.ok(state.djHistoryList[0].updatedAt)
  })
  await check('history searches content and groups by local calendar date', () => {
    const now = new Date(); now.setHours(0, 0, 0, 0)
    state.djHistoryList.push({ id: 'old', type: 'history', mode: 'dj', title: '昨天的音乐', updatedAt: now.getTime() - 3600000, messages: [{ sender: 'user', text: '想听爵士' }] })
    h.historyQuery.value = '爵士'
    assert.equal(h.groupedHistory.value[0].label, '昨天')
    assert.equal(h.groupedHistory.value[0].items[0].id, 'old')
    h.historyQuery.value = '不存在'
    assert.equal(h.groupedHistory.value.length, 0)
  })
  await check('deleting a recommendation does not delete a DJ conversation', () => {
    const recommendation = { id: 'rec-test', type: 'recommend', mode: 'dj', title: '晴天' }
    state.recommendHistoryList.push(recommendation)
    const before = state.djHistoryList.length
    h.deleteHistory(recommendation)
    assert.equal(state.recommendHistoryList.length, 0)
    assert.equal(state.djHistoryList.length, before)
  })
  await check('clearing current category history only clears the selected category', () => {
    state.djHistoryList.push({ id: 'dj-1', type: 'history', mode: 'dj', title: 'DJ 1' })
    state.chatHistoryList.push({ id: 'chat-1', type: 'history', mode: 'chat', title: 'Chat 1' })
    h.historyCategory.value = 'dj'
    h.clearCurrentCategoryHistory()
    assert.equal(state.djHistoryList.length, 0)
    assert.equal(state.chatHistoryList.length, 1)
  })
  await check('clearing another category preserves the active conversation and direct play does not switch sessions', () => {
    h.activeHistoryId.value = 'chat-1'
    h.historyCategory.value = 'recommend'
    state.recommendHistoryList.push({ id: 'rec-2', type: 'recommend', mode: 'dj', title: '夜曲', singer: '歌手' })
    h.clearCurrentCategoryHistory()
    assert.equal(h.activeHistoryId.value, 'chat-1')
    let played
    h.directPlay({ title: '夜曲', singer: '歌手' }, card => { played = card })
    assert.deepEqual(played, { name: '夜曲', singer: '歌手' })
    assert.equal(h.activeHistoryId.value, 'chat-1')
  })
  const { createTtsService } = await compile('src/main/bundles/radio/tts.ts')
  await check('main-process TTS preserves local speech and cancellation', async() => {
    const settings = { ttsEngine: 'web-speech', ttsVoice: '', ttsSpeed: 1 }
    const result = await createTtsService(settings).synthesize('你好 **音乐**')
    // No browser speech object exists in Node; fallback is a URL for the UI.
    assert.ok(typeof result.url === 'string')
    const controller = new AbortController(); controller.abort()
    await assert.rejects(() => createTtsService(settings).synthesize('你好', controller.signal), /abort/i)
  })
  const vaultFile = join(directory, 'vault.json')
  const electronStub = join(directory, 'electron-stub.mjs')
  await writeFile(electronStub, `import {Buffer} from 'node:buffer';export const app={getPath:()=>${JSON.stringify(directory)}};export const safeStorage={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'gnome_libsecret',encryptString:text=>Buffer.from('encrypted:'+text),decryptString:buffer=>buffer.toString().slice(10)};`)
  const vault = await compile('src/main/bundles/radio/vault.ts', {
    "'electron'": JSON.stringify(pathToFileURL(electronStub).href),
    "import { VAULT_PREFIX } from '@common/dj/ipc';": "const VAULT_PREFIX='lx-vault:';",
  })
  await check('vault protects active and per-provider keys without returning plaintext', () => {
    const result = vault.protectSettings({ selectedModel: 'opencode-go', apiKey: 'fixture-active-secret', ttsApiKey: 'fixture-tts-secret', modelList: [{ id: 'openai', apiKey: 'fixture-other-secret' }] })
    assert.equal(result.storage, 'system')
    assert.ok(!JSON.stringify(result.settings).includes('fixture-'))
    assert.equal(vault.hydrateSettings(result.settings).apiKey, 'fixture-active-secret')
    assert.equal(vault.readSecret(result.settings.modelList[0].apiKey), 'fixture-other-secret')
  })
  await check('vault refuses to silently lose an unavailable referenced key', () => {
    assert.throws(() => vault.readSecret('lx-vault:nonexistent'), /密钥存储不可用/)
  })
  console.log(`${checks} experience and service checks passed`)
} finally {
  await rm(directory, { recursive: true, force: true })
}
