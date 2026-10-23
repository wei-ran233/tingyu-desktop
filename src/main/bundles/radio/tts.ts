import type { DjSettingsState } from '../../../renderer/bundles/radio/utils/types'

export const createTtsService = (djSettings: DjSettingsState, request: typeof fetch = fetch) => {
  type TtsEngine =
    | 'web-speech'
    | 'youdao-tts'
    | 'openai-tts'
    | 'azure-tts'
    | 'iflytek-tts'
    | 'volcengine-tts'
    | 'volcengine-v3-tts'
    | 'custom-tts'

  const TTS_HTTP_TIMEOUT_MS = 60000
  const MAX_TTS_TEXT_LENGTH = 1200

  interface SynthesizeSpeechOptions {
    signal?: AbortSignal
  }

  const createAbortError = (): Error => {
    const err = new Error('TTS request aborted')
    err.name = 'AbortError'
    return err
  }

  const isAbortError = (err: unknown): boolean => {
    return !!err && typeof err === 'object' && (err as Error).name === 'AbortError'
  }

  const throwIfAborted = (signal?: AbortSignal) => {
    if (signal?.aborted) throw createAbortError()
  }

  const createTimedSignal = (timeoutMs: number, parentSignal?: AbortSignal) => {
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    const handleParentAbort = () => {
      controller.abort()
    }

    if (parentSignal?.aborted) {
      controller.abort()
    } else {
      parentSignal?.addEventListener('abort', handleParentAbort, { once: true })
    }

    return {
      signal: controller.signal,
      cleanup() {
        clearTimeout(timer)
        parentSignal?.removeEventListener('abort', handleParentAbort)
      },
      isTimeout() {
        return timedOut
      },
    }
  }

  const fetchWithTimeout = async(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> => {
    throwIfAborted(signal)
    const timedSignal = createTimedSignal(TTS_HTTP_TIMEOUT_MS, signal)
    try {
      const response = await request(url, {
        ...init,
        signal: timedSignal.signal,
      })
      const body = await response.arrayBuffer()
      return new Response(body, { status: response.status, headers: response.headers })
    } catch (err) {
      if (timedSignal.isTimeout()) throw new Error('语音合成超时（60 秒），请缩短串词或稍后重试')
      if (isAbortError(err)) throw createAbortError()
      throw err
    } finally {
      timedSignal.cleanup()
    }
  }

  const readAudio = async(response: Response): Promise<string> => {
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok) throw new Error(`语音服务 HTTP ${response.status}`)
    if (/json|text|html/i.test(type)) throw new Error('语音服务返回了非音频内容，请检查接口地址和配置')
    const blob = await response.blob()
    if (!blob.size) throw new Error('语音服务返回了空音频')
    return blobToUrl(blob)
  }

  /**
   * 清理文本，去除 Emoji、Markdown 标记与方括号标签
   */
  const cleanTextForSpeech = (text: string): string => {
    return text
      .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
      .replace(/\[.*?\]/g, '')
      .replace(/[#*`_~]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /** 返回 Web Speech 协议地址（由 djAudio 处理） */
  const toSpeechProtocol = (text: string): string => {
    return `speech:${encodeURIComponent(text)}`
  }

  /** 生成有道翻译语音地址 */
  const toYoudaoUrl = (text: string): string => {
    const encodedText = encodeURIComponent(text.slice(0, 100))
    return `https://dict.youdao.com/dictvoice?audio=${encodedText}&le=zh`
  }

  /** 获取 blob URL */
  const audioBlobs = new Map<string, Blob>()
  const blobToUrl = (blob: Blob): string => { const id = `audio:${audioBlobs.size}`; audioBlobs.set(id, blob); return id }

  // ─── 各渠道实现 ──────────────────────────────────────────

  /** 1. OpenAI TTS */
  const synthesizeOpenAI = async(text: string, signal?: AbortSignal): Promise<string | null> => {
    const apiKey = djSettings.ttsApiKey
    if (!apiKey) throw new Error('请填写该语音服务专用的 API Key')

    const response = await fetchWithTimeout(
      'https://api.openai.com/v1/audio/speech',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice: /Neural$/.test(djSettings.ttsVoice || '') ? 'alloy' : (djSettings.ttsVoice || 'alloy'),
          speed: djSettings.ttsSpeed || 1,
          response_format: 'mp3',
        }),
      },
      signal,
    )

    if (!response.ok) throw new Error(`OpenAI TTS Status ${response.status}`)
    return readAudio(response)
  }

  /** 2. Azure 神经语音 REST API */
  const synthesizeAzure = async(text: string, voice: string, signal?: AbortSignal): Promise<string | null> => {
    const apiKey = djSettings.ttsApiKey
    const region = djSettings.ttsRegion || 'eastasia'
    if (!apiKey) throw new Error('请填写该语音服务专用的 API Key')

    const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;').replace(/"/g, '&quot;')
    const lang = escapeXml(djSettings.ttsLang || 'zh-CN')
    const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`

    const ssml = [
      `<speak version='1.0' xml:lang='${lang}'>`,
      `<voice name='${escapeXml(voice || ({ 'zh-CN': 'zh-CN-XiaoxiaoNeural', 'zh-TW': 'zh-TW-HsiaoChenNeural', 'en-US': 'en-US-JennyNeural' }[djSettings.ttsLang] ?? 'zh-CN-XiaoxiaoNeural'))}'>`,
      `<prosody rate='${Math.round(((djSettings.ttsSpeed || 1) - 1) * 100)}%' pitch='${Math.round(((djSettings.ttsPitch || 1) - 1) * 100)}%'>${escapeXml(text)}</prosody>`,
      '</voice>',
      '</speak>',
    ].join('')

    const response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
          'Ocp-Apim-Subscription-Key': apiKey,
          'User-Agent': 'tingyu-desktop',
        },
        body: ssml,
      },
      signal,
    )

    if (!response.ok) throw new Error(`Azure TTS Status ${response.status}`)
    return readAudio(response)
  }

  /** HMAC-SHA256 签名（用于讯飞鉴权） */
  const hmacSha256 = async(key: string, message: string): Promise<ArrayBuffer> => {
    const enc = new TextEncoder()
    const keyData = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return crypto.subtle.sign('HMAC', keyData, enc.encode(message))
  }

  /** 3. 讯飞 WebSocket TTS */
  const synthesizeIflytek = async(text: string, voice: string, signal?: AbortSignal): Promise<string | null> => {
    const appId = djSettings.ttsAppId
    const apiKey = djSettings.ttsApiKey
    const apiSecret = djSettings.ttsCustomUrl // 复用 customUrl 存 ApiSecret
    if (!appId || !apiKey || !apiSecret) throw new Error('讯飞语音需要 AppID、API Key 和 API Secret')
    throwIfAborted(signal)

    const host = 'tts-api.xfyun.cn'
    const date = new Date().toUTCString()
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v2/tts HTTP/1.1`
    const signature = await hmacSha256(apiSecret, signatureOrigin).then(buf =>
      btoa(String.fromCharCode(...new Uint8Array(buf))),
    )
    const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
    const authorization = btoa(authorizationOrigin)

    const url = `wss://${host}/v2/tts?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${host}`
    throwIfAborted(signal)

    return new Promise((resolve, reject) => {
      let ws: WebSocket | null = null
      let timer: ReturnType<typeof setTimeout> | null = null
      let settled = false
      const audioChunks: Uint8Array[] = []
      let handleAbort = () => {}

      const cleanup = () => {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
        signal?.removeEventListener('abort', handleAbort)
      }

      const closeSocket = () => {
        try { ws?.close() } catch { /* ignore */ }
      }

      const rejectOnce = (err: unknown) => {
        if (settled) return
        settled = true
        cleanup()
        closeSocket()
        reject(err instanceof Error ? err : new Error(String(err)))
      }

      const resolveOnce = (audioUrl: string) => {
        if (settled) return
        settled = true
        cleanup()
        closeSocket()
        resolve(audioUrl)
      }

      handleAbort = () => {
        rejectOnce(createAbortError())
      }

      if (signal?.aborted) {
        rejectOnce(createAbortError())
        return
      }
      signal?.addEventListener('abort', handleAbort, { once: true })

      try {
        ws = new WebSocket(url)
      } catch (err) {
        rejectOnce(err)
        return
      }

      const socket = ws

      timer = setTimeout(() => {
        rejectOnce(new Error('Iflytek TTS timeout'))
      }, 15000)

      socket.onopen = () => {
        if (signal?.aborted) {
          rejectOnce(createAbortError())
          return
        }
        socket.send(JSON.stringify({
          common: { app_id: appId },
          business: {
            aue: 'lame',
            sfl: 1,
            auf: 'audio/L16;rate=16000',
            vcn: voice || 'xiaoyan',
            speed: Math.round(djSettings.ttsSpeed * 50),
          },
          data: {
            status: 2,
            text: btoa(unescape(encodeURIComponent(text))),
          },
        }))
      }

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.code !== 0) {
            rejectOnce(new Error(`Iflytek TTS error: ${data.message || data.code}`))
            return
          }
          if (data.data?.audio) {
            const binStr = atob(data.data.audio)
            const bytes = new Uint8Array(binStr.length)
            for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
            audioChunks.push(bytes)
          }
          if (data.data?.status === 2) {
            const merged = new Uint8Array(audioChunks.reduce((sum, c) => sum + c.length, 0))
            let offset = 0
            for (const chunk of audioChunks) {
              merged.set(chunk, offset)
              offset += chunk.length
            }
            const blob = new Blob([merged], { type: 'audio/mpeg' })
            resolveOnce(blobToUrl(blob))
          }
        } catch (err) {
          rejectOnce(err)
        }
      }

      socket.onerror = () => {
        rejectOnce(new Error('Iflytek TTS connection failed'))
      }

      socket.onclose = () => {
        if (!settled) rejectOnce(new Error('Iflytek TTS connection closed'))
      }
    })
  }

  /** 4. 火山引擎 TTS HTTP API */
  const synthesizeVolcengine = async(text: string, voice: string, signal?: AbortSignal): Promise<string | null> => {
    const appId = djSettings.ttsAppId
    const accessToken = djSettings.ttsApiKey
    if (!appId || !accessToken) throw new Error('火山语音需要 AppID 和 Access Token')

    const endpoint = 'https://openspeech.bytedance.com/api/v1/tts'
    const cluster = 'volcano_tts'

    const response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer;${accessToken}`,
        },
        body: JSON.stringify({
          app: { appid: appId, token: 'access_token', cluster },
          user: { uid: 'tingyu' },
          audio: { voice_type: voice || 'BV001_streaming', encoding: 'mp3', speed_ratio: djSettings.ttsSpeed },
          request: { reqid: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, operation: 'query' },
        }),
      },
      signal,
    )

    if (!response.ok) throw new Error(`火山 TTS Status ${response.status}`)
    const data = await response.json()

    if (data.code !== 3000 || typeof data.data !== 'string' || !data.data) {
      throw new Error(`火山 TTS 返回异常: ${data.message || data.code}`)
    }

    const binStr = atob(data.data)
    const bytes = new Uint8Array(binStr.length)
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
    return blobToUrl(new Blob([bytes], { type: 'audio/mpeg' }))
  }

  /** New-console API Key authentication; HTTP chunked JSON / SSE response. */
  const synthesizeVolcengineV3 = async(text: string, voice: string, signal?: AbortSignal): Promise<string> => {
    if (!djSettings.ttsApiKey) throw new Error('请填写火山新版 API Key')
    const response = await fetchWithTimeout('https://openspeech.bytedance.com/api/v3/tts/unidirectional', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': djSettings.ttsApiKey,
        'X-Api-Resource-Id': djSettings.ttsResourceId?.trim() ? djSettings.ttsResourceId.trim() : 'seed-tts-2.0',
        'X-Api-Request-Id': crypto.randomUUID(),
      },
      body: JSON.stringify({
        req_params: {
          text,
          speaker: voice || 'zh_female_vv_uranus_bigtts',
          audio_params: { format: 'mp3', sample_rate: 24000, speech_rate: Math.round(((djSettings.ttsSpeed || 1) - 1) * 100) },
        },
      }),
    }, signal)
    if (!response.ok) throw new Error(`火山语音 HTTP ${response.status}，请检查 API Key 与资源权限`)
    const chunks: Uint8Array[] = []
    let complete = false
    for (const raw of (await response.text()).split(/\r?\n/)) {
      const line = raw.trim().replace(/^data:\s*/, '')
      if (!line || !line.startsWith('{')) continue
      const event = JSON.parse(line)
      if (event.code !== 0 && event.code !== 20000000) throw new Error(`火山语音错误 ${event.code}：${event.message || '请检查资源和音色权限'}`)
      if (event.data) chunks.push(Uint8Array.from(atob(event.data), c => c.charCodeAt(0)))
      if (event.code === 20000000) complete = true
    }
    if (!complete || !chunks.some(chunk => chunk.length)) throw new Error('火山语音返回不完整或没有音频')
    return blobToUrl(new Blob(chunks as BlobPart[], { type: 'audio/mpeg' }))
  }

  /** 5. 自定义 WebAPI */
  const synthesizeCustom = async(text: string, signal?: AbortSignal): Promise<string | null> => {
    if (!djSettings.ttsCustomUrl) throw new Error('请填写自定义语音服务地址')
    const response = await fetchWithTimeout(
      djSettings.ttsCustomUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${djSettings.ttsApiKey}`,
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice: /Neural$/.test(djSettings.ttsVoice || '') ? 'alloy' : (djSettings.ttsVoice || 'alloy'),
          response_format: 'mp3',
          speed: djSettings.ttsSpeed || 1,
        }),
      },
      signal,
    )

    if (!response.ok) throw new Error(`自定义 TTS Status ${response.status}`)
    return readAudio(response)
  }

  // ─── 主入口 ──────────────────────────────────────────────

  /**
   * 将文本转为 TTS 语音 URL 或 speech: 格式
   * 返回的字符串由 playDjSpeech 消费
   */
  const synthesizeSpeech = async(text: string, options: SynthesizeSpeechOptions = {}): Promise<string> => {
    const engine: TtsEngine = djSettings.ttsEngine || 'web-speech'
    const configuredVoice = djSettings.ttsVoice || ''
    const voice = engine !== 'azure-tts' && /Neural$/.test(configuredVoice) ? '' : configuredVoice
    const signal = options.signal
    const cleanText = cleanTextForSpeech(text).slice(0, MAX_TTS_TEXT_LENGTH)
    throwIfAborted(signal)

    if (!cleanText) {
      throw new Error('TTS 转换文本为空')
    }

    try {
      let url: string | null = null

      switch (engine) {
        case 'web-speech':
          throwIfAborted(signal)
          return toSpeechProtocol(cleanText)

        case 'youdao-tts':
          throwIfAborted(signal)
          if (cleanText.length > 100) throw new Error('有道接口只适合 100 字以内短句，长篇播报请选择 Azure 或讯飞语音')
          return readAudio(await fetchWithTimeout(toYoudaoUrl(cleanText), {}, signal))

        case 'openai-tts':
          url = await synthesizeOpenAI(cleanText, signal)
          break

        case 'azure-tts':
          url = await synthesizeAzure(cleanText, voice, signal)
          break

        case 'iflytek-tts':
          url = await synthesizeIflytek(cleanText, voice, signal)
          break

        case 'volcengine-v3-tts':
          url = await synthesizeVolcengineV3(cleanText, voice, signal)
          break

        case 'volcengine-tts':
          url = await synthesizeVolcengine(cleanText, voice, signal)
          break

        case 'custom-tts':
          url = await synthesizeCustom(cleanText, signal)
          break
      }

      if (url) return url
    } catch (err) {
      if (isAbortError(err)) throw createAbortError()
      // Keep failures visible; do not silently switch to a possibly unavailable engine.
      throw new Error(err instanceof Error ? err.message : '语音服务请求失败')
    }

    throwIfAborted(signal)
    throw new Error('语音服务未返回音频，请检查配置')
  }

  return { async synthesize(text: string, signal?: AbortSignal) { const result = await synthesizeSpeech(text, { signal }); const blob = audioBlobs.get(result); return blob ? { audio: new Uint8Array(await blob.arrayBuffer()), mime: blob.type } : { url: result } } }
}
