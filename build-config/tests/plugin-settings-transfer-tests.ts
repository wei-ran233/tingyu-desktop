import assert from 'node:assert/strict'
import {
  PLUGIN_API_VERSION,
  type PluginManifest,
  type PluginSettingField,
  type PluginSettingsTransferContext,
} from '@common/plugin/types'
import {
  canonicalManifestPayload,
  validatePluginManifest,
} from '@common/plugin/security'
import {
  MAX_PLUGIN_SETTINGS_DOCUMENT_BYTES,
  createPluginSettingsDocument,
  validatePluginSettingsDocument,
  type PluginSettingsDocument,
} from '@common/plugin/settings'

const manifest = (changes: Partial<PluginManifest> = {}): PluginManifest => ({
  id: 'fixture.settings',
  name: 'Fixture settings',
  version: '1.0.0',
  apiVersion: '1.10.0',
  main: 'index.html',
  permissions: [],
  signature: '',
  publicKey: '',
  ...changes,
})

const setting = (changes: Partial<PluginSettingField> = {}): PluginSettingField => ({
  key: 'enabled',
  title: 'Enabled',
  type: 'boolean',
  default: true,
  ...changes,
})

const transferFields = (): PluginSettingField[] => [
  setting({ key: 'enabled', exportable: true }),
  setting({ key: 'count', title: 'Count', type: 'number', default: 2, min: 1, max: 10, exportable: true }),
  setting({
    key: 'mode',
    title: 'Mode',
    type: 'select',
    default: 'a',
    options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
    exportable: true,
  }),
]

const context = (changes: Partial<PluginSettingsTransferContext> = {}): PluginSettingsTransferContext => ({
  pluginId: 'fixture.settings',
  signerFingerprint: 'a'.repeat(64),
  settingsVersion: 3,
  schemaFingerprint: 'b'.repeat(64),
  fields: transferFields(),
  ...changes,
})

const documentValue = (changes: Partial<PluginSettingsDocument> = {}): PluginSettingsDocument => ({
  format: 'lxplugin-settings/1',
  pluginId: 'fixture.settings',
  signerFingerprint: 'a'.repeat(64),
  settingsVersion: 3,
  schemaFingerprint: 'b'.repeat(64),
  values: { enabled: false, count: 8, mode: 'b' },
  ...changes,
})

export const pluginSettingsTransferTests = async(
  test: (name: string, run: () => void | Promise<void>) => Promise<void>,
) => {
  await test('API 1.10 gates explicit settings transfer declarations and preserves legacy signatures', () => {
    assert.ok(Number(PLUGIN_API_VERSION.split('.')[1]) >= 10)

    const legacyField = setting({ key: 'legacy' })
    const legacy = manifest({
      apiVersion: '1.9.0',
      permissions: ['settings.scoped'],
      settings: [legacyField],
    })
    const normalizedLegacy = validatePluginManifest(legacy)
    assert.equal(normalizedLegacy.settingsVersion, undefined)
    assert.deepEqual(normalizedLegacy.settings, [legacyField])
    assert.equal(canonicalManifestPayload(normalizedLegacy), canonicalManifestPayload(legacy))

    const modern = manifest({
      permissions: ['settings.scoped'],
      settings: [setting({ exportable: false })],
      settingsVersion: 1,
    })
    const normalizedModern = validatePluginManifest(modern)
    assert.equal(normalizedModern.settingsVersion, 1)
    assert.equal(normalizedModern.settings![0].exportable, false)

    assert.throws(() => validatePluginManifest(manifest({
      apiVersion: '1.9.0',
      permissions: ['settings.scoped'],
      settings: [setting({ exportable: false })],
    })), /API 1\.10/)
    assert.throws(() => validatePluginManifest(manifest({
      apiVersion: '2.0.0',
      permissions: ['settings.scoped'],
      settings: [setting({ exportable: true })],
    })), /API 1\.10/)
    assert.throws(() => validatePluginManifest(manifest({
      apiVersion: '1.10.0-beta.1',
      permissions: ['settings.scoped'],
      settings: [setting({ exportable: true })],
    })), /API 1\.10/)
    assert.throws(() => validatePluginManifest(manifest({
      permissions: [],
      settings: [setting({ exportable: true })],
    })), /settings\.scoped/)

    assert.throws(() => validatePluginManifest(manifest({
      apiVersion: '1.9.0',
      permissions: ['settings.scoped'],
      settingsVersion: 1,
    })), /API 1\.10/)
    assert.throws(() => validatePluginManifest(manifest({
      apiVersion: '2.0.0',
      permissions: ['settings.scoped'],
      settingsVersion: 1,
    })), /API 1\.10/)
    assert.throws(() => validatePluginManifest(manifest({
      permissions: [],
      settingsVersion: 1,
    })), /settings\.scoped/)
  })

  await test('settings versions and exportable flags are strictly bounded and typed', () => {
    for (const settingsVersion of [null, undefined, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1_000_001, '1', true]) {
      assert.throws(() => validatePluginManifest(manifest({
        permissions: ['settings.scoped'],
        settingsVersion: settingsVersion as never,
      })), /settings version/i)
    }
    assert.doesNotThrow(() => validatePluginManifest(manifest({
      permissions: ['settings.scoped'],
      settingsVersion: 1,
    })))
    assert.doesNotThrow(() => validatePluginManifest(manifest({
      permissions: ['settings.scoped'],
      settingsVersion: 1_000_000,
    })))

    for (const exportable of [null, undefined, 0, 1, 'true', {}, []]) {
      assert.throws(() => validatePluginManifest(manifest({
        permissions: ['settings.scoped'],
        settings: [{ ...setting(), exportable } as unknown as PluginSettingField],
      })), /exportable|Invalid setting/i)
    }
    assert.throws(() => validatePluginManifest(manifest({
      permissions: ['settings.scoped'],
      settings: [{ ...setting(), exported: true } as unknown as PluginSettingField],
    })), /Invalid/i)
  })

  await test('transfer validation binds identity, version and schema and returns fresh plain data', () => {
    const ctx = context()
    const input = documentValue()
    const result = validatePluginSettingsDocument(input, ctx)
    assert.deepEqual(result, input)
    assert.notEqual(result, input)
    assert.notEqual(result.values, input.values)

    for (const [key, value] of [
      ['format', 'lxplugin-settings/2'],
      ['pluginId', 'fixture.other'],
      ['signerFingerprint', 'c'.repeat(64)],
      ['settingsVersion', 4],
      ['schemaFingerprint', 'd'.repeat(64)],
    ] as const) {
      assert.throws(() => validatePluginSettingsDocument({ ...input, [key]: value }, ctx))
    }
    assert.throws(() => validatePluginSettingsDocument({ ...input, extra: true }, ctx), /unexpected|missing/i)
    const missing: Record<string, unknown> = { ...input }
    delete missing.values
    assert.throws(() => validatePluginSettingsDocument(missing, ctx), /unexpected|missing/i)

    let accessed = 0
    const getterDocument: Record<string, unknown> = {
      format: input.format,
      pluginId: input.pluginId,
      signerFingerprint: input.signerFingerprint,
      settingsVersion: input.settingsVersion,
      schemaFingerprint: input.schemaFingerprint,
    }
    Object.defineProperty(getterDocument, 'values', {
      enumerable: true,
      get() {
        accessed++
        return input.values
      },
    })
    assert.throws(() => validatePluginSettingsDocument(getterDocument, ctx), /values/i)
    assert.equal(accessed, 0)
  })

  await test('transfer validation rejects non-plain nesting, prototype keys, accessors and invalid values', () => {
    const ctx = context()
    const input = documentValue()
    for (const invalid of [null, [], new Date(), 'document', 1]) {
      assert.throws(() => validatePluginSettingsDocument(invalid, ctx), /plain object/i)
    }
    for (const values of [[], new Date(), null, 'values']) {
      assert.throws(() => validatePluginSettingsDocument({ ...input, values }, ctx), /plain object/i)
    }
    assert.throws(() => validatePluginSettingsDocument({
      ...input,
      values: { enabled: {}, count: 8, mode: 'b' },
    }, ctx), /Invalid plugin setting value/)
    assert.throws(() => validatePluginSettingsDocument({
      ...input,
      values: { enabled: [], count: 8, mode: 'b' },
    }, ctx), /Invalid plugin setting value/)
    assert.throws(() => validatePluginSettingsDocument({
      ...input,
      values: { enabled: true, count: '8', mode: 'b' },
    }, ctx), /Invalid plugin setting value/)
    assert.throws(() => validatePluginSettingsDocument({
      ...input,
      values: { enabled: true, count: Number.NaN, mode: 'b' },
    }, ctx), /Invalid plugin setting value/)
    assert.throws(() => validatePluginSettingsDocument({
      ...input,
      values: { enabled: true, count: 8, mode: 'z' },
    }, ctx), /Invalid plugin setting value/)
    assert.throws(() => validatePluginSettingsDocument({
      ...input,
      values: { enabled: true, unknown: 'x' },
    }, ctx), /Unknown plugin setting/)

    const protoValues = JSON.parse('{"__proto__":true,"enabled":true}') as Record<string, unknown>
    const constructorValues = Object.assign(Object.create(null), { enabled: true, constructor: true })
    assert.throws(() => validatePluginSettingsDocument({ ...input, values: protoValues }, ctx), /value key/i)
    assert.throws(() => validatePluginSettingsDocument({ ...input, values: constructorValues }, ctx), /value key/i)
    const topPrototypeKey: Record<string, unknown> = { ...input }
    Object.defineProperty(topPrototypeKey, '__proto__', { enumerable: true, value: true })
    assert.throws(() => validatePluginSettingsDocument(topPrototypeKey, ctx), /unexpected|missing/i)

    let accessed = 0
    const accessorValues: Record<string, unknown> = { count: 8, mode: 'b' }
    Object.defineProperty(accessorValues, 'enabled', {
      enumerable: true,
      get() {
        accessed++
        return true
      },
    })
    assert.throws(() => validatePluginSettingsDocument({ ...input, values: accessorValues }, ctx), /value: enabled/i)
    assert.equal(accessed, 0)
  })

  await test('settings exports require explicit exportable true and omit invalid source values', () => {
    const fields = [
      setting({ key: 'public', exportable: true }),
      setting({ key: 'default-private' }),
      setting({ key: 'locked', exportable: false }),
      setting({ key: 'invalid', exportable: true }),
    ]
    const ctx = context({ fields })
    assert.throws(() => validatePluginSettingsDocument(documentValue({
      values: { 'default-private': true },
    }), ctx), /not exportable/i)
    assert.throws(() => validatePluginSettingsDocument(documentValue({
      values: { locked: true },
    }), ctx), /not exportable/i)

    const created = createPluginSettingsDocument(ctx, {
      public: false,
      'default-private': true,
      locked: true,
      invalid: 'not-a-boolean',
      unknown: true,
    })
    assert.deepEqual(created.values, { public: false })

    let accessed = 0
    const source: Record<string, unknown> = {}
    Object.defineProperty(source, 'public', {
      enumerable: true,
      get() {
        accessed++
        return true
      },
    })
    assert.deepEqual(createPluginSettingsDocument(ctx, source).values, {})
    assert.equal(accessed, 0)
  })

  await test('transfer documents accept at most 64 values and 256 KiB of UTF-8 JSON', () => {
    assert.equal(MAX_PLUGIN_SETTINGS_DOCUMENT_BYTES, 256 * 1024)
    const fields = Array.from({ length: 64 }, (_, index) => setting({
      key: `field${index}`,
      title: `Field ${index}`,
      type: 'string',
      default: '',
      maxLength: 4000,
      exportable: true,
    }))
    const ctx = context({ fields })
    const values = Object.fromEntries(fields.map(field => [field.key, 'ok']))
    assert.equal(Object.keys(validatePluginSettingsDocument(documentValue({ values }), ctx).values).length, 64)
    assert.throws(() => validatePluginSettingsDocument(documentValue({
      values: { ...values, overflow: 'x' },
    }), ctx), /64 values/)

    const tooLarge = Object.fromEntries(fields.map(field => [field.key, '界'.repeat(4000)]))
    assert.throws(() => validatePluginSettingsDocument(documentValue({ values: tooLarge }), ctx), /256 KiB/)
  })
}
