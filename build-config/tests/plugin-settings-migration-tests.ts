import assert from 'node:assert/strict'
import {
  PLUGIN_API_VERSION,
  type PluginManifest,
  type PluginSettingField,
  type PluginSettingsMigration,
} from '@common/plugin/types'
import {
  canonicalManifestPayload,
  validatePluginManifest,
} from '@common/plugin/security'
import { migratePluginSettings } from '@common/plugin/settingsMigration'

const manifest = (changes: Partial<PluginManifest> = {}): PluginManifest => ({
  id: 'fixture.settings-migration',
  name: 'Fixture settings migration',
  version: '1.0.0',
  apiVersion: '1.11.0',
  main: 'index.html',
  permissions: ['settings.scoped'],
  settingsVersion: 2,
  settings: [],
  signature: '',
  publicKey: '',
  ...changes,
})

const fields = (): PluginSettingField[] => [
  { key: 'enabled', title: 'Enabled', type: 'boolean', default: true },
  { key: 'count', title: 'Count', type: 'number', default: 2, min: 1, max: 5 },
  { key: 'text', title: 'Text', type: 'string', default: 'base', maxLength: 8 },
  {
    key: 'mode',
    title: 'Mode',
    type: 'select',
    default: 'a',
    options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
  },
]

const migrationTarget = (
  changes: Partial<{
    settingsVersion: number
    settingsMigrations: PluginSettingsMigration[]
    settings: PluginSettingField[]
  }> = {},
) => ({
  settingsVersion: 2,
  settingsMigrations: [],
  settings: fields(),
  ...changes,
})

const invalidManifest = (migrations: unknown, settingsVersion: unknown = 2) => manifest({
  settingsVersion: settingsVersion as never,
  settingsMigrations: migrations as never,
})

export const pluginSettingsMigrationTests = async(
  test: (name: string, run: () => void | Promise<void>) => Promise<void>,
) => {
  await test('API 1.11 gates explicit settings migrations and preserves legacy canonical payloads', () => {
    assert.equal(Number(PLUGIN_API_VERSION.split('.')[1]) >= 11, true)

    const legacy = manifest({
      apiVersion: '1.10.0',
      settingsVersion: 2,
      settings: fields(),
    })
    const normalizedLegacy = validatePluginManifest(legacy)
    assert.equal(Object.prototype.hasOwnProperty.call(normalizedLegacy, 'settingsMigrations'), false)
    assert.equal(canonicalManifestPayload(normalizedLegacy), canonicalManifestPayload(legacy))

    const declaration: PluginSettingsMigration = {
      fromVersion: 1,
      toVersion: 2,
      rename: { old: 'count' },
      remove: ['legacy'],
    }
    const normalized = validatePluginManifest(manifest({
      settingsMigrations: [declaration],
    }))
    assert.deepEqual(normalized.settingsMigrations, [declaration])
    assert.notEqual(normalized.settingsMigrations, declaration)
    assert.notEqual(normalized.settingsMigrations?.[0], declaration)
    assert.doesNotThrow(() => validatePluginManifest(manifest({ settingsVersion: 1, settingsMigrations: [] })))

    for (const migrations of [undefined, null]) {
      assert.throws(() => validatePluginManifest(invalidManifest(migrations)), /settings migration/i)
    }
    for (const apiVersion of ['1.10.0', '2.0.0', '1.11.0-alpha.1']) {
      assert.throws(() => validatePluginManifest(manifest({
        apiVersion,
        settingsMigrations: [{ fromVersion: 1, toVersion: 2 }],
      })), /API 1\.(?:10|11)/)
    }
    assert.throws(() => validatePluginManifest(manifest({
      permissions: [],
      settingsMigrations: [{ fromVersion: 1, toVersion: 2 }],
    })), /settings\.scoped/)

    let accessed = 0
    const getterManifest = manifest()
    Object.defineProperty(getterManifest, 'settingsMigrations', {
      enumerable: true,
      get() {
        accessed++
        return []
      },
    })
    assert.throws(() => validatePluginManifest(getterManifest), /settings migrations/i)
    assert.equal(accessed, 0)

    const missingVersion = { ...manifest() }
    Reflect.deleteProperty(missingVersion, 'settingsVersion')
    missingVersion.settingsMigrations = [{ fromVersion: 1, toVersion: 2 }]
    assert.throws(() => validatePluginManifest(missingVersion), /explicit settings version/i)
  })

  await test('migration declarations reject ambiguous versions, extra fields, unsafe rename maps and overlapping removals', () => {
    const check = (migrations: unknown, settingsVersion: unknown = 4) => validatePluginManifest(
      invalidManifest(migrations, settingsVersion),
    )
    for (const migrations of [
      null,
      {},
      'migrations',
      Array.from({ length: 17 }, () => ({ fromVersion: 1, toVersion: 2 })),
    ]) {
      assert.throws(() => check(migrations), /settings migration/i)
    }
    for (const migration of [
      { fromVersion: 0, toVersion: 2 },
      { fromVersion: 1.5, toVersion: 2 },
      { fromVersion: 1, toVersion: 1 },
      { fromVersion: 1, toVersion: 1_000_001 },
      { fromVersion: 4, toVersion: 5 },
    ]) {
      assert.throws(() => check([migration]), /settings migration/i)
    }
    assert.throws(() => check([
      { fromVersion: 1, toVersion: 2 },
      { fromVersion: 1, toVersion: 3 },
    ]), /duplicate/i)
    assert.throws(() => check([
      { fromVersion: 1, toVersion: 2, extra: true },
    ]), /fields/i)

    for (const rename of [
      [],
      new Date(),
      { same: 'same' },
      { first: 'target', second: 'target' },
      { Invalid: 'target' },
      { source: 'Invalid' },
      JSON.parse('{"__proto__":"target"}'),
    ]) {
      assert.throws(() => check([{ fromVersion: 1, toVersion: 2, rename }]), /rename|setting/i)
    }
    const oversizedRename = Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`source${index}`, `target${index}`]))
    assert.throws(() => check([{ fromVersion: 1, toVersion: 2, rename: oversizedRename }]), /64|rename/i)

    for (const remove of [
      null,
      {},
      ['old', 'old'],
      ['Invalid'],
      ['constructor'],
      Array.from({ length: 65 }, (_, index) => `old${index}`),
    ]) {
      assert.throws(() => check([{ fromVersion: 1, toVersion: 2, remove }]), /remove|setting/i)
    }
    assert.throws(() => check([{
      fromVersion: 1,
      toVersion: 2,
      rename: { old: 'current' },
      remove: ['old'],
    }]), /renamed key/i)
    assert.throws(() => check([{
      fromVersion: 1,
      toVersion: 2,
      rename: { old: 'current' },
      remove: ['current'],
    }]), /renamed key/i)

    let accessed = 0
    const migrations = [{ fromVersion: 1, toVersion: 2 }] as PluginSettingsMigration[]
    Object.defineProperty(migrations[0], 'rename', {
      enumerable: true,
      get() {
        accessed++
        return { old: 'count' }
      },
    })
    assert.throws(() => check(migrations), /settings migration/i)
    assert.equal(accessed, 0)
  })

  await test('pure migration follows a unique chain, applies simultaneous renames and removals, and fills defaults', () => {
    const target = migrationTarget({
      settingsVersion: 4,
      settingsMigrations: [
        { fromVersion: 1, toVersion: 2, rename: { legacy: 'middle' }, remove: ['obsolete'] },
        { fromVersion: 2, toVersion: 3, rename: { middle: 'current', missing: 'ignored' } },
        { fromVersion: 3, toVersion: 4, rename: { current: 'final' } },
      ],
      settings: [
        { key: 'final', title: 'Final', type: 'string', default: 'fallback', maxLength: 20 },
        { key: 'enabled', title: 'Enabled', type: 'boolean', default: true },
      ],
    })
    const input = { legacy: 'old', obsolete: true }
    const snapshot = { ...input }
    const result = migratePluginSettings(1, target, input)
    assert.deepEqual(result, { final: 'old', enabled: true })
    assert.deepEqual(input, snapshot)
    assert.notEqual(result, input)
  })

  await test('simultaneous renames support swaps and source chains while rejecting occupied remaining targets', () => {
    const swap = migrationTarget({
      settingsMigrations: [{ fromVersion: 1, toVersion: 2, rename: { a: 'b', b: 'a' } }],
      settings: [
        { key: 'a', title: 'A', type: 'number', default: 0 },
        { key: 'b', title: 'B', type: 'number', default: 0 },
        { key: 'mode', title: 'Mode', type: 'string', default: 'safe' },
      ],
    })
    const input = { a: 1, b: 2 }
    assert.deepEqual(migratePluginSettings(1, swap, input), { a: 2, b: 1, mode: 'safe' })
    assert.deepEqual(input, { a: 1, b: 2 })

    const chain = migrationTarget({
      settingsMigrations: [{ fromVersion: 1, toVersion: 2, rename: { a: 'b', b: 'c' } }],
      settings: [
        { key: 'b', title: 'B', type: 'number', default: 0 },
        { key: 'c', title: 'C', type: 'number', default: 0 },
      ],
    })
    assert.deepEqual(migratePluginSettings(1, chain, { a: 1, b: 2 }), { b: 1, c: 2 })

    const collision = migrationTarget({
      settingsMigrations: [{ fromVersion: 1, toVersion: 2, rename: { a: 'c' } }],
      settings: [
        { key: 'a', title: 'A', type: 'number', default: 0 },
        { key: 'c', title: 'C', type: 'number', default: 0 },
      ],
    })
    assert.throws(() => migratePluginSettings(1, collision, { a: 1, c: 2 }), /occupied/)
  })

  await test('final projection requires explicit removal and strictly validates types, ranges and choices', () => {
    const target = migrationTarget()
    assert.deepEqual(migratePluginSettings(2, target, { count: 4 }), {
      enabled: true,
      count: 4,
      text: 'base',
      mode: 'a',
    })
    assert.throws(() => migratePluginSettings(2, target, { count: 4, unknown: true }), /Unknown plugin setting/)
    for (const values of [
      { count: 0 },
      { count: 6 },
      { count: Number.NaN },
      { count: '4' },
      { count: {} },
      { enabled: 'yes' },
      { text: 'too-long!' },
      { mode: 'z' },
    ]) {
      assert.throws(() => migratePluginSettings(2, target, values as never), /Invalid plugin setting/)
    }
    assert.throws(() => migratePluginSettings(2, migrationTarget({
      settings: [{ key: 'count', title: 'Count', type: 'number', default: 2, min: '1' as never }],
    }), { count: 2 }), /setting bounds/)

    const removeTarget = migrationTarget({
      settingsMigrations: [{ fromVersion: 1, toVersion: 2, remove: ['legacy'] }],
    })
    const noOpTarget = migrationTarget({
      settingsMigrations: [{ fromVersion: 1, toVersion: 2 }],
    })
    assert.throws(() => migratePluginSettings(1, noOpTarget, { legacy: true }), /Unknown plugin setting/)
    assert.deepEqual(migratePluginSettings(1, removeTarget, { legacy: true }), {
      enabled: true,
      count: 2,
      text: 'base',
      mode: 'a',
    })
  })

  await test('equal versions only project defaults and values without applying historical rules', () => {
    const target = migrationTarget({
      settingsMigrations: [{ fromVersion: 1, toVersion: 2, rename: { count: 'enabled' } }],
    })
    assert.deepEqual(migratePluginSettings(2, target, { count: 4 }), {
      enabled: true,
      count: 4,
      text: 'base',
      mode: 'a',
    })
  })

  await test('migration execution rejects missing paths, lower versions, cycles, invalid target schemas and getters', () => {
    const missingPath = migrationTarget({
      settingsVersion: 3,
      settingsMigrations: [{ fromVersion: 1, toVersion: 2 }],
    })
    assert.throws(() => migratePluginSettings(1, missingPath, {}), /Missing settings migration/)

    const cycle = migrationTarget({
      settingsMigrations: [
        { fromVersion: 1, toVersion: 2 },
        { fromVersion: 2, toVersion: 1 },
      ],
    })
    assert.throws(() => migratePluginSettings(1, cycle, {}), /migration/i)
    for (const fromVersion of [0, -1, 1.5, Number.NaN, 1_000_001]) {
      assert.throws(() => migratePluginSettings(fromVersion, migrationTarget(), {}), /installed settings version/)
    }
    assert.throws(() => migratePluginSettings(3, migrationTarget(), {}), /newer/)
    assert.throws(() => migratePluginSettings(2, migrationTarget({ settingsVersion: null as never }), {}), /settings version/)

    const noExplicitVersion = { settingsMigrations: [] as PluginSettingsMigration[], settings: fields() }
    assert.throws(() => migratePluginSettings(1, noExplicitVersion, {}), /explicit settings version/)
    assert.throws(() => migratePluginSettings(2, migrationTarget({ settings: [null as never] }), {}), /settings fields|setting field/)

    let accessed = 0
    const getterValues: Record<string, string | number | boolean> = {}
    Object.defineProperty(getterValues, 'count', {
      enumerable: true,
      get() {
        accessed++
        return 4
      },
    })
    assert.throws(() => migratePluginSettings(2, migrationTarget(), getterValues), /settings values/)
    assert.equal(accessed, 0)

    accessed = 0
    const getterTarget: {
      settingsVersion: number
      settingsMigrations?: PluginSettingsMigration[]
      settings: PluginSettingField[]
    } = { settingsVersion: 2, settings: fields() }
    Object.defineProperty(getterTarget, 'settingsMigrations', {
      enumerable: true,
      get() {
        accessed++
        return []
      },
    })
    assert.throws(() => migratePluginSettings(2, getterTarget, { count: 4 }), /migration target/)
    assert.equal(accessed, 0)
  })

  await test('input values must be safe plain data and are never mutated or read through accessors', () => {
    const target = migrationTarget()
    for (const values of [null, [], new Date()]) {
      assert.throws(() => migratePluginSettings(2, target, values as never), /values/)
    }
    const nullPrototype = Object.assign(Object.create(null), { count: 4 })
    assert.doesNotThrow(() => migratePluginSettings(2, target, nullPrototype))
    assert.throws(() => migratePluginSettings(2, target, JSON.parse('{"__proto__":true}')), /value key/)
    assert.throws(() => migratePluginSettings(2, target, { count: Number.POSITIVE_INFINITY }), /Invalid plugin setting value/)
    assert.throws(() => migratePluginSettings(2, target, { count: 1n as never }), /Invalid plugin setting value/)

    const source = { count: 4 }
    const result = migratePluginSettings(2, target, source)
    assert.notEqual(result, source)
    assert.deepEqual(source, { count: 4 })
    result.count = 5
    assert.equal(source.count, 4)
  })
}
