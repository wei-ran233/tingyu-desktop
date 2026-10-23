import { createHash, randomBytes } from 'node:crypto'
import { constants as fsConstants, promises as fs } from 'node:fs'
import path from 'node:path'
import { TextDecoder } from 'node:util'
import { isSafePluginId } from '../../../common/plugin/security'

const MAX_CREDENTIAL_KEYS = 16
const MAX_VALUE_CODE_UNITS = 4096
const MAX_VALUE_BYTES = 16 * 1024
const MAX_PAYLOAD_BYTES = 32 * 1024
const MAX_ENVELOPE_BYTES = 512 * 1024
const MAX_FILE_ATTEMPTS = 5
const FINGERPRINT_RE = /^[a-f0-9]{64}$/
const KEY_RE = /^[a-z][a-zA-Z0-9._-]{0,63}$/
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const utf8Decoder = new TextDecoder('utf-8', { fatal: true })

export interface PluginCredentialCrypto {
  isAvailable: () => boolean
  encrypt: (value: string) => Buffer
  decrypt: (value: Buffer) => string
}

export interface PluginCredentialStatus {
  available: boolean
  configured: Record<string, boolean>
}

interface CredentialEnvelope {
  version: 1
  values: Record<string, string>
}

interface EncryptedPayload {
  version: 1
  pluginId: string
  fingerprint: string
  key: string
  value: string
}

class CredentialVaultError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'CredentialVaultError'
    this.code = code
  }
}

const invalidIdentity = (): never => {
  throw new CredentialVaultError('invalid_identity', 'Invalid plugin credential identity')
}

const invalidKey = (): never => {
  throw new CredentialVaultError('invalid_key', 'Invalid plugin credential key')
}

const invalidStore = (): never => {
  throw new CredentialVaultError('invalid_store', 'Plugin credential store is invalid')
}

const ioFailure = (): never => {
  throw new CredentialVaultError('credential_io', 'Plugin credential storage failed')
}

const adapterFailure = (message: string): never => {
  throw new CredentialVaultError('credential_adapter', message)
}

const unavailable = (): never => {
  throw new CredentialVaultError('credential_unavailable', 'Plugin credential encryption is unavailable')
}

const integrityFailure = (): never => {
  throw new CredentialVaultError('credential_integrity', 'Plugin credential failed an integrity check')
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

const isFingerprint = (value: unknown): value is string => typeof value === 'string' && FINGERPRINT_RE.test(value)
const isCredentialKey = (value: unknown): value is string => {
  return typeof value === 'string' && KEY_RE.test(value) && !RESERVED_KEYS.has(value)
}

const assertIdentity = (pluginId: unknown, fingerprint: unknown): void => {
  if (!isSafePluginId(pluginId) || !isFingerprint(fingerprint)) invalidIdentity()
}

const assertKey = (key: unknown): void => {
  if (!isCredentialKey(key)) invalidKey()
}

const assertValue = (value: unknown): void => {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_VALUE_CODE_UNITS ||
    Buffer.byteLength(value, 'utf8') > MAX_VALUE_BYTES) {
    throw new CredentialVaultError('invalid_value', 'Invalid plugin credential value')
  }
}

const validateStatusKeys = (keys: unknown): string[] => {
  if (!Array.isArray(keys) || keys.length > MAX_CREDENTIAL_KEYS) {
    throw new CredentialVaultError('too_many_keys', 'Plugin credential key limit exceeded')
  }
  const result: string[] = []
  const seen = new Set<string>()
  for (const key of keys) {
    assertKey(key)
    if (seen.has(key)) throw new CredentialVaultError('invalid_key', 'Duplicate plugin credential key')
    seen.add(key)
    result.push(key)
  }
  return result
}

const canonicalBase64 = (value: unknown): Buffer | undefined => {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return undefined
  }
  const decoded = Buffer.from(value, 'base64')
  return decoded.length > 0 && decoded.toString('base64') === value ? decoded : undefined
}

const decodeJson = (buffer: Buffer): unknown => {
  try {
    return JSON.parse(utf8Decoder.decode(buffer))
  } catch {
    return invalidStore()
  }
}

const parseEnvelope = (buffer: Buffer): Map<string, Buffer> => {
  const input = decodeJson(buffer)
  if (!isPlainRecord(input) || Object.keys(input).length !== 2 ||
    input.version !== 1 || !isPlainRecord(input.values)) {
    return invalidStore()
  }
  const entries = Object.entries(input.values)
  if (entries.length > MAX_CREDENTIAL_KEYS) return invalidStore()
  const values = new Map<string, Buffer>()
  for (const [key, encoded] of entries) {
    if (!isCredentialKey(key) || values.has(key)) return invalidStore()
    const encrypted = canonicalBase64(encoded)
    if (encrypted === undefined) return invalidStore()
    values.set(key, encrypted)
  }
  return values
}

const parsePayload = (plaintext: unknown): Record<string, unknown> => {
  if (typeof plaintext !== 'string' || Buffer.byteLength(plaintext, 'utf8') > MAX_PAYLOAD_BYTES) {
    return integrityFailure()
  }
  let payload: unknown
  try {
    payload = JSON.parse(plaintext)
  } catch {
    return integrityFailure()
  }
  if (!isPlainRecord(payload) || Object.keys(payload).length !== 5) return integrityFailure()
  return payload
}

const assertPayload = (
  payload: Record<string, unknown>,
  pluginId: string,
  fingerprint: string,
  key: string,
): string => {
  if (payload.version !== 1 ||
    payload.pluginId !== pluginId ||
    payload.fingerprint !== fingerprint ||
    payload.key !== key ||
    typeof payload.value !== 'string') {
    return integrityFailure()
  }
  try {
    assertValue(payload.value)
  } catch {
    return integrityFailure()
  }
  return payload.value
}

export class PluginCredentialVault {
  private readonly root: string
  private readonly crypto: PluginCredentialCrypto
  private readonly locks = new Map<string, Promise<void>>()

  constructor(root: string, crypto: PluginCredentialCrypto) {
    if (typeof root !== 'string' || root.length === 0) {
      throw new CredentialVaultError('invalid_root', 'Invalid plugin credential root')
    }
    if (crypto == null || typeof crypto.isAvailable !== 'function' ||
      typeof crypto.encrypt !== 'function' || typeof crypto.decrypt !== 'function') {
      throw new CredentialVaultError('invalid_adapter', 'Invalid plugin credential adapter')
    }
    this.root = root
    this.crypto = crypto
  }

  async status(pluginId: string, fingerprint: string, keys: string[]): Promise<PluginCredentialStatus> {
    assertIdentity(pluginId, fingerprint)
    const requestedKeys = validateStatusKeys(keys)
    const file = this.namespaceFile(pluginId, fingerprint)
    return this.exclusive(file, async() => {
      const available = this.isAvailable()
      const values = await this.readEnvelope(file)
      const configured: Record<string, boolean> = {}
      for (const key of requestedKeys) configured[key] = values?.has(key) === true
      return { available, configured }
    })
  }

  async get(pluginId: string, fingerprint: string, key: string): Promise<string | undefined> {
    assertIdentity(pluginId, fingerprint)
    assertKey(key)
    const file = this.namespaceFile(pluginId, fingerprint)
    return this.exclusive(file, async() => {
      const values = await this.readEnvelope(file)
      const encrypted = values?.get(key)
      if (encrypted === undefined) return undefined
      if (!this.isAvailable()) return unavailable()
      return this.decryptValue(encrypted, pluginId, fingerprint, key)
    })
  }

  async set(pluginId: string, fingerprint: string, key: string, value: string): Promise<void> {
    assertIdentity(pluginId, fingerprint)
    assertKey(key)
    assertValue(value)
    const file = this.namespaceFile(pluginId, fingerprint)
    await this.exclusive(file, async() => {
      if (!this.isAvailable()) return unavailable()
      const values = await this.readEnvelope(file) ?? new Map<string, Buffer>()
      if (!values.has(key) && values.size >= MAX_CREDENTIAL_KEYS) {
        throw new CredentialVaultError('too_many_keys', 'Plugin credential key limit exceeded')
      }
      values.set(key, this.encryptValue(pluginId, fingerprint, key, value))
      await this.writeEnvelope(file, values)
    })
  }

  async remove(pluginId: string, fingerprint: string, key: string): Promise<void> {
    assertIdentity(pluginId, fingerprint)
    assertKey(key)
    const file = this.namespaceFile(pluginId, fingerprint)
    await this.exclusive(file, async() => {
      const values = await this.readEnvelope(file)
      if (values === undefined || !values.delete(key)) return
      if (values.size === 0) await this.removeFile(file)
      else await this.writeEnvelope(file, values)
    })
  }

  async clear(pluginId: string, fingerprint: string): Promise<void> {
    assertIdentity(pluginId, fingerprint)
    const file = this.namespaceFile(pluginId, fingerprint)
    await this.exclusive(file, async() => this.removeFile(file))
  }

  private namespaceFile(pluginId: string, fingerprint: string): string {
    const namespace = createHash('sha256')
      .update(pluginId)
      .update('\0')
      .update(fingerprint)
      .digest('hex')
    return path.join(this.root, `${namespace}.json`)
  }

  private async exclusive<T>(file: string, run: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(file) ?? Promise.resolve()
    const result = previous.then(run, run)
    const tail = result.then(() => undefined, () => undefined)
    this.locks.set(file, tail)
    try {
      return await result
    } finally {
      if (this.locks.get(file) === tail) this.locks.delete(file)
    }
  }

  private isAvailable(): boolean {
    try {
      const available = this.crypto.isAvailable()
      if (typeof available !== 'boolean') return adapterFailure('Plugin credential encryption is unavailable')
      return available
    } catch (error) {
      if (error instanceof CredentialVaultError) throw error
      return adapterFailure('Plugin credential encryption is unavailable')
    }
  }

  private encryptValue(pluginId: string, fingerprint: string, key: string, value: string): Buffer {
    const payload: EncryptedPayload = { version: 1, pluginId, fingerprint, key, value }
    const plaintext = JSON.stringify(payload)
    if (Buffer.byteLength(plaintext, 'utf8') > MAX_PAYLOAD_BYTES) {
      throw new CredentialVaultError('invalid_value', 'Plugin credential value is too large')
    }
    try {
      const encrypted = this.crypto.encrypt(plaintext)
      if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) {
        return adapterFailure('Plugin credential encryption failed')
      }
      return Buffer.from(encrypted)
    } catch (error) {
      if (error instanceof CredentialVaultError) throw error
      return adapterFailure('Plugin credential encryption failed')
    }
  }

  private decryptValue(encrypted: Buffer, pluginId: string, fingerprint: string, key: string): string {
    let plaintext: string
    try {
      plaintext = this.crypto.decrypt(encrypted)
    } catch {
      return integrityFailure()
    }
    return assertPayload(parsePayload(plaintext), pluginId, fingerprint, key)
  }

  private async readEnvelope(file: string): Promise<Map<string, Buffer> | undefined> {
    let handle: Awaited<ReturnType<typeof fs.open>>
    try {
      handle = await fs.open(
        file,
        fsConstants.O_RDONLY | fsConstants.O_NONBLOCK | (fsConstants.O_NOFOLLOW ?? 0),
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      return invalidStore()
    }

    try {
      const stat = await handle.stat()
      if (!stat.isFile()) return invalidStore()
      if (stat.size > MAX_ENVELOPE_BYTES) {
        throw new CredentialVaultError('credential_too_large', 'Plugin credential store exceeds the size limit')
      }
      const buffer = Buffer.alloc(MAX_ENVELOPE_BYTES + 1)
      let total = 0
      while (total < buffer.length) {
        const { bytesRead } = await handle.read(buffer, total, buffer.length - total, null)
        if (bytesRead === 0) break
        total += bytesRead
      }
      if (total > MAX_ENVELOPE_BYTES) {
        throw new CredentialVaultError('credential_too_large', 'Plugin credential store exceeds the size limit')
      }
      return parseEnvelope(buffer.subarray(0, total))
    } catch (error) {
      if (error instanceof CredentialVaultError) throw error
      return ioFailure()
    } finally {
      try {
        await handle.close()
      } catch {}
    }
  }

  private async writeEnvelope(file: string, values: Map<string, Buffer>): Promise<void> {
    if (values.size === 0) {
      await this.removeFile(file)
      return
    }
    if (values.size > MAX_CREDENTIAL_KEYS) {
      throw new CredentialVaultError('too_many_keys', 'Plugin credential key limit exceeded')
    }
    const serializedValues: Record<string, string> = {}
    for (const key of [...values.keys()].sort()) {
      if (!isCredentialKey(key)) return invalidStore()
      const encrypted = values.get(key)
      if (encrypted === undefined || encrypted.length === 0) return invalidStore()
      serializedValues[key] = encrypted.toString('base64')
    }
    const envelope: CredentialEnvelope = { version: 1, values: serializedValues }
    const data = Buffer.from(JSON.stringify(envelope), 'utf8')
    if (data.length > MAX_ENVELOPE_BYTES) {
      throw new CredentialVaultError('credential_too_large', 'Plugin credential store exceeds the size limit')
    }
    try {
      await fs.mkdir(this.root, { recursive: true, mode: 0o700 })
    } catch {
      return ioFailure()
    }

    for (let attempt = 0; attempt < MAX_FILE_ATTEMPTS; attempt++) {
      let temporary: string | undefined
      let created = false
      try {
        temporary = path.join(this.root, `.${path.basename(file)}.${randomBytes(12).toString('hex')}.tmp`)
        const handle = await fs.open(
          temporary,
          fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL |
            (fsConstants.O_NOFOLLOW ?? 0),
          0o600,
        )
        created = true
        try {
          await handle.writeFile(data)
          await handle.sync()
        } finally {
          await handle.close()
        }
        await fs.rename(temporary, file)
        temporary = undefined
        return
      } catch (error) {
        if (!created && (error as NodeJS.ErrnoException).code === 'EEXIST') continue
        if (temporary !== undefined) {
          try {
            await fs.unlink(temporary)
          } catch {}
        }
        return ioFailure()
      }
    }
    return ioFailure()
  }

  private async removeFile(file: string): Promise<void> {
    try {
      await fs.unlink(file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return ioFailure()
    }
  }
}
