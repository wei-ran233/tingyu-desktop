import type { PluginActionInfo, PluginDependency, PluginEventReceipt, PluginExtension, PluginExtensionPoint, PluginLifecycleState, PluginPublicInfo } from '@common/plugin/types'
import { assertMessageSize } from '@common/collection/validation'
import { PLUGIN_UI_KINDS, validatePluginUiDocument } from '@common/plugin/ui'
import { PluginRequestLimit } from './requestLimit'
import { dependencyAccepts } from '@common/plugin/dependencies'
import { matchesExtensionSchema, equalExtensionSchemas } from '@common/plugin/extensions'

export class PluginRuntimeBusyError extends Error {
  constructor() { super('Plugin runtime is busy'); this.name = 'PluginRuntimeBusyError' }
}

export interface RuntimePlugin extends PluginPublicInfo { runtimeKey: string }
export interface RuntimeInstance {
  invoke: (handler: string, value: unknown, signal: AbortSignal) => Promise<unknown>
  dispose: () => Promise<void>
  destroy: () => void
}
export type EventPublisher = (target: string, value: unknown) => Promise<PluginEventReceipt>
export interface RuntimeBackend { start: (plugin: RuntimePlugin, signal: AbortSignal, failed: (error: Error) => void, publishEvent: EventPublisher) => Promise<RuntimeInstance> }
interface RecordState {
  plugin: RuntimePlugin
  state: PluginLifecycleState
  reason?: string
  controller: AbortController
  settingsController: AbortController
  instance?: RuntimeInstance
}
const aborted = () => new Error('Plugin operation cancelled')
const bounded = async <T>(task: Promise<T>, timeout: number, signal?: AbortSignal): Promise<T> => new Promise<T>((resolve, reject) => {
  const timer = setTimeout(() => { finish(); reject(new Error('Plugin operation timed out')) }, timeout)
  const cancel = () => { finish(); reject(aborted()) }
  const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
  // Consume settlement even when the caller was already cancelled.
  task.then(value => { finish(); resolve(value) }, error => { finish(); reject(error) })
  if (signal?.aborted) { cancel(); return }
  signal?.addEventListener('abort', cancel, { once: true })
})

/** Serialized reconciliation, awaited activation, reverse dependency disposal. */
export class PluginLifecycle {
  private readonly records = new Map<string, RecordState>()
  private queue: Promise<unknown> = Promise.resolve()
  private desired: RuntimePlugin[] = []
  private revision = 0
  private readonly actions = new PluginRequestLimit(1, () => new PluginRuntimeBusyError())
  private readonly eventQueues = new Map<RecordState, { tail: Promise<unknown>, size: number }>()
  private eventCount = 0
  private readonly failures = new Map<string, string>()
  readonly events: Array<{ pluginId: string, state: PluginLifecycleState }> = []
  constructor(private readonly backend: RuntimeBackend, private readonly changed: () => void = () => {}) {}

  status(id: string): { state: PluginLifecycleState, reason?: string } {
    const record = this.records.get(id)
    return record ? { state: record.state, reason: record.reason } : { state: 'installed' }
  }

  private publish(record: RecordState, state: PluginLifecycleState, reason?: string) {
    record.state = state; record.reason = reason
    this.events.push({ pluginId: record.plugin.id, state })
    if (this.events.length > 200) this.events.shift()
    this.changed()
  }

  private affected(ids: Set<string>): Set<string> {
    let size = -1
    while (size !== ids.size) {
      size = ids.size
      for (const record of this.records.values()) if (record.plugin.dependencies?.some(dep => ids.has(dep.id))) ids.add(record.plugin.id)
    }
    return ids
  }

  /** Immediately revoke requests, then await the serial reverse-order stop. */
  async suspend(id: string): Promise<void> {
    const affected = this.affected(new Set([id]))
    if (![...affected].some(pluginId => this.records.has(pluginId))) return
    this.revision++
    for (const pluginId of affected) { const record = this.records.get(pluginId); if (record) { record.controller.abort(); this.publish(record, 'stopping') } }
    const pending = this.queue.then(async() => this.stop(affected), async() => this.stop(affected))
    this.queue = pending.catch(() => {})
    await pending
  }

  private async stop(ids: Set<string>) {
    // Map insertion order is activation order, including dependency diamonds.
    for (const [id, record] of [...this.records].reverse()) {
      if (!ids.has(id)) continue
      record.controller.abort()
      this.publish(record, 'stopping')
      try { if (record.instance) await bounded(record.instance.dispose(), 1000) } catch {} finally { record.instance?.destroy(); this.records.delete(id) }
    }
  }

  /** Revoke only calls affected by committed configuration; keep runtimes alive. */
  settingsChanged(id: string): string[] {
    const targets = new Set<string>()
    for (const pluginId of this.affected(new Set([id]))) {
      const record = this.records.get(pluginId)
      if (!record || record.state !== 'active') continue
      record.settingsController.abort()
      record.settingsController = new AbortController()
      for (const extension of record.plugin.extensions ?? []) targets.add(extension.target)
      for (const point of record.plugin.extensionPoints ?? []) targets.add(`${pluginId}/${point.id}`)
    }
    return [...targets].sort()
  }

  retry(id: string) { this.failures.delete(id) }
  async reconcile(plugins: RuntimePlugin[]): Promise<void> {
    this.desired = plugins
    const request = ++this.revision
    const byId = new Map(plugins.map(plugin => [plugin.id, plugin]))
    const invalid = this.affected(new Set([...this.records].filter(([id, record]) => record.state !== 'active' || !byId.get(id)?.available || byId.get(id)?.runtimeKey !== record.plugin.runtimeKey).map(([id]) => id)))
    for (const id of invalid) { const record = this.records.get(id); if (record) { record.controller.abort(); this.publish(record, 'stopping') } }
    const work = async() => {
      await this.stop(invalid)
      if (request !== this.revision) return
      for (const plugin of plugins) {
        if (request !== this.revision) return
        if (this.records.has(plugin.id)) continue
        const record: RecordState = { plugin, controller: new AbortController(), settingsController: new AbortController(), state: 'resolving' }
        this.records.set(plugin.id, record)
        this.publish(record, 'resolving')
        if (!plugin.available) { this.publish(record, plugin.enabled ? 'blocked' : 'disabled', plugin.blockedReason); continue }
        const failure = this.failures.get(plugin.id)
        if (failure) { this.publish(record, 'failed', failure); continue }
        const dependency = plugin.dependencies?.find(dep => this.records.get(dep.id)?.state !== 'active')
        if (dependency) { this.publish(record, 'blocked', `依赖尚未就绪：${dependency.id}`); continue }
        const contractError = this.contractError(plugin)
        if (contractError) { this.publish(record, 'blocked', contractError); continue }
        this.publish(record, 'activating')
        try {
          if (plugin.runtime) {
            const starting = this.backend.start(plugin, record.controller.signal, error => { this.fail(plugin.id, error, record) }, async(target, value) => this.publishEvent(plugin.id, target, value, record.controller.signal))
            // Also clean a backend that returns after timeout or cancellation.
            void starting.then(instance => { if (record.controller.signal.aborted) instance.destroy() }, () => {})
            record.instance = await bounded(starting, plugin.runtime.timeoutMs ?? 5000, record.controller.signal)
          }
          if (request !== this.revision || record.controller.signal.aborted) throw aborted()
          this.publish(record, 'active')
        } catch (error: any) {
          const cancelled = record.controller.signal.aborted || request !== this.revision
          record.controller.abort(); record.instance?.destroy()
          if (!cancelled) this.failures.set(plugin.id, String(error?.message ?? error))
          this.publish(record, cancelled ? 'blocked' : 'failed', cancelled ? '插件操作已取消' : String(error?.message ?? error))
        }
      }
    }
    const pending = this.queue.then(work, work)
    this.queue = pending.catch(() => {})
    await pending
  }

  /** Optional contributions are attached to the target generation, not A's core. */
  optionalDependencyStates(id: string): NonNullable<PluginPublicInfo['optionalDependencyStates']> {
    const record = this.records.get(id)
    return (record?.plugin.optionalDependencies ?? []).map(dependency => {
      const reason = record?.state !== 'active' || record.controller.signal.aborted
        ? '插件核心尚未就绪'
        : this.optionalIntegrationError(record.plugin, dependency)
      return { id: dependency.id, available: !reason, ...(reason ? { reason } : {}) }
    })
  }

  private extensionError(plugin: RuntimePlugin, extension: PluginExtension): string | undefined {
    const [owner, id] = extension.target.split('/')
    const point = this.records.get(owner)?.plugin.extensionPoints?.find(point => point.id === id)
    if (!plugin.permissions.includes(point && (PLUGIN_UI_KINDS as readonly string[]).includes(point.kind) ? 'extensions.render' : point?.kind === 'event' ? 'extensions.subscribe' : point?.kind === 'provider' ? 'extensions.provide' : point?.kind === 'action' ? 'extensions.act' : 'extensions.process') || !point || point.version !== extension.version || (point.kind === 'processor' && !equalExtensionSchemas(point.input, point.output))) return `扩展点、版本或权限不可用：${extension.target}`
  }

  private optionalIntegrationError(plugin: RuntimePlugin, dependency: PluginDependency): string | undefined {
    const target = this.records.get(dependency.id)
    if (!target) return `可选目标未安装或尚未就绪：${dependency.id}`
    if (!dependencyAccepts(target.plugin.version, dependency)) return `可选依赖版本不匹配：${dependency.id} ${target.plugin.version}`
    if (target.state !== 'active' || target.controller.signal.aborted) return `可选目标不可用：${dependency.id}（${target.reason ?? target.state}）`
    for (const extension of plugin.extensions ?? []) {
      if (extension.target.split('/')[0] !== dependency.id) continue
      const reason = this.extensionError(plugin, extension)
      if (reason) return reason
    }
  }

  private contractError(plugin: RuntimePlugin): string | undefined {
    if (plugin.extensions?.length && !plugin.runtime) return '扩展运行时不可用'
    for (const extension of plugin.extensions ?? []) {
      const owner = extension.target.split('/')[0]
      if (plugin.optionalDependencies?.some(dep => dep.id === owner)) continue
      if (!plugin.dependencies?.some(dep => dep.id === owner)) return `未声明扩展依赖：${extension.target}`
      const reason = this.extensionError(plugin, extension)
      if (reason) return reason
    }
  }

  private fail(id: string, error: Error, expected: RecordState) {
    const record = this.records.get(id)
    if (!record || record !== expected || record.state === 'stopping' || record.controller.signal.aborted) return
    // A failed runtime stays quarantined until explicit reenable/update/retry.
    this.failures.set(id, error.message)
    const affected = this.affected(new Set([id]))
    for (const target of affected) { const state = this.records.get(target); if (state) { state.controller.abort(); this.publish(state, target === id ? 'failed' : 'blocked', target === id ? error.message : `依赖失败：${id}`) } }
    // Never reconcile an old catalog automatically while an install/rollback
    // may be committing new files. Only publish failure tombstones after stop.
    const stopping = this.suspend(id)
    const request = this.revision
    void stopping.then(() => {
      if (request !== this.revision) return
      for (const plugin of this.desired) {
        if (!affected.has(plugin.id)) continue
        const stopped: RecordState = { plugin, controller: new AbortController(), settingsController: new AbortController(), state: plugin.id === id ? 'failed' : 'blocked' }
        stopped.controller.abort()
        this.records.set(plugin.id, stopped)
        this.publish(stopped, stopped.state, plugin.id === id ? error.message : `依赖失败：${id}`)
      }
    }).catch(() => {})
  }

  private contributionError(plugin: RuntimePlugin, extension: PluginExtension): string | undefined {
    const owner = extension.target.split('/')[0]
    const optional = plugin.optionalDependencies?.find(dep => dep.id === owner)
    if (optional) return this.optionalIntegrationError(plugin, optional)
    return this.extensionError(plugin, extension)
  }

  private contributors(target: string) {
    return [...this.records.values()].filter(record => record.state === 'active').flatMap(record => (record.plugin.extensions ?? []).filter(extension => extension.target === target && !this.contributionError(record.plugin, extension)).map(extension => ({ record, extension })))
      .sort((a, b) => (a.extension.priority ?? 0) - (b.extension.priority ?? 0) || a.record.plugin.id.localeCompare(b.record.plugin.id) || a.extension.id.localeCompare(b.extension.id))
  }

  async process(target: string, input: unknown, signal?: AbortSignal): Promise<unknown> {
    return this.execute(target, input, 'processor', signal)
  }

  async provide(target: string, input: unknown, signal?: AbortSignal): Promise<unknown> {
    return this.execute(target, input, 'provider', signal)
  }

  listActions(target: string): PluginActionInfo[] {
    const [owner, id] = target.split('/')
    const provider = this.records.get(owner)
    if (provider?.state !== 'active' || !provider.plugin.extensionPoints?.some(point => point.id === id && point.kind === 'action')) return []
    return this.contributors(target).map(({ record, extension }) => ({ id: `${record.plugin.id}/${extension.id}`, title: extension.title ?? record.plugin.name, pluginId: record.plugin.id, pluginName: record.plugin.name }))
  }

  async act(target: string, actionId: string, input: unknown, signal?: AbortSignal): Promise<unknown> {
    return this.actions.run(`${target}/${actionId}`, async() => this.execute(target, input, 'action', signal, actionId))
  }

  listRenderers(target: string): PluginActionInfo[] {
    const [owner, id] = target.split('/')
    const provider = this.records.get(owner)
    if (provider?.state !== 'active' || !provider.plugin.extensionPoints?.some(point => point.id === id && (PLUGIN_UI_KINDS as readonly string[]).includes(point.kind))) return []
    return this.contributors(target).map(({ record, extension }) => ({ id: `${record.plugin.id}/${extension.id}`, title: extension.title ?? record.plugin.name, pluginId: record.plugin.id, pluginName: record.plugin.name }))
  }

  async render(target: string, renderId: string, input: unknown, signal?: AbortSignal): Promise<unknown> {
    const [owner, id] = target.split('/')
    const point = this.records.get(owner)?.plugin.extensionPoints?.find(point => point.id === id)
    if (!point || !(PLUGIN_UI_KINDS as readonly string[]).includes(point.kind)) throw new Error('UI extension unavailable')
    return this.actions.run(`ui/${target}/${renderId}`, async() => this.execute(target, input, point.kind, signal, renderId))
  }

  /** Owner-authenticated, bounded FIFO notifications; subscriptions are declarative. */
  async publishEvent(publisherId: string, target: string, input: unknown, signal?: AbortSignal): Promise<PluginEventReceipt> {
    const [owner, id, extra] = target.split('/')
    const publisher = this.records.get(owner)
    const point = publisher?.plugin.extensionPoints?.find(point => point.id === id && point.kind === 'event')
    if (extra != null || owner !== publisherId || !publisher || publisher.state !== 'active' || publisher.controller.signal.aborted || !publisher.plugin.permissions.includes('events.publish') || (signal != null && signal !== publisher.controller.signal) || !point || !matchesExtensionSchema(point.input, input)) throw new Error('Event point unavailable or invalid publisher/input')
    assertMessageSize(input, 64 * 1024)
    const ownerSettings = publisher.settingsController.signal
    const subscribers = this.contributors(target).map(step => ({ ...step, settings: step.record.settingsController.signal }))
    if (subscribers.length > 64) throw new PluginRuntimeBusyError()
    const queue = this.eventQueues.get(publisher) ?? { tail: Promise.resolve(), size: 0 }
    if (queue.size >= 16 || this.eventCount >= 64) throw new PluginRuntimeBusyError()
    const value = structuredClone(input)
    const currentOwner = () => this.records.get(owner) === publisher && publisher.state === 'active' && !publisher.controller.signal.aborted && publisher.settingsController.signal === ownerSettings
    const deliver = async(): Promise<PluginEventReceipt> => {
      if (!currentOwner()) throw aborted()
      const receipt: PluginEventReceipt = { delivered: 0, failed: 0, skipped: 0 }
      await Promise.all(subscribers.map(async({ record, extension, settings }) => {
        const current = () => currentOwner() && this.records.get(record.plugin.id) === record && record.state === 'active' && !record.controller.signal.aborted && record.settingsController.signal === settings
        if (!current() || !record.instance) { receipt.skipped++; return }
        const controller = new AbortController()
        const cancel = () => { controller.abort() }
        const signals = [publisher.controller.signal, ownerSettings, record.controller.signal, settings]
        for (const source of signals) source.addEventListener('abort', cancel, { once: true })
        try {
          const result = await bounded(record.instance.invoke(extension.handler, structuredClone(value), controller.signal), 2000, controller.signal)
          if (!current()) { receipt.skipped++; return }
          if (!matchesExtensionSchema(point.output, result)) throw new Error('Event handler returned invalid acknowledgement')
          receipt.delivered++
        } catch (error: any) {
          if (!current() || controller.signal.aborted || error instanceof PluginRuntimeBusyError) receipt.skipped++
          else { receipt.failed++; this.fail(record.plugin.id, error, record) }
        } finally {
          controller.abort()
          for (const source of signals) source.removeEventListener('abort', cancel)
        }
      }))
      if (!currentOwner()) throw aborted()
      return receipt
    }
    queue.size++; this.eventCount++
    this.eventQueues.set(publisher, queue)
    const pending = queue.tail.then(deliver, deliver)
    queue.tail = pending.catch(() => {})
    try { return await pending } finally {
      queue.size--; this.eventCount--
      if (!queue.size && this.eventQueues.get(publisher) === queue) this.eventQueues.delete(publisher)
    }
  }

  private async execute(target: string, input: unknown, kind: PluginExtensionPoint['kind'], signal?: AbortSignal, actionId?: string): Promise<unknown> {
    const [owner, id] = target.split('/')
    const provider = this.records.get(owner)
    const point: PluginExtensionPoint | undefined = provider?.plugin.extensionPoints?.find(point => point.id === id)
    if (point == null || point.kind !== kind || provider?.state !== 'active' || !matchesExtensionSchema(point.input, input)) throw new Error('Extension point unavailable or invalid input')
    const ownerSettings = provider.settingsController.signal
    const selected = () => (kind === 'provider' ? this.contributors(target).slice(0, 1) : (kind === 'action' || (PLUGIN_UI_KINDS as readonly string[]).includes(kind)) ? this.contributors(target).filter(({ record, extension }) => `${record.plugin.id}/${extension.id}` === actionId) : this.contributors(target)).map(step => ({ ...step, settings: step.record.settingsController.signal }))
    const steps = selected()
    const current = () => {
      if (this.records.get(owner) !== provider || provider.state !== 'active' || provider.controller.signal.aborted || ownerSettings !== provider.settingsController.signal) return false
      const active = selected()
      return active.length === steps.length && active.every((step, index) => step.record === steps[index].record && step.extension === steps[index].extension && step.settings === steps[index].settings)
    }
    const cancelled = () => signal?.aborted === true
    if (cancelled() || !current()) throw aborted()
    if (kind === 'provider' && !steps.length) return null
    if ((kind === 'action' || (PLUGIN_UI_KINDS as readonly string[]).includes(kind)) && steps.length !== 1) throw new Error('Action unavailable')
    let value = structuredClone(input)
    for (const { record, extension, settings } of steps) {
      if (cancelled() || !current()) throw aborted()
      if (!record.instance) throw new Error('Extension runtime unavailable')
      const controller = new AbortController()
      const cancel = () => { controller.abort() }
      provider.controller.signal.addEventListener('abort', cancel, { once: true }); signal?.addEventListener('abort', cancel, { once: true }); record.controller.signal.addEventListener('abort', cancel, { once: true }); settings.addEventListener('abort', cancel, { once: true }); ownerSettings.addEventListener('abort', cancel, { once: true })
      try {
        const result = await bounded(record.instance.invoke(extension.handler, structuredClone(value), controller.signal), 2000, controller.signal)
        if (!current()) throw aborted()
        if (!matchesExtensionSchema(point.output, result) || ((PLUGIN_UI_KINDS as readonly string[]).includes(kind) && !validatePluginUiDocument(result, input))) throw new Error('Extension returned invalid output')
        value = result
      } catch (error: any) {
        if (!(error instanceof PluginRuntimeBusyError) && !controller.signal.aborted && current()) this.fail(record.plugin.id, error, record)
        throw error
      } finally { controller.abort(); provider.controller.signal.removeEventListener('abort', cancel); signal?.removeEventListener('abort', cancel); record.controller.signal.removeEventListener('abort', cancel); settings.removeEventListener('abort', cancel); ownerSettings.removeEventListener('abort', cancel) }
    }
    if (!matchesExtensionSchema(point.output, value) || !current() || signal?.aborted) throw aborted()
    return value
  }
}
