import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createCipheriv, createDecipheriv, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import JSZip from 'jszip'
import type { PluginManifest } from '@common/plugin/types'
import { validatePluginManifest } from '@common/plugin/security'
import { PluginService } from '@main/modules/plugin/service'
import { PluginCredentialVault } from '@main/modules/plugin/credentialVault'
import { digestPluginFiles, pluginSignaturePayload } from '@main/modules/plugin/signature'

export const pluginCredentialServiceTests = async(test: (name: string, run: () => void | Promise<void>) => Promise<void>) => {
  const signingKey = generateKeyPairSync('ed25519')
  const cipherKey = randomBytes(32)
  const crypto = {
    isAvailable: () => true,
    encrypt: (value: string) => {
      const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', cipherKey, iv)
      const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
      return Buffer.concat([iv, cipher.getAuthTag(), bytes])
    },
    decrypt: (value: Buffer) => {
      const cipher = createDecipheriv('aes-256-gcm', cipherKey, value.subarray(0, 12))
      cipher.setAuthTag(value.subarray(12, 28))
      return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString('utf8')
    },
  }
  const manifest = (id: string): Partial<PluginManifest> => ({
    id,
    name: id,
    version: '1.0.0',
    apiVersion: '1.12.0',
    main: 'index.html',
    permissions: ['settings.scoped', 'credentials.scoped'],
    settingsVersion: 1,
    credentials: [{ key: 'token', title: 'Service token', maxLength: 100 }],
    settings: [{ key: 'label', title: 'Label', type: 'string', default: 'initial', exportable: true }],
    runtime: { entry: 'runtime.html' },
  })
  const withService = async(run: (service: PluginService, dir: string, vault: PluginCredentialVault, install: (raw: Partial<PluginManifest>) => Promise<void>, activationValues: Array<string | undefined>) => Promise<void>) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lx-credential-service-'))
    const vault = new PluginCredentialVault(path.join(dir, 'plugins/credentials'), crypto)
    const service = new PluginService(path.join(dir, 'plugins'), true, vault)
    const activationValues: Array<string | undefined> = []
    const install = async(raw: Partial<PluginManifest>) => {
      const normalized = validatePluginManifest(JSON.parse(JSON.stringify(raw)))
      const files = new Map([['index.html', Buffer.from('<h1>Credential fixture</h1>')], ['runtime.html', Buffer.from('<h1>Runtime</h1>')]])
      normalized.publicKey = signingKey.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
      normalized.signature = sign(null, pluginSignaturePayload(normalized, digestPluginFiles(files)), signingKey.privateKey).toString('base64')
      const zip = new JSZip(); zip.file('manifest.json', JSON.stringify(normalized)); for (const [name, data] of files) zip.file(name, data)
      const file = path.join(dir, normalized.id + '.lxplugin'); await fs.writeFile(file, await zip.generateAsync({ type: 'nodebuffer' }))
      await service.install(file)
    }
    try {
      await service.init()
      await service.configureLifecycle({
        start: async plugin => {
          if (plugin.credentials?.some(field => field.key === 'token')) activationValues.push(await service.readCredential(plugin.id, 'token', service.store.get(plugin.id)!.manifest.signature))
          return { invoke: async() => null, dispose: async() => {}, destroy: () => {} }
        },
      })
      await run(service, dir, vault, install, activationValues)
    } finally { await service.shutdown(); await fs.rm(dir, { recursive: true, force: true }) }
  }
  const signature = (service: PluginService, id: string) => service.store.get(id)!.manifest.signature
  const fingerprint = (service: PluginService, id: string) => service.getPublicInfo(id)!.publicKeyFingerprint

  await test('credential values stay outside catalog, settings, exports and migrations while activation reads explicit own credentials', async() => withService(async(service, dir, _vault, install, activations) => {
    const id = 'fixture.credential-owner'; await install(manifest(id))
    assert.deepEqual(activations, [undefined])
    const secret = 'fictional-owner-token-123'
    const status = await service.setCredential(id, 'token', secret, fingerprint(service, id))
    assert.deepEqual(status, { available: true, configured: { token: true } })
    assert.equal(activations[activations.length - 1], secret)
    assert.equal(await service.readCredential(id, 'token', signature(service, id)), secret)
    for (const value of [service.list(), await service.getSettings(id), await service.exportSettings(id), status]) assert.ok(!JSON.stringify(value).includes(secret))
    await service.resetSettings(id)
    assert.equal(await service.readCredential(id, 'token', signature(service, id)), secret)
    await install({ ...manifest(id), version: '2.0.0', settingsVersion: 2, settingsMigrations: [{ fromVersion: 1, toVersion: 2 }] })
    assert.equal(await service.readCredential(id, 'token', signature(service, id)), secret)
    await service.rollback(id)
    assert.equal(await service.readCredential(id, 'token', signature(service, id)), secret)
    const files = await fs.readdir(path.join(dir, 'plugins/credentials'))
    assert.equal(files.length, 1)
    const bytes = await fs.readFile(path.join(dir, 'plugins/credentials', files[0]))
    assert.ok(!bytes.includes(Buffer.from(secret)))
  }))
  await test('declared keys, verified signer and runtime state gate access; disabled packages remain manageable', async() => withService(async(service, _dir, _vault, install) => {
    const id = 'fixture.credential-auth'; await install(manifest(id))
    const fp = fingerprint(service, id)
    await assert.rejects(service.setCredential(id, 'token', 'private', '0'.repeat(64)), /签名者/)
    await assert.rejects(service.setCredential(id, 'missing', 'private', fp), /声明/)
    await assert.rejects(service.setCredential(id, 'token', '', fp), /为空/)
    await assert.rejects(service.setCredential(id, 'token', 'a'.repeat(101), fp), /长度/)
    await service.setCredential(id, 'token', 'private', fp)
    await assert.rejects(service.readCredential(id, 'token', 'stale-signature'), /运行实例/)
    await assert.rejects(service.readCredential(id, 'missing', signature(service, id)), /声明/)
    await service.setEnabled(id, false)
    await assert.rejects(service.readCredential(id, 'token', signature(service, id)), /运行实例/)
    await service.setCredential(id, 'token', 'changed while disabled', fp)
    assert.deepEqual((await service.credentialStatus(id)).configured, { token: true })
    await service.setEnabled(id, true)
    assert.equal(await service.readCredential(id, 'token', signature(service, id)), 'changed while disabled')
    await install({ ...manifest('fixture.no-credentials'), credentials: undefined, permissions: ['settings.scoped'] })
    await assert.rejects(service.credentialStatus('fixture.no-credentials'), /凭据存储/)
  }))
  await test('sibling namespaces are isolated and uninstall removes only the owning encrypted namespace', async() => withService(async(service, dir, _vault, install) => {
    const a = 'fixture.credential-a'; const b = 'fixture.credential-b'; await install(manifest(a)); await install(manifest(b))
    await service.setCredential(a, 'token', 'a-secret', fingerprint(service, a))
    assert.equal(await service.readCredential(b, 'token', signature(service, b)), undefined)
    await service.setCredential(b, 'token', 'b-secret', fingerprint(service, b))
    await service.uninstall(a)
    assert.equal(await service.readCredential(b, 'token', signature(service, b)), 'b-secret')
    assert.equal((await fs.readdir(path.join(dir, 'plugins/credentials'))).length, 1)
    await service.removeCredential(b, 'token', fingerprint(service, b))
    assert.deepEqual((await service.credentialStatus(b)).configured, { token: false })
    assert.equal((await fs.readdir(path.join(dir, 'plugins/credentials'))).length, 0)
  }))
  await test('failed credential cleanup leaves the signed package selectable and retryable before uninstall', async() => withService(async(service, dir, vault, install) => {
    const id = 'fixture.credential-uninstall'; await install(manifest(id))
    await service.setCredential(id, 'token', 'retry-secret', fingerprint(service, id))
    const original = service.store.get(id)!
    const clear = vault.clear.bind(vault)
    try {
      vault.clear = async() => { throw new Error('simulated credential cleanup failure') }
      await assert.rejects(service.uninstall(id), /cleanup failure/)
    } finally { vault.clear = clear }
    assert.equal(service.store.get(id), original)
    assert.equal(service.getPublicInfo(id)?.available, true)
    assert.equal(await service.readCredential(id, 'token', signature(service, id)), 'retry-secret')
    await service.uninstall(id)
    assert.equal(service.getPublicInfo(id), undefined)
    assert.equal((await fs.readdir(path.join(dir, 'plugins/credentials'))).length, 0)
  }))
  await test('a later package commit failure reports cleared credentials and keeps uninstall retryable', async() => withService(async(service, dir, _vault, install) => {
    const id = 'fixture.credential-remove-failure'; await install(manifest(id))
    await service.setCredential(id, 'token', 'explicitly-removed', fingerprint(service, id))
    const persist = (service.store as any).persist
    try {
      ;(service.store as any).persist = async() => { throw new Error('simulated package commit failure') }
      await assert.rejects(service.uninstall(id), /凭据已清理.*卸载失败/)
    } finally { (service.store as any).persist = persist }
    assert.equal(service.getPublicInfo(id)?.version, '1.0.0')
    assert.equal((await service.credentialStatus(id)).configured.token, false)
    assert.equal((await fs.readdir(path.join(dir, 'plugins/credentials'))).length, 0)
    await service.uninstall(id)
    assert.equal(service.getPublicInfo(id), undefined)
  }))
  await test('package directory cleanup failure keeps a persisted uninstall identity and a fresh service can finish retry', async() => withService(async(service, dir, vault, install) => {
    const id = 'fixture.credential-directory-failure'; await install(manifest(id))
    await service.setCredential(id, 'token', 'explicitly-destroyed', fingerprint(service, id))
    const original = service.store.get(id)!
    const registryFile = path.join(dir, 'plugins/registry.json')
    const registryBytes = await fs.readFile(registryFile)
    const remove = fs.rm
    Object.defineProperty(fs, 'rm', {
      configurable: true,
      writable: true,
      value: async(...args: Parameters<typeof fs.rm>) => {
        if (String(args[0]) === original.path) throw Object.assign(new Error('simulated package EACCES'), { code: 'EACCES' })
        return remove(...args)
      },
    })
    try { await assert.rejects(service.uninstall(id), /凭据已清理.*卸载失败/) } finally { Object.defineProperty(fs, 'rm', { configurable: true, writable: true, value: remove }) }
    assert.equal(service.store.get(id), original)
    assert.deepEqual(await fs.readFile(registryFile), registryBytes)
    assert.equal((await service.credentialStatus(id)).configured.token, false)
    const retry = new PluginService(path.join(dir, 'plugins'), true, vault)
    try {
      await retry.init()
      assert.equal(retry.getPublicInfo(id)?.version, '1.0.0')
      await retry.uninstall(id)
      assert.equal(retry.getPublicInfo(id), undefined)
      await assert.rejects(fs.stat(original.path), { code: 'ENOENT' })
    } finally { await retry.shutdown() }
  }))
  await test('credential reads in flight reject after runtime revocation even if it reactivates with the same package', async() => withService(async(service, _dir, vault, install) => {
    const id = 'fixture.credential-race'; await install(manifest(id)); await service.setCredential(id, 'token', 'old-secret', fingerprint(service, id))
    const original = vault.get.bind(vault)
    let release: () => void = () => {}; let entered: () => void = () => {}
    const gate = new Promise<void>(resolve => { release = resolve }); const started = new Promise<void>(resolve => { entered = resolve })
    vault.get = async(...args) => { const value = await original(...args); entered(); await gate; return value }
    try {
      const reading = assert.rejects(service.readCredential(id, 'token', signature(service, id)), /变化|运行实例/)
      await started
      const stopping = service.setEnabled(id, false)
      release(); await reading; await stopping
    } finally { release(); vault.get = original }
    await service.setEnabled(id, true)
    assert.equal(await service.readCredential(id, 'token', signature(service, id)), 'old-secret')
  }))
  await test('a tightened credential declaration fails activation until the host supplies a valid replacement', async() => withService(async(service, _dir, _vault, install) => {
    const id = 'fixture.credential-constraint'; await install(manifest(id))
    await service.setCredential(id, 'token', 'previous-long-value', fingerprint(service, id))
    await install({ ...manifest(id), version: '2.0.0', credentials: [{ key: 'token', title: 'Token', maxLength: 4 }] })
    assert.equal(service.getPublicInfo(id)?.lifecycleState, 'failed')
    assert.deepEqual((await service.credentialStatus(id)).configured, { token: true })
    await service.setCredential(id, 'token', 'new', fingerprint(service, id))
    assert.equal(service.getPublicInfo(id)?.lifecycleState, 'active')
    assert.equal(await service.readCredential(id, 'token', signature(service, id)), 'new')
  }))
  await test('host clearing reclaims removed credential declarations without requiring decryption', async() => withService(async(service, dir, _vault, install) => {
    const id = 'fixture.credential-retired'; await install(manifest(id))
    await service.setCredential(id, 'token', 'retired-secret', fingerprint(service, id))
    await install({ ...manifest(id), version: '2.0.0', credentials: [] })
    assert.deepEqual((await service.credentialStatus(id)).configured, {})
    await assert.rejects(service.readCredential(id, 'token', signature(service, id)), /声明/)
    assert.equal((await fs.readdir(path.join(dir, 'plugins/credentials'))).length, 1)
    await assert.rejects(service.clearCredentials(id, '0'.repeat(64)), /签名者/)
    await service.clearCredentials(id, fingerprint(service, id))
    assert.equal((await fs.readdir(path.join(dir, 'plugins/credentials'))).length, 0)
    await service.rollback(id)
    assert.equal(await service.readCredential(id, 'token', signature(service, id)), undefined)
  }))
  await test('unsigned development declarations cannot use the signed credential namespace', async() => withService(async(service, dir) => {
    const id = 'fixture.credential-dev'; const development = path.join(dir, 'dev')
    await fs.mkdir(development); await fs.writeFile(path.join(development, 'index.html'), 'dev'); await fs.writeFile(path.join(development, 'runtime.html'), 'runtime')
    await fs.writeFile(path.join(development, 'manifest.json'), JSON.stringify(manifest(id)))
    await service.installDevDirectory(development)
    await assert.rejects(service.credentialStatus(id), /凭据存储/)
    await assert.rejects(service.setCredential(id, 'token', 'private', ''), /凭据存储/)
  }))
}
