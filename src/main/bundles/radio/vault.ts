import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { VAULT_PREFIX } from '@common/dj/ipc'

const memory = new Map<string, string>()
const filePath = () => path.join(app.getPath('userData'), 'dj-credentials.json')
let encrypted: Record<string, string> | undefined
const load = () => {
  if (!encrypted) {
    try { encrypted = JSON.parse(fs.readFileSync(filePath(), 'utf8')) } catch { encrypted = {} }
  }
  return encrypted!
}
const encryptionAvailable = () => safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
const remember = (name: string, value: string) => {
  const id = `${name}:${randomUUID()}`
  memory.set(id, value)
  if (encryptionAvailable()) load()[id] = safeStorage.encryptString(value).toString('base64')
  return `${VAULT_PREFIX}${id}`
}
export const readSecret = (value: string): string => {
  if (!value?.startsWith(VAULT_PREFIX)) return value ?? ''
  const id = value.slice(VAULT_PREFIX.length)
  if (memory.has(id)) return memory.get(id)!
  const saved = load()[id]
  if (!saved || !encryptionAvailable()) throw new Error('密钥存储不可用，请解锁系统密钥环或重新填写 Key')
  try {
    const secret = safeStorage.decryptString(Buffer.from(saved, 'base64'))
    memory.set(id, secret)
    return secret
  } catch {
    throw new Error('密钥无法解密，请解锁系统密钥环或重新填写此项 Key')
  }
}

export const protectSettings = <T extends Record<string, any>>(input: T): { settings: T, storage: string } => {
  const settings = JSON.parse(JSON.stringify(input))
  const protect = (value: string, id: string) => !value || value.startsWith(VAULT_PREFIX) ? value : remember(id, value)
  settings.modelList = (settings.modelList ?? []).map((model: any) => ({ ...model, apiKey: protect(model.apiKey, `model:${model.id}`) }))
  settings.apiKey = protect(settings.apiKey, `model:${settings.selectedModel}`)
  settings.ttsApiKey = protect(settings.ttsApiKey, 'tts:key')
  if (settings.ttsEngine === 'iflytek-tts') settings.ttsCustomUrl = protect(settings.ttsCustomUrl, 'tts:secret')
  if (encryptionAvailable()) {
    const temporary = `${filePath()}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(load()), { mode: 0o600 })
    fs.renameSync(temporary, filePath())
  }
  return { settings, storage: encryptionAvailable() ? 'system' : 'session' }
}

export const hydrateSettings = <T extends Record<string, any>>(input: T): T => {
  const settings = { ...input }
  for (const key of ['apiKey', 'ttsApiKey', 'ttsCustomUrl']) {
    const value = settings[key]
    if (typeof value === 'string' && value.startsWith(VAULT_PREFIX)) (settings as any)[key] = readSecret(value)
  }
  return settings
}
