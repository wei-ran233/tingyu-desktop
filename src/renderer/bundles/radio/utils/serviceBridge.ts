import { ipcRenderer } from 'electron'
import { DJ_IPC } from '@common/dj/ipc'

const activeRequests = new Map<string, () => void>()
export const cancelRadioRequests = () => {
  for (const cancel of activeRequests.values()) cancel()
  activeRequests.clear()
}

export async function djRequest<T>(operation: string, payload: unknown, signal?: AbortSignal, onEvent?: (event: any) => void): Promise<T> {
  if (signal?.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' })
  const id = crypto.randomUUID()
  let cancelled = false
  const abort = () => { cancelled = true; ipcRenderer.send(DJ_IPC.cancel, id) }
  activeRequests.set(id, abort)
  const receive = (_: unknown, requestId: string, event: unknown) => { if (requestId === id && !cancelled) onEvent?.(event) }
  signal?.addEventListener('abort', abort, { once: true })
  if (onEvent) ipcRenderer.on(DJ_IPC.event, receive)
  try {
    const result = await ipcRenderer.invoke(DJ_IPC.request, { id, operation, payload: JSON.parse(JSON.stringify(payload)) })
    if (cancelled || signal?.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' })
    if (result.error) throw Object.assign(new Error(result.error.message), { name: result.error.name })
    return result.value as T
  } finally {
    activeRequests.delete(id)
    signal?.removeEventListener('abort', abort)
    if (onEvent) ipcRenderer.off(DJ_IPC.event, receive)
  }
}

export async function storeDjCredentials<T>(settings: T): Promise<{ settings: T, storage: string }> {
  return ipcRenderer.invoke(DJ_IPC.credentials, JSON.parse(JSON.stringify(settings)))
}
