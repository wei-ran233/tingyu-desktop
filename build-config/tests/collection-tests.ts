import { pluginInstallImpactTests } from './plugin-install-impact-tests'
import { pluginInstallPreviewServiceTests } from './plugin-install-preview-service-tests'
import assert from 'node:assert/strict'
import { controllerTests } from './collection-controller-tests'
import { installerTests } from './plugin-installer-tests'
import { pluginExtensibilityTests } from './plugin-extensibility-tests'
import { pluginRequestLimitTests } from './plugin-request-limit-tests'
import { pluginLifecycleTests } from './plugin-lifecycle-tests'
import { pluginActionTests } from './plugin-action-tests'
import { pluginEventTests } from './plugin-event-tests'
import { pluginUiTests } from './plugin-ui-tests'
import { pluginOptionalContractTests } from './plugin-optional-contract-tests'
import { pluginOptionalLifecycleTests } from './plugin-optional-lifecycle-tests'
import { pluginSettingsTransferTests } from './plugin-settings-transfer-tests'
import { pluginCredentialTests } from './plugin-credential-tests'
import { pluginCredentialVaultTests } from './plugin-credential-vault-tests'
import { pluginCredentialServiceTests } from './plugin-credential-service-tests'
import { pluginSettingsMigrationTests } from './plugin-settings-migration-tests'
import { pluginSettingsSnapshotTests } from './plugin-settings-snapshot-tests'
import { pluginSettingsMigrationServiceTests } from './plugin-settings-migration-service-tests'
import { pluginSettingsTransferServiceTests } from './plugin-settings-transfer-service-tests'
import { themeResourceTests } from './theme-resource-tests'
import { featureBundleTests } from './feature-bundle-tests'
import { getTrustedPluginFingerprints } from '@main/modules/plugin/trustedKeys'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import {
  COLLECTION_ERRORS,
  HOST_RECOVERY_PROVIDER_ID,
  OFFICIAL_PLUGIN_ID,
  OFFICIAL_PROVIDER_ID,
  type CollectionProviderInfo,
} from '@common/collection/types'
import {
  CollectionProtocolError,
  byteLength,
  validateDispatchRequest,
  validateItemsRequest,
  validateSnapshot,
  validateMusicItemSummary,
} from '@common/collection/validation'
import { buildProviderState, resolveCollectionProvider } from '@common/collection/resolve'
import { validateThemeTokens } from '@common/theme/validation'
import { readZipEntries } from '@main/modules/plugin/zipArchive'
import { digestPluginFiles, pluginSignaturePayload, verifyPluginSignature } from '@main/modules/plugin/signature'
import { isPluginApiCompatible, canonicalizePluginValue, canonicalManifestPayload, PluginSecurityError, validatePluginManifest } from '@common/plugin/security'

const root = path.join(__dirname, '../..')
let passed = 0

const test = async(name: string, fn: () => void | Promise<void>) => {
  try {
    await fn()
    passed++
    console.log(`  ok  ${name}`)
  } catch (error) {
    console.error(`  FAIL ${name}`)
    throw error
  }
}

const provider = (overrides: Partial<CollectionProviderInfo>): CollectionProviderInfo => ({
  id: 'list',
  qualifiedId: 'lx.test/list',
  displayName: 'Test list',
  pluginId: 'lx.test',
  apiVersion: '1.0.0',
  surfaces: ['list-music'],
  entry: 'index.html',
  icon: 'icon.svg',
  enabled: true,
  available: true,
  isOfficial: false,
  ...overrides,
})

const run = async() => {
  await pluginInstallImpactTests(test)
  await pluginInstallPreviewServiceTests(test)
  await featureBundleTests(test, root)
  await pluginOptionalContractTests(test)
  await pluginOptionalLifecycleTests(test)
  await pluginSettingsTransferTests(test)
  await pluginCredentialTests(test)
  await pluginCredentialVaultTests(test)
  await pluginCredentialServiceTests(test)
  await pluginSettingsMigrationTests(test)
  await pluginSettingsSnapshotTests(test)
  await pluginSettingsMigrationServiceTests(test)
  await pluginSettingsTransferServiceTests(test)
  console.log('collection contracts')
  await test('rejects stale and oversized item reads', () => {
    assert.throws(() => validateItemsRequest({ revision: 1, offset: 0, limit: 101 }), /limit/)
    assert.throws(() => validateItemsRequest({ revision: -1, offset: 0, limit: 10 }), /revision/)
    assert.throws(() => validateItemsRequest({ revision: 1, offset: -1, limit: 10 }), /offset/)
  })

  await test('caps target keys at one protocol read', () => {
    const keys = Array.from({ length: 101 }, (_, index) => `k${index}`)
    assert.throws(() => validateDispatchRequest({ revision: 1, command: 'playItem', target: { kind: 'item', keys } }), /target/)
    const ok = validateDispatchRequest({ revision: 1, command: 'playItem', target: { kind: 'item', keys: keys.slice(0, 100) } })
    assert.equal(ok.target?.kind, 'item')
  })

  await test('rejects unknown commands and control characters', () => {
    assert.throws(() => validateDispatchRequest({ revision: 1, command: 'eval' as never }), /command/)
    assert.throws(() => validateDispatchRequest({ revision: 1, command: 'playItem', target: { kind: 'item', keys: ['a\u0000b'] } }), /key/)
  })

  await test('select-all snapshot stays bounded with 10,000 songs', () => {
    const snapshot = validateSnapshot({
      revision: 4,
      surfaceId: 'list-music',
      contextId: 'list-music?listId=default',
      total: 10_000,
      loadedCount: 100,
      selection: { mode: 'all', count: 10_000 },
      query: {},
      facets: [],
      commands: [],
      status: 'ready',
    })
    assert.equal(snapshot.selection.count, 10_000)
    assert.ok(byteLength(snapshot) < 4096, `select-all snapshot must stay small, got ${byteLength(snapshot)} bytes`)
  })

  await test('validates item summaries and malformed snapshots', () => {
    assert.throws(() => validateMusicItemSummary({ key: '', name: 'x', available: true }), /key/)
    assert.throws(() => validateSnapshot({ revision: 1, surfaceId: 'unknown' as never, contextId: 'x', total: 0, loadedCount: 0, selection: { mode: 'none', count: 0 }, query: {}, facets: [], commands: [], status: 'ready' }), /surface/)
  })

  console.log('provider resolution')
  await test('resolves page override, global, official then recovery', () => {
    const official = provider({
      id: OFFICIAL_PROVIDER_ID,
      qualifiedId: `${OFFICIAL_PLUGIN_ID}/${OFFICIAL_PROVIDER_ID}`,
      pluginId: OFFICIAL_PLUGIN_ID,
      surfaces: ['search-music', 'list-music', 'songlist-detail-music', 'leaderboard-music'],
      isOfficial: true,
    })
    const card = provider({ id: 'cards', qualifiedId: 'lx.cards/cards', pluginId: 'lx.cards', surfaces: ['list-music', 'search-music'] })
    const providers = [official, card]
    const surface = resolveCollectionProvider(providers, { globalProviderId: null, surfaceProviders: { 'list-music': card.qualifiedId } }, 'list-music')
    assert.deepEqual(surface, { providerId: card.qualifiedId, source: 'surface', unavailablePreferenceId: null })
    const global = resolveCollectionProvider(providers, { globalProviderId: card.qualifiedId, surfaceProviders: {} }, 'list-music')
    assert.equal(global.source, 'global')
    const fallback = resolveCollectionProvider(providers, { globalProviderId: null, surfaceProviders: {} }, 'leaderboard-music')
    assert.equal(fallback.source, 'official')
    const recovery = resolveCollectionProvider([card], { globalProviderId: null, surfaceProviders: {} }, 'leaderboard-music')
    assert.equal(recovery.providerId, null)
    assert.equal(recovery.source, 'recovery')
  })

  await test('keeps invalid preferences while falling through', () => {
    const official = provider({
      id: OFFICIAL_PROVIDER_ID,
      qualifiedId: `${OFFICIAL_PLUGIN_ID}/${OFFICIAL_PROVIDER_ID}`,
      pluginId: OFFICIAL_PLUGIN_ID,
      surfaces: ['search-music', 'list-music', 'songlist-detail-music', 'leaderboard-music'],
      isOfficial: true,
    })
    const state = buildProviderState([official], {
      globalProviderId: 'lx.missing/list',
      surfaceProviders: { 'list-music': 'lx.gone/cards' },
    })
    assert.equal(state.resolved['list-music'], official.qualifiedId)
    assert.equal(state.invalidPreferences['list-music'], 'lx.gone/cards')
    assert.equal(state.globalInvalidPreference, 'lx.missing/list')
    assert.notEqual(state.resolved['list-music'], HOST_RECOVERY_PROVIDER_ID)
  })

  console.log('theme tokens')
  await test('accepts semantic tokens only and strips unsafe values', () => {
    const { tokens, invalid } = validateThemeTokens({
      '--lx-accent': '#ff8800',
      '--lx-text': 'rgb(1, 2, 3)',
      '--color-font': '#000',
      '--lx-image': 'url(https://evil.example/x.png)',
      '--lx-import': '@import url(x.css)',
    })
    assert.equal(tokens['--lx-accent'], '#ff8800')
    assert.equal(tokens['--lx-text'], 'rgb(1, 2, 3)')
    assert.ok(!('--color-font' in tokens))
    assert.ok(invalid.includes('--lx-image'))
    assert.ok(invalid.includes('--lx-import'))
  })

  console.log('packages and signatures')
  const packageDir = path.join(root, 'src/static/plugins')
  const packages = (await fs.readdir(packageDir)).filter(file => file.endsWith('.lxplugin'))
  await test('bundled packages are readable and signed', async() => {
    assert.ok(packages.length >= 2)
    for (const file of packages) {
      const buffer = await fs.readFile(path.join(packageDir, file))
      const entries = readZipEntries(buffer)
      const manifest = validatePluginManifest(JSON.parse(entries.get('manifest.json')!.toString('utf8')))
      const verified = verifyPluginSignature(manifest, digestPluginFiles(entries))
      assert.equal(verified.fingerprint.length, 64)
      assert.ok(manifest.collection?.providers.length || manifest.themes?.length || manifest.runtime || (manifest.nativeBundle && entries.has('bundle.json')))
    }
  })

  await test('tampering with a packaged resource invalidates the signature', async() => {
    const buffer = await fs.readFile(path.join(packageDir, packages[0]))
    const entries = readZipEntries(buffer)
    const manifest = validatePluginManifest(JSON.parse(entries.get('manifest.json')!.toString('utf8')))
    const digests = digestPluginFiles(entries)
    digests[0] = { ...digests[0], sha256: '0'.repeat(64) }
    assert.throws(() => verifyPluginSignature(manifest, digests), /signature/i)
  })

  await test('rejects manifest tampering and key substitution', async() => {
    const buffer = await fs.readFile(path.join(packageDir, packages[0]))
    const entries = readZipEntries(buffer)
    const manifest = validatePluginManifest(JSON.parse(entries.get('manifest.json')!.toString('utf8')))
    const digests = digestPluginFiles(entries)
    const tampered = { ...manifest, name: `${manifest.name} tampered` }
    assert.throws(() => verifyPluginSignature(tampered, digests), /signature/i)

    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const evilManifest = { ...manifest, publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64') }
    const payload = pluginSignaturePayload(evilManifest, digests)
    evilManifest.signature = sign(null, payload, privateKey).toString('base64')
    const verified = verifyPluginSignature(evilManifest, digests)
    assert.notEqual(verified.fingerprint, verifyPluginSignature(manifest, digests).fingerprint)
  })

  console.log('archive hardening')
  await test('rejects Zip Slip entries', async() => {
    const zip = new JSZip()
    zip.file('manifest.json', '{}')
    zip.file('../escape.txt', 'x')
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })
    assert.throws(() => readZipEntries(buffer), (error: any) => error instanceof PluginSecurityError || error?.code === 'unsafe_path')
  })

  await test('rejects symbolic links', async() => {
    const zip = new JSZip()
    zip.file('manifest.json', '{}')
    zip.file('link', 'target')
    zip.files.link.unixPermissions = 0o120777
    const buffer = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' })
    assert.throws(() => readZipEntries(buffer), /symbolic|unsafe/i)
  })

  await test('rejects compression bombs and oversized packages', async() => {
    const zip = new JSZip()
    zip.file('manifest.json', '{}')
    zip.file('bomb.bin', Buffer.alloc(12 * 1024 * 1024))
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
    assert.ok(buffer.length < 12 * 1024 * 1024)
    assert.throws(() => readZipEntries(buffer))
  })

  await test('canonical manifest payload excludes the signature', () => {
    const payload = canonicalManifestPayload({
      id: 'lx.test',
      name: 'Test',
      version: '1.0.0',
      apiVersion: '1.0.0',
      main: 'index.html',
      permissions: [],
      signature: 'abc',
      publicKey: 'def',
    })
    assert.ok(!payload.includes('"signature"'))
    assert.deepEqual(canonicalizePluginValue({ b: 1, a: 2 }), { a: 2, b: 1 })
  })

  await test('official fallback cannot be spoofed by reusing the official plugin id', () => {
    const fake = provider({ id: OFFICIAL_PROVIDER_ID, pluginId: OFFICIAL_PLUGIN_ID, qualifiedId: `${OFFICIAL_PLUGIN_ID}/${OFFICIAL_PROVIDER_ID}`, isOfficial: false })
    assert.equal(resolveCollectionProvider([fake], { globalProviderId: null, surfaceProviders: {} }, 'list-music').source, 'recovery')
  })
  await test('API versions reject newer requirements and sample keys are excluded in production', () => {
    assert.equal(isPluginApiCompatible('1.0.0'), true)
    assert.equal(isPluginApiCompatible('1.1.0'), true)
    assert.equal(isPluginApiCompatible('1.2.0'), true)
    assert.equal(isPluginApiCompatible('1.3.0'), true)
    assert.equal(isPluginApiCompatible('1.4.0'), true)
    assert.equal(isPluginApiCompatible('1.5.0'), true)
    assert.equal(isPluginApiCompatible('1.6.0'), true)
    assert.equal(isPluginApiCompatible('1.7.0'), true)
    assert.equal(isPluginApiCompatible('1.8.0'), true)
    assert.equal(isPluginApiCompatible('1.9.0'), true)
    assert.equal(isPluginApiCompatible('1.10.0'), true)
    assert.equal(isPluginApiCompatible('1.11.0'), true)
    assert.equal(isPluginApiCompatible('1.12.0'), true)
    assert.equal(isPluginApiCompatible('1.13.0'), false)
    assert.equal(isPluginApiCompatible('2.0.0'), false)
    assert.equal(isPluginApiCompatible('1.0.0-beta.1'), false)
    const sample = '9424c4f6c35a7e12ab4159363391160ff6540c80a1bad867a9eec18dda35f8ff'
    assert.ok(!getTrustedPluginFingerprints(false).includes(sample))
  })
  await controllerTests(test)
  await installerTests(test)
  await pluginExtensibilityTests(test)
  await pluginLifecycleTests(test)
  await pluginActionTests(test)
  await pluginEventTests(test)
  await pluginUiTests(test)
  await themeResourceTests(test)
  await pluginRequestLimitTests(test)
  console.log(`\n${passed} checks passed`)
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
