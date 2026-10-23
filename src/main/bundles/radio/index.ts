import { ipcMain } from 'electron'
import { DJ_IPC } from '@common/dj/ipc'
import { completeModelText, fetchProviderModels, resolveConfiguredModel, modelRequestHeaders } from '@common/dj/models'
import { protectSettings, hydrateSettings } from './vault'
import { getWebContents } from '@main/modules/winMain/main'
import { createTtsService } from './tts'
import { loadOfficialVolcengineVoices } from './voices'

export default (available: () => boolean = () => false) => {
  const pending = new Map<string, AbortController>()
  const trusted = (sender: Electron.WebContents) => { try { return sender === getWebContents() } catch { return false } }
  ipcMain.handle(DJ_IPC.credentials, (event, input) => {
    if (!trusted(event.sender) || !available()) throw new Error('不允许访问 AI 密钥存储')
    return protectSettings(input)
  })
  ipcMain.on(DJ_IPC.cancel, (event, id: string) => { pending.get(`${event.sender.id}:${id}`)?.abort() })
  ipcMain.handle(DJ_IPC.request, async(event, request) => {
    if (!available()) return { error: { name: 'AbortError', message: '电台插件已停用或其依赖不可用' } }
    if (!trusted(event.sender)) return { error: { name: 'Error', message: '不允许访问 AI 服务' } }
    const key = `${event.sender.id}:${request.id}`
    const controller = new AbortController()
    pending.set(key, controller)
    let timedOut = false
    const timeout = setTimeout(() => { timedOut = true; controller.abort() }, request.operation === 'stream' ? 120000 : request.operation === 'tts' ? 65000 : request.operation === 'tts-voices' ? 45000 : 30000)
    const destroyed = () => { controller.abort() }
    event.sender.once('destroyed', destroyed)
    let resolvedSettings: Record<string, any> = {}
    try {
      const { settings: raw, ...args } = request.payload
      const settings = hydrateSettings<any>(raw)
      resolvedSettings = settings
      let value: unknown
      if (request.operation === 'tts-voices') value = await loadOfficialVolcengineVoices(controller.signal)
      else if (request.operation === 'models') value = await fetchProviderModels(settings, controller.signal)
      else if (request.operation === 'complete') value = await completeModelText(settings, args.prompt, controller.signal)
      else if (request.operation === 'resolve') value = { model: (await resolveConfiguredModel(settings, controller.signal)).model }
      else if (request.operation === 'tts') value = await createTtsService(settings, async(url, init) => getWebContents().session.fetch(url as string, init as any) as unknown as Promise<Response>).synthesize(args.text, controller.signal)
      else if (request.operation === 'stream') {
        const { models, model, apiKey } = await resolveConfiguredModel(settings, controller.signal)
        const stream = models.streamSimple(model, args.context, { apiKey, signal: controller.signal, sessionId: args.sessionId, headers: modelRequestHeaders(model, args.sessionId), maxTokens: Math.min(model.maxTokens, 4096) })
        for await (const update of stream) {
          if (controller.signal.aborted || event.sender.isDestroyed()) break
          // UI only needs deltas and tool notifications, not auth or raw SDK errors.
          if (['text_delta', 'thinking_delta'].includes(update.type)) event.sender.send(DJ_IPC.event, request.id, { type: update.type, delta: (update as any).delta })
          else if (update.type === 'thinking_end') event.sender.send(DJ_IPC.event, request.id, { type: update.type })
          else if (update.type === 'toolcall_end') event.sender.send(DJ_IPC.event, request.id, { type: update.type, toolCall: (update as any).toolCall })
        }
        value = await stream.result()
        if (['error', 'aborted'].includes((value as any).stopReason)) throw new Error((value as any).errorMessage ?? '模型请求失败')
      } else throw new Error('不支持的 AI 服务操作')
      if (controller.signal.aborted) throw Object.assign(new Error('请求已取消或超时'), { name: 'AbortError' })
      return { value }
    } catch (error: any) {
      // Remove configured credentials from errors before crossing back to the UI.
      let message = timedOut ? (request.operation === 'tts' ? '语音合成服务超时，请缩短串词或稍后重试' : 'AI 服务请求超时，请稍后重试') : String(error.message ?? 'AI 服务请求失败')
      if (!timedOut && request.operation === 'tts' && /net::ERR_|ECONNRESET|ENOTFOUND|fetch failed/i.test(message)) {
        message = `语音服务网络连接失败，请检查网络与代理设置：${message}`
      }
      for (const value of [resolvedSettings.apiKey, resolvedSettings.ttsApiKey, resolvedSettings.ttsEngine === 'iflytek-tts' ? resolvedSettings.ttsCustomUrl : '']) {
        if (typeof value === 'string' && value.length > 3) message = message.split(value).join('[已隐藏]')
      }
      return { error: { name: controller.signal.aborted && !timedOut ? 'AbortError' : 'Error', message: message.slice(0, 1000) } }
    } finally {
      clearTimeout(timeout)
      event.sender.removeListener('destroyed', destroyed)
      pending.delete(key)
    }
  })
  return () => {
    for (const controller of pending.values()) controller.abort()
    pending.clear()
  }
}
