import { createModels, createProvider, type Api, type Model, type MutableModels } from '@earendil-works/pi-ai'
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy'
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy'
import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai'
import { deepseekProvider } from '@earendil-works/pi-ai/providers/deepseek'
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic'
import { googleProvider } from '@earendil-works/pi-ai/providers/google'
import { groqProvider } from '@earendil-works/pi-ai/providers/groq'
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter'
import { opencodeGoProvider } from '@earendil-works/pi-ai/providers/opencode-go'
import type { DjSettingsState } from '../../renderer/bundles/radio/utils/types'

export type ModelSettings = Pick<DjSettingsState, 'selectedModel' | 'customModelName' | 'activeModel' | 'baseUrl' | 'apiKey' | 'localAiHost' | 'localAiModel'>

const factories = {
  openai: openaiProvider,
  deepseek: deepseekProvider,
  anthropic: anthropicProvider,
  google: googleProvider,
  groq: groqProvider,
  openrouter: openrouterProvider,
  'opencode-go': () => {
    const native = opencodeGoProvider()
    return createProvider<Api>({
      id: native.id,
      name: native.name,
      auth: native.auth,
      models: native.getModels(),
      api: { 'openai-completions': openAICompletionsApi(), 'openai-responses': openAIResponsesApi(), 'anthropic-messages': anthropicMessagesApi(), 'google-generative-ai': googleGenerativeAIApi() },
    })
  },
}

const defaults: Record<string, { url: string, model: string }> = {
  openai: { url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  deepseek: { url: 'https://api.deepseek.com', model: 'deepseek-chat' },
  anthropic: { url: 'https://api.anthropic.com', model: 'claude-sonnet-4-5' },
  google: { url: 'https://generativelanguage.googleapis.com', model: 'gemini-2.5-flash' },
  groq: { url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  openrouter: { url: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  'opencode-go': { url: 'https://opencode.ai/zen/go/v1', model: 'glm-5.2' },
  ollama: { url: 'http://127.0.0.1:11434', model: 'qwen2.5:7b' },
  lmstudio: { url: 'http://127.0.0.1:1234', model: 'default' },
  'glm-4.7-flash': { url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.7-flash' },
  'glm-4-flash': { url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  'qwen-turbo': { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo' },
  'qwen-plus': { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
}

export const isLocalModel = (selected: string): boolean => ['ollama', 'lmstudio', 'local-ollama', 'local-lmstudio'].includes(selected)
export const hasLlmConfiguration = (settings: ModelSettings): boolean => !!settings.apiKey.trim() || isLocalModel(settings.selectedModel)

/** Accept an API root or a copied endpoint, and append /v1 only for local engines. */
export function normalizeBaseUrl(raw: string, local = false): string {
  const url = new URL(raw.trim())
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('API 地址必须使用 http 或 https')
  if (url.username || url.password || url.search || url.hash) throw new Error('API 地址不能包含账号、查询参数或锚点')
  let pathname = url.pathname.replace(/\/+$/, '').replace(/\/(chat\/completions|responses|messages|models)$/, '')
  if (local && !pathname.endsWith('/v1')) pathname += '/v1'
  url.pathname = pathname
  return url.toString().replace(/\/+$/, '')
}

let collection: MutableModels | undefined
export function getModelsCollection(): MutableModels {
  collection ??= createModels()
  return collection
}

export interface ProviderModelOption {
  id: string
  name: string
  api?: Api
  reasoning?: boolean
  contextWindow?: number
  supported: boolean
}

const liveGoModels = new Map<string, Model<Api>>()

const getGoApi = (id: string, catalog?: Model<Api>): Api | undefined => {
  if (/^minimax-m2\.[57]$/.test(id)) return 'anthropic-messages'
  if (catalog) return catalog.api
  if (/^gemini-/.test(id)) return 'google-generative-ai'
  if (/^kimi-k2\.6$|^glm-5\.1$|^qwen3\.[56]-|^cat-jam-free$/.test(id)) return 'openai-completions'
  if (/^qwen3\.7-max$/.test(id)) return 'anthropic-messages'
  return undefined
}

export function getProviderModels(selected: string): ProviderModelOption[] {
  if (!Object.prototype.hasOwnProperty.call(factories, selected)) return []
  const id = selected as keyof typeof factories
  const models = getModelsCollection()
  if (!models.getProvider(id)) models.setProvider(factories[id]())
  const catalog = models.getModels(id)
  const entries = selected === 'opencode-go' ? [...new Map([...catalog, ...liveGoModels.values()].map(model => [model.id, model])).values()] : catalog
  return entries.map(model => ({ id: model.id, name: model.name, api: selected === 'opencode-go' ? getGoApi(model.id, model) : model.api, reasoning: model.reasoning, contextWindow: model.contextWindow, supported: true }))
}

export const modelRequestHeaders = (model: Model<Api>, sessionId: string): Record<string, string> | undefined => model.provider === 'opencode-go'
  ? { 'x-opencode-session': sessionId, 'User-Agent': 'Tingyu (AI Radio)' }
  : undefined

/** Read the actual endpoint, not a static input hint. Never persist or return keys. */
export async function fetchProviderModels(settings: ModelSettings, signal?: AbortSignal): Promise<ProviderModelOption[]> {
  const selected = settings.selectedModel.replace(/^local-/, '')
  const fallback = defaults[selected] ?? defaults.openai
  let baseUrl = normalizeBaseUrl(settings.baseUrl.trim() || fallback.url, isLocalModel(selected))
  if (selected === 'opencode-go' && !baseUrl.endsWith('/v1')) baseUrl += '/v1'
  if (selected === 'anthropic' || selected === 'google') throw new Error('此服务商请使用内置模型目录或手动输入模型名称')
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (settings.apiKey.trim()) headers.Authorization = `Bearer ${settings.apiKey.trim()}`
  if (selected === 'opencode-go') headers['x-opencode-session'] = crypto.randomUUID()
  const response = await fetch(`${baseUrl}/models`, { headers, signal })
  if (!response.ok) throw new Error(`读取模型失败（HTTP ${response.status}），请检查服务地址、Key 和账号权限`)
  const data = await response.json()
  const raw: unknown = Array.isArray(data) ? data : data.data ?? data.models
  if (!Array.isArray(raw)) throw new Error('服务返回的模型列表格式不正确')
  const catalog = getModelsCollection()
  getProviderModels(selected)
  const unique = new Map<string, ProviderModelOption>()
  for (const item of raw) {
    if (!item || typeof item.id !== 'string' || !item.id.trim()) continue
    const id = selected === 'opencode-go' ? item.id.trim().replace(/^opencode-go\//, '') : item.id.trim()
    const known = catalog.getModel(selected, id)
    const api = selected === 'opencode-go' ? getGoApi(id, known) : known?.api ?? 'openai-completions'
    if (selected === 'opencode-go' && api) {
      liveGoModels.set(id, { ...known, id, name: typeof item.name === 'string' ? item.name : known?.name ?? id, api, provider: selected, baseUrl, input: known?.input ?? ['text'], reasoning: known?.reasoning ?? false, contextWindow: known?.contextWindow ?? 32768, maxTokens: known?.maxTokens ?? 4096, cost: known?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } })
    }
    unique.set(id, { id, name: typeof item.name === 'string' ? item.name : known?.name ?? id, api, supported: !!api, reasoning: known?.reasoning, contextWindow: known?.contextWindow })
  }
  if (!unique.size) throw new Error('该服务没有返回可用模型')
  return [...unique.values()]
}

export interface ActiveModelResolution {
  models: MutableModels
  model: Model<Api>
  apiKey?: string
}

/** Provider owns the protocol; model overrides preserve catalog capabilities and limits. */
export function resolveActiveModel(settings: ModelSettings): ActiveModelResolution {
  const models = getModelsCollection()
  const selected = (settings.selectedModel || 'openai-compatible').replace(/^local-/, '')
  const local = isLocalModel(selected)
  const preset = defaults[selected] ?? defaults.openai
  const configuredModelId = [settings.customModelName.trim(), local ? settings.localAiModel?.trim() : settings.activeModel.trim(), preset.model].find(value => !!value)!
  const modelId = selected === 'opencode-go' ? configuredModelId.replace(/^opencode-go\//, '') : configuredModelId
  const rawUrl = settings.baseUrl.trim() || (local && settings.localAiHost && selected !== 'lmstudio' ? settings.localAiHost : '') || preset.url
  const baseUrl = normalizeBaseUrl(rawUrl, local)
  const apiKey = settings.apiKey.trim() || (local ? 'local' : undefined)

  if (Object.prototype.hasOwnProperty.call(factories, selected)) {
    const id = selected as keyof typeof factories
    if (!models.getProvider(id)) models.setProvider(factories[id]())
    const catalogModel = (selected === 'opencode-go' ? liveGoModels.get(modelId) : undefined) ?? models.getModel(id, modelId)
    if (selected === 'opencode-go' && !catalogModel) throw new Error('OpenCode Go 模型不在当前目录中，请从模型提示列表选择，或升级 pi-ai 模型目录')
    const reference = catalogModel ?? models.getModel(id, preset.model) ?? models.getModels(id)[0]
    if (!reference) throw new Error('该服务商没有可用的对话模型')
    // Go's MiniMax M2.7 endpoint now uses Messages (the installed catalog
    // predates that change). The native provider already supports both APIs.
    const api = selected === 'opencode-go' ? getGoApi(modelId, reference)! : reference.api
    let resolvedBaseUrl = baseUrl
    if (selected === 'opencode-go') {
      const root = baseUrl.replace(/\/v1$/, '')
      resolvedBaseUrl = api === 'anthropic-messages' ? root : `${root}/v1`
    }
    const model: Model<Api> = { ...reference, api, id: modelId, name: catalogModel?.name ?? modelId, baseUrl: resolvedBaseUrl }
    return { models, model, apiKey }
  }

  const providerId = local ? selected : 'custom-openai-compat'
  const model: Model<'openai-completions'> = {
    id: modelId,
    name: modelId,
    api: 'openai-completions',
    provider: providerId,
    baseUrl,
    contextWindow: 32768,
    maxTokens: 4096,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  }
  models.setProvider(createProvider({
    id: providerId,
    name: local ? `${selected} 本地引擎` : 'OpenAI 兼容接口',
    auth: {
      apiKey: {
        name: 'API Key',
        resolve: async() => ({ auth: { apiKey: apiKey ?? '' }, source: 'settings' }),
      },
    },
    models: [model],
    api: openAICompletionsApi(),
  }))
  return { models, model, apiKey }
}

/** Models discovered online must remain usable after restarting the app. */
export async function resolveConfiguredModel(settings: ModelSettings, signal?: AbortSignal): Promise<ActiveModelResolution> {
  if (settings.selectedModel === 'opencode-go') {
    const id = (settings.customModelName.trim() || settings.activeModel.trim() || defaults['opencode-go'].model).replace(/^opencode-go\//, '')
    if (!getProviderModels('opencode-go').some(model => model.id === id)) await fetchProviderModels(settings, signal)
  }
  return resolveActiveModel(settings)
}

/** Connection checks and suggestions use the same provider and protocol as chat. */
export async function completeModelText(settings: ModelSettings, prompt: string, signal?: AbortSignal): Promise<string> {
  const { models, model, apiKey } = await resolveConfiguredModel(settings, signal)
  const sessionId = crypto.randomUUID()
  const response = await models.completeSimple(model, {
    messages: [{ role: 'user', content: prompt, timestamp: Date.now() }],
  }, { apiKey, signal, sessionId, headers: modelRequestHeaders(model, sessionId), maxTokens: 256 })
  if (signal?.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' })
  if (response.stopReason === 'error' || response.stopReason === 'aborted') throw new Error(response.errorMessage ?? '模型没有返回有效响应')
  return response.content.filter(block => block.type === 'text').map(block => block.text).join('')
}
