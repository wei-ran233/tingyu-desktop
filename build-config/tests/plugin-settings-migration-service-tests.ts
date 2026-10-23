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
import { settingsFilePath } from '@main/modules/plugin/settingsSnapshots'

export const pluginSettingsMigrationServiceTests = async(test: (name: string, run: () => void | Promise<void>) => Promise<void>) => {
  const key = generateKeyPairSync('ed25519')
  const legacy = (id: string): Partial<PluginManifest> => ({
    id,
    name: id,
    version: '1.0.0',
    apiVersion: '1.10.0',
    settingsVersion: 1,
    main: 'index.html',
    permissions: ['settings.scoped'],
    settings: [
      { key: 'title', title: 'Title', type: 'string', default: 'initial', maxLength: 100, exportable: true },
      { key: 'level', title: 'Level', type: 'number', default: 2, min: 0, max: 10, exportable: true },
      { key: 'obsolete', title: 'Old', type: 'boolean', default: true },
    ],
  })
  const upgraded = (id: string): Partial<PluginManifest> => ({
    ...legacy(id),
    apiVersion: '1.11.0',
    version: '3.0.0',
    settingsVersion: 3,
    settings: [
      { key: 'label', title: 'Label', type: 'string', default: 'new default', maxLength: 100, exportable: true },
      { key: 'level', title: 'Level', type: 'number', default: 3, min: 0, max: 10, exportable: true },
      { key: 'extra', title: 'Extra', type: 'boolean', default: true },
    ],
    settingsMigrations: [{ fromVersion: 1, toVersion: 2, rename: { title: 'middle' }, remove: ['obsolete'] }, { fromVersion: 2, toVersion: 3, rename: { middle: 'label' } }],
  })
  const withService = async(run: (service: PluginService, dir: string, install: (raw: Partial<PluginManifest>) => Promise<unknown>) => Promise<void>) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lx-settings-migration-'))
    const service = new PluginService(path.join(dir, 'plugins'), true)
    const install = async(raw: Partial<PluginManifest>) => {
      const manifest = validatePluginManifest(raw)
      const files = new Map([['index.html', Buffer.from('<h1>Migration fixture</h1>')]])
      manifest.publicKey = key.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
      manifest.signature = sign(null, pluginSignaturePayload(manifest, digestPluginFiles(files)), key.privateKey).toString('base64')
      const zip = new JSZip(); zip.file('manifest.json', JSON.stringify(manifest)); for (const [name, data] of files) zip.file(name, data)
      const file = path.join(dir, String(manifest.id) + '.lxplugin'); await fs.writeFile(file, await zip.generateAsync({ type: 'nodebuffer' }))
      return service.install(file)
    }
    try { await service.init(); await run(service, dir, install) } finally { await service.shutdown(); await fs.rm(dir, { recursive: true, force: true }) }
  }
  await test('signed upgrade migrates a legacy snapshot, survives restart and rollback restores pre-upgrade values', async() => withService(async(service, dir, install) => {
    const id = 'fixture.migration'; await install(legacy(id))
    await service.setSetting(id, 'title', 'custom'); await service.setSetting(id, 'level', 7); await service.setSetting(id, 'obsolete', false)
    const original = service.store.get(id)!
    const oldFile = settingsFilePath(path.join(dir, 'plugins'), original)
    const oldBytes = await fs.readFile(oldFile)
    const backup = await service.exportSettings(id)
    const notifications: unknown[] = []; const off = service.subscribeSettings(change => notifications.push(change))
    try {
      await install(upgraded(id))
      const current = service.store.get(id)!
      assert.match(current.settingsFile!, /^fixture\.migration\.[a-f0-9]{24}\.json$/)
      assert.deepEqual(await service.getSettings(id), { label: 'custom', level: 7, extra: true })
      assert.deepEqual(await fs.readFile(oldFile), oldBytes)
      assert.equal((await fs.stat(settingsFilePath(path.join(dir, 'plugins'), current))).mode & 0o777, 0o600)
      assert.equal(notifications.length, 1)
      await assert.rejects(service.previewSettingsImport(id, backup), /version|schema/)
      const newBackup = await service.exportSettings(id)
      await service.setSetting(id, 'label', 'changed on v3')
      const preview = await service.previewSettingsImport(id, newBackup)
      await service.importSettings(id, preview.document, preview)
      await service.resetSettings(id)
      assert.deepEqual(await service.getSettings(id), { label: 'new default', level: 3, extra: true })
      assert.deepEqual(await fs.readFile(oldFile), oldBytes)
      const reloaded = new PluginService(path.join(dir, 'plugins'), true); await reloaded.init()
      assert.deepEqual(await reloaded.getSettings(id), { label: 'new default', level: 3, extra: true })
      await reloaded.rollback(id)
      assert.deepEqual(await reloaded.getSettings(id), { title: 'custom', level: 7, obsolete: false })
      assert.equal(reloaded.getPublicInfo(id)!.version, '1.0.0')
      const again = new PluginService(path.join(dir, 'plugins'), true); await again.init()
      assert.deepEqual(await again.getSettings(id), { title: 'custom', level: 7, obsolete: false })
      await assert.rejects(fs.stat(settingsFilePath(path.join(dir, 'plugins'), current)), { code: 'ENOENT' })
    } finally { off() }
  }))
  await test('missing or invalid migration leaves old registry, settings and available package unchanged', async() => withService(async(service, dir, install) => {
    const id = 'fixture.rejected'; await install(legacy(id)); await service.setSetting(id, 'level', 8)
    const file = settingsFilePath(path.join(dir, 'plugins'), service.store.get(id)!)
    const bytes = await fs.readFile(file)
    const registry = await fs.readFile(path.join(dir, 'plugins/registry.json'))
    for (const manifest of [
      { ...upgraded(id), settingsMigrations: [] },
      { ...upgraded(id), settings: upgraded(id).settings!.map(field => field.key === 'level' ? { ...field, max: 5 } : field) },
      { ...upgraded(id), settingsVersion: 1, settingsMigrations: [] },
    ]) {
      await assert.rejects(install(manifest))
      assert.deepEqual(await fs.readFile(file), bytes)
      assert.deepEqual(await fs.readFile(path.join(dir, 'plugins/registry.json')), registry)
      assert.equal(service.getPublicInfo(id)!.available, true)
      assert.equal(service.getPublicInfo(id)!.version, '1.0.0')
    }
  }))
  await test('registry commit failure discards staged package and parameter file and keeps current snapshot', async() => withService(async(service, dir, install) => {
    const id = 'fixture.atomic'; await install(legacy(id)); await service.setSetting(id, 'title', 'keep')
    const listing = (await fs.readdir(path.join(dir, 'plugins'))).sort()
    const settingsListing = (await fs.readdir(path.join(dir, 'plugins/settings'))).sort()
    const persist = Object.getOwnPropertyDescriptor(service.store, 'persist')
    Object.defineProperty(service.store, 'persist', { configurable: true, value: async() => { throw new Error('migration registry disk full') } })
    try { await assert.rejects(install(upgraded(id)), /migration registry disk full/) } finally {
      if (persist) Object.defineProperty(service.store, 'persist', persist)
      else delete (service.store as any).persist
    }
    assert.deepEqual((await fs.readdir(path.join(dir, 'plugins'))).sort(), listing)
    assert.deepEqual((await fs.readdir(path.join(dir, 'plugins/settings'))).sort(), settingsListing)
    assert.equal((await service.getSettings(id)).title, 'keep')
    await install(upgraded(id)); assert.equal((await service.getSettings(id)).label, 'keep')
  }))
  await test('readers wait for a committing migration and cannot observe an uncommitted failed registry pair', async() => withService(async(service, dir, install) => {
    const id = 'fixture.read-barrier'; await install(legacy(id)); await service.setSetting(id, 'title', 'stable old')
    const original = service.store.get(id)!
    const candidate: Partial<PluginManifest> = {
      ...upgraded(id),
      permissions: ['settings.scoped', 'plugin.pages'],
      pages: [{ id: 'new-page', title: 'Only after commit', entry: 'index.html' }],
    }
    const registryPath = path.join(dir, 'plugins/registry.json')
    const rename = fs.rename
    let entered: () => void = () => {}; let release: () => void = () => {}
    const enteredPromise = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    Object.defineProperty(fs, 'rename', {
      configurable: true,
      writable: true,
      value: async(...args: Parameters<typeof fs.rename>) => {
        if (String(args[1]) === registryPath) { entered(); await gate; throw new Error('registry commit refused') }
        return rename(...args)
      },
    })
    try {
      const upgrading = assert.rejects(install(candidate), /registry commit refused/)
      await Promise.race([enteredPromise, upgrading.then(() => { throw new Error('Registry gate was not reached') })])
      assert.equal(service.store.get(id), original)
      assert.equal(service.store.list().find(plugin => plugin.id === id)?.manifest.version, '1.0.0')
      assert.equal(service.list().find(plugin => plugin.id === id)?.version, '1.0.0')
      assert.equal(service.getPublicInfo(id)?.settings?.some(field => field.key === 'title'), true)
      assert.equal(service.getEntry(id).manifest.version, '1.0.0')
      assert.ok(!service.getPages().some(page => page.pluginId === id))
      let readFinished = false
      const read = service.getSettings(id).then(value => { readFinished = true; return value })
      await new Promise(resolve => setTimeout(resolve, 20))
      assert.equal(readFinished, false)
      release(); await upgrading
      assert.deepEqual(await read, { title: 'stable old', level: 2, obsolete: true })
      assert.equal(service.getPublicInfo(id)?.version, '1.0.0')
      assert.ok(!service.getPages().some(page => page.pluginId === id))
      assert.ok(!(await fs.readdir(path.join(dir, 'plugins'))).some(name => name.startsWith('registry.json.') && name.endsWith('.tmp')))
    } finally { release(); Object.defineProperty(fs, 'rename', { configurable: true, writable: true, value: rename }) }
    await install(candidate)
    assert.equal(service.getPublicInfo(id)?.version, '3.0.0')
    assert.ok(service.getPages().some(page => page.pluginId === id && page.id === 'new-page'))
  }))
  await test('versioned snapshots reject direct downgrade, retain only one rollback snapshot and clean all files on uninstall', async() => withService(async(service, dir, install) => {
    const id = 'fixture.cleanup'; await install(legacy(id)); await service.setSetting(id, 'title', 'original')
    await install(upgraded(id)); const first = service.store.get(id)!
    await service.setSetting(id, 'label', 'snapshot3')
    await assert.rejects(install(legacy(id)), /回滚|downgrade|降低/)
    const fourth = { ...upgraded(id), version: '4.0.0', settingsVersion: 4, settingsMigrations: [{ fromVersion: 3, toVersion: 4 }] }
    await install(fourth); const second = service.store.get(id)!
    await service.setSetting(id, 'label', 'snapshot4')
    await install({ ...fourth, version: '4.0.1' })
    await assert.rejects(fs.stat(settingsFilePath(path.join(dir, 'plugins'), first)), { code: 'ENOENT' })
    assert.equal(service.store.get(id)!.previous!.settingsFile, second.settingsFile)
    await service.rollback(id)
    assert.equal((await service.getSettings(id)).label, 'snapshot4')
    await service.uninstall(id)
    const remaining = await fs.readdir(path.join(dir, 'plugins/settings'))
    assert.ok(!remaining.some(name => name.startsWith(id + '.')))
  }))
  await test('development installation failure preserves the old manifest and exact resource files without orphan staging', async() => withService(async(service, dir) => {
    const id = 'fixture.dev-transaction'
    const development = path.join(dir, 'dev-transaction')
    await fs.mkdir(development)
    await fs.writeFile(path.join(development, 'manifest.json'), JSON.stringify(legacy(id)))
    await fs.writeFile(path.join(development, 'index.html'), '<h1>dev v1</h1>')
    const listing = (await fs.readdir(path.join(dir, 'plugins'))).sort()
    const persist = (service.store as any).persist
    try {
      ;(service.store as any).persist = async() => { throw new Error('dev registry refused') }
      await assert.rejects(service.installDevDirectory(development), /dev registry refused/)
    } finally { (service.store as any).persist = persist }
    assert.equal(service.store.get(id), undefined)
    assert.deepEqual((await fs.readdir(path.join(dir, 'plugins'))).sort(), listing)
    await service.installDevDirectory(development)
    const original = service.store.get(id)!
    const oldBytes = await service.readPluginFile(id, 'index.html')
    const committedListing = (await fs.readdir(path.join(dir, 'plugins'))).sort()
    await fs.writeFile(path.join(development, 'manifest.json'), JSON.stringify({ ...legacy(id), version: '2.0.0' }))
    await fs.writeFile(path.join(development, 'index.html'), '<h1>dev v2</h1>')
    try {
      ;(service.store as any).persist = async() => { throw new Error('dev registry refused') }
      await assert.rejects(service.installDevDirectory(development), /dev registry refused/)
    } finally { (service.store as any).persist = persist }
    assert.equal(service.store.get(id), original)
    assert.equal(service.getPublicInfo(id)?.version, '1.0.0')
    assert.deepEqual(await fs.readFile(path.join(original.path, 'index.html')), oldBytes)
    assert.deepEqual(await service.readPluginFile(id, 'index.html'), oldBytes)
    assert.deepEqual((await fs.readdir(path.join(dir, 'plugins'))).sort(), committedListing)
    await service.installDevDirectory(development)
    assert.equal(service.getPublicInfo(id)?.version, '2.0.0')
    assert.notEqual(service.store.get(id)!.path, original.path)
    assert.equal((await service.readPluginFile(id, 'index.html')).toString(), '<h1>dev v2</h1>')
    await assert.rejects(fs.stat(original.path), { code: 'ENOENT' })
  }))
  await test('new install uses current defaults without replaying historical rules and development cannot replace snapshot packages', async() => withService(async(service, dir, install) => {
    const id = 'fixture.fresh'; await install(upgraded(id))
    assert.deepEqual(await service.getSettings(id), { label: 'new default', level: 3, extra: true })
    const development = path.join(dir, 'dev'); await fs.mkdir(development)
    await fs.writeFile(path.join(development, 'index.html'), '<h1>Development</h1>')
    await fs.writeFile(path.join(development, 'manifest.json'), JSON.stringify(legacy(id)))
    await assert.rejects(service.installDevDirectory(development), /开发目录/)
    assert.equal(service.getPublicInfo(id)!.version, '3.0.0')
    assert.equal((await service.getSettings(id)).label, 'new default')
  }))
}
