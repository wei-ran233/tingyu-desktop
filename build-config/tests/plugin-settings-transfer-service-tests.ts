import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { generateKeyPairSync, sign } from 'node:crypto'
import JSZip from 'jszip'
import type { PluginManifest } from '@common/plugin/types'
import { validatePluginManifest } from '@common/plugin/security'
import { PluginService } from '@main/modules/plugin/service'
import { digestPluginFiles, pluginSignaturePayload } from '@main/modules/plugin/signature'

export const pluginSettingsTransferServiceTests = async(test: (name: string, run: () => void | Promise<void>) => Promise<void>) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lx-settings-transfer-'))
  const service = new PluginService(path.join(dir, 'plugins'), true)
  const key = generateKeyPairSync('ed25519')
  const fields: NonNullable<PluginManifest['settings']> = [
    { key: 'title', type: 'string', title: 'Title', default: 'default', maxLength: 100, exportable: true },
    { key: 'count', type: 'number', title: 'Count', default: 2, min: 0, max: 10, exportable: true },
    { key: 'localOnly', type: 'string', title: 'Local only', default: 'local', maxLength: 100 },
  ]
  const id = 'fixture.transfer'
  const install = async(extra: Partial<PluginManifest> = {}) => {
    const raw = { id, name: id, main: 'index.html', version: '1.0.0', apiVersion: '1.10.0', permissions: ['settings.scoped'], settingsVersion: 1, settings: fields, ...extra }
    const manifest = validatePluginManifest(JSON.parse(JSON.stringify(raw)))
    const files = new Map([['index.html', Buffer.from('<h1>Fixture</h1>')]])
    manifest.publicKey = key.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
    manifest.signature = sign(null, pluginSignaturePayload(manifest, digestPluginFiles(files)), key.privateKey).toString('base64')
    const zip = new JSZip(); zip.file('manifest.json', JSON.stringify(manifest)); for (const [name, data] of files) zip.file(name, data)
    const file = path.join(dir, manifest.id + '.lxplugin'); await fs.writeFile(file, await zip.generateAsync({ type: 'nodebuffer' })); await service.install(file)
  }
  try {
    await service.init(); await install()
    await test('transfer exports only explicitly portable parameters and preserves local-only values on import', async() => {
      await service.setSetting(id, 'title', 'saved')
      await service.setSetting(id, 'localOnly', 'private local value')
      const document = await service.exportSettings(id)
      assert.deepEqual(document.values, { title: 'saved', count: 2 })
      assert.equal(document.settingsVersion, 1)
      assert.match(document.schemaFingerprint, /^[a-f0-9]{64}$/)
      assert.ok(!JSON.stringify(document).includes('private local value'))
      await service.setSetting(id, 'title', 'changed')
      const preview = await service.previewSettingsImport(id, document)
      assert.deepEqual(preview.changes.map(change => change.key), ['title'])
      const notifications: unknown[] = []; const off = service.subscribeSettings(change => notifications.push(change))
      try {
        const result = await service.importSettings(id, preview.document, preview)
        assert.deepEqual(result, { title: 'saved', count: 2, localOnly: 'private local value' })
        assert.equal(notifications.length, 1)
        const again = await service.previewSettingsImport(id, document)
        await service.importSettings(id, again.document, again)
        assert.equal(notifications.length, 1, 'no-op import emits no change')
      } finally { off() }
      assert.equal(service.getPublicInfo(id)!.enabled, true)
      const reloaded = new PluginService(path.join(dir, 'plugins'), true); await reloaded.init()
      assert.deepEqual(await reloaded.getSettings(id), await service.getSettings(id))
    })
    await test('invalid and foreign transfer files never change settings bytes or sibling parameters', async() => {
      await install({ id: 'fixture.sibling' }); await service.setSetting('fixture.sibling', 'count', 9)
      const document = await service.exportSettings(id)
      const settingsFile = path.join(dir, 'plugins/settings/' + id + '.json')
      const bytes = await fs.readFile(settingsFile)
      for (const input of [
        { ...document, pluginId: 'fixture.sibling' },
        { ...document, signerFingerprint: '0'.repeat(64) },
        { ...document, settingsVersion: 2 },
        { ...document, schemaFingerprint: 'f'.repeat(64) },
        { ...document, values: { title: 'would overwrite', count: 100 } },
        { ...document, values: { localOnly: 'leaked' } },
      ]) await assert.rejects(service.previewSettingsImport(id, input))
      assert.deepEqual(await fs.readFile(settingsFile), bytes)
      assert.equal((await service.getSettings('fixture.sibling')).count, 9)
    })
    await test('confirmation rejects intervening settings writes and package replacement without clobbering values', async() => {
      const document = await service.exportSettings(id)
      const preview = await service.previewSettingsImport(id, document)
      await service.setSetting(id, 'count', 8)
      await assert.rejects(service.importSettings(id, preview.document, preview), /预览后/)
      assert.equal((await service.getSettings(id)).count, 8)
      const beforeUpgrade = await service.previewSettingsImport(id, document)
      await install({ version: '1.0.1' })
      await assert.rejects(service.importSettings(id, beforeUpgrade.document, beforeUpgrade), /预览后/)
      assert.equal((await service.getSettings(id)).count, 8)
      const afterUpgrade = await service.previewSettingsImport(id, document)
      await service.importSettings(id, afterUpgrade.document, afterUpgrade)
      assert.equal((await service.getSettings(id)).count, 2, 'same schema after patch can import after a fresh preview')
    })
    await test('import rename failure leaves old bytes intact, cleans staging and releases the write lock', async() => {
      const document = await service.exportSettings(id)
      document.values.count = 4
      const preview = await service.previewSettingsImport(id, document)
      const file = path.join(dir, 'plugins/settings/' + id + '.json')
      const original = await fs.readFile(file)
      const rename = fs.rename
      Object.defineProperty(fs, 'rename', {
        configurable: true,
        writable: true,
        value: async(...args: Parameters<typeof fs.rename>) => {
          if (String(args[1]) === file) throw new Error('simulated rename failure')
          return rename(...args)
        },
      })
      try { await assert.rejects(service.importSettings(id, preview.document, preview), /simulated rename failure/) } finally { Object.defineProperty(fs, 'rename', { configurable: true, writable: true, value: rename }) }
      assert.deepEqual(await fs.readFile(file), original)
      assert.ok(!(await fs.readdir(path.dirname(file))).some(name => name.startsWith(id + '.json.') && name.endsWith('.tmp')))
      await service.setSetting(id, 'count', 5)
      assert.equal((await service.getSettings(id)).count, 5)
    })
    await test('disabled plugins and undeclared legacy parameters cannot be transferred', async() => {
      const document = await service.exportSettings(id)
      await service.setEnabled(id, false)
      await assert.rejects(service.exportSettings(id), /停用/)
      await assert.rejects(service.previewSettingsImport(id, document), /停用/)
      await service.setEnabled(id, true)
      await install({ id: 'fixture.legacy-transfer', apiVersion: '1.2.0', settingsVersion: undefined, settings: fields.map(({ exportable, ...field }) => field) })
      await assert.rejects(service.exportSettings('fixture.legacy-transfer'), /未声明/)
    })
    await test('development directories remain usable for settings but cannot transfer unsigned identities', async() => {
      const signedDocument = await service.exportSettings(id)
      const devDir = path.join(dir, 'development-source')
      const developmentPublicKey = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
      const manifest = {
        id,
        name: id,
        main: 'index.html',
        version: '1.0.0',
        apiVersion: '1.10.0',
        permissions: ['settings.scoped'],
        settingsVersion: 1,
        settings: fields,
        signature: 'development-signature-is-not-trusted',
        publicKey: developmentPublicKey,
      }
      await fs.mkdir(devDir, { recursive: true })
      await fs.writeFile(path.join(devDir, 'manifest.json'), JSON.stringify(manifest))
      await fs.writeFile(path.join(devDir, 'index.html'), '<h1>Development fixture</h1>')
      await service.installDevDirectory(devDir)

      const info = service.getPublicInfo(id)!
      assert.equal(info.source, 'development')
      assert.equal(info.publicKeyFingerprint, '')
      await service.setSetting(id, 'title', 'development local setting')
      assert.equal((await service.getSettings(id)).title, 'development local setting')

      const settingsFile = path.join(dir, 'plugins/settings/' + id + '.json')
      const settingsBytes = await fs.readFile(settingsFile)
      const rejection = { message: '参数导入导出仅支持已验证签名的插件包' }
      await assert.rejects(service.exportSettings(id), rejection)
      await assert.rejects(service.previewSettingsImport(id, signedDocument), rejection)
      await assert.rejects(service.importSettings(id, signedDocument, { packageSignature: 'unused', settingsHash: 'unused' }), rejection)
      assert.deepEqual(await fs.readFile(settingsFile), settingsBytes)
    })
  } finally { await service.shutdown(); await fs.rm(dir, { recursive: true, force: true }) }
}
