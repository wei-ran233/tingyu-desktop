import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import radioBuild from '@common/bundles/radio-build.json'
import { validatePluginManifest } from '@common/plugin/security'
import type { PluginManifest } from '@common/plugin/types'
import { PluginCredentialVault } from '@main/modules/plugin/credentialVault'
import type { RuntimeBackend } from '@main/modules/plugin/lifecycle'
import { PluginService } from '@main/modules/plugin/service'
import { settingsFilePath } from '@main/modules/plugin/settingsSnapshots'
import { digestPluginFiles, pluginSignaturePayload } from '@main/modules/plugin/signature'

type Test = (name: string, run: () => void | Promise<void>) => Promise<void>

const signingKey = generateKeyPairSync('ed25519')
let packageSequence = 0

const manifestBase = (id: string, overrides: Partial<PluginManifest> = {}): PluginManifest => {
  return validatePluginManifest({
    id,
    name: id,
    version: '1.0.0',
    apiVersion: '1.12.0',
    main: 'index.html',
    permissions: [],
    ...overrides,
  })
}

const packageFixture = async(
  directory: string,
  id: string,
  overrides: Partial<PluginManifest> = {},
  content = 'fixture',
) => {
  const files = new Map([
    ['index.html', Buffer.from(`<h1>${id}:${content}</h1>`)],
    ['runtime.html', Buffer.from(`<script>globalThis.fixture=${JSON.stringify(content)}</script>`)],
  ])
  const manifest = manifestBase(id, overrides)
  manifest.publicKey = signingKey.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  manifest.signature = sign(null, pluginSignaturePayload(manifest, digestPluginFiles(files)), signingKey.privateKey).toString('base64')
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify(manifest))
  for (const [name, data] of files) zip.file(name, data)
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const packagePath = path.join(directory, `${id}-${++packageSequence}.lxplugin`)
  await fs.writeFile(packagePath, buffer)
  return { buffer, manifest, packagePath }
}

const runtimeBackend = (starts: string[]): RuntimeBackend => ({
  start: async plugin => {
    starts.push(plugin.id)
    return {
      invoke: async() => null,
      dispose: async() => {},
      destroy: () => {},
    }
  },
})

const waitFor = async(predicate: () => boolean, message: string, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

const snapshotDirectory = async(root: string): Promise<Array<[string, Buffer]>> => {
  const result: Array<[string, Buffer]> = []
  const walk = async(relative: string) => {
    let entries
    try {
      entries = await fs.readdir(path.join(root, relative), { withFileTypes: true })
    } catch (error: any) {
      if (error?.code === 'ENOENT' && relative === '') return
      throw error
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const next = relative ? path.join(relative, entry.name) : entry.name
      if (entry.isDirectory()) await walk(next)
      else if (entry.isFile()) result.push([next, await fs.readFile(path.join(root, next))])
    }
  }
  await walk('')
  return result
}

const withService = async(
  run: (context: {
    service: PluginService
    root: string
    temporary: string
    createPackage: (id: string, overrides?: Partial<PluginManifest>, content?: string) => ReturnType<typeof packageFixture>
  }) => Promise<void>,
  credentialVault?: PluginCredentialVault,
) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'lx-install-preview-'))
  const root = path.join(temporary, 'plugins')
  const packages = path.join(temporary, 'packages')
  await fs.mkdir(packages)
  const service = new PluginService(root, true, credentialVault)
  try {
    await service.init()
    await run({
      service,
      root,
      temporary,
      createPackage: async(id, overrides, content) => packageFixture(packages, id, overrides, content),
    })
  } finally {
    await service.shutdown()
    await fs.rm(temporary, { recursive: true, force: true })
  }
}

export const pluginInstallPreviewServiceTests = async(test: Test) => {
  await test('signed preview reports impact without writing packages, starting runtime, or exposing secret defaults', async() => {
    const vault = new PluginCredentialVault(path.join(os.tmpdir(), `lx-preview-vault-${process.pid}`), {
      isAvailable: () => { throw new Error('preview must not access credential storage') },
      encrypt: value => Buffer.from(value),
      decrypt: value => value.toString(),
    })
    await withService(async({ service, root, createPackage }) => {
      const candidateId = 'fixture.preview'
      const conflictId = 'fixture.conflict'
      const dependentId = 'fixture.dependent'
      const v1 = await createPackage(candidateId, {
        runtime: { entry: 'runtime.html' },
        permissions: ['credentials.scoped', 'settings.scoped'],
        settings: [{
          key: 'mode',
          title: 'Mode',
          type: 'string',
          default: 'SETTINGS_DEFAULT_SENTINEL',
          maxLength: 100,
        }],
        credentials: [{ key: 'token', title: 'Token', maxLength: 100 }],
      }, 'v1')
      const upgrade = await createPackage(candidateId, {
        version: '2.0.0',
        runtime: { entry: 'runtime.html' },
        permissions: ['credentials.scoped', 'settings.scoped', 'extensions.act'],
        conflicts: [{ id: conflictId }],
        settings: [{
          key: 'mode',
          title: 'Mode',
          type: 'string',
          default: 'SETTINGS_DEFAULT_SENTINEL',
          maxLength: 100,
        }],
        credentials: [{ key: 'token', title: 'Token', maxLength: 100 }],
      }, 'v2')
      const conflict = await createPackage(conflictId, {}, 'conflict')
      const dependent = await createPackage(dependentId, {
        dependencies: [{ id: conflictId }],
      }, 'dependent')

      await service.install(v1.packagePath)
      await service.install(conflict.packagePath)
      await service.install(dependent.packagePath)

      const starts: string[] = []
      await service.configureLifecycle(runtimeBackend(starts))
      const startsBeforePreview = starts.length
      const rootBeforePreview = await snapshotDirectory(root)
      const registryBeforePreview = await fs.readFile(path.join(root, 'registry.json'))
      const preview = await service.previewInstall(upgrade.packagePath)

      assert.deepEqual(preview.impact.plugin.permissions.added, ['extensions.act'])
      assert.equal(preview.impact.operation, 'upgrade')
      assert.equal(preview.impact.plugin.enabledBefore, true)
      assert.equal(preview.impact.plugin.enabledAfter, true)
      assert.deepEqual(
        preview.impact.availabilityChanges.map(change => change.pluginId).sort(),
        [candidateId, conflictId, dependentId].sort(),
      )
      assert.ok(preview.impact.availabilityChanges.every(change => change.before && !change.after))
      assert.match(preview.impact.availabilityChanges.find(change => change.pluginId === dependentId)!.afterReason!, /依赖不可用/)
      assert.doesNotMatch(JSON.stringify(preview), /SETTINGS_DEFAULT_SENTINEL/)
      assert.equal(starts.length, startsBeforePreview)
      assert.deepEqual(await fs.readFile(path.join(root, 'registry.json')), registryBeforePreview)
      assert.deepEqual(await snapshotDirectory(root), rootBeforePreview)
      assert.equal(service.store.get(candidateId)!.manifest.version, '1.0.0')
    }, vault)
  })

  await test('new candidates start enabled and upgrades preserve the installed switch state', async() => {
    await withService(async({ service, createPackage }) => {
      const fresh = await createPackage('fixture.fresh', {
        defaultEnabled: false,
      })
      const freshPreview = await service.previewInstall(fresh.packagePath)
      assert.equal(freshPreview.impact.plugin.enabledBefore, null)
      assert.equal(freshPreview.impact.plugin.enabledAfter, true)

      const installed = await createPackage('fixture.preserve-enabled')
      await service.install(installed.packagePath)
      await service.setEnabled(installed.manifest.id, false)
      const upgrade = await createPackage(installed.manifest.id, {
        version: '2.0.0',
        defaultEnabled: true,
      }, 'upgrade')
      const upgradePreview = await service.previewInstall(upgrade.packagePath)
      assert.equal(upgradePreview.impact.plugin.enabledBefore, false)
      assert.equal(upgradePreview.impact.plugin.enabledAfter, false)
    })
  })

  await test('preview retries when the registry changes during asynchronous package validation', async() => {
    await withService(async({ service, createPackage }) => {
      const id = 'fixture.preview-race'
      const otherId = 'fixture.preview-race-other'
      const current = await createPackage(id)
      const upgrade = await createPackage(id, { version: '2.0.0' }, 'upgrade')
      const other = await createPackage(otherId)
      await service.install(current.packagePath)
      await service.install(other.packagePath)

      const descriptor = Object.getOwnPropertyDescriptor(service.store, 'previewPackage')
      const originalPreview = (service.store as any).previewPackage.bind(service.store)
      let attempts = 0
      Object.defineProperty(service.store, 'previewPackage', {
        configurable: true,
        writable: true,
        value: async(packagePath: string) => {
          const result = await originalPreview(packagePath)
          attempts++
          if (attempts === 1) await service.store.setEnabled(otherId, false)
          return result
        },
      })
      const preview = await (async() => {
        try {
          return await service.previewInstall(upgrade.packagePath)
        } finally {
          if (descriptor) Object.defineProperty(service.store, 'previewPackage', descriptor)
          else delete (service.store as any).previewPackage
        }
      })()

      const stable = await service.previewInstall(upgrade.packagePath)
      assert.equal(attempts, 2)
      assert.equal(service.store.get(otherId)!.enabled, false)
      assert.equal(preview.contextFingerprint, stable.contextFingerprint)
    })
  })

  await test('context fingerprint tracks enabled, source, signature, install, uninstall and rollback changes', async() => {
    await withService(async({ service, createPackage }) => {
      const id = 'fixture.context'
      const v1 = await createPackage(id, {}, 'v1')
      const upgrade = await createPackage(id, { version: '2.0.0' }, 'v2')
      const changedV1 = await createPackage(id, {}, 'v1-signed-variant')
      await service.install(v1.packagePath)

      let previousFingerprint: string | undefined
      const capture = async() => {
        const preview = await service.previewInstall(upgrade.packagePath)
        assert.match(preview.contextFingerprint, /^[a-f0-9]{64}$/)
        if (previousFingerprint !== undefined) assert.notEqual(preview.contextFingerprint, previousFingerprint)
        previousFingerprint = preview.contextFingerprint
        return preview.contextFingerprint
      }

      await capture()
      await service.setEnabled(id, false)
      await capture()
      await service.store.installArchive(v1.buffer, { source: 'bundled' })
      await capture()
      await service.store.installArchive(changedV1.buffer)
      await capture()
      await service.rollback(id)
      await capture()
      await service.uninstall(id)
      await capture()
      await service.install(v1.packagePath)
      await capture()
    })
  })

  await test('development manifest-only changes expire approval while resource digests remain unchanged', async() => {
    await withService(async({ service, temporary, createPackage }) => {
      const id = 'fixture.dev-manifest'
      const development = path.join(temporary, 'development')
      await fs.mkdir(development)
      await fs.writeFile(path.join(development, 'manifest.json'), JSON.stringify(manifestBase(id)))
      await fs.writeFile(path.join(development, 'index.html'), '<h1>stable resource</h1>')
      await service.installDevDirectory(development)
      const upgrade = await createPackage('fixture.approval', { version: '2.0.0' })

      const before = await service.previewInstall(upgrade.packagePath)
      const beforeEntry = service.store.get(id)!
      const beforeDigests = structuredClone(beforeEntry.fileDigests)
      assert.equal(beforeEntry.manifest.signature, '')

      await fs.writeFile(
        path.join(development, 'manifest.json'),
        JSON.stringify(manifestBase(id, { description: 'manifest-only change' })),
      )
      await service.installDevDirectory(development)
      const afterEntry = service.store.get(id)!
      const after = await service.previewInstall(upgrade.packagePath)

      assert.deepEqual(afterEntry.fileDigests, beforeDigests)
      assert.equal(afterEntry.manifest.signature, '')
      assert.notEqual(after.contextFingerprint, before.contextFingerprint)
    })
  })

  await test('stale context is rejected immediately before reading a changed package path', async() => {
    await withService(async({ service, temporary, createPackage }) => {
      const id = 'fixture.stale-immediate'
      const current = await createPackage(id)
      const upgrade = await createPackage(id, { version: '2.0.0' }, 'upgrade')
      await service.install(current.packagePath)
      const preview = await service.previewInstall(upgrade.packagePath)
      await service.setEnabled(id, false)

      await assert.rejects(
        service.install(
          path.join(temporary, 'does-not-exist.lxplugin'),
          preview.fingerprint,
          preview.archiveHash,
          preview.contextFingerprint,
        ),
        (error: any) => error?.code === 'catalog_changed' && /重新预览/.test(error.message),
      )
      assert.equal(service.store.get(id)!.manifest.version, '1.0.0')
    })
  })

  await test('queued confirmation rechecks context, writes no registry/package, and reconciles the suspended runtime', async() => {
    await withService(async({ service, createPackage }) => {
      const id = 'fixture.stale-queued'
      const otherId = 'fixture.queue-blocker'
      const current = await createPackage(id, {
        runtime: { entry: 'runtime.html' },
      })
      const upgrade = await createPackage(id, {
        version: '2.0.0',
        runtime: { entry: 'runtime.html' },
      }, 'upgrade')
      const other = await createPackage(otherId)
      await service.install(current.packagePath)
      await service.install(other.packagePath)

      const starts: string[] = []
      await service.configureLifecycle(runtimeBackend(starts))
      assert.equal(service.getPublicInfo(id)!.lifecycleState, 'active')
      const preview = await service.previewInstall(upgrade.packagePath)
      const oldEntry = service.store.get(id)!
      const oldPackageDirectories = (await fs.readdir(service.rootDirectory))
        .filter(name => name.startsWith(id + '-') && !name.endsWith('.json'))
      const eventStart = service.getLifecycleEvents().length

      let entered!: () => void
      let release!: () => void
      const persistenceEntered = new Promise<void>(resolve => { entered = resolve })
      const persistenceGate = new Promise<void>(resolve => { release = resolve })
      let gateReleased = false
      const descriptor = Object.getOwnPropertyDescriptor(service.store, 'persist')
      const originalPersist = (service.store as any).persist.bind(service.store)
      Object.defineProperty(service.store, 'persist', {
        configurable: true,
        writable: true,
        value: async(...args: unknown[]) => {
          entered()
          await persistenceGate
          return originalPersist(...args)
        },
      })
      const releaseGate = () => {
        if (gateReleased) return
        gateReleased = true
        release()
      }

      try {
        const blocker = service.setEnabled(otherId, false)
        await persistenceEntered
        const installing = service.install(
          upgrade.packagePath,
          preview.fingerprint,
          preview.archiveHash,
          preview.contextFingerprint,
        )
        await waitFor(
          () => service.getLifecycleEvents().slice(eventStart).some(event => event.pluginId === id && event.state === 'stopping'),
          'queued install did not suspend the active target runtime',
        )
        releaseGate()
        await blocker
        await assert.rejects(
          installing,
          (error: any) => error?.code === 'catalog_changed' && /重新预览/.test(error.message),
        )
      } finally {
        releaseGate()
        if (descriptor) Object.defineProperty(service.store, 'persist', descriptor)
        else delete (service.store as any).persist
      }

      assert.equal(service.store.get(id), oldEntry)
      assert.equal(service.store.get(otherId)!.enabled, false)
      const persisted = JSON.parse(await fs.readFile(path.join(service.rootDirectory, 'registry.json'), 'utf8'))
      assert.deepEqual(
        persisted.plugins.find((plugin: { id: string }) => plugin.id === id),
        JSON.parse(JSON.stringify(oldEntry)),
      )
      assert.deepEqual(
        (await fs.readdir(service.rootDirectory)).filter(name => name.startsWith(id + '-') && !name.endsWith('.json')),
        oldPackageDirectories,
      )
      assert.equal(service.getPublicInfo(id)!.lifecycleState, 'active')
      assert.ok(starts.filter(pluginId => pluginId === id).length >= 2)
    })
  })

  await test('settings changes keep approval valid, while same-version package bytes still fail archive binding', async() => {
    await withService(async({ service, createPackage }) => {
      const id = 'fixture.package-binding'
      const settings = [{
        key: 'mode' as const,
        title: 'Mode',
        type: 'string' as const,
        default: 'initial',
        maxLength: 100,
      }]
      const v1 = await createPackage(id, {
        permissions: ['settings.scoped'],
        settings,
      }, 'v1')
      const v2 = await createPackage(id, {
        version: '2.0.0',
        permissions: ['settings.scoped'],
        settings,
      }, 'v2-a')
      const sameVersionChanged = await createPackage(id, {
        version: '2.0.0',
        permissions: ['settings.scoped'],
        settings,
      }, 'v2-b')
      await service.install(v1.packagePath)
      const approval = await service.previewInstall(v2.packagePath)
      await service.setSetting(id, 'mode', 'changed after preview')
      await service.install(
        v2.packagePath,
        approval.fingerprint,
        approval.archiveHash,
        approval.contextFingerprint,
      )
      assert.equal(service.store.get(id)!.manifest.version, '2.0.0')
      assert.equal(service.store.get(id)!.manifest.signature, v2.manifest.signature)

      const changedPreview = await service.previewInstall(sameVersionChanged.packagePath)
      assert.equal(changedPreview.version, '2.0.0')
      assert.notEqual(changedPreview.archiveHash, approval.archiveHash)
      await assert.rejects(
        service.install(
          sameVersionChanged.packagePath,
          approval.fingerprint,
          approval.archiveHash,
          changedPreview.contextFingerprint,
        ),
        (error: any) => error?.code === 'package_changed' && /changed after preview/.test(error.message),
      )
      assert.equal(service.store.get(id)!.manifest.signature, v2.manifest.signature)
    })
  })

  await test('install defaults package binding to its verified preview and rejects a swapped archive', async() => {
    await withService(async({ service, createPackage }) => {
      const id = 'fixture.default-binding'
      const current = await createPackage(id)
      const candidate = await createPackage(id, { version: '2.0.0' }, 'candidate')
      const replacement = await createPackage(id, { version: '2.0.0' }, 'replacement')
      await service.install(current.packagePath)

      const oldEntry = service.store.get(id)!
      const previewDescriptor = Object.getOwnPropertyDescriptor(service.store, 'previewPackage')
      const installDescriptor = Object.getOwnPropertyDescriptor(service.store, 'installFromPackage')
      const originalPreview = (service.store as any).previewPackage.bind(service.store)
      const originalInstall = (service.store as any).installFromPackage.bind(service.store)
      let verifiedPreview: { archiveHash: string, fingerprint: string } | undefined
      let installOptions: any
      Object.defineProperty(service.store, 'previewPackage', {
        configurable: true,
        writable: true,
        value: async(packagePath: string) => {
          const result = await originalPreview(packagePath)
          verifiedPreview = result
          return result
        },
      })
      Object.defineProperty(service.store, 'installFromPackage', {
        configurable: true,
        writable: true,
        value: async(packagePath: string, options: any) => {
          installOptions = options
          await fs.writeFile(packagePath, replacement.buffer)
          return originalInstall(packagePath, options)
        },
      })

      try {
        await assert.rejects(
          service.install(candidate.packagePath),
          (error: any) => error?.code === 'package_changed',
        )
      } finally {
        if (previewDescriptor) Object.defineProperty(service.store, 'previewPackage', previewDescriptor)
        else delete (service.store as any).previewPackage
        if (installDescriptor) Object.defineProperty(service.store, 'installFromPackage', installDescriptor)
        else delete (service.store as any).installFromPackage
      }

      assert.ok(verifiedPreview)
      assert.equal(installOptions.expectedArchiveHash, verifiedPreview.archiveHash)
      assert.equal(installOptions.expectedFingerprint, verifiedPreview.fingerprint)
      assert.equal(service.store.get(id), oldEntry)
      assert.equal(service.store.get(id)!.manifest.version, '1.0.0')
    })
  })

  await test('reserved native ids require matching declaration, build and trusted signer before preview or change', async() => {
    await withService(async({ service, createPackage }) => {
      const id = 'lx.radio'
      const incompatibleApi = await createPackage('fixture.api-incompatible', {
        apiVersion: '1.13.0',
      })
      const rootBeforeApi = await snapshotDirectory(service.rootDirectory)
      await assert.rejects(
        service.previewInstall(incompatibleApi.packagePath),
        (error: any) => error?.code === 'incompatible_api',
      )
      assert.deepEqual(await fs.readFile(incompatibleApi.packagePath), incompatibleApi.buffer)
      assert.deepEqual(await snapshotDirectory(service.rootDirectory), rootBeforeApi)

      const correctHash = await createPackage(id, {
        version: '1.0.0',
        nativeBundle: { id, buildHash: radioBuild.buildHash },
      }, 'trusted-build')
      assert.throws(() => validatePluginManifest({
        ...correctHash.manifest,
        nativeBundle: { id: 'lx.official-suite', buildHash: radioBuild.buildHash },
      }), /Invalid trusted bundle declaration/)
      const checked = await service.store.previewPackage(correctHash.packagePath)
      const priorTrustedKeys = process.env.LX_PLUGIN_TRUSTED_KEYS
      try {
        delete process.env.LX_PLUGIN_TRUSTED_KEYS
        const rootBeforeUntrusted = await snapshotDirectory(service.rootDirectory)
        await assert.rejects(
          service.previewInstall(correctHash.packagePath),
          (error: any) => error?.code === 'incompatible_plugin' &&
            /application build or trusted signing key/.test(error.message),
        )
        assert.deepEqual(await fs.readFile(correctHash.packagePath), correctHash.buffer)
        assert.deepEqual(await snapshotDirectory(service.rootDirectory), rootBeforeUntrusted)

        process.env.LX_PLUGIN_TRUSTED_KEYS = checked.fingerprint
        const validPreview = await service.previewInstall(correctHash.packagePath)
        const installedNative = await service.install(correctHash.packagePath, validPreview.fingerprint, validPreview.archiveHash, validPreview.contextFingerprint)
        assert.equal(installedNative.plugin.compatible, true)
        assert.equal(installedNative.plugin.nativeBundle?.buildHash, radioBuild.buildHash)
        const oldEntry = service.store.get(id)!
        const rootBeforeRejections = await snapshotDirectory(service.rootDirectory)
        const omitted = await createPackage(id, { version: '2.0.0' }, 'omitted')
        const mismatched = await createPackage(id, {
          version: '2.0.0',
          nativeBundle: { id, buildHash: '0'.repeat(64) },
        }, 'mismatched')

        for (const candidate of [omitted, mismatched]) {
          await assert.rejects(
            service.previewInstall(candidate.packagePath),
            (error: any) => error?.code === 'incompatible_plugin' &&
              /application build or trusted signing key/.test(error.message),
          )
          assert.deepEqual(await fs.readFile(candidate.packagePath), candidate.buffer)
          assert.deepEqual(await snapshotDirectory(service.rootDirectory), rootBeforeRejections)
          assert.equal(service.store.get(id), oldEntry)
        }

        let changes = 0
        const change = (service as any).change
        const changeDescriptor = Object.getOwnPropertyDescriptor(service, 'change')
        ;(service as any).change = async(...args: any[]) => {
          changes++
          return change.apply(service, args)
        }
        try {
          await assert.rejects(
            service.install(omitted.packagePath),
            (error: any) => error?.code === 'incompatible_plugin',
          )
        } finally {
          if (changeDescriptor) Object.defineProperty(service, 'change', changeDescriptor)
          else delete (service as any).change
        }
        assert.equal(changes, 0)
        assert.equal(service.store.get(id), oldEntry)
        assert.deepEqual(await snapshotDirectory(service.rootDirectory), rootBeforeRejections)
      } finally {
        if (priorTrustedKeys === undefined) delete process.env.LX_PLUGIN_TRUSTED_KEYS
        else process.env.LX_PLUGIN_TRUSTED_KEYS = priorTrustedKeys
      }
    })
  })

  await test('preview rejects settings drift and downgrade without IO, then estimates a normal schema upgrade only', async() => {
    await withService(async({ service, root, createPackage }) => {
      const id = 'fixture.settings-preview'
      const oldField = {
        key: 'legacy' as const,
        title: 'Legacy',
        type: 'string' as const,
        default: 'old',
        maxLength: 100,
      }
      const improvedField = {
        ...oldField,
        key: 'modern' as const,
        title: 'Modern',
      }
      const legacy = await createPackage(id, {
        permissions: ['settings.scoped'],
        settingsVersion: 1,
        settings: [oldField],
      }, 'legacy')
      const current = await createPackage(id, {
        version: '2.0.0',
        permissions: ['settings.scoped'],
        settingsVersion: 2,
        settings: [oldField],
        settingsMigrations: [{ fromVersion: 1, toVersion: 2 }],
      }, 'current')
      const drift = await createPackage(id, {
        version: '3.0.0',
        permissions: ['settings.scoped'],
        settingsVersion: 2,
        settings: [{ ...oldField, default: 'changed without version' }],
      }, 'drift')
      const downgrade = await createPackage(id, {
        version: '3.0.0',
        permissions: ['settings.scoped'],
        settingsVersion: 1,
        settings: [oldField],
      }, 'downgrade')
      const schemaUpgrade = await createPackage(id, {
        version: '4.0.0',
        permissions: ['settings.scoped'],
        settingsVersion: 3,
        settings: [improvedField],
        settingsMigrations: [{
          fromVersion: 2,
          toVersion: 3,
          rename: { legacy: 'modern' },
        }],
      }, 'schema-upgrade')
      await service.install(legacy.packagePath)
      await service.install(current.packagePath)
      const installed = service.store.get(id)!
      assert.match(installed.settingsFile!, /^fixture\.settings-preview\.[a-f0-9]{24}\.json$/)
      const malformedSettings = '{"MIGRATION_VALUE_SENTINEL":'
      await fs.writeFile(settingsFilePath(root, installed), malformedSettings)
      const rootBefore = await snapshotDirectory(root)

      await assert.rejects(
        service.previewInstall(drift.packagePath),
        (error: any) => error?.code === 'invalid_settings_snapshot' &&
          /changed without a settings version increase/.test(error.message),
      )
      assert.equal(service.store.get(id), installed)
      assert.deepEqual(await snapshotDirectory(root), rootBefore)

      await assert.rejects(
        service.previewInstall(downgrade.packagePath),
        (error: any) => error?.code === 'invalid_settings_snapshot' &&
          /downgrade is rejected/.test(error.message),
      )
      assert.equal(service.store.get(id), installed)
      assert.deepEqual(await snapshotDirectory(root), rootBefore)
      for (const candidate of [drift, downgrade]) {
        await assert.rejects(service.install(candidate.packagePath), (error: any) => error?.code === 'invalid_settings_snapshot')
        assert.equal(service.store.get(id), installed)
        assert.deepEqual(await snapshotDirectory(root), rootBefore)
        assert.deepEqual(await fs.readFile(candidate.packagePath), candidate.buffer)
      }

      const preview = await service.previewInstall(schemaUpgrade.packagePath)
      assert.deepEqual(preview.impact.plugin.settings, {
        beforeVersion: 2,
        afterVersion: 3,
        migrationRequired: true,
        migrationExecuted: false,
        migrationSuccessGuaranteed: false,
      })
      assert.equal(await fs.readFile(settingsFilePath(root, installed), 'utf8'), malformedSettings)
      assert.deepEqual(await snapshotDirectory(root), rootBefore)
    })
  })
}
