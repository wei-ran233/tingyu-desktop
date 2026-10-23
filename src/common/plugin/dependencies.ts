import type { PluginDependency, PluginPublicInfo } from './types'

// Captures 1-4 are consumed by comparePluginVersions; build metadata stays non-capturing.
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
export const isDependencyVersion = (value: unknown): value is string => typeof value === 'string' && value.length <= 100 && VERSION.test(value)
/** SemVer precedence; build metadata has no effect on dependency bounds. */
export const comparePluginVersions = (left: string, right: string): number => {
  const a = VERSION.exec(left); const b = VERSION.exec(right)
  if (!a || !b) throw new Error('Invalid dependency version')
  for (let index = 1; index <= 3; index++) {
    const x = BigInt(a[index]); const y = BigInt(b[index])
    if (x !== y) return x > y ? 1 : -1
  }
  if (a[4] === b[4]) return 0
  if (!a[4] || !b[4]) return a[4] ? -1 : 1
  const x = a[4].split('.'); const y = b[4].split('.')
  for (let index = 0; index < Math.max(x.length, y.length); index++) {
    if (x[index] === y[index]) continue
    if (x[index] === undefined || y[index] === undefined) return x[index] === undefined ? -1 : 1
    const xn = /^\d+$/.test(x[index]); const yn = /^\d+$/.test(y[index])
    if (xn && yn) { const diff = BigInt(x[index]) - BigInt(y[index]); if (diff) return diff > 0n ? 1 : -1; continue }
    if (xn !== yn) return xn ? -1 : 1
    return x[index] > y[index] ? 1 : -1
  }
  return 0
}
export const dependencyAccepts = (version: string, dependency: PluginDependency) => isDependencyVersion(version) &&
  (!dependency.minVersion || comparePluginVersions(version, dependency.minVersion) >= 0) &&
  (!dependency.maxVersionExclusive || comparePluginVersions(version, dependency.maxVersionExclusive) < 0)

/** Stable topological contribution order. It does not execute plugin services. */
export const resolvePluginDependencies = (plugins: PluginPublicInfo[]): PluginPublicInfo[] => {
  const byId = new Map(plugins.map(plugin => [plugin.id, plugin]))
  const resolved = new Map<string, PluginPublicInfo>()
  const visiting = new Set<string>()
  const conflictReasons = new Map<string, string>()
  const recordConflict = (id: string, otherId: string, otherVersion: string) => {
    const reason = `插件冲突：${otherId} ${otherVersion}`
    const current = conflictReasons.get(id)
    if (!current || reason.localeCompare(current) < 0) conflictReasons.set(id, reason)
  }
  for (const plugin of [...plugins].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!plugin.enabled || !plugin.compatible) continue
    for (const conflict of [...(plugin.conflicts ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
      const target = byId.get(conflict.id)
      if (!target || target.id === plugin.id || !target.enabled || !target.compatible) continue
      let matches = false
      try { matches = dependencyAccepts(target.version, conflict) } catch {}
      if (!matches) continue
      recordConflict(plugin.id, target.id, target.version)
      recordConflict(target.id, plugin.id, plugin.version)
    }
  }
  let activationIndex = 0
  const visit = (plugin: PluginPublicInfo): PluginPublicInfo => {
    const cached = resolved.get(plugin.id)
    if (cached) return cached
    if (visiting.has(plugin.id)) return { ...plugin, available: false, blockedReason: `依赖循环：${plugin.id}` }
    visiting.add(plugin.id)
    let reason = !plugin.enabled ? '插件已停用' : !plugin.compatible ? (plugin.incompatibleReason ?? '插件不兼容') : conflictReasons.get(plugin.id)
    for (const dependency of [...(plugin.dependencies ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
      if (reason) break
      const target = byId.get(dependency.id)
      if (!target) { reason = `缺少依赖：${dependency.id}`; break }
      if (!dependencyAccepts(target.version, dependency)) { reason = `依赖版本不匹配：${dependency.id} ${target.version}`; break }
      const state = visit(target)
      if (!state.available) reason = `依赖不可用：${dependency.id}（${state.blockedReason}）`
    }
    visiting.delete(plugin.id)
    const state = { ...plugin, available: !reason, blockedReason: reason, activationIndex: reason ? undefined : activationIndex++ }
    resolved.set(plugin.id, state)
    return state
  }
  for (const plugin of [...plugins].sort((a, b) => a.id.localeCompare(b.id))) visit(plugin)
  return [...resolved.values()].sort((a, b) => (a.activationIndex ?? Infinity) - (b.activationIndex ?? Infinity) || a.id.localeCompare(b.id))
}
