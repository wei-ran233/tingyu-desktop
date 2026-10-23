import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateKeyPairSync, sign } from 'node:crypto'
import JSZip from 'jszip'
import type { PluginManifest, PluginPublicInfo } from '@common/plugin/types'
import { comparePluginVersions, resolvePluginDependencies } from '@common/plugin/dependencies'
import { validatePluginManifest } from '@common/plugin/security'
import { PluginService } from '@main/modules/plugin/service'
import { digestPluginFiles, pluginSignaturePayload } from '@main/modules/plugin/signature'

export const pluginExtensibilityTests = async(test: (name: string, run: () => void | Promise<void>) => Promise<void>) => {
  const info = (id: string, dependencies: string[] = []): PluginPublicInfo => ({ id, name: id, version: '1.0.0', apiVersion: '1.2.0', enabled: true, compatible: true, source: 'installed', permissions: [], providers: [], pages: [], themes: [], publicKeyFingerprint: '', official: false, canRollback: false, dependencies: dependencies.map(id => ({ id })) })
  await test('plugin dependency graph is stable, topological, transitive and cycle safe', () => {
    const plugins = [info('example.a', ['example.b']), info('example.c', ['example.a', 'example.b']), info('example.b'), info('example.unrelated')]
    assert.deepEqual(resolvePluginDependencies(plugins).filter(p => p.available).map(p => p.id), ['example.b', 'example.a', 'example.c', 'example.unrelated'])
    assert.deepEqual(resolvePluginDependencies([...plugins].reverse()), resolvePluginDependencies(plugins))
    const blocked = resolvePluginDependencies(plugins.filter(p => p.id !== 'example.b'))
    assert.equal(blocked.find(p => p.id === 'example.a')!.available, false)
    assert.equal(blocked.find(p => p.id === 'example.c')!.available, false)
    assert.equal(blocked.find(p => p.id === 'example.unrelated')!.available, true)
    const cycle = resolvePluginDependencies([info('example.a', ['example.b']), info('example.b', ['example.a']), info('example.c', ['example.a'])])
    assert.ok(cycle.every(p => !p.available && (p.blockedReason!).includes('循环')))
    assert.equal(comparePluginVersions('1.0.0-beta.10', '1.0.0-beta.2'), 1)
    assert.equal(comparePluginVersions('1.0.0-beta', '1.0.0'), -1)
    assert.equal(comparePluginVersions('1.0.0+build', '1.0.0'), 0)
  })
  const manifest = (id: string, changes: Partial<PluginManifest> = {}): PluginManifest => ({ id, name: id, version: '1.0.0', apiVersion: '1.2.0', main: 'index.html', permissions: ['plugin.pages'], pages: [{ id: 'main', title: id }], signature: '', publicKey: '', ...changes })
  await test('signed dependency and setting schemas reject self/copies, invalid bounds and unsafe fields', () => {
    for (const dependencies of [[{ id: 'example.a' }], [{ id: 'example.b' }, { id: 'example.b' }], [{ id: '../escape' }], [{ id: 'example.b', minVersion: '2.0.0', maxVersionExclusive: '1.0.0' }]]) assert.throws(() => validatePluginManifest(manifest('example.a', { dependencies })))
    assert.throws(() => validatePluginManifest(manifest('example.a', { apiVersion: '1.0.0', dependencies: [{ id: 'example.b' }] })))
    assert.throws(() => validatePluginManifest(manifest('example.a', { settings: [{ key: 'x', title: 'x', type: 'boolean', default: true }] })))
    for (const field of [{ key: '__proto__', title: 'x', type: 'boolean', default: true }, { key: 'x', title: 'x', type: 'number', min: 1, default: 0 }, { key: 'x', title: 'x', type: 'select', options: [{ value: 'a', label: 'a' }], default: 'b' }]) assert.throws(() => validatePluginManifest(manifest('example.a', { permissions: ['settings.scoped'], settings: [field as any] })))
  })
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lx-extension-contract-'))
  const key = generateKeyPairSync('ed25519')
  const service = new PluginService(path.join(dir, 'plugins'), true)
  const install = async(value: PluginManifest) => {
    value = validatePluginManifest(value)
    const files = new Map([['index.html', Buffer.from('<h1>fixture</h1>')]])
    value.publicKey = key.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
    value.signature = sign(null, pluginSignaturePayload(value, digestPluginFiles(files)), key.privateKey).toString('base64')
    const zip = new JSZip(); zip.file('manifest.json', JSON.stringify(value)); zip.file('index.html', files.get('index.html')!)
    const file = path.join(dir, `${value.id}.lxplugin`); await fs.writeFile(file, await zip.generateAsync({ type: 'nodebuffer' }))
    await service.install(file)
  }
  try {
    await service.init()
    await test('installed enhancement remains blocked until B exists; disable/recovery preserves A intent and resources', async() => {
      await install(manifest('example.a', { dependencies: [{ id: 'example.b', minVersion: '1.0.0', maxVersionExclusive: '2.0.0' }] }))
      assert.equal(service.getPublicInfo('example.a')!.available, false)
      assert.throws(() => service.getEntry('example.a'), /缺少依赖/)
      await install(manifest('example.b'))
      assert.deepEqual(service.getPages().map(p => p.pluginId), ['example.b', 'example.a'])
      await service.setEnabled('example.b', false)
      assert.equal(service.getPublicInfo('example.a')!.enabled, true)
      assert.equal(service.getPublicInfo('example.a')!.available, false)
      await assert.rejects(service.readPluginFile('example.a', 'index.html'), /依赖不可用/)
      await service.setEnabled('example.b', true)
      assert.equal(service.getPublicInfo('example.a')!.available, true)
    })
    await test('dependency updates and rollback re-evaluate supported version boundaries', async() => {
      await install(manifest('example.b', { version: '2.0.0' }))
      assert.equal(service.getPublicInfo('example.a')!.available, false)
      assert.match(service.getPublicInfo('example.a')!.blockedReason!, /版本不匹配/)
      await service.rollback('example.b')
      assert.equal(service.getPublicInfo('example.a')!.available, true)
    })
    await test('scoped settings validate values, serialize writes, survive restart and clean up on uninstall', async() => {
      await install(manifest('example.config', {
        permissions: ['settings.scoped'],
        pages: undefined,
        settings: [
          { key: 'enabled', title: 'Enabled', type: 'boolean', default: true },
          { key: 'count', title: 'Count', type: 'number', default: 2, min: 1, max: 10 },
          { key: 'mode', title: 'Mode', type: 'select', default: 'a', options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] },
        ],
      }))
      assert.deepEqual(await service.getSettings('example.config'), { enabled: true, count: 2, mode: 'a' })
      await Promise.all([service.setSetting('example.config', 'count', 8), service.setSetting('example.config', 'enabled', false), service.setSetting('example.config', 'mode', 'b')])
      await assert.rejects(service.setSetting('example.config', 'count', 11), /Invalid plugin setting/)
      await assert.rejects(service.setSetting('example.config', 'enabled', 'false'), /Invalid plugin setting/)
      await assert.rejects(service.setSetting('example.config', 'constructor', 'x'), /Invalid plugin setting/)
      const restored = new PluginService(path.join(dir, 'plugins'), true); await restored.init()
      assert.deepEqual(await restored.getSettings('example.config'), { enabled: false, count: 8, mode: 'b' })
      await service.uninstall('example.config')
      await assert.rejects(fs.stat(path.join(dir, 'plugins/settings/example.config.json')))
    })
    await test('settings notifications follow committed writes, skip unchanged or invalid values and support unsubscribe', async() => {
      await install(manifest('example.live-settings', { permissions: ['settings.scoped'], pages: undefined, settings: [{ key: 'count', title: 'Count', type: 'number', default: 2, min: 1, max: 10 }] }))
      const changes: unknown[] = []
      const reads: Array<Promise<unknown>> = []
      const unsubscribe = service.subscribeSettings(change => {
        changes.push(change)
        reads.push(fs.readFile(path.join(dir, 'plugins/settings/example.live-settings.json'), 'utf8').then(text => JSON.parse(text)))
        change.settings.count = 999
      })
      const values: unknown[] = []
      const off = service.subscribeSettings(change => { values.push(change.settings.count) })
      assert.deepEqual(await service.setSetting('example.live-settings', 'count', 8), { count: 8 })
      assert.deepEqual(values, [8])
      await Promise.all(reads)
      assert.deepEqual(await reads[0], { count: 8 })
      await service.setSetting('example.live-settings', 'count', 8)
      await assert.rejects(service.setSetting('example.live-settings', 'count', 100))
      assert.equal(changes.length, 1)
      unsubscribe(); off()
      await service.setSetting('example.live-settings', 'count', 9)
      assert.equal(changes.length, 1)
      await service.uninstall('example.live-settings')
    })
    await test('reset removes only the selected plugin overrides and leaves sibling and enabled state intact', async() => {
      const settings = [
        { key: 'enabled', title: 'Enabled', type: 'boolean' as const, default: true },
        { key: 'count', title: 'Count', type: 'number' as const, default: 2, min: 1, max: 10 },
        { key: 'mode', title: 'Mode', type: 'select' as const, default: 'a', options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] },
      ]
      await install(manifest('example.reset-scope', { permissions: ['settings.scoped'], pages: undefined, settings }))
      await install(manifest('example.reset-sibling', { permissions: ['settings.scoped'], pages: undefined, settings: [{ key: 'count', title: 'Count', type: 'number', default: 1, min: 1, max: 10 }] }))
      await service.setSetting('example.reset-scope', 'enabled', false)
      await service.setSetting('example.reset-scope', 'count', 8)
      await service.setSetting('example.reset-scope', 'mode', 'b')
      await service.setSetting('example.reset-sibling', 'count', 6)
      const before = service.getPublicInfo('example.reset-scope')!

      assert.deepEqual(await service.resetSettings('example.reset-scope'), { enabled: true, count: 2, mode: 'a' })
      assert.deepEqual(await service.getSettings('example.reset-scope'), { enabled: true, count: 2, mode: 'a' })
      assert.deepEqual(await service.getSettings('example.reset-sibling'), { count: 6 })
      const after = service.getPublicInfo('example.reset-scope')!
      assert.equal(after.enabled, before.enabled)
      assert.equal(after.version, before.version)
      await assert.rejects(fs.stat(path.join(dir, 'plugins/settings/example.reset-scope.json')), { code: 'ENOENT' })
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, 'plugins/settings/example.reset-sibling.json'), 'utf8')), { count: 6 })
      await service.uninstall('example.reset-scope')
      await service.uninstall('example.reset-sibling')
    })
    await test('clearing old overrides lets upgraded package defaults take effect', async() => {
      await install(manifest('example.reset-upgrade', { permissions: ['settings.scoped'], pages: undefined, settings: [{ key: 'count', title: 'Count', type: 'number', default: 2, min: 1, max: 10 }] }))
      await service.setSetting('example.reset-upgrade', 'count', 8)
      await service.resetSettings('example.reset-upgrade')
      await assert.rejects(fs.stat(path.join(dir, 'plugins/settings/example.reset-upgrade.json')), { code: 'ENOENT' })

      await install(manifest('example.reset-upgrade', {
        version: '2.0.0',
        permissions: ['settings.scoped'],
        pages: undefined,
        settings: [
          { key: 'count', title: 'Count', type: 'number', default: 5, min: 1, max: 10 },
          { key: 'mode', title: 'Mode', type: 'string', default: 'fresh' },
        ],
      }))
      assert.deepEqual(await service.getSettings('example.reset-upgrade'), { count: 5, mode: 'fresh' })
      await assert.rejects(fs.stat(path.join(dir, 'plugins/settings/example.reset-upgrade.json')), { code: 'ENOENT' })
      await service.uninstall('example.reset-upgrade')
    })
    await test('reset and setting writes share per-plugin serialization', async() => {
      await install(manifest('example.reset-lock', { permissions: ['settings.scoped'], pages: undefined, settings: [{ key: 'count', title: 'Count', type: 'number', default: 2, min: 1, max: 10 }] }))
      await service.setSetting('example.reset-lock', 'count', 8)
      const settingsFile = path.join(dir, 'plugins/settings/example.reset-lock.json')
      const originalUnlink = fs.unlink
      const originalWrite = fs.writeFile
      let enterUnlink: () => void = () => {}
      let releaseUnlink: () => void = () => {}
      let writeStarted = false
      const unlinkEntered = new Promise<void>(resolve => { enterUnlink = resolve })
      const unlinkGate = new Promise<void>(resolve => { releaseUnlink = resolve })
      Object.defineProperty(fs, 'unlink', {
        configurable: true,
        writable: true,
        value: async(...args: Parameters<typeof fs.unlink>) => {
          if (String(args[0]) === settingsFile) { enterUnlink(); await unlinkGate }
          return originalUnlink(...args)
        },
      })
      Object.defineProperty(fs, 'writeFile', {
        configurable: true,
        writable: true,
        value: async(...args: Parameters<typeof fs.writeFile>) => {
          if (String(args[0]) === settingsFile + '.tmp') writeStarted = true
          return originalWrite(...args)
        },
      })
      try {
        const resetting = service.resetSettings('example.reset-lock')
        await unlinkEntered
        const saving = service.setSetting('example.reset-lock', 'count', 9)
        await new Promise(resolve => setTimeout(resolve, 30))
        assert.equal(writeStarted, false)
        releaseUnlink()
        assert.deepEqual(await resetting, { count: 2 })
        assert.deepEqual(await saving, { count: 9 })
      } finally {
        releaseUnlink()
        Object.defineProperty(fs, 'unlink', { configurable: true, writable: true, value: originalUnlink })
        Object.defineProperty(fs, 'writeFile', { configurable: true, writable: true, value: originalWrite })
      }
      assert.deepEqual(JSON.parse(await fs.readFile(settingsFile, 'utf8')), { count: 9 })
      await service.uninstall('example.reset-lock')
    })
    await test('reset notifies once for changed values and stays quiet when already at defaults', async() => {
      await install(manifest('example.reset-notify', {
        permissions: ['settings.scoped'],
        pages: undefined,
        settings: [
          { key: 'count', title: 'Count', type: 'number', default: 2, min: 1, max: 10 },
          { key: 'enabled', title: 'Enabled', type: 'boolean', default: true },
        ],
      }))
      await service.setSetting('example.reset-notify', 'count', 8)
      await service.setSetting('example.reset-notify', 'enabled', false)
      const changes: Array<{ settings: Record<string, string | number | boolean> }> = []
      const unsubscribe = service.subscribeSettings(change => { changes.push(change) })
      try {
        assert.deepEqual(await service.resetSettings('example.reset-notify'), { count: 2, enabled: true })
        assert.equal(changes.length, 1)
        assert.deepEqual(changes[0].settings, { count: 2, enabled: true })
        assert.deepEqual(await service.resetSettings('example.reset-notify'), { count: 2, enabled: true })
        assert.equal(changes.length, 1)
      } finally { unsubscribe() }
      await service.uninstall('example.reset-notify')
    })
    await test('disabled plugins reject reset and retain their saved overrides', async() => {
      await install(manifest('example.reset-disabled', { permissions: ['settings.scoped'], pages: undefined, settings: [{ key: 'count', title: 'Count', type: 'number', default: 2, min: 1, max: 10 }] }))
      await service.setSetting('example.reset-disabled', 'count', 9)
      const settingsFile = path.join(dir, 'plugins/settings/example.reset-disabled.json')
      const saved = await fs.readFile(settingsFile, 'utf8')
      await service.setEnabled('example.reset-disabled', false)
      await assert.rejects(service.resetSettings('example.reset-disabled'), /unavailable|disabled|禁用|停用/i)
      assert.equal(await fs.readFile(settingsFile, 'utf8'), saved)
      assert.deepEqual(await service.getSettings('example.reset-disabled'), { count: 9 })
      assert.equal(service.getPublicInfo('example.reset-disabled')!.enabled, false)
      await service.uninstall('example.reset-disabled')
    })
    await test('failed reset deletion does not notify or poison the next settings operation', async() => {
      await install(manifest('example.reset-io-error', { permissions: ['settings.scoped'], pages: undefined, settings: [{ key: 'count', title: 'Count', type: 'number', default: 2, min: 1, max: 10 }] }))
      const target = path.join(dir, 'plugins/settings/example.reset-io-error.json')
      await fs.mkdir(target, { recursive: true })
      let notifications = 0
      const off = service.subscribeSettings(change => { if (change.pluginId === 'example.reset-io-error') notifications++ })
      try {
        await assert.rejects(service.resetSettings('example.reset-io-error'), { code: 'EISDIR' })
        assert.equal(notifications, 0)
        await fs.rmdir(target)
        await service.setSetting('example.reset-io-error', 'count', 8)
        assert.deepEqual(await service.getSettings('example.reset-io-error'), { count: 8 })
        assert.equal(notifications, 1)
      } finally { off(); await service.uninstall('example.reset-io-error') }
    })
    await test('package replacement waits for a committing settings write and preserves the latest value', async() => {
      const fields = [{ key: 'count', title: 'Count', type: 'number' as const, default: 2, min: 1, max: 10 }]
      await install(manifest('example.write-race', { permissions: ['settings.scoped'], pages: undefined, settings: fields }))
      const originalWrite = fs.writeFile
      let release: () => void = () => {}; let entered: () => void = () => {}
      const committing = new Promise<void>(resolve => { entered = resolve })
      const gate = new Promise<void>(resolve => { release = resolve })
      const destination = path.join(dir, 'plugins/settings/example.write-race.json.tmp')
      Object.defineProperty(fs, 'writeFile', {
        configurable: true,
        writable: true,
        value: async(...args: Parameters<typeof fs.writeFile>) => {
          if (String(args[0]) === destination) { entered(); await gate }
          return originalWrite(...args)
        },
      })
      try {
        const saving = service.setSetting('example.write-race', 'count', 8)
        await committing
        let replaced = false
        const replacement = install(manifest('example.write-race', { version: '2.0.0', permissions: ['settings.scoped'], pages: undefined, settings: [...fields, { key: 'extra', title: 'Extra', type: 'boolean', default: true }] })).then(() => { replaced = true })
        await new Promise(resolve => setTimeout(resolve, 30))
        assert.equal(replaced, false)
        assert.equal(service.getPublicInfo('example.write-race')!.version, '1.0.0')
        release(); await saving; await replacement
        assert.deepEqual(await service.getSettings('example.write-race'), { count: 8, extra: true })
      } finally { release(); Object.defineProperty(fs, 'writeFile', { configurable: true, writable: true, value: originalWrite }) }
      await service.uninstall('example.write-race')
    })
    await test('removing dependency blocks its dependents without deleting their settings or preferences', async() => {
      await service.uninstall('example.b')
      assert.equal(service.getPublicInfo('example.a')!.available, false)
      assert.equal(service.getPublicInfo('example.a')!.enabled, true)
      assert.equal(service.getPages().length, 0)
    })
  } finally { await fs.rm(dir, { recursive: true, force: true }) }
}
