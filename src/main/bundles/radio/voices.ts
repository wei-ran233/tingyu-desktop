import { BrowserWindow, session } from 'electron'
import { VOLCENGINE_VOICE_SOURCE, type DjVoice } from '@common/dj/voices'
import { parseVolcengineVoiceTables, type VoiceTable } from '@common/dj/voiceCatalog'
import { getProxy } from '@main/utils'

/** Public documentation only; this reader never receives TTS credentials. */
export const loadOfficialVolcengineVoices = async(signal: AbortSignal): Promise<{ voices: DjVoice[], updatedAt: string, source: string }> => {
  const proxy = getProxy()
  const readerSession = session.fromPartition(proxy?.host ? 'persist:dj-public-voice-catalog-proxy' : 'persist:dj-public-voice-catalog')
  if (proxy?.host) await readerSession.setProxy({ mode: 'fixed_servers', proxyRules: `http://${proxy.host}:${proxy.port}` })
  readerSession.setPermissionRequestHandler((_contents, _permission, grant) => { grant(false) })
  const reader = new BrowserWindow({
    show: false,
    webPreferences: { session: readerSession, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  })
  reader.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  reader.webContents.on('will-navigate', (event, url) => {
    if (!['docs.volcengine.com', 'www.volcengine.com'].includes(new URL(url).hostname)) event.preventDefault()
  })
  reader.webContents.debugger.attach('1.3')
  const close = () => { if (!reader.isDestroyed()) reader.destroy() }
  const timer = setTimeout(close, 40000)
  signal.addEventListener('abort', close, { once: true })
  try {
    if (signal.aborted) throw new Error('音色刷新已取消')
    let loadError = ''
    void reader.loadURL(VOLCENGINE_VOICE_SOURCE).catch((error: Error) => { loadError = error.message })
    for (let attempt = 0; attempt < 140; attempt++) {
      if (signal.aborted || reader.isDestroyed()) throw new Error('读取官方音色列表超时或已取消')
      const snapshot = await reader.webContents.debugger.sendCommand('Runtime.evaluate', {
        returnByValue: true, expression: `(() => {
        let section = ''
        const tables = []
        for (const element of document.querySelectorAll('h1,h2,h3,h4,h5,h6,table')) {
          if (element.tagName !== 'TABLE') { section = element.textContent || ''; continue }
          tables.push({ section, rows: [...element.querySelectorAll('tr')].map(row => [...row.querySelectorAll('th,td')].map(cell => cell.textContent.trim())) })
        }
        return tables
      })()`,
      })
      const tables: VoiceTable[] = snapshot.result?.value ?? []
      const voices = parseVolcengineVoiceTables(tables)
      if (voices.length) return { voices, updatedAt: new Date().toISOString(), source: VOLCENGINE_VOICE_SOURCE }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new Error(loadError || '官网音色表格暂不可用，请稍后刷新')
  } catch (error) {
    if (signal.aborted) throw Object.assign(new Error('音色刷新已取消'), { name: 'AbortError' })
    throw new Error(`官方音色列表读取失败：${reader.isDestroyed() ? '请求超时' : (error as Error).message}`)
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', close)
    close()
  }
}
