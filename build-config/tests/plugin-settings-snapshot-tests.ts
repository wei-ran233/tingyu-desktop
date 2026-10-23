import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type {
  PluginManifest,
  PluginRegistryEntry,
  PluginSettingField,
} from '@common/plugin/types'
import {
  PluginSettingsSnapshots,
  settingsFilePath,
} from '@main/modules/plugin/settingsSnapshots'

const execFileAsync = promisify(execFile)
const ID = 'fixture.snapshot'

const field = (changes: Partial<PluginSettingField> = {}): PluginSettingField => ({
  key: 'enabled',
  title: 'Enabled',
  type: 'boolean',
  default: true,
  ...changes,
})

const manifest = (changes: Partial<PluginManifest> = {}): PluginManifest => ({
  id: ID,
  name: 'Snapshot fixture',
  version: '1.0.0',
  apiVersion: '1.11.0',
  main: 'index.html',
  permissions: ['settings.scoped'],
  signature: '',
  publicKey: '',
  ...changes,
})

const entry = (
  value: PluginManifest,
  settingsFile?: string,
): PluginRegistryEntry => ({
  id: value.id,
  path: '/tmp/plugin-package',
  source: 'installed',
  enabled: true,
  publicKey: '',
  publicKeyFingerprint: 'a'.repeat(64),
  manifest: value,
  ...(settingsFile !== undefined ? { settingsFile } : {}),
  fileDigests: {},
  installedAt: 1,
})

const temporaryRoot = async(): Promise<string> => fs.mkdtemp(path.join(os.tmpdir(), 'lx-settings-snapshot-'))

const mode = (stat: Awaited<ReturnType<typeof fs.stat>>): number => Number(stat.mode) & 0o777

export const pluginSettingsSnapshotTests = async(
  test: (name: string, run: () => void | Promise<void>) => Promise<void>,
) => {
  await test('inactive legacy settings keep the flat file and perform no snapshot IO', async() => {
    const root = await temporaryRoot()
    try {
      const settings = [field()]
      const previousManifest = manifest({ settingsVersion: 2, settings })
      const previous = entry(previousManifest)
      const result = await new PluginSettingsSnapshots(root).prepare(previous, manifest({ settingsVersion: 2, settings }))
      assert.equal(result, undefined)
      await assert.rejects(fs.stat(path.join(root, 'settings')), (error: NodeJS.ErrnoException) => error.code === 'ENOENT')
      assert.equal(settingsFilePath(root, previous), path.join(root, 'settings', `${ID}.json`))
      assert.equal(
        settingsFilePath(root, { id: ID, settingsFile: `${ID}.${'a'.repeat(24)}.json` }),
        path.join(root, 'settings', `${ID}.${'a'.repeat(24)}.json`),
      )
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  await test('first installation uses target defaults without replaying historical migrations', async() => {
    const root = await temporaryRoot()
    try {
      const target = manifest({
        settingsVersion: 3,
        settings: [
          field({ key: 'enabled', default: false }),
          field({ key: 'count', title: 'Count', type: 'number', default: 7, min: 0, max: 10 }),
        ],
        settingsMigrations: [
          { fromVersion: 1, toVersion: 2, remove: ['enabled'] },
          { fromVersion: 2, toVersion: 3 },
        ],
      })
      const prepared = await new PluginSettingsSnapshots(root).prepare(undefined, target)
      assert.ok(prepared)
      assert.match(prepared.settingsFile, new RegExp(`^${ID.replaceAll('.', '\\.')}\\.[a-f0-9]{24}\\.json$`))
      const file = path.join(root, 'settings', prepared.settingsFile)
      assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { enabled: false, count: 7 })
      if (process.platform !== 'win32') assert.equal(mode(await fs.stat(file)), 0o600)
      await prepared.cleanup()
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  await test('flat settings migrate into one 0600 snapshot without changing the source bytes', async() => {
    const root = await temporaryRoot()
    try {
      const oldFields = [
        field({ key: 'enabled', type: 'boolean', default: true }),
        field({
          key: 'mode',
          title: 'Mode',
          type: 'select',
          default: 'compact',
          options: [{ value: 'compact', label: 'Compact' }, { value: 'wide', label: 'Wide' }],
        }),
      ]
      const oldManifest = manifest({ settingsVersion: 1, settings: oldFields })
      const previous = entry(oldManifest)
      const source = settingsFilePath(root, previous)
      await fs.mkdir(path.dirname(source), { recursive: true })
      const original = Buffer.from('{\n  "enabled": true,\n  "mode": "wide"\n}\n')
      await fs.writeFile(source, original, { mode: 0o600 })
      const sentinel = path.join(path.dirname(source), 'unrelated.json')
      await fs.writeFile(sentinel, '{}')

      const target = manifest({
        settingsVersion: 2,
        settings: [
          field({
            key: 'layout',
            title: 'Layout',
            type: 'select',
            default: 'compact',
            options: [{ value: 'compact', label: 'Compact' }, { value: 'wide', label: 'Wide' }],
          }),
          field({ key: 'count', title: 'Count', type: 'number', default: 5, min: 0, max: 10 }),
        ],
        settingsMigrations: [{ fromVersion: 1, toVersion: 2, rename: { mode: 'layout' }, remove: ['enabled'] }],
      })
      const prepared = await new PluginSettingsSnapshots(root).prepare(previous, target)
      assert.ok(prepared)
      const snapshot = path.join(root, 'settings', prepared.settingsFile)
      assert.deepEqual(JSON.parse(await fs.readFile(snapshot, 'utf8')), { layout: 'wide', count: 5 })
      assert.deepEqual(await fs.readFile(source), original)
      if (process.platform !== 'win32') assert.equal(mode(await fs.stat(snapshot)), 0o600)
      await prepared.cleanup()
      await prepared.cleanup()
      await assert.rejects(fs.stat(snapshot), (error: NodeJS.ErrnoException) => error.code === 'ENOENT')
      assert.deepEqual(await fs.readFile(source), original)
      assert.equal(await fs.readFile(sentinel, 'utf8'), '{}')
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  await test('invalid pointers, JSON, values and oversized or non-regular files are rejected', async() => {
    const root = await temporaryRoot()
    try {
      const oldManifest = manifest({
        settingsVersion: 1,
        settings: [field({ key: 'count', title: 'Count', type: 'number', default: 1, min: 0, max: 10 })],
      })
      const target = manifest({
        settingsVersion: 2,
        settings: oldManifest.settings,
        settingsMigrations: [{ fromVersion: 1, toVersion: 2 }],
      })
      for (const pointer of [
        '',
        `../${ID}.${'a'.repeat(24)}.json`,
        `${ID}.${'a'.repeat(23)}.json`,
        `${ID}.${'A'.repeat(24)}.json`,
        `other.${'a'.repeat(24)}.json`,
        `${ID}.${'a'.repeat(24)}.json/child`,
      ]) {
        await assert.rejects(
          new PluginSettingsSnapshots(root).prepare(entry(oldManifest, pointer), target),
          /pointer|settings file/i,
        )
      }
      await assert.rejects(
        new PluginSettingsSnapshots(root).prepare({ ...entry(oldManifest), settingsFile: undefined }, target),
        /pointer|settings file/i,
      )

      const source = settingsFilePath(root, entry(oldManifest))
      await fs.mkdir(path.dirname(source), { recursive: true })
      for (const contents of ['{', JSON.stringify({ count: 99 }), JSON.stringify({ unknown: true }), '[]']) {
        await fs.writeFile(source, contents)
        await assert.rejects(new PluginSettingsSnapshots(root).prepare(entry(oldManifest), target))
        assert.equal(await fs.readFile(source, 'utf8'), contents)
      }
      await fs.writeFile(source, Buffer.concat([
        Buffer.alloc(2 * 1024 * 1024 + 1, 0x20),
        Buffer.from('{}'),
      ]))
      await assert.rejects(new PluginSettingsSnapshots(root).prepare(entry(oldManifest), target), /2 MiB/)

      if (process.platform === 'linux') {
        const fifoName = `${ID}.${'c'.repeat(24)}.json`
        const fifo = path.join(root, 'settings', fifoName)
        await execFileAsync('mkfifo', [fifo])
        await assert.rejects(
          new PluginSettingsSnapshots(root).prepare(entry({ ...oldManifest, settings: [] }, fifoName), manifest({
            settingsVersion: 2,
            settings: [],
            settingsMigrations: [{ fromVersion: 1, toVersion: 2 }],
          })),
          /regular file/,
        )
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  await test('missing legacy settings start from defaults', async() => {
    const root = await temporaryRoot()
    try {
      const oldManifest = manifest({
        settingsVersion: 1,
        settings: [field({ key: 'enabled', default: true })],
      })
      const target = manifest({
        settingsVersion: 2,
        settings: [
          field({ key: 'enabled', default: true }),
          field({ key: 'count', title: 'Count', type: 'number', default: 4, min: 0, max: 10 }),
        ],
        settingsMigrations: [{ fromVersion: 1, toVersion: 2 }],
      })
      const prepared = await new PluginSettingsSnapshots(root).prepare(entry(oldManifest), target)
      assert.ok(prepared)
      assert.deepEqual(
        JSON.parse(await fs.readFile(path.join(root, 'settings', prepared.settingsFile), 'utf8')),
        { enabled: true, count: 4 },
      )
      await prepared.cleanup()
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  await test('Linux rejects a settings symlink without reading or changing its target', async() => {
    if (process.platform !== 'linux') return
    const root = await temporaryRoot()
    try {
      const previousManifest = manifest({
        settingsVersion: 1,
        settings: [field({ key: 'enabled', default: true })],
      })
      const target = manifest({
        settingsVersion: 2,
        settings: previousManifest.settings,
        settingsMigrations: [{ fromVersion: 1, toVersion: 2 }],
      })
      const settingsDir = path.join(root, 'settings')
      const foreignDir = path.join(root, 'foreign')
      const source = settingsFilePath(root, entry(previousManifest))
      const foreign = path.join(foreignDir, 'other-plugin.json')
      const foreignBytes = Buffer.from('{"enabled":false}\n')
      await fs.mkdir(settingsDir, { recursive: true })
      await fs.mkdir(foreignDir, { recursive: true })
      await fs.writeFile(foreign, foreignBytes)
      await fs.symlink(foreign, source)

      await assert.rejects(new PluginSettingsSnapshots(root).prepare(entry(previousManifest), target))
      assert.deepEqual(await fs.readFile(foreign), foreignBytes)
      assert.ok((await fs.lstat(source)).isSymbolicLink())
      await assert.rejects(fs.stat(path.join(root, 'settings', `${ID}.${'d'.repeat(24)}.json`)))

      await fs.unlink(source)
      const legacyBytes = Buffer.from('{"enabled":false}\n')
      await fs.writeFile(source, legacyBytes, { mode: 0o600 })
      const prepared = await new PluginSettingsSnapshots(root).prepare(entry(previousManifest), target)
      assert.ok(prepared)
      assert.deepEqual(await fs.readFile(source), legacyBytes)
      assert.deepEqual(await fs.readFile(foreign), foreignBytes)
      await prepared.cleanup()
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  await test('partial snapshot write failure cleans staging and preserves the legacy source', async() => {
    const root = await temporaryRoot()
    const originalWrite = fs.writeFile
    try {
      const previousManifest = manifest({ settingsVersion: 1, settings: [field()] })
      const source = settingsFilePath(root, entry(previousManifest))
      const bytes = Buffer.from('{"enabled":false}\n')
      await fs.mkdir(path.dirname(source), { recursive: true })
      await fs.writeFile(source, bytes)
      const target = manifest({
        settingsVersion: 2,
        settings: previousManifest.settings,
        settingsMigrations: [{ fromVersion: 1, toVersion: 2 }],
      })
      let failedFile: string | undefined
      fs.writeFile = async(...args: Parameters<typeof fs.writeFile>) => {
        const file = String(args[0])
        if (file !== source && file.startsWith(path.dirname(source) + path.sep)) {
          failedFile = file
          await originalWrite(args[0], '{', args[2])
          throw Object.assign(new Error('simulated partial settings write'), { code: 'ENOSPC' })
        }
        return originalWrite(...args)
      }
      try {
        await assert.rejects(new PluginSettingsSnapshots(root).prepare(entry(previousManifest), target), /partial settings write/)
      } finally {
        fs.writeFile = originalWrite
      }
      assert.ok(failedFile)
      assert.deepEqual(await fs.readFile(source), bytes)
      assert.deepEqual(await fs.readdir(path.dirname(source)), [`${ID}.json`])
      const retried = await new PluginSettingsSnapshots(root).prepare(entry(previousManifest), target)
      assert.ok(retried)
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'settings', retried.settingsFile), 'utf8')), { enabled: false })
      await retried.cleanup()
    } finally {
      fs.writeFile = originalWrite
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  await test('same-version schema drift and version downgrade are rejected', async() => {
    const root = await temporaryRoot()
    try {
      const pointer = `${ID}.${'b'.repeat(24)}.json`
      const previousManifest = manifest({
        settingsVersion: 2,
        settings: [field({ key: 'enabled', default: true })],
      })
      const source = settingsFilePath(root, { id: ID, settingsFile: pointer })
      await fs.mkdir(path.dirname(source), { recursive: true })
      await fs.writeFile(source, '{"enabled":false}')
      await assert.rejects(
        new PluginSettingsSnapshots(root).prepare(entry(previousManifest, pointer), manifest({
          settingsVersion: 2,
          settings: [field({ key: 'enabled', default: false })],
        })),
        /version increase/i,
      )
      assert.equal(await fs.readFile(source, 'utf8'), '{"enabled":false}')
      await assert.rejects(
        new PluginSettingsSnapshots(root).prepare(entry(previousManifest), manifest({
          settingsVersion: 1,
          settings: previousManifest.settings,
        })),
        /rollback/i,
      )
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
}
