/**
 * 本地大模型服务探测与动态发现
 *
 * 支持自动探测：
 * 1. Ollama (默认端口 11434)
 * 2. LM Studio (默认端口 1234)
 * 3. 自定义 OpenAI-compatible 本地服务
 */

export interface LocalModelInfo {
  id: string
  name: string
  source: 'ollama' | 'lmstudio' | 'custom'
  size?: string
}

export interface LocalServerStatus {
  online: boolean
  source: 'ollama' | 'lmstudio' | 'custom'
  url: string
  models: LocalModelInfo[]
  error?: string
}

const requests = new Set<AbortController>()
export const cancelLocalDiscovery = () => {
  for (const controller of requests) controller.abort()
  requests.clear()
}

const formatSize = (bytes?: number): string | undefined => {
  if (!bytes || bytes <= 0) return undefined
  const gb = bytes / (1024 * 1024 * 1024)
  return `${gb.toFixed(1)} GB`
}

/**
 * 探测本地 Ollama 服务
 */
export async function detectOllama(host = 'http://127.0.0.1:11434'): Promise<LocalServerStatus> {
  const cleanHost = host.replace(/\/+$/, '')
  const controller = new AbortController()
  requests.add(controller)
  const timer = setTimeout(() => { controller.abort() }, 3000)
  try {
    const res = await fetch(`${cleanHost}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    })

    if (!res.ok) {
      return {
        online: false,
        source: 'ollama',
        url: cleanHost,
        models: [],
        error: `HTTP ${res.status}`,
      }
    }

    const data = await res.json()
    const models: LocalModelInfo[] = (data.models || []).map((m: any) => ({
      id: m.name || m.model,
      name: m.name || m.model,
      source: 'ollama' as const,
      size: formatSize(m.size),
    }))

    return {
      online: true,
      source: 'ollama',
      url: cleanHost,
      models,
    }
  } catch (err: any) {
    return {
      online: false,
      source: 'ollama',
      url: cleanHost,
      models: [],
      error: err.message || '连接失败',
    }
  } finally { clearTimeout(timer); requests.delete(controller) }
}

/**
 * 探测本地 LM Studio 服务
 */
export async function detectLmStudio(host = 'http://127.0.0.1:1234'): Promise<LocalServerStatus> {
  const cleanHost = host.replace(/\/+$/, '')
  const controller = new AbortController()
  requests.add(controller)
  const timer = setTimeout(() => { controller.abort() }, 3000)
  try {
    const res = await fetch(`${cleanHost}/v1/models`, {
      method: 'GET',
      signal: controller.signal,
    })

    if (!res.ok) {
      return {
        online: false,
        source: 'lmstudio',
        url: cleanHost,
        models: [],
        error: `HTTP ${res.status}`,
      }
    }

    const data = await res.json()
    const models: LocalModelInfo[] = (data.data || []).map((m: any) => ({
      id: m.id,
      name: m.id,
      source: 'lmstudio' as const,
    }))

    return {
      online: true,
      source: 'lmstudio',
      url: cleanHost,
      models,
    }
  } catch (err: any) {
    return {
      online: false,
      source: 'lmstudio',
      url: cleanHost,
      models: [],
      error: err.message || '连接失败',
    }
  } finally { clearTimeout(timer); requests.delete(controller) }
}

/**
 * 一键探测所有本地大模型引擎
 */
export async function detectAllLocalEngines(options?: {
  ollamaHost?: string
  lmStudioHost?: string
}): Promise<LocalServerStatus[]> {
  const ollamaPromise = detectOllama(options?.ollamaHost)
  const lmStudioPromise = detectLmStudio(options?.lmStudioHost)

  const results = await Promise.all([ollamaPromise, lmStudioPromise])
  return results
}
