import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { PluginStore } from '@main/modules/plugin/installer'
import { digestPluginFiles, pluginSignaturePayload, sha256 } from '@main/modules/plugin/signature'
import type { PluginManifest } from '@common/plugin/types'

export const installerTests = async(test: (name: string, run: () => Promise<void>) => Promise<void>) => {
  const key = generateKeyPairSync('ed25519')
  const archive = async(version: string, signingKey = key) => {
    const files = new Map([['index.html', Buffer.from(`<h1>${version}</h1>`)]])
    const manifest: PluginManifest = {
      id: 'lx.test-install', name: 'Test', version, apiVersion: '1.0.0', main: 'index.html', permissions: [],
      publicKey: signingKey.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), signature: '',
    }
    manifest.signature = sign(null, pluginSignaturePayload(manifest, digestPluginFiles(files)), signingKey.privateKey).toString('base64')
    const zip = new JSZip(); zip.file('manifest.json', JSON.stringify(manifest)); zip.file('index.html', files.get('index.html')!)
    return zip.generateAsync({ type: 'nodebuffer' })
  }
  const withStore = async(run: (store: PluginStore, dir: string) => Promise<void>) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lx-installer-test-'))
    try { const store = new PluginStore(dir); await store.init(); await run(store, dir) } finally { await fs.rm(dir, { recursive: true, force: true }) }
  }
  await test('installer pins updates to the original signing key', async() => withStore(async(store) => {
    await store.installArchive(await archive('1.0.0'))
    await assert.rejects(store.installArchive(await archive('2.0.0', generateKeyPairSync('ed25519'))), /original signing key/)
    assert.equal(store.get('lx.test-install')?.manifest.version, '1.0.0')
  }))
  await test('immutable update survives restart and can roll back to verified old files', async() => withStore(async(store, dir) => {
    const first = await store.installArchive(await archive('1.0.0'))
    await store.installArchive(await archive('2.0.0'))
    assert.ok(store.get('lx.test-install')?.previous)
    assert.match(await fs.readFile(path.join(first.entry.path, 'index.html'), 'utf8'), /1.0.0/)
    const reloaded = new PluginStore(dir); await reloaded.init(); await reloaded.rollback('lx.test-install')
    assert.equal(reloaded.get('lx.test-install')?.manifest.version, '1.0.0')
    const again = new PluginStore(dir); await again.init(); assert.equal(again.get('lx.test-install')?.manifest.version, '1.0.0')
  }))
  await test('registry persistence failure leaves the old version active and removes staged files', async() => withStore(async(store, dir) => {
    await store.installArchive(await archive('1.0.0'))
    const previousFiles = (await fs.readdir(dir)).sort()
    Object.defineProperty(store, 'persist', { value: async() => { throw new Error('disk full') } })
    await assert.rejects(store.installArchive(await archive('2.0.0')), /disk full/)
    assert.equal(store.get('lx.test-install')?.manifest.version, '1.0.0')
    assert.deepEqual((await fs.readdir(dir)).sort(), previousFiles)
  }))
  await test('concurrent updates serialize and keep exactly one rollback version', async() => withStore(async(store, dir) => {
    await store.installArchive(await archive('1.0.0'))
    const [second, third] = await Promise.all([archive('2.0.0'), archive('3.0.0')])
    await Promise.all([store.installArchive(second), store.installArchive(third)])
    assert.equal(store.get('lx.test-install')?.manifest.version, '3.0.0')
    assert.equal(store.get('lx.test-install')?.previous?.manifest.version, '2.0.0')
    const folders = await Promise.all((await fs.readdir(dir)).map(async name => (await fs.stat(path.join(dir, name))).isDirectory()))
    assert.equal(folders.filter(Boolean).length, 2)
  }))
  await test('package bytes are bound to preview and uninstall removes scoped storage', async() => withStore(async(store, dir) => {
    const original = await archive('1.0.0')
    await assert.rejects(store.installArchive(await archive('2.0.0'), { expectedArchiveHash: sha256(original) }), /changed after preview/)
    await store.installArchive(original)
    await fs.mkdir(path.join(dir, 'storage'))
    const storage = path.join(dir, 'storage/lx.test-install.json'); await fs.writeFile(storage, '{}')
    await store.remove('lx.test-install')
    await assert.rejects(fs.stat(storage), { code: 'ENOENT' })
  }))
}
