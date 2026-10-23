import assert from 'node:assert/strict'
import { PluginLifecycle, PluginRuntimeBusyError, type RuntimePlugin, type RuntimeBackend } from '@main/modules/plugin/lifecycle'
import { createLatestLoader, createCoalescedLoader } from '@renderer/core/latestLoader'
import { validatePluginManifest } from '@common/plugin/security'
import { validateExtensionSchema, matchesExtensionSchema, equalExtensionSchemas } from '@common/plugin/extensions'
import type { ExtensionSchema } from '@common/plugin/types'

const schema: ExtensionSchema = { type: 'object', properties: { text: { type: 'string', maxLength: 100 } } }
const plugin = (id: string, dependencies: string[] = [], extra: Partial<RuntimePlugin> = {}): RuntimePlugin => ({ id, name: id, version: '1.0.0', apiVersion: '1.3.0', enabled: true, compatible: true, available: true, permissions: [], source: 'installed', publicKeyFingerprint: '', providers: [], pages: [], themes: [], official: false, canRollback: false, runtimeKey: id, dependencies: dependencies.map(id => ({ id })), ...extra })
const provider = () => plugin('fixture.b', [], { extensionPoints: [{ id: 'query', version: '1.0.0', kind: 'processor', input: schema, output: schema }] })
const enhancer = (id = 'fixture.a', priority = 0) => plugin(id, ['fixture.b'], { permissions: ['extensions.process'], runtime: { entry: 'runtime.html', timeoutMs: 100 }, extensions: [{ id: 'normalize', handler: 'normalize', target: 'fixture.b/query', version: '1.0.0', priority }] })
const flush = async() => { for (let i = 0; i < 10; i++) await Promise.resolve() }

export const pluginLifecycleTests = async(test: (name: string, run: () => void | Promise<void>) => Promise<void>) => {
  await test('lifecycle awaits B activation before A and disposes A before B exactly once', async() => {
    const log: string[] = []; let release: () => void = () => {}
    const backend: RuntimeBackend = { start: async(p) => {
      log.push('start:' + p.id)
      if (p.id === 'fixture.b') await new Promise<void>(resolve => { release = resolve })
      return { invoke: async(_handler, value) => value, dispose: async() => { log.push('stop:' + p.id) }, destroy: () => { log.push('destroy:' + p.id) } }
    } }
    const runtime = new PluginLifecycle(backend)
    const starting = runtime.reconcile([{ ...provider(), runtime: { entry: 'runtime.html' } }, enhancer()])
    await flush()
    assert.deepEqual(log, ['start:fixture.b'])
    assert.equal(runtime.status('fixture.b').state, 'activating')
    release(); await starting
    assert.equal(runtime.status('fixture.a').state, 'active')
    await runtime.suspend('fixture.b')
    assert.deepEqual(log, ['start:fixture.b', 'start:fixture.a', 'stop:fixture.a', 'destroy:fixture.a', 'stop:fixture.b', 'destroy:fixture.b'])
  })
  await test('activation failure blocks dependents, isolates unrelated plugins and requires explicit retry', async() => {
    let fail = true
    const runtime = new PluginLifecycle({ start: async() => { if (fail) throw Error('B failed'); return { invoke: async(_handler, value) => value, dispose: async() => {}, destroy: () => {} } } })
    const desired = [{ ...provider(), runtime: { entry: 'runtime.html' } }, enhancer(), plugin('fixture.unrelated')]
    await runtime.reconcile(desired)
    assert.equal(runtime.status('fixture.b').state, 'failed'); assert.equal(runtime.status('fixture.a').state, 'blocked'); assert.equal(runtime.status('fixture.unrelated').state, 'active')
    fail = false; await runtime.reconcile(desired)
    assert.equal(runtime.status('fixture.b').state, 'failed')
    runtime.retry('fixture.b'); await runtime.reconcile(desired)
    assert.equal(runtime.status('fixture.a').state, 'active')
    await runtime.reconcile([])
  })
  await test('processor order is priority then stable plugin ID; removing A reverses its effect', async() => {
    const runtime = new PluginLifecycle({ start: async(p) => ({ invoke: async(_handler, value: any) => ({ text: value.text + ':' + p.id }), dispose: async() => {}, destroy: () => {} }) })
    await runtime.reconcile([provider(), enhancer('fixture.z', -1), enhancer('fixture.a'), enhancer('fixture.c')])
    assert.deepEqual(await runtime.process('fixture.b/query', { text: 'song' }), { text: 'song:fixture.z:fixture.a:fixture.c' })
    await runtime.suspend('fixture.a')
    assert.deepEqual(await runtime.process('fixture.b/query', { text: 'song' }), { text: 'song:fixture.z:fixture.c' })
    await assert.rejects(runtime.process('fixture.b/query', { text: 'x', secret: 'unexpected' }))
    await runtime.reconcile([])
  })
  await test('missing permission, incompatible extension version and activation timeout fail closed', async() => {
    let starts = 0; let cancelled = false
    const runtime = new PluginLifecycle({ start: async(_p, signal) => { starts++; signal.addEventListener('abort', () => { cancelled = true }); return new Promise(() => {}) } })
    const noPermission = { ...enhancer(), permissions: [] }
    await runtime.reconcile([provider(), noPermission]); assert.equal(runtime.status('fixture.a').state, 'blocked'); assert.equal(starts, 0)
    const wrongVersion = enhancer(); wrongVersion.extensions![0].version = '2.0.0'
    await runtime.reconcile([provider(), wrongVersion]); assert.equal(starts, 0)
    await runtime.reconcile([provider(), enhancer()]); assert.equal(runtime.status('fixture.a').state, 'failed'); assert.equal(cancelled, true)
    await runtime.reconcile([])
  })
  await test('stop cancels pending handlers and rejects late results from an old generation', async() => {
    let release: (value: unknown) => void = () => {}; let cancelled = false
    const runtime = new PluginLifecycle({ start: async() => ({ invoke: async(_handler, _value, signal) => { signal.addEventListener('abort', () => { cancelled = true }); return new Promise(resolve => { release = resolve }) }, dispose: async() => {}, destroy: () => {} }) })
    await runtime.reconcile([provider(), enhancer()])
    const pending = runtime.process('fixture.b/query', { text: 'old' })
    const rejected = assert.rejects(pending, /cancelled/)
    await flush(); await runtime.suspend('fixture.b'); release({ text: 'late' }); await rejected
    assert.equal(cancelled, true)
    await runtime.reconcile([])
  })
  await test('invalid processor output removes its contribution and blocks its dependents', async() => {
    const runtime = new PluginLifecycle({ start: async() => ({ invoke: async() => ({ text: 'bad', undeclared: true }), dispose: async() => {}, destroy: () => {} }) })
    const desired = [provider(), enhancer(), plugin('fixture.c', ['fixture.a'])]
    await runtime.reconcile(desired)
    await assert.rejects(runtime.process('fixture.b/query', { text: 'song' }), /invalid output/)
    await flush(); await runtime.reconcile(desired)
    assert.equal(runtime.status('fixture.a').state, 'failed'); assert.equal(runtime.status('fixture.c').state, 'blocked')
    await runtime.reconcile([])
  })
  await test('unrelated plugin changes preserve pending work, but changed processor chains reject old results', async() => {
    let release: (value: unknown) => void = () => {}
    const runtime = new PluginLifecycle({ start: async() => ({ invoke: async() => new Promise(resolve => { release = resolve }), dispose: async() => {}, destroy: () => {} }) })
    const unrelated = plugin('fixture.unrelated')
    const desired = [provider(), enhancer(), unrelated]
    await runtime.reconcile(desired)
    const pending = runtime.process('fixture.b/query', { text: 'song' })
    await flush(); await runtime.suspend(unrelated.id)
    await runtime.reconcile([provider(), enhancer(), { ...unrelated, available: false, enabled: false }])
    release({ text: 'preserved' })
    assert.deepEqual(await pending, { text: 'preserved' })
    const previousChain = runtime.process('fixture.b/query', { text: 'song' })
    const rejected = assert.rejects(previousChain, /cancelled/)
    await flush(); await runtime.reconcile([provider(), enhancer(), enhancer('fixture.c')])
    release({ text: 'old chain' }); await rejected
    assert.equal(runtime.status('fixture.a').state, 'active', 'chain invalidation must not quarantine a healthy processor')
    await runtime.reconcile([])
  })
  await test('late failure callbacks from disposed runtimes cannot quarantine a replacement generation', async() => {
    const callbacks: Array<(error: Error) => void> = []
    const runtime = new PluginLifecycle({ start: async(_plugin, _signal, failed) => { callbacks.push(failed); return { invoke: async(_handler, value) => value, dispose: async() => {}, destroy: () => {} } } })
    await runtime.reconcile([provider(), enhancer()])
    await runtime.suspend('fixture.a')
    await runtime.reconcile([provider(), { ...enhancer(), runtimeKey: 'replacement' }])
    callbacks[0](new Error('late old renderer crash')); await flush()
    assert.equal(runtime.status('fixture.a').state, 'active')
    assert.deepEqual(await runtime.process('fixture.b/query', { text: 'replacement works' }), { text: 'replacement works' })
    await runtime.reconcile([])
  })
  await test('processor contract equality ignores object property order and preserves type constraints', async() => {
    const fields = { text: { type: 'string', maxLength: 100 }, enabled: { type: 'boolean' } } as const
    const b = provider()
    b.extensionPoints![0].input = { type: 'object', properties: fields }
    b.extensionPoints![0].output = { type: 'object', properties: { enabled: fields.enabled, text: fields.text } }
    const runtime = new PluginLifecycle({ start: async() => ({ invoke: async(_handler, value) => value, dispose: async() => {}, destroy: () => {} }) })
    await runtime.reconcile([b, enhancer()])
    assert.equal(runtime.status('fixture.a').state, 'active')
    assert.deepEqual(await runtime.process('fixture.b/query', { text: 'same schema', enabled: true }), { text: 'same schema', enabled: true })
    await assert.rejects(runtime.process('fixture.b/query', { text: 'wrong type', enabled: 'true' }))
    await runtime.reconcile([])
  })
  const suggestionSchema: ExtensionSchema = { type: 'object', properties: { suggestions: { type: 'array', maxItems: 2, items: { type: 'string', maxLength: 10 } } } }
  const owner = () => plugin('fixture.b', [], { extensionPoints: [{ id: 'query', version: '1.0.0', kind: 'provider', input: schema, output: suggestionSchema }] })
  const supplier = (id = 'fixture.a', priority = 0) => ({ ...enhancer(id, priority), permissions: ['extensions.provide'] as RuntimePlugin['permissions'] })
  await test('providers choose one stable priority winner, use distinct output schema and restore the next supplier', async() => {
    const calls: string[] = []
    const runtime = new PluginLifecycle({ start: async(p) => ({ invoke: async() => { calls.push(p.id); return { suggestions: [p.id] } }, dispose: async() => {}, destroy: () => {} }) })
    await runtime.reconcile([owner()])
    assert.equal(await runtime.provide('fixture.b/query', { text: 'x' }), null)
    await assert.rejects(runtime.process('fixture.b/query', { text: 'x' }))
    await runtime.reconcile([owner(), supplier('fixture.z', -1), supplier('fixture.c'), supplier('fixture.a')])
    assert.deepEqual(await runtime.provide('fixture.b/query', { text: 'x' }), { suggestions: ['fixture.z'] })
    assert.deepEqual(calls, ['fixture.z'])
    await runtime.suspend('fixture.z')
    assert.deepEqual(await runtime.provide('fixture.b/query', { text: 'x' }), { suggestions: ['fixture.a'] })
    await runtime.reconcile([])
  })
  await test('provider permissions and bounded array results are enforced with per-plugin failure isolation', async() => {
    const runtime = new PluginLifecycle({ start: async(p) => ({ invoke: async() => ({ suggestions: p.id === 'fixture.bad' ? ['1', '2', '3'] : ['healthy'] }), dispose: async() => {}, destroy: () => {} }) })
    await runtime.reconcile([owner(), enhancer(), supplier('fixture.bad', -1), supplier('fixture.good')])
    assert.equal(runtime.status('fixture.a').state, 'blocked')
    await assert.rejects(runtime.provide('fixture.b/query', { text: 'x' }), /invalid output/)
    await flush()
    assert.equal(runtime.status('fixture.good').state, 'active')
    assert.deepEqual(await runtime.provide('fixture.b/query', { text: 'x' }), { suggestions: ['healthy'] })
    await runtime.reconcile([])
  })
  await test('replacing the chosen provider rejects its stale output without quarantining a healthy runtime', async() => {
    let release: (value: unknown) => void = () => {}
    const runtime = new PluginLifecycle({ start: async() => ({ invoke: async() => new Promise(resolve => { release = resolve }), dispose: async() => {}, destroy: () => {} }) })
    await runtime.reconcile([owner(), supplier()])
    const pending = runtime.provide('fixture.b/query', { text: 'x' })
    const rejected = assert.rejects(pending, /cancelled/)
    await flush()
    await runtime.reconcile([owner(), supplier(), supplier('fixture.first', -1)])
    release({ suggestions: ['old'] }); await rejected
    assert.equal(runtime.status('fixture.a').state, 'active')
    await runtime.reconcile([])
  })
  await test('bounded array schemas reject excessive length, invalid items, sparse values and executable fields', () => {
    const list: ExtensionSchema = { type: 'array', maxItems: 2, items: { type: 'string', maxLength: 10 } }
    assert.deepEqual(validateExtensionSchema(list), list)
    assert.equal(matchesExtensionSchema(list, []), true)
    for (const value of [['a', 'b', 'c'], [1], ['too long a string'], new Array(1), {}]) assert.equal(matchesExtensionSchema(list, value), false)
    assert.equal(equalExtensionSchemas(list, { ...list, maxItems: 3 }), false)
    assert.equal(equalExtensionSchemas(list, { ...list, items: { type: 'number' } }), false)
    for (const bad of [{ ...list, maxItems: 33 }, { ...list, script: 'run' }, { ...list, items: { type: 'unknown' } }]) assert.throws(() => validateExtensionSchema(bad))
    const manifest = { id: 'fixture.provider', name: 'Provider', version: '1.0.0', apiVersion: '1.4.0', main: 'index.html', permissions: [], extensionPoints: owner().extensionPoints }
    assert.ok(validatePluginManifest(manifest).extensionPoints)
    assert.throws(() => validatePluginManifest({ ...manifest, apiVersion: '1.3.0' }))
  })
  await test('committed settings cancel affected processors immediately without restarting or quarantining them', async() => {
    for (const changedId of ['fixture.a', 'fixture.b']) {
      let starts = 0; let calls = 0; let cancelled = false
      const runtime = new PluginLifecycle({ start: async() => {
        starts++
        return { invoke: async(_handler, value, signal) => { calls++; if (calls > 1) return value; signal.addEventListener('abort', () => { cancelled = true }); return new Promise(() => {}) }, dispose: async() => {}, destroy: () => {} }
      } })
      await runtime.reconcile([provider(), enhancer()])
      const pending = runtime.process('fixture.b/query', { text: 'old' })
      const rejected = assert.rejects(pending, /cancelled/)
      await flush()
      assert.deepEqual(runtime.settingsChanged(changedId), ['fixture.b/query'])
      await rejected
      assert.equal(cancelled, true)
      assert.equal(runtime.status('fixture.a').state, 'active')
      assert.equal(starts, 1)
      assert.deepEqual(await runtime.process('fixture.b/query', { text: 'fresh' }), { text: 'fresh' })
      await runtime.reconcile([])
    }
  })
  await test('unrelated settings and unselected provider settings do not cancel the winning provider', async() => {
    let release: (value: unknown) => void = () => {}
    const runtime = new PluginLifecycle({ start: async() => ({ invoke: async() => new Promise(resolve => { release = resolve }), dispose: async() => {}, destroy: () => {} }) })
    await runtime.reconcile([owner(), supplier('fixture.a', -1), supplier('fixture.other'), plugin('fixture.unrelated')])
    const pending = runtime.provide('fixture.b/query', { text: 'input' })
    await flush()
    assert.deepEqual(runtime.settingsChanged('fixture.unrelated'), [])
    assert.deepEqual(runtime.settingsChanged('fixture.other'), ['fixture.b/query'])
    release({ suggestions: ['healthy'] })
    assert.deepEqual(await pending, { suggestions: ['healthy'] })
    await runtime.reconcile([])
  })
  await test('provider configuration changes reject stale results and keep its runtime active for the next call', async() => {
    let release: (value: unknown) => void = () => {}; let calls = 0
    const runtime = new PluginLifecycle({ start: async() => ({ invoke: async() => ++calls === 1 ? new Promise(resolve => { release = resolve }) : { suggestions: ['new'] }, dispose: async() => {}, destroy: () => {} }) })
    await runtime.reconcile([owner(), supplier()])
    const pending = runtime.provide('fixture.b/query', { text: 'input' })
    const rejected = assert.rejects(pending, /cancelled/)
    await flush(); runtime.settingsChanged('fixture.a')
    release({ suggestions: ['old'] }); await rejected
    assert.equal(runtime.status('fixture.a').state, 'active')
    assert.deepEqual(await runtime.provide('fixture.b/query', { text: 'input' }), { suggestions: ['new'] })
    await runtime.reconcile([])
  })
  await test('runtime backpressure rejects a call without quarantining healthy processors or providers', async() => {
    for (const kind of ['processor', 'provider'] as const) {
      let busy = true
      const runtime = new PluginLifecycle({ start: async() => ({ invoke: async(_handler, value) => { if (busy) throw new PluginRuntimeBusyError(); return kind === 'processor' ? value : { suggestions: ['healthy'] } }, dispose: async() => {}, destroy: () => {} }) })
      await runtime.reconcile(kind === 'processor' ? [provider(), enhancer()] : [owner(), supplier()])
      const invoke = () => kind === 'processor' ? runtime.process('fixture.b/query', { text: 'x' }) : runtime.provide('fixture.b/query', { text: 'x' })
      await assert.rejects(invoke(), PluginRuntimeBusyError)
      assert.equal(runtime.status('fixture.a').state, 'active')
      busy = false
      assert.deepEqual(await invoke(), kind === 'processor' ? { text: 'x' } : { suggestions: ['healthy'] })
      await runtime.reconcile([])
    }
  })
  await test('refresh bursts coalesce into a single load and only the latest result is published', async() => {
    const calls: number[] = []; const releases: Array<(value: string) => void> = []; const values: string[] = []
    let active = 0; let maximum = 0
    const loader = createLatestLoader(async(input: number) => {
      calls.push(input); active++; maximum = Math.max(maximum, active)
      try { return await new Promise<string>(resolve => { releases.push(resolve) }) } finally { active-- }
    }, value => { values.push(value) }, error => { throw error })
    loader.request(1)
    for (let i = 2; i <= 50; i++) loader.request(i)
    assert.deepEqual(calls, [1])
    releases[0]('obsolete'); await flush()
    assert.deepEqual(calls, [1, 50]); assert.deepEqual(values, [])
    releases[1]('latest'); await flush()
    assert.deepEqual(values, ['latest']); assert.equal(maximum, 1)
    loader.dispose()
  })
  await test('refresh cancellation and disposal suppress obsolete errors and do not keep queued work alive', async() => {
    const completions: Array<{ resolve: (value: string) => void, reject: (error: Error) => void }> = []
    const values: string[] = []; const errors: unknown[] = []
    const loader = createLatestLoader(async(_input: string) => new Promise<string>((resolve, reject) => { completions.push({ resolve, reject }) }), value => { values.push(value) }, error => { errors.push(error) })
    loader.request('old'); loader.cancel(); loader.request('new')
    completions[0].reject(new Error('obsolete failure')); await flush()
    assert.deepEqual(errors, []); assert.equal(completions.length, 2)
    completions[1].reject(new Error('current failure')); await flush()
    assert.equal(errors.length, 1)
    loader.request('dispose-active'); loader.request('never-start')
    loader.dispose(); completions[2].resolve('obsolete'); await flush()
    loader.request('after-dispose')
    assert.equal(completions.length, 3); assert.deepEqual(values, [])
  })
  await test('shared catalog readers coalesce IPC and all receive the latest snapshot after invalidation', async() => {
    let reads = 0; const releases: Array<(value: string) => void> = []
    const load = createCoalescedLoader(async() => { reads++; return new Promise<string>(resolve => { releases.push(resolve) }) })
    const first = load(); await flush()
    const other = Array.from({ length: 30 }, () => load())
    assert.equal(reads, 1)
    releases[0]('old'); await flush(); assert.equal(reads, 2)
    releases[1]('latest')
    assert.deepEqual(await Promise.all([first, ...other]), Array(31).fill('latest'))
    const next = load(); await flush(); assert.equal(reads, 3)
    releases[2]('next'); assert.equal(await next, 'next')
  })
  await test('a failed shared catalog read does not poison later refreshes', async() => {
    let fail = true
    const load = createCoalescedLoader(async() => { if (fail) throw Error('read failed'); return 'recovered' })
    await assert.rejects(load(), /read failed/)
    fail = false; assert.equal(await load(), 'recovered')
  })
  await test('extension manifests reject undeclared targets, unknown modes, executable schemas and old API', () => {
    const base = { id: 'fixture.a', name: 'A', version: '1.0.0', apiVersion: '1.3.0', main: 'index.html', permissions: ['extensions.process'], runtime: { entry: 'runtime.html' }, dependencies: [{ id: 'fixture.b' }], extensions: enhancer().extensions }
    assert.ok(validatePluginManifest(base).runtime)
    assert.throws(() => validatePluginManifest({ ...base, dependencies: [] }))
    assert.throws(() => validatePluginManifest({ ...base, apiVersion: '1.2.0' }))
    assert.throws(() => validatePluginManifest({ ...base, extensionPoints: [{ id: 'x', version: '1.0.0', kind: 'script', input: schema, output: schema }] }))
    assert.throws(() => validatePluginManifest({ ...base, extensionPoints: [{ id: 'x', version: '1.0.0', kind: 'processor', input: { type: 'object', properties: { text: { type: 'string', maxLength: 10, script: 'run()' } } }, output: schema }] }))
  })
}
