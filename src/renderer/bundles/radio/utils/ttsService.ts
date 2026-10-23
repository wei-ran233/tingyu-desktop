import type { DjSettingsState } from './types'
import { djSettings } from '@renderer/bundles/radio/store'
import { djRequest } from './serviceBridge'
export type TtsEngine = 'web-speech' | 'youdao-tts' | 'openai-tts' | 'azure-tts' | 'iflytek-tts' | 'volcengine-tts' | 'volcengine-v3-tts' | 'custom-tts'

export const cleanTextForSpeech = (text: string): string => text
  .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
  .replace(/\[.*?\]/g, '').replace(/[#*`_~]/g, '').replace(/\s+/g, ' ').trim()

export const synthesizeSpeech = async(text: string, options: { signal?: AbortSignal, settings?: DjSettingsState } = {}): Promise<string> => {
  const clean = cleanTextForSpeech(text).slice(0, 1200)
  if (!clean) throw new Error('TTS 转换文本为空')
  if (options.signal?.aborted) throw Object.assign(new Error('已取消语音播报'), { name: 'AbortError' })
  const settings = options.settings ?? djSettings
  if (settings.ttsEngine === 'web-speech') {
    if (!('speechSynthesis' in window)) throw new Error('当前环境不支持系统语音，请选择云端语音服务')
    const synth = window.speechSynthesis
    if (!synth.getVoices().length) {
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); synth.removeEventListener('voiceschanged', done); resolve() }
        const timer = setTimeout(done, 1200)
        synth.addEventListener('voiceschanged', done, { once: true })
      })
    }
    if (options.signal?.aborted) throw Object.assign(new Error('已取消语音播报'), { name: 'AbortError' })
    if (!synth.getVoices().some(v => v.lang.replace('_', '-').toLowerCase().startsWith((settings.ttsLang || 'zh-CN').toLowerCase()))) {
      throw new Error('系统没有对应语言的语音音色，Ubuntu 请配置 Azure 或讯飞等云端语音服务')
    }
    return `speech:${encodeURIComponent(clean)}`
  }
  const result = await djRequest<{ url?: string, audio?: Uint8Array, mime?: string }>('tts', { settings, text: clean }, options.signal)
  if (result.audio) return URL.createObjectURL(new Blob([new Uint8Array(result.audio).buffer], { type: result.mime ?? 'audio/mpeg' }))
  if (result.url) return result.url
  throw new Error('语音服务未返回音频')
}
