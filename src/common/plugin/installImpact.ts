import { dependencyAccepts, resolvePluginDependencies } from './dependencies'
import type {
  PluginExtension,
  PluginExtensionPoint,
  PluginPermission,
  PluginPublicInfo,
} from './types'

export const PLUGIN_INSTALL_IMPACT_LIMIT = 64

export interface PluginAvailabilityImpact {
  pluginId: string
  /** null means the plugin did not exist in the current catalog. */
  before: boolean | null
  after: boolean
  beforeReason?: string
  afterReason?: string
}

export interface PluginOptionalDependencyImpact {
  pluginId: string
  dependencyId: string
  /** null means the optional declaration did not exist on that side. */
  before: boolean | null
  after: boolean | null
  beforeReason?: string
  afterReason?: string
}

export interface PluginStringListChange {
  added: string[]
  removed: string[]
}

export interface PluginPermissionListChange {
  added: PluginPermission[]
  removed: PluginPermission[]
}

export interface PluginExtensionListChange extends PluginStringListChange {
  changed: string[]
}

export interface PluginSettingsImpact {
  beforeVersion: number | null
  afterVersion: number
  /** A version increase requires the installer's migration path; success is not implied. */
  migrationRequired: boolean
  migrationExecuted: false
  migrationSuccessGuaranteed: false
}

export interface PluginInstallSelfImpact {
  pluginId: string
  operation: 'install' | 'upgrade'
  enabledBefore: boolean | null
  enabledAfter: boolean
  permissions: PluginPermissionListChange
  settings: PluginSettingsImpact
  credentials: PluginStringListChange
  extensionPoints: PluginExtensionListChange
  extensions: PluginExtensionListChange
}

export interface PluginInstallImpactResult {
  analysis: 'declarations-only'
  runtimeHealth: 'not-evaluated'
  operation: 'install' | 'upgrade'
  /** Sum of availability and optional-dependency changes, capped at 64. */
  affectedCount: number
  availabilityChanges: PluginAvailabilityImpact[]
  optionalDependencyChanges: PluginOptionalDependencyImpact[]
  plugin: PluginInstallSelfImpact
  /** Declarative, transitive runtime rebuild estimate; no runtime state is inspected. */
  estimatedRestartPluginIds: string[]
}

interface OptionalDependencyState {
  available: boolean
  reason?: string
}

const compareStrings = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0

const sortedUnique = <T extends string>(values: Iterable<T>): T[] => {
  return [...new Set(values)].sort(compareStrings)
}

const listChange = <T extends string>(before: Iterable<T>, after: Iterable<T>): { added: T[], removed: T[] } => {
  const beforeSet = new Set(before)
  const afterSet = new Set(after)
  return {
    added: sortedUnique([...afterSet].filter(value => !beforeSet.has(value))),
    removed: sortedUnique([...beforeSet].filter(value => !afterSet.has(value))),
  }
}

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value != null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort(compareStrings).map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

const extensionListChange = <T extends PluginExtensionPoint | PluginExtension>(
  before: readonly T[],
  after: readonly T[],
): PluginExtensionListChange => {
  const beforeById = new Map(before.map(value => [value.id, value]))
  const afterById = new Map(after.map(value => [value.id, value]))
  const ids = listChange(beforeById.keys(), afterById.keys())
  const changed = sortedUnique([...beforeById.keys()].filter(id => {
    const afterValue = afterById.get(id)
    return afterValue != null && stableSerialize(beforeById.get(id)) !== stableSerialize(afterValue)
  }))
  return { ...ids, changed }
}

const optionalStates = (
  plugin: PluginPublicInfo,
  resolvedById: ReadonlyMap<string, PluginPublicInfo>,
): Map<string, OptionalDependencyState> => {
  const states = new Map<string, OptionalDependencyState>()
  for (const dependency of plugin.optionalDependencies ?? []) {
    const target = resolvedById.get(dependency.id)
    if (!target) {
      states.set(dependency.id, {
        available: false,
        reason: `可选目标未安装：${dependency.id}`,
      })
      continue
    }
    if (!dependencyAccepts(target.version, dependency)) {
      states.set(dependency.id, {
        available: false,
        reason: `可选依赖版本不匹配：${dependency.id} ${target.version}`,
      })
      continue
    }
    if (!target.available) {
      states.set(dependency.id, {
        available: false,
        reason: `可选目标声明不可用：${dependency.id}（${target.blockedReason ?? '不可用'}）`,
      })
      continue
    }
    states.set(dependency.id, { available: true })
  }
  return states
}

const estimateRestarts = (
  candidate: PluginPublicInfo,
  enabled: boolean,
  plugins: readonly PluginPublicInfo[],
): string[] => {
  if (!enabled) return []
  const ids = new Set([candidate.id])
  const enabledPlugins = plugins.filter(plugin => plugin.enabled)
  let size = -1
  while (size !== ids.size) {
    size = ids.size
    for (const plugin of enabledPlugins) {
      if (plugin.dependencies?.some(dependency => ids.has(dependency.id))) ids.add(plugin.id)
    }
  }
  return sortedUnique(ids)
}

/**
 * Estimates the declarative effect of installing or upgrading one already
 * verified, normalised plugin. It performs no I/O and does not assess runtime health.
 */
export const buildPluginInstallImpact = (
  current: PluginPublicInfo[],
  candidate: PluginPublicInfo,
): PluginInstallImpactResult => {
  const currentById = new Map<string, PluginPublicInfo>()
  for (const plugin of current) {
    if (currentById.has(plugin.id)) throw new Error(`当前插件目录包含重复 ID：${plugin.id}`)
    currentById.set(plugin.id, plugin)
  }

  const previous = currentById.get(candidate.id)
  const enabledAfter = previous ? previous.enabled : candidate.enabled
  const effectiveCandidate = { ...candidate, enabled: enabledAfter }
  const future = current.map(plugin => plugin.id === candidate.id ? effectiveCandidate : plugin)
  if (!previous) future.push(effectiveCandidate)

  const currentResolved = resolvePluginDependencies(current)
  const futureResolved = resolvePluginDependencies(future)
  const currentResolvedById = new Map(currentResolved.map(plugin => [plugin.id, plugin]))
  const futureResolvedById = new Map(futureResolved.map(plugin => [plugin.id, plugin]))

  const availabilityChanges: PluginAvailabilityImpact[] = []
  for (const pluginId of sortedUnique(currentResolvedById.keys())) {
    const before = currentResolvedById.get(pluginId)!
    const after = futureResolvedById.get(pluginId)
    if (!after) continue
    const beforeAvailable = before.available === true
    const afterAvailable = after.available === true
    if (beforeAvailable === afterAvailable) continue
    availabilityChanges.push({
      pluginId,
      before: beforeAvailable,
      after: afterAvailable,
      ...(!beforeAvailable && before.blockedReason ? { beforeReason: before.blockedReason } : {}),
      ...(!afterAvailable && after.blockedReason ? { afterReason: after.blockedReason } : {}),
    })
  }
  if (!previous) {
    const after = futureResolvedById.get(candidate.id)!
    availabilityChanges.push({
      pluginId: candidate.id,
      before: null,
      after: after.available === true,
      ...(after.available !== true && after.blockedReason ? { afterReason: after.blockedReason } : {}),
    })
  }
  availabilityChanges.sort((left, right) => compareStrings(left.pluginId, right.pluginId))

  const currentOptionalByKey = new Map<string, { dependencyId: string, state: OptionalDependencyState }>()
  for (const plugin of current) {
    for (const [dependencyId, state] of optionalStates(plugin, currentResolvedById)) {
      currentOptionalByKey.set(`${plugin.id}\0${dependencyId}`, { dependencyId, state })
    }
  }
  const futureOptionalByKey = new Map<string, { pluginId: string, dependencyId: string, state: OptionalDependencyState }>()
  for (const plugin of future) {
    for (const [dependencyId, state] of optionalStates(plugin, futureResolvedById)) {
      futureOptionalByKey.set(`${plugin.id}\0${dependencyId}`, { pluginId: plugin.id, dependencyId, state })
    }
  }

  const optionalDependencyChanges: PluginOptionalDependencyImpact[] = []
  const optionalKeys = sortedUnique([
    ...currentOptionalByKey.keys(),
    ...futureOptionalByKey.keys(),
  ])
  for (const key of optionalKeys) {
    const [pluginId, dependencyId] = key.split('\0')
    const before = currentOptionalByKey.get(key)?.state
    const after = futureOptionalByKey.get(key)?.state
    const beforeAvailable = before?.available ?? null
    const afterAvailable = after?.available ?? null
    if (beforeAvailable === afterAvailable) continue
    optionalDependencyChanges.push({
      pluginId,
      dependencyId,
      before: beforeAvailable,
      after: afterAvailable,
      ...(before?.reason ? { beforeReason: before.reason } : {}),
      ...(after?.reason ? { afterReason: after.reason } : {}),
    })
  }
  optionalDependencyChanges.sort((left, right) => {
    return compareStrings(left.pluginId, right.pluginId) ||
      compareStrings(left.dependencyId, right.dependencyId)
  })

  const affectedCount = availabilityChanges.length + optionalDependencyChanges.length
  if (affectedCount > PLUGIN_INSTALL_IMPACT_LIMIT) {
    throw new Error(
      `插件安装影响共 ${affectedCount} 条（可用性 ${availabilityChanges.length}、可选依赖 ${optionalDependencyChanges.length}），` +
      `超过 ${PLUGIN_INSTALL_IMPACT_LIMIT} 条；请人工审查后再继续。`,
    )
  }

  const permissions = listChange(previous?.permissions ?? [], candidate.permissions)
  const credentialKeys = listChange(
    (previous?.credentials ?? []).map(credential => credential.key),
    (candidate.credentials ?? []).map(credential => credential.key),
  )
  const beforeSettingsVersion = previous ? (previous.settingsVersion ?? 1) : null
  const afterSettingsVersion = candidate.settingsVersion ?? 1

  return {
    analysis: 'declarations-only',
    runtimeHealth: 'not-evaluated',
    operation: previous ? 'upgrade' : 'install',
    affectedCount,
    availabilityChanges,
    optionalDependencyChanges,
    plugin: {
      pluginId: candidate.id,
      operation: previous ? 'upgrade' : 'install',
      enabledBefore: previous ? previous.enabled : null,
      enabledAfter,
      permissions,
      settings: {
        beforeVersion: beforeSettingsVersion,
        afterVersion: afterSettingsVersion,
        migrationRequired: beforeSettingsVersion != null && afterSettingsVersion > beforeSettingsVersion,
        migrationExecuted: false,
        migrationSuccessGuaranteed: false,
      },
      credentials: credentialKeys,
      extensionPoints: extensionListChange(
        previous?.extensionPoints ?? [],
        candidate.extensionPoints ?? [],
      ),
      extensions: extensionListChange(
        previous?.extensions ?? [],
        candidate.extensions ?? [],
      ),
    },
    estimatedRestartPluginIds: estimateRestarts(
      effectiveCandidate,
      enabledAfter,
      future,
    ),
  }
}
