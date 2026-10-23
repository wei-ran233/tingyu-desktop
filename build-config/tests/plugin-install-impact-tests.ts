import { pluginDisplayLabel } from '@common/plugin/display'
import assert from 'node:assert/strict'
import {
  PLUGIN_INSTALL_IMPACT_LIMIT,
  buildPluginInstallImpact,
} from '@common/plugin/installImpact'
import type {
  PluginDependency,
  PluginExtension,
  PluginExtensionPoint,
  PluginPublicInfo,
} from '@common/plugin/types'

const info = (id: string, changes: Partial<PluginPublicInfo> = {}): PluginPublicInfo => ({
  id,
  name: id,
  version: '1.0.0',
  apiVersion: '1.12.0',
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

const dependency = (id: string, changes: Partial<PluginDependency> = {}): PluginDependency => ({
  id,
  ...changes,
})

const extensionPoint = (id: string): PluginExtensionPoint => ({
  id,
  version: '1.0.0',
  kind: 'action',
  input: { type: 'string', maxLength: 20 },
  output: { type: 'boolean' },
})

const extension = (id: string, target = 'fixture.owner/run'): PluginExtension => ({
  id,
  target,
  version: '1.0.0',
  handler: 'run',
})

const deepFreeze = <T>(value: T): T => {
  if (value != null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

export const pluginInstallImpactTests = async(
  test: (name: string, run: () => void | Promise<void>) => Promise<void>,
) => {
  await test('untrusted plugin labels cannot create host confirmation paragraphs or reverse their direction', () => {
    assert.equal(pluginDisplayLabel('Trusted Sync\n\nPermissions:\nNone'), 'Trusted Sync Permissions: None')
    assert.equal(pluginDisplayLabel('作者\r\n\u202e无权限\u202c\u2066name\u2069\u0085\u2028end'), '作者 无权限 name end')
    assert.equal(pluginDisplayLabel('听域 Theme Studio'), '听域 Theme Studio')
  })
  await test('install and upgrade report own declarations without settings or credential values', () => {
    const installed = buildPluginInstallImpact([], info('fixture.new', {
      permissions: ['settings.scoped', 'credentials.scoped'],
      settingsVersion: 2,
      settings: [{
        key: 'mode',
        title: 'Mode',
        type: 'string',
        default: 'DO_NOT_EXPOSE_SETTING_VALUE',
      }],
      credentials: [{ key: 'token', title: 'Token' }],
      extensionPoints: [extensionPoint('new-point')],
      extensions: [extension('new-extension')],
      runtime: { entry: 'runtime.html' },
    }))

    assert.equal(installed.operation, 'install')
    assert.equal(installed.plugin.enabledBefore, null)
    assert.equal(installed.plugin.enabledAfter, true)
    assert.deepEqual(installed.plugin.permissions.added, ['credentials.scoped', 'settings.scoped'])
    assert.deepEqual(installed.plugin.permissions.removed, [])
    assert.deepEqual(installed.plugin.settings, {
      beforeVersion: null,
      afterVersion: 2,
      migrationRequired: false,
      migrationExecuted: false,
      migrationSuccessGuaranteed: false,
    })
    assert.deepEqual(installed.plugin.credentials, { added: ['token'], removed: [] })
    assert.deepEqual(installed.plugin.extensionPoints, {
      added: ['new-point'],
      removed: [],
      changed: [],
    })
    assert.deepEqual(installed.plugin.extensions, {
      added: ['new-extension'],
      removed: [],
      changed: [],
    })
    assert.deepEqual(installed.estimatedRestartPluginIds, ['fixture.new'])
    assert.doesNotMatch(JSON.stringify(installed), /DO_NOT_EXPOSE_SETTING_VALUE/)

    const upgraded = buildPluginInstallImpact([info('fixture.owner', {
      permissions: ['collection.read', 'settings.scoped'],
      settingsVersion: 1,
      settings: [{
        key: 'legacy',
        title: 'Legacy',
        type: 'string',
        default: 'OLD_SECRET_DEFAULT',
      }],
      credentials: [{ key: 'legacyToken', title: 'Legacy token' }],
      extensionPoints: [extensionPoint('changed-point'), extensionPoint('removed-point')],
      extensions: [extension('changed-extension'), extension('removed-extension')],
    })], info('fixture.owner', {
      version: '2.0.0',
      permissions: ['settings.scoped', 'extensions.act'],
      settingsVersion: 2,
      settings: [{
        key: 'mode',
        title: 'Mode',
        type: 'string',
        default: 'NEW_SECRET_DEFAULT',
      }],
      credentials: [{ key: 'newToken', title: 'New token' }],
      extensionPoints: [
        { ...extensionPoint('changed-point'), version: '2.0.0' },
        extensionPoint('added-point'),
      ],
      extensions: [
        { ...extension('changed-extension'), target: 'fixture.owner/new-run' },
        extension('added-extension', 'fixture.owner/new-run'),
      ],
    }))

    assert.equal(upgraded.operation, 'upgrade')
    assert.deepEqual(upgraded.plugin.permissions, {
      added: ['extensions.act'],
      removed: ['collection.read'],
    })
    assert.equal(upgraded.plugin.settings.beforeVersion, 1)
    assert.equal(upgraded.plugin.settings.afterVersion, 2)
    assert.equal(upgraded.plugin.settings.migrationRequired, true)
    assert.equal(upgraded.plugin.settings.migrationExecuted, false)
    assert.equal(upgraded.plugin.settings.migrationSuccessGuaranteed, false)
    assert.deepEqual(upgraded.plugin.credentials, {
      added: ['newToken'],
      removed: ['legacyToken'],
    })
    assert.deepEqual(upgraded.plugin.extensionPoints, {
      added: ['added-point'],
      removed: ['removed-point'],
      changed: ['changed-point'],
    })
    assert.deepEqual(upgraded.plugin.extensions, {
      added: ['added-extension'],
      removed: ['removed-extension'],
      changed: ['changed-extension'],
    })
    assert.doesNotMatch(JSON.stringify(upgraded), /OLD_SECRET_DEFAULT|NEW_SECRET_DEFAULT/)
  })

  await test('candidate conflicts block both sides and propagate through required dependencies, then recover', () => {
    const current = [
      info('fixture.a', { version: '1.0.0' }),
      info('fixture.b'),
      info('fixture.c', { dependencies: [dependency('fixture.a')] }),
      info('fixture.d', { dependencies: [dependency('fixture.c')] }),
    ]
    const blockedCandidate = info('fixture.a', {
      version: '2.0.0',
      conflicts: [dependency('fixture.b', { maxVersionExclusive: '2.0.0' })],
    })
    const blocked = buildPluginInstallImpact(current, blockedCandidate)

    assert.deepEqual(blocked.availabilityChanges.map(change => change.pluginId), [
      'fixture.a',
      'fixture.b',
      'fixture.c',
      'fixture.d',
    ])
    assert.ok(blocked.availabilityChanges.every(change => change.before === true && !change.after))
    assert.match(blocked.availabilityChanges[0].afterReason!, /冲突/)
    assert.match(blocked.availabilityChanges[1].afterReason!, /冲突/)
    assert.match(blocked.availabilityChanges[2].afterReason!, /依赖不可用/)
    assert.match(blocked.availabilityChanges[3].afterReason!, /依赖不可用/)
    assert.deepEqual(blocked.estimatedRestartPluginIds, [
      'fixture.a',
      'fixture.c',
      'fixture.d',
    ])

    const conflictedCurrent = current.map(plugin => plugin.id === 'fixture.a' ? blockedCandidate : plugin)
    const recovered = buildPluginInstallImpact(
      conflictedCurrent,
      info('fixture.a', { version: '3.0.0' }),
    )
    assert.deepEqual(recovered.availabilityChanges.map(change => change.pluginId), [
      'fixture.a',
      'fixture.b',
      'fixture.c',
      'fixture.d',
    ])
    assert.ok(recovered.availabilityChanges.every(change => change.before === false && change.after))
  })

  await test('optional dependencies report range and missing-target states without blocking the owner', () => {
    const owner = info('fixture.owner', {
      optionalDependencies: [
        dependency('fixture.optional', {
          minVersion: '2.0.0',
          maxVersionExclusive: '3.0.0',
        }),
        dependency('fixture.missing'),
      ],
    })
    const installed = buildPluginInstallImpact([
      info('fixture.optional', { version: '1.0.0' }),
    ], owner)

    assert.deepEqual(installed.availabilityChanges, [{
      pluginId: 'fixture.owner',
      before: null,
      after: true,
    }])
    assert.deepEqual(installed.optionalDependencyChanges, [{
      pluginId: 'fixture.owner',
      dependencyId: 'fixture.missing',
      before: null,
      after: false,
      afterReason: '可选目标未安装：fixture.missing',
    }, {
      pluginId: 'fixture.owner',
      dependencyId: 'fixture.optional',
      before: null,
      after: false,
      afterReason: '可选依赖版本不匹配：fixture.optional 1.0.0',
    }])

    const upgraded = buildPluginInstallImpact([
      owner,
      info('fixture.optional', { version: '1.0.0' }),
    ], info('fixture.optional', { version: '2.0.0' }))
    assert.deepEqual(upgraded.availabilityChanges, [])
    assert.deepEqual(upgraded.optionalDependencyChanges, [{
      pluginId: 'fixture.owner',
      dependencyId: 'fixture.optional',
      before: false,
      after: true,
      beforeReason: '可选依赖版本不匹配：fixture.optional 1.0.0',
    }])
    assert.equal(upgraded.plugin.pluginId, 'fixture.optional')
  })

  await test('upgrades retain the existing enabled flag and avoid unnecessary restart estimates', () => {
    const impact = buildPluginInstallImpact([
      info('fixture.core', { enabled: false }),
      info('fixture.dependent', { dependencies: [dependency('fixture.core')] }),
    ], info('fixture.core', { version: '2.0.0', enabled: true }))

    assert.equal(impact.operation, 'upgrade')
    assert.equal(impact.plugin.enabledBefore, false)
    assert.equal(impact.plugin.enabledAfter, false)
    assert.deepEqual(impact.availabilityChanges, [])
    assert.deepEqual(impact.estimatedRestartPluginIds, [])
  })

  await test('input remains unchanged, output is serialisable and ordering is stable', () => {
    const current = deepFreeze([
      info('fixture.z', { optionalDependencies: [dependency('fixture.candidate')] }),
      info('fixture.a', { dependencies: [dependency('fixture.core')] }),
      info('fixture.core'),
    ])
    const candidate = deepFreeze(info('fixture.candidate'))
    const original = JSON.stringify({ current, candidate })
    const first = buildPluginInstallImpact(current, candidate)
    const second = buildPluginInstallImpact([...current].reverse(), candidate)

    assert.equal(JSON.stringify({ current, candidate }), original)
    assert.deepEqual(first, second)
    assert.deepEqual(JSON.parse(JSON.stringify(first)), first)
    assert.equal(first.analysis, 'declarations-only')
    assert.equal(first.runtimeHealth, 'not-evaluated')
    assert.deepEqual(first.availabilityChanges.map(change => change.pluginId), ['fixture.candidate'])
    assert.deepEqual(first.optionalDependencyChanges.map(change => change.pluginId), ['fixture.z'])
    assert.deepEqual(first.estimatedRestartPluginIds, ['fixture.candidate'])
  })

  await test('more than 64 combined availability and optional changes requires manual review', () => {
    const owners = (count: number) => Array.from({ length: count }, (_, index) => info(
      `fixture.owner-${String(index).padStart(2, '0')}`,
      { optionalDependencies: [dependency('fixture.candidate')] },
    ))
    const atLimit = buildPluginInstallImpact(
      owners(PLUGIN_INSTALL_IMPACT_LIMIT - 1),
      info('fixture.candidate'),
    )
    assert.equal(atLimit.affectedCount, PLUGIN_INSTALL_IMPACT_LIMIT)

    assert.throws(
      () => buildPluginInstallImpact(
        owners(PLUGIN_INSTALL_IMPACT_LIMIT),
        info('fixture.candidate'),
      ),
      /超过 64 条.*人工审查/,
    )
  })
}
