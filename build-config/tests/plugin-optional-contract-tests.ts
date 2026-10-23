import assert from 'node:assert/strict'
import {
  PLUGIN_API_VERSION,
  type PluginDependency,
  type PluginManifest,
  type PluginPublicInfo,
} from '@common/plugin/types'
import {
  canonicalManifestPayload,
  isPluginApiCompatible,
  validatePluginManifest,
} from '@common/plugin/security'
import {
  comparePluginVersions,
  dependencyAccepts,
  isDependencyVersion,
  resolvePluginDependencies,
} from '@common/plugin/dependencies'

const manifest = (changes: Partial<PluginManifest> = {}): PluginManifest => ({
  id: 'fixture.owner',
  name: 'Fixture owner',
  version: '1.0.0',
  apiVersion: '1.9.0',
  main: 'index.html',
  permissions: [],
  signature: '',
  publicKey: '',
  ...changes,
})

const info = (id: string, changes: Partial<PluginPublicInfo> = {}): PluginPublicInfo => ({
  id,
  name: id,
  version: '1.0.0',
  apiVersion: '1.9.0',
  enabled: true,
  compatible: true,
  source: 'installed',
  permissions: [],
  providers: [],
  pages: [],
  themes: [],
  publicKeyFingerprint: '',
  official: false,
  canRollback: false,
  ...changes,
})

const dependency = (id: string, changes: Partial<PluginDependency> = {}): PluginDependency => ({ id, ...changes })

export const pluginOptionalContractTests = async(
  test: (name: string, run: () => void | Promise<void>) => Promise<void>,
) => {
  await test('API 1.9 validates bounded optional dependencies and conflicts', () => {
    assert.ok(Number(PLUGIN_API_VERSION.split('.')[1]) >= 9)
    const normalized = validatePluginManifest(manifest({
      optionalDependencies: [dependency('fixture.optional', {
        minVersion: '1.0.0',
        maxVersionExclusive: '2.0.0',
      })],
      conflicts: [dependency('fixture.conflict', {
        minVersion: '1.5.0',
        maxVersionExclusive: '1.6.0',
      })],
    }))
    assert.deepEqual(normalized.optionalDependencies, [{
      id: 'fixture.optional',
      minVersion: '1.0.0',
      maxVersionExclusive: '2.0.0',
    }])
    assert.deepEqual(normalized.conflicts, [{
      id: 'fixture.conflict',
      minVersion: '1.5.0',
      maxVersionExclusive: '1.6.0',
    }])

    const optional = Array.from({ length: 32 }, (_, index) => dependency(`fixture.optional-${index}`))
    const conflicts = Array.from({ length: 32 }, (_, index) => dependency(`fixture.conflict-${index}`))
    assert.equal(validatePluginManifest(manifest({ optionalDependencies: optional, conflicts })).optionalDependencies!.length, 32)
    assert.throws(() => validatePluginManifest(manifest({
      optionalDependencies: [...optional, dependency('fixture.optional-overflow')],
    })), /optional dependency/)
    assert.throws(() => validatePluginManifest(manifest({
      conflicts: [...conflicts, dependency('fixture.conflict-overflow')],
    })), /conflict/)
  })

  await test('API 1.9 gate includes empty arrays and rejects malformed declarations', () => {
    assert.throws(() => validatePluginManifest(manifest({
      apiVersion: '1.8.0',
      optionalDependencies: [],
    })), /API 1\.9/)
    assert.throws(() => validatePluginManifest(manifest({
      apiVersion: '1.8.0',
      conflicts: [],
    })), /API 1\.9/)
    assert.throws(() => validatePluginManifest(manifest({
      apiVersion: '1.9.0-beta.1',
      optionalDependencies: [],
    })), /API 1\.9/)
    assert.doesNotThrow(() => validatePluginManifest(manifest({
      apiVersion: '1.10.0',
      optionalDependencies: [],
      conflicts: [],
    })))

    const withUnknownKey = { id: 'fixture.extra', unexpected: true }
    const invalid = [
      () => validatePluginManifest(manifest({ optionalDependencies: [dependency('fixture.owner')] })),
      () => validatePluginManifest(manifest({ conflicts: [dependency('fixture.owner')] })),
      () => validatePluginManifest(manifest({
        optionalDependencies: [dependency('fixture.extra'), dependency('fixture.extra')],
      })),
      () => validatePluginManifest(manifest({
        conflicts: [dependency('fixture.extra'), dependency('fixture.extra')],
      })),
      () => validatePluginManifest(manifest({
        dependencies: [dependency('fixture.extra')],
        optionalDependencies: [dependency('fixture.extra')],
      })),
      () => validatePluginManifest(manifest({
        dependencies: [dependency('fixture.extra')],
        conflicts: [dependency('fixture.extra')],
      })),
      () => validatePluginManifest(manifest({
        optionalDependencies: [dependency('fixture.extra')],
        conflicts: [dependency('fixture.extra')],
      })),
      () => validatePluginManifest(manifest({
        optionalDependencies: [withUnknownKey],
      })),
      () => validatePluginManifest(manifest({
        conflicts: [dependency('fixture.extra', { minVersion: '2.0.0', maxVersionExclusive: '2.0.0' })],
      })),
      () => validatePluginManifest(manifest({
        optionalDependencies: [dependency('fixture.extra', { minVersion: 'invalid' })],
      })),
    ]
    for (const validate of invalid) assert.throws(validate)
  })

  await test('versions require strict SemVer prerelease and build identifiers', () => {
    const validVersions = [
      '1.0.0',
      '1.0.0-0',
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha-1',
      '1.0.0-01a',
      '1.0.0+build.001',
      '1.0.0-beta+exp.sha.5114f85',
    ]
    for (const version of validVersions) assert.equal(isDependencyVersion(version), true, version)

    const invalidVersions = [
      '1.0.0-01',
      '1.0.0-alpha..1',
      '1.0.0+',
      '1.0.0+a..b',
    ]
    for (const version of invalidVersions) {
      assert.equal(isDependencyVersion(version), false, version)
      assert.throws(() => comparePluginVersions(version, '1.0.0'), /Invalid dependency version/)
      assert.throws(() => comparePluginVersions('1.0.0', version), /Invalid dependency version/)
      assert.throws(() => validatePluginManifest(manifest({ version })), /Invalid plugin version/)
    }

    assert.equal(comparePluginVersions('1.0.0-alpha', '1.0.0-alpha.1'), -1)
    assert.equal(comparePluginVersions('1.0.0-beta.11', '1.0.0-rc.1'), -1)
    assert.equal(comparePluginVersions('1.0.0+first', '1.0.0+second'), 0)
  })

  await test('optional and conflict ranges reject malformed SemVer bounds', () => {
    const validateRelation = (key: 'optionalDependencies' | 'conflicts', version: string) => {
      const relation = [dependency('fixture.extra', { minVersion: version })]
      return validatePluginManifest(manifest(key === 'optionalDependencies'
        ? { optionalDependencies: relation }
        : { conflicts: relation }))
    }
    for (const key of ['optionalDependencies', 'conflicts'] as const) {
      for (const version of ['1.0.0-01', '1.0.0+a..b']) {
        assert.throws(() => validateRelation(key, version), /Invalid dependency version/)
      }
      assert.doesNotThrow(() => validateRelation(key, '1.0.0-rc.1+build.7'))
    }
  })

  await test('legacy manifests keep their canonical signature payload', () => {
    const legacy = manifest({
      apiVersion: '1.8.0',
      dependencies: [dependency('fixture.required')],
      description: 'Legacy package',
    })
    const normalized = validatePluginManifest(legacy)
    assert.equal(normalized.optionalDependencies, undefined)
    assert.equal(normalized.conflicts, undefined)
    assert.equal(canonicalManifestPayload(normalized), canonicalManifestPayload(legacy))
    assert.equal(isPluginApiCompatible('1.8.0'), true)

    const semverLegacy = manifest({
      apiVersion: '1.8.0',
      version: '1.0.0-beta.1+build.7',
    })
    const normalizedSemverLegacy = validatePluginManifest(semverLegacy)
    assert.equal(normalizedSemverLegacy.version, semverLegacy.version)
    assert.equal(canonicalManifestPayload(normalizedSemverLegacy), canonicalManifestPayload(semverLegacy))
  })

  await test('extensions may target required or optional declarations only', () => {
    const extension = {
      id: 'connect',
      target: 'fixture.target/point',
      version: '1.0.0',
      handler: 'connect',
    }
    const withExtension = (changes: Partial<PluginManifest>) => manifest({
      permissions: ['extensions.process'],
      runtime: { entry: 'runtime.html', timeoutMs: 100 },
      extensions: [extension],
      ...changes,
    })
    assert.equal(validatePluginManifest(withExtension({
      dependencies: [dependency('fixture.target')],
    })).extensions![0].target, extension.target)
    assert.equal(validatePluginManifest(withExtension({
      optionalDependencies: [dependency('fixture.target')],
    })).extensions![0].target, extension.target)
    assert.throws(() => validatePluginManifest(withExtension({
      conflicts: [dependency('fixture.target')],
    })))
    assert.throws(() => validatePluginManifest(withExtension({})))
  })

  await test('conflicts are symmetric, ranged and propagate through required dependencies', () => {
    const range = dependency('fixture.b', {
      minVersion: '1.0.0',
      maxVersionExclusive: '2.0.0',
    })
    assert.equal(dependencyAccepts('1.0.0', range), true)
    assert.equal(dependencyAccepts('1.9.9', range), true)
    assert.equal(dependencyAccepts('2.0.0', range), false)

    const a = info('fixture.a', { conflicts: [range] })
    const b = info('fixture.b', { version: '1.5.0' })
    const dependent = info('fixture.dependent', { dependencies: [dependency('fixture.a')] })
    const core = info('fixture.core')
    const plugins = [a, b, dependent, core]
    const resolved = resolvePluginDependencies(plugins)
    for (const id of ['fixture.a', 'fixture.b', 'fixture.dependent']) {
      const state = resolved.find(plugin => plugin.id === id)!
      assert.equal(state.available, false)
      assert.match(state.blockedReason!, /冲突/)
    }
    assert.equal(resolved.find(plugin => plugin.id === 'fixture.core')!.available, true)
    assert.equal(resolved.find(plugin => plugin.id === 'fixture.a')!.enabled, true)
    assert.equal(resolved.find(plugin => plugin.id === 'fixture.b')!.enabled, true)
    assert.deepEqual(resolvePluginDependencies([...plugins].reverse()), resolved)

    const reverseDeclaration = resolvePluginDependencies([
      info('fixture.a', { version: '1.5.0' }),
      info('fixture.b', { conflicts: [dependency('fixture.a', { maxVersionExclusive: '2.0.0' })] }),
    ])
    assert.ok(reverseDeclaration.every(plugin => !plugin.available))

    const outside = resolvePluginDependencies([
      info('fixture.a', { conflicts: [range] }),
      info('fixture.b', { version: '2.0.0' }),
      info('fixture.dependent', { dependencies: [dependency('fixture.a')] }),
    ])
    assert.ok(outside.every(plugin => plugin.available))
  })

  await test('conflict declarations survive a missing required dependency until the target is disabled', () => {
    const declarer = info('fixture.declarer', {
      dependencies: [dependency('fixture.missing')],
      conflicts: [dependency('fixture.target')],
    })
    const target = info('fixture.target')
    const blocked = resolvePluginDependencies([declarer, target])
    assert.equal(blocked.find(plugin => plugin.id === declarer.id)!.available, false)
    assert.match(blocked.find(plugin => plugin.id === declarer.id)!.blockedReason!, /冲突/)
    assert.equal(blocked.find(plugin => plugin.id === target.id)!.available, false)
    assert.match(blocked.find(plugin => plugin.id === target.id)!.blockedReason!, /冲突/)

    const disabled = resolvePluginDependencies([declarer, { ...target, enabled: false }])
    const declarerAfterDisable = disabled.find(plugin => plugin.id === declarer.id)!
    const targetAfterDisable = disabled.find(plugin => plugin.id === target.id)!
    assert.equal(declarerAfterDisable.available, false)
    assert.match(declarerAfterDisable.blockedReason!, /缺少依赖/)
    assert.doesNotMatch(declarerAfterDisable.blockedReason!, /冲突/)
    assert.equal(targetAfterDisable.available, false)
    assert.match(targetAfterDisable.blockedReason!, /已停用/)
  })

  await test('disabled and incompatible parties pause conflicts and recover without mutating intent', () => {
    const a = info('fixture.a', { conflicts: [dependency('fixture.b')] })
    const disabled = info('fixture.b', { enabled: false })
    const paused = resolvePluginDependencies([a, disabled])
    assert.equal(paused.find(plugin => plugin.id === 'fixture.a')!.available, true)
    assert.equal(paused.find(plugin => plugin.id === 'fixture.b')!.available, false)

    const incompatible = info('fixture.b', {
      compatible: false,
      incompatibleReason: 'fixture incompatible',
    })
    const ignored = resolvePluginDependencies([a, incompatible])
    assert.equal(ignored.find(plugin => plugin.id === 'fixture.a')!.available, true)
    assert.equal(ignored.find(plugin => plugin.id === 'fixture.b')!.available, false)

    const enabled = info('fixture.b')
    const active = resolvePluginDependencies([a, enabled])
    assert.ok(active.every(plugin => !plugin.available))
    assert.ok(active.every(plugin => plugin.enabled))

    const recovered = resolvePluginDependencies([a, disabled])
    assert.equal(recovered.find(plugin => plugin.id === 'fixture.a')!.available, true)
    assert.equal(recovered.find(plugin => plugin.id === 'fixture.b')!.enabled, false)
    assert.equal(a.enabled, true)
    assert.equal(disabled.enabled, false)
  })

  await test('optional cycles and missing or mismatched targets never block or order activation', () => {
    const a = info('fixture.a', {
      optionalDependencies: [
        dependency('fixture.b', { minVersion: '2.0.0' }),
        dependency('fixture.missing'),
      ],
    })
    const b = info('fixture.b', {
      optionalDependencies: [dependency('fixture.a')],
    })
    const core = info('fixture.core')
    const plugins = [a, b, core]
    const resolved = resolvePluginDependencies(plugins)
    assert.ok(resolved.every(plugin => plugin.available))
    assert.deepEqual(resolved.map(plugin => plugin.id), ['fixture.a', 'fixture.b', 'fixture.core'])
    assert.deepEqual(resolvePluginDependencies([...plugins].reverse()), resolved)

    const required = info('fixture.a', {
      dependencies: [dependency('fixture.b')],
      optionalDependencies: [dependency('fixture.optional')],
    })
    const ordered = resolvePluginDependencies([
      required,
      info('fixture.b'),
      info('fixture.optional'),
    ])
    assert.ok(ordered.every(plugin => plugin.available))
    assert.deepEqual(ordered.map(plugin => plugin.id), ['fixture.b', 'fixture.a', 'fixture.optional'])
  })

  await test('required cycles remain blocking while optional-only participants stay available', () => {
    const cycle = resolvePluginDependencies([
      info('fixture.a', { dependencies: [dependency('fixture.b')] }),
      info('fixture.b', { dependencies: [dependency('fixture.a')] }),
      info('fixture.dependent', { dependencies: [dependency('fixture.a')] }),
      info('fixture.optional', { optionalDependencies: [dependency('fixture.a')] }),
    ])
    for (const id of ['fixture.a', 'fixture.b', 'fixture.dependent']) {
      assert.equal(cycle.find(plugin => plugin.id === id)!.available, false)
      assert.match(cycle.find(plugin => plugin.id === id)!.blockedReason!, /循环|依赖不可用/)
    }
    assert.equal(cycle.find(plugin => plugin.id === 'fixture.optional')!.available, true)
  })
}
