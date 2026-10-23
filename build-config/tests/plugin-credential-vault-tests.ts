import assert from 'node:assert/strict'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  PluginCredentialVault,
  type PluginCredentialCrypto,
} from '../../src/main/modules/plugin/credentialVault'

const execFileAsync = promisify(execFile)
const PLUGIN_ID = 'fixture.credentials'
const OTHER_PLUGIN_ID = 'fixture.other'
const FINGERPRINT = 'a'.repeat(64)
const OTHER_FINGERPRINT = 'b'.repeat(64)
const MAX_ENVELOPE_BYTES = 512 * 1024

interface TestCrypto extends PluginCredentialCrypto {
  setAvailable: (value: boolean) => void
}

const createTestCrypto = (): TestCrypto => {
  const key = createHash('sha256').update('plugin-credential-vault-test-key').digest()
  let available = true
  return {
    isAvailable: () => available,
    setAvailable: value => { available = value },
    encrypt: value => {
      const nonce = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, nonce)
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
      return Buffer.concat([nonce, cipher.getAuthTag(), encrypted])
    },
    decrypt: value => {
      if (value.length < 28) throw new Error('invalid fixture cipher')
      const nonce = value.subarray(0, 12)
      const tag = value.subarray(12, 28)
      const encrypted = value.subarray(28)
      const decipher = createDecipheriv('aes-256-gcm', key, nonce)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    },
  }
}

const temporaryRoot = async(): Promise<string> => fs.mkdtemp(path.join(os.tmpdir(), 'lx-credential-vault-'))

const namespaceFile = (root: string, pluginId = PLUGIN_ID, fingerprint = FINGERPRINT): string => {
  const namespace = createHash('sha256')
    .update(pluginId)
    .update('\0')
    .update(fingerprint)
    .digest('hex')
  return path.join(root, `${namespace}.json`)
}

const errorCode = (code: string) => (error: unknown) => {
  return error instanceof Error && (error as Error & { code?: string }).code === code
}

const readEnvelope = async(file: string): Promise<{ version: number, values: Record<string, string> }> => {
  return JSON.parse(await fs.readFile(file, 'utf8'))
}

const writeEnvelope = async(
  file: string,
  values: Record<string, string>,
  version = 1,
): Promise<void> => {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify({ version, values }), { mode: 0o600 })
}

export const pluginCredentialVaultTests = async(
  test: (name: string, run: () => void | Promise<void>) => Promise<void>,
) => {
  await test('stores encrypted values across restart and status never decrypts', async() => {
    const root = await temporaryRoot()
    try {
      const crypto = createTestCrypto()
      const vault = new PluginCredentialVault(root, crypto)
      const value = 'synthetic-secret-alpha'
      await vault.set(PLUGIN_ID, FINGERPRINT, 'apiKey', value)
      await vault.set(PLUGIN_ID, FINGERPRINT, 'token', 'synthetic-secret-beta')

      const file = namespaceFile(root)
      const disk = await fs.readFile(file, 'utf8')
      assert.ok(!disk.includes(value))
      assert.ok(!disk.toString().includes('synthetic-secret-beta'))
      if (process.platform !== 'win32') {
        assert.equal(Number((await fs.stat(file)).mode) & 0o777, 0o600)
      }

      const decrypt = crypto.decrypt.bind(crypto)
      let decryptCalls = 0
      crypto.decrypt = value => {
        decryptCalls++
        return decrypt(value)
      }
      assert.deepEqual(
        await vault.status(PLUGIN_ID, FINGERPRINT, ['apiKey', 'token', 'missing']),
        { available: true, configured: { apiKey: true, token: true, missing: false } },
      )
      assert.equal(decryptCalls, 0)

      const restarted = new PluginCredentialVault(root, crypto)
      assert.equal(await restarted.get(PLUGIN_ID, FINGERPRINT, 'apiKey'), value)
      assert.equal(await restarted.get(PLUGIN_ID, FINGERPRINT, 'token'), 'synthetic-secret-beta')
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  await test('rejects namespace and key ciphertext substitution after decrypting', async() => {
    const root = await temporaryRoot()
    try {
      const vault = new PluginCredentialVault(root, createTestCrypto())
      await vault.set(PLUGIN_ID, FINGERPRINT, 'first', 'synthetic-secret-first')
      await vault.set(PLUGIN_ID, FINGERPRINT, 'second', 'synthetic-secret-second')

      const source = namespaceFile(root)
      const sourceBytes = await fs.readFile(source)
      const destination = namespaceFile(root, OTHER_PLUGIN_ID, OTHER_FINGERPRINT)
      await fs.writeFile(destination, sourceBytes, { mode: 0o600 })
      await assert.rejects(
        vault.get(OTHER_PLUGIN_ID, OTHER_FINGERPRINT, 'first'),
        errorCode('credential_integrity'),
      )

      const envelope = await readEnvelope(source)
      envelope.values.second = envelope.values.first
      await writeEnvelope(source, envelope.values)
      await assert.rejects(
        vault.get(PLUGIN_ID, FINGERPRINT, 'second'),
        errorCode('credential_integrity'),
      )
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  await test('fails closed when encryption is unavailable while allowing status and removal', async() => {
    const root = await temporaryRoot()
    try {
      const crypto = createTestCrypto()
      crypto.setAvailable(false)
      const vault = new PluginCredentialVault(root, crypto)
      assert.deepEqual(
        await vault.status(PLUGIN_ID, FINGERPRINT, ['apiKey']),
        { available: false, configured: { apiKey: false } },
      )
      assert.equal(await vault.get(PLUGIN_ID, FINGERPRINT, 'apiKey'), undefined)
      await assert.rejects(
        vault.set(PLUGIN_ID, FINGERPRINT, 'apiKey', 'synthetic-secret-locked'),
        errorCode('credential_unavailable'),
      )

      crypto.setAvailable(true)
      await vault.set(PLUGIN_ID, FINGERPRINT, 'apiKey', 'synthetic-secret-locked')
      crypto.setAvailable(false)
      assert.deepEqual(
        await vault.status(PLUGIN_ID, FINGERPRINT, ['apiKey']),
        { available: false, configured: { apiKey: true } },
      )
      await assert.rejects(
        vault.get(PLUGIN_ID, FINGERPRINT, 'apiKey'),
        errorCode('credential_unavailable'),
      )
      await vault.remove(PLUGIN_ID, FINGERPRINT, 'apiKey')
      assert.equal((await vault.status(PLUGIN_ID, FINGERPRINT, ['apiKey'])).configured.apiKey, false)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  await test('rejects malformed, oversized, FIFO and symlink stores', async() => {
    const root = await temporaryRoot()
    try {
      const vault = new PluginCredentialVault(root, createTestCrypto())
      const file = namespaceFile(root)

      for (const bytes of [
        Buffer.from('{'),
        Buffer.from(JSON.stringify({ version: 2, values: {} })),
        Buffer.from(JSON.stringify({ version: 1, values: {}, extra: true })),
        Buffer.from(JSON.stringify({ version: 1, values: { apiKey: 'not-base64' } })),
        Buffer.alloc(MAX_ENVELOPE_BYTES + 1, 0x20),
      ]) {
        await fs.writeFile(file, bytes, { mode: 0o600 })
        await assert.rejects(vault.status(PLUGIN_ID, FINGERPRINT, ['apiKey']))
        assert.deepEqual(await fs.readFile(file), bytes)
      }

      if (process.platform === 'linux') {
        await fs.unlink(file)
        await execFileAsync('mkfifo', [file])
        await assert.rejects(
          vault.status(PLUGIN_ID, FINGERPRINT, ['apiKey']),
          errorCode('invalid_store'),
        )
        await fs.unlink(file)

        const target = path.join(root, 'foreign.json')
        const targetBytes = Buffer.from(JSON.stringify({ version: 1, values: {} }))
        await fs.writeFile(target, targetBytes, { mode: 0o600 })
        await fs.symlink(target, file)
        await assert.rejects(
          vault.status(PLUGIN_ID, FINGERPRINT, ['apiKey']),
          errorCode('invalid_store'),
        )
        assert.deepEqual(await fs.readFile(target), targetBytes)
        assert.ok((await fs.lstat(file)).isSymbolicLink())
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  await test('rename failure preserves old bytes, removes staging and releases the identity lock', async() => {
    const root = await temporaryRoot()
    const originalRename = fs.rename
    try {
      const vault = new PluginCredentialVault(root, createTestCrypto())
      await vault.set(PLUGIN_ID, FINGERPRINT, 'first', 'synthetic-secret-first')
      const file = namespaceFile(root)
      const before = await fs.readFile(file)

      fs.rename = async() => {
        throw Object.assign(new Error('synthetic rename failure with secret'), { code: 'EIO' })
      }
      await assert.rejects(
        vault.set(PLUGIN_ID, FINGERPRINT, 'second', 'synthetic-secret-second'),
        (error: unknown) => {
          return error instanceof Error &&
            (error as Error & { code?: string }).code === 'credential_io' &&
            !error.message.includes('synthetic') &&
            !error.message.includes('secret')
        },
      )
      fs.rename = originalRename

      assert.deepEqual(await fs.readFile(file), before)
      assert.deepEqual(await fs.readdir(root), [path.basename(file)])
      assert.equal(await vault.get(PLUGIN_ID, FINGERPRINT, 'first'), 'synthetic-secret-first')
      assert.equal(await vault.get(PLUGIN_ID, FINGERPRINT, 'second'), undefined)
      await vault.set(PLUGIN_ID, FINGERPRINT, 'second', 'synthetic-secret-second')
    } finally {
      fs.rename = originalRename
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  await test('remove deletes the final key and clear works without decrypting', async() => {
    const root = await temporaryRoot()
    try {
      const crypto = createTestCrypto()
      const vault = new PluginCredentialVault(root, crypto)
      const file = namespaceFile(root)
      await vault.set(PLUGIN_ID, FINGERPRINT, 'first', 'synthetic-secret-first')
      await vault.set(PLUGIN_ID, FINGERPRINT, 'second', 'synthetic-secret-second')

      await vault.remove(PLUGIN_ID, FINGERPRINT, 'first')
      assert.deepEqual(
        await vault.status(PLUGIN_ID, FINGERPRINT, ['first', 'second']),
        { available: true, configured: { first: false, second: true } },
      )
      await vault.remove(PLUGIN_ID, FINGERPRINT, 'second')
      await assert.rejects(fs.stat(file), errorCode('ENOENT'))

      await vault.set(PLUGIN_ID, FINGERPRINT, 'first', 'synthetic-secret-first')
      await fs.writeFile(file, '{', { mode: 0o600 })
      crypto.setAvailable(false)
      let decryptCalls = 0
      crypto.decrypt = () => {
        decryptCalls++
        throw new Error('decrypt must not run during clear')
      }
      await vault.clear(PLUGIN_ID, FINGERPRINT)
      assert.equal(decryptCalls, 0)
      await assert.rejects(fs.stat(file), errorCode('ENOENT'))
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  await test('serializes concurrent saves for one identity without dropping updates', async() => {
    const root = await temporaryRoot()
    try {
      const keys = Array.from({ length: 16 }, (_, index) => `key${index}`)
      const vault = new PluginCredentialVault(root, createTestCrypto())
      await Promise.all(keys.map(async(key, index) => {
        return vault.set(PLUGIN_ID, FINGERPRINT, key, `synthetic-secret-${index}`)
      }))

      const status = await vault.status(PLUGIN_ID, FINGERPRINT, keys)
      assert.equal(status.available, true)
      assert.equal(Object.values(status.configured).filter(Boolean).length, 16)
      for (let index = 0; index < keys.length; index++) {
        assert.equal(await vault.get(PLUGIN_ID, FINGERPRINT, keys[index]), `synthetic-secret-${index}`)
      }
      await assert.rejects(
        vault.set(PLUGIN_ID, FINGERPRINT, 'overflow', 'synthetic-secret-overflow'),
        errorCode('too_many_keys'),
      )
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  await test('validates identities, keys, values and status key limits', async() => {
    const root = await temporaryRoot()
    try {
      const vault = new PluginCredentialVault(root, createTestCrypto())
      await vault.set('0a', FINGERPRINT, 'apiKey', 'synthetic-secret-canonical-id')
      assert.equal(await vault.get('0a', FINGERPRINT, 'apiKey'), 'synthetic-secret-canonical-id')
      await assert.rejects(
        vault.set('Uppercase', FINGERPRINT, 'apiKey', 'synthetic-secret'),
        errorCode('invalid_identity'),
      )
      await assert.rejects(
        vault.set(PLUGIN_ID, 'A'.repeat(64), 'apiKey', 'synthetic-secret'),
        errorCode('invalid_identity'),
      )
      await assert.rejects(
        vault.set(PLUGIN_ID, FINGERPRINT, '__proto__', 'synthetic-secret'),
        errorCode('invalid_key'),
      )
      await assert.rejects(
        vault.set(PLUGIN_ID, FINGERPRINT, 'apiKey', ''),
        errorCode('invalid_value'),
      )
      await assert.rejects(
        vault.set(PLUGIN_ID, FINGERPRINT, 'apiKey', 'x'.repeat(4097)),
        errorCode('invalid_value'),
      )
      await assert.rejects(
        vault.status(
          PLUGIN_ID,
          FINGERPRINT,
          Array.from({ length: 17 }, (_, index) => `key${index}`),
        ),
        errorCode('too_many_keys'),
      )
      await assert.rejects(
        vault.status(PLUGIN_ID, FINGERPRINT, ['apiKey', 'apiKey']),
        errorCode('invalid_key'),
      )
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
}
