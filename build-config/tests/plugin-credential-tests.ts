import assert from 'node:assert/strict'
import {
  PLUGIN_API_VERSION,
  PLUGIN_PERMISSIONS,
  type PluginCredentialField,
  type PluginCredentialStatus,
  type PluginManifest,
  type PluginPublicInfo,
} from '@common/plugin/types'
import {
  canonicalManifestPayload,
  validatePluginManifest,
} from '@common/plugin/security'

const manifest = (changes: Record<string, unknown> = {}) => ({
  id: 'fixture.credentials',
  name: 'Fixture credentials',
  version: '1.0.0',
  apiVersion: '1.12.0',
  main: 'index.html',
  permissions: ['credentials.scoped'],
  signature: '',
  publicKey: '',
  ...changes,
})

const credential = (changes: Partial<PluginCredentialField> = {}): PluginCredentialField => ({
  key: 'apiToken',
  title: 'API token',
  ...changes,
})

const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key)

export const pluginCredentialTests = async(
  test: (name: string, run: () => void | Promise<void>) => Promise<void>,
) => {
  await test('API 1.12 gates credential permissions and declarations while preserving permission-only manifests', () => {
    assert.equal(PLUGIN_API_VERSION, '1.12.0')
    assert.equal(PLUGIN_PERMISSIONS.includes('credentials.scoped'), true)

    const status: PluginCredentialStatus = { available: true, configured: { apiToken: false } }
    const publicCredentials: NonNullable<PluginPublicInfo['credentials']> = [credential()]
    assert.deepEqual(status, { available: true, configured: { apiToken: false } })
    assert.equal(publicCredentials[0].key, 'apiToken')

    const normalized = validatePluginManifest(manifest({ credentials: [credential()] }))
    assert.deepEqual(normalized.credentials, [credential()])
    assert.equal(hasOwn(normalized, 'credentials'), true)

    const permissionOnly = validatePluginManifest(manifest())
    assert.equal(hasOwn(permissionOnly, 'credentials'), false)
    assert.equal(permissionOnly.permissions.includes('credentials.scoped'), true)

    for (const apiVersion of ['1.11.0', '2.0.0', '1.12.0-beta.1']) {
      assert.throws(
        () => validatePluginManifest(manifest({ apiVersion })),
        /API 1\.12/,
      )
      assert.throws(
        () => validatePluginManifest(manifest({ apiVersion, permissions: [], credentials: [] })),
        /API 1\.12/,
      )
    }

    const legacyUndefined = manifest({
      apiVersion: '1.11.0',
      permissions: [],
      credentials: undefined,
    })
    assert.equal(hasOwn(legacyUndefined, 'credentials'), true)
    assert.throws(() => validatePluginManifest(legacyUndefined), /API 1\.12/)
    assert.throws(
      () => validatePluginManifest(manifest({ credentials: undefined })),
      /credentials must be an array/i,
    )
    assert.throws(
      () => validatePluginManifest(manifest({ permissions: [], credentials: [credential()] })),
      /credentials\.scoped/,
    )
  })

  await test('credential declarations clone bounded optional fields without inventing defaults', () => {
    const minimal = credential({ key: 'service.token', title: 'Service token' })
    const complete = credential({
      key: 'secondaryToken',
      title: 'Secondary token',
      description: '',
      maxLength: 4096,
    })
    const input = { ...manifest(), credentials: [minimal, complete] }
    const normalized = validatePluginManifest(input)

    assert.deepEqual(normalized.credentials, [minimal, complete])
    assert.notEqual(normalized.credentials, input.credentials)
    assert.notEqual(normalized.credentials?.[0], input.credentials[0])
    assert.equal(hasOwn(normalized.credentials[0], 'description'), false)
    assert.equal(hasOwn(normalized.credentials[0], 'maxLength'), false)
    assert.equal(canonicalManifestPayload(normalized), canonicalManifestPayload(input as PluginManifest))

    const undefinedOptionals = credential({
      description: undefined,
      maxLength: undefined,
    })
    const normalizedUndefined = validatePluginManifest(manifest({ credentials: [undefinedOptionals] }))
    assert.equal(hasOwn(normalizedUndefined.credentials![0], 'description'), false)
    assert.equal(hasOwn(normalizedUndefined.credentials![0], 'maxLength'), false)
  })

  await test('credential declarations enforce field-count and field-length limits', () => {
    const maximum = Array.from({ length: 16 }, (_, index) => credential({
      key: `credential${index}`,
      title: `Credential ${index}`,
    }))
    assert.equal(validatePluginManifest(manifest({ credentials: maximum })).credentials?.length, 16)
    assert.throws(
      () => validatePluginManifest(manifest({
        credentials: [...maximum, credential({ key: 'overflow', title: 'Overflow' })],
      })),
      /16/,
    )

    assert.doesNotThrow(() => validatePluginManifest(manifest({
      credentials: [credential({ title: 'T'.repeat(80), description: 'D'.repeat(500), maxLength: 1 })],
    })))
    assert.doesNotThrow(() => validatePluginManifest(manifest({
      credentials: [credential({ maxLength: 4096 })],
    })))

    for (const title of ['', '   ', 'T'.repeat(81)]) {
      assert.throws(
        () => validatePluginManifest(manifest({ credentials: [credential({ title })] })),
        /title/i,
      )
    }
    for (const description of ['D'.repeat(501), null, 1]) {
      assert.throws(
        () => validatePluginManifest(manifest({
          credentials: [{ ...credential(), description }],
        })),
        /description/i,
      )
    }
    for (const maxLength of [0, 4097, 1.5, '16', null]) {
      assert.throws(
        () => validatePluginManifest(manifest({
          credentials: [{ ...credential(), maxLength }],
        })),
        /maxLength/i,
      )
    }
  })

  await test('credential keys are safe, unique and disjoint from scoped setting keys', () => {
    const validKeys = ['apiToken', 'api.token-1_2', 'a']
    for (const key of validKeys) {
      assert.equal(
        validatePluginManifest(manifest({
          credentials: [credential({ key })],
        })).credentials?.[0].key,
        key,
      )
    }

    for (const key of ['ApiToken', '1token', 'api token', 'a'.repeat(65), '__proto__', 'constructor', 'prototype']) {
      assert.throws(
        () => validatePluginManifest(manifest({ credentials: [credential({ key })] })),
        /credential key/i,
      )
    }
    assert.throws(
      () => validatePluginManifest(manifest({
        credentials: [credential(), credential({ title: 'Duplicate' })],
      })),
      /duplicate credential key/i,
    )
    assert.throws(
      () => validatePluginManifest(manifest({
        permissions: ['settings.scoped', 'credentials.scoped'],
        settings: [{ key: 'shared', title: 'Shared', type: 'string', default: 'value' }],
        credentials: [credential({ key: 'shared' })],
      })),
      /conflicts with setting/i,
    )
  })

  await test('credential fields reject unknown, default, exportable and secret value properties', () => {
    for (const extra of [
      { default: 'value' },
      { exportable: true },
      { value: 'secret' },
      { secret: true },
    ]) {
      assert.throws(
        () => validatePluginManifest(manifest({
          credentials: [{ ...credential(), ...extra }],
        })),
        /credential field|credential/i,
      )
    }
    for (const credentials of [null, {}, 'credentials', [null], [new Date()], [credential(), 1]]) {
      assert.throws(() => validatePluginManifest(manifest({ credentials })), /credential/i)
    }
  })

  await test('credential validation rejects accessors and anomalous arrays without executing getters', () => {
    let topLevelGetterCalls = 0
    const topLevelGetter = manifest()
    Object.defineProperty(topLevelGetter, 'credentials', {
      enumerable: true,
      get() {
        topLevelGetterCalls++
        return []
      },
    })
    assert.throws(() => validatePluginManifest(topLevelGetter), /credentials/i)
    assert.equal(topLevelGetterCalls, 0)

    let fieldGetterCalls = 0
    const fieldWithGetter: Record<string, unknown> = { key: 'apiToken' }
    Object.defineProperty(fieldWithGetter, 'title', {
      enumerable: true,
      get() {
        fieldGetterCalls++
        return 'API token'
      },
    })
    assert.throws(
      () => validatePluginManifest(manifest({ credentials: [fieldWithGetter] })),
      /credential field/i,
    )
    assert.equal(fieldGetterCalls, 0)

    let itemGetterCalls = 0
    const arrayWithGetter: unknown[] = []
    Object.defineProperty(arrayWithGetter, '0', {
      enumerable: true,
      get() {
        itemGetterCalls++
        return credential()
      },
    })
    arrayWithGetter.length = 1
    assert.throws(() => validatePluginManifest(manifest({ credentials: arrayWithGetter })), /credentials/i)
    assert.equal(itemGetterCalls, 0)

    assert.throws(
      () => validatePluginManifest(manifest({ credentials: new Array(1) })),
      /credentials/i,
    )
    const arrayWithExtraProperty = [credential()]
    Object.defineProperty(arrayWithExtraProperty, 'extra', {
      enumerable: true,
      value: true,
    })
    assert.throws(
      () => validatePluginManifest(manifest({ credentials: arrayWithExtraProperty })),
      /credentials/i,
    )

    const revoked = Proxy.revocable<unknown[]>([credential()], {})
    revoked.revoke()
    assert.throws(
      () => validatePluginManifest(manifest({ credentials: revoked.proxy })),
      /credentials/i,
    )
  })

  await test('API 1.11 manifests keep their canonical signature payload without credential fields', () => {
    const legacy = {
      id: 'fixture.legacy-credentials',
      name: 'Fixture legacy credentials',
      version: '1.0.0',
      apiVersion: '1.11.0',
      main: 'index.html',
      permissions: ['settings.scoped'],
      settings: [{ key: 'enabled', title: 'Enabled', type: 'boolean', default: true }],
      signature: '',
      publicKey: '',
    }
    const normalized = validatePluginManifest(legacy)
    assert.equal(hasOwn(normalized, 'credentials'), false)
    assert.equal(canonicalManifestPayload(normalized), canonicalManifestPayload(legacy as PluginManifest))
  })
}
