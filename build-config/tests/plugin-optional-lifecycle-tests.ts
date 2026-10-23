import assert from 'node:assert/strict'
import type { ExtensionSchema, PluginExtensionPoint } from '@common/plugin/types'
import { PLUGIN_UI_INPUT_SCHEMA, PLUGIN_UI_SCHEMA } from '@common/plugin/ui'
import { resolvePluginDependencies } from '@common/plugin/dependencies'
import { PluginLifecycle, type RuntimePlugin, type RuntimeBackend } from '@main/modules/plugin/lifecycle'

const schema: ExtensionSchema = { type: 'object', properties: { text: { type: 'string', maxLength: 100 } } }
const plugin = (id: string, extra: Partial<RuntimePlugin> = {}): RuntimePlugin => ({ id, name: id, version: '1.0.0', apiVersion: '1.9.0', enabled: true, compatible: true, available: true, permissions: [], source: 'installed', publicKeyFingerprint: '', providers: [], pages: [], themes: [], official: false, canRollback: false, runtimeKey: id, ...extra })
const owner = (extra: Partial<RuntimePlugin> = {}) => plugin('fixture.b', { extensionPoints: [{ id: 'query', kind: 'processor', version: '1.0.0', input: schema, output: schema }], ...extra })
const enhancer = (extra: Partial<RuntimePlugin> = {}) => plugin('fixture.a', { optionalDependencies: [{ id: 'fixture.b', minVersion: '1.0.0', maxVersionExclusive: '2.0.0' }], runtime: { entry: 'runtime.html' }, permissions: ['extensions.process'], extensions: [{ id: 'clean', target: 'fixture.b/query', version: '1.0.0', handler: 'clean' }], ...extra })
const flush = async() => { for (let index = 0; index < 20; index++) await Promise.resolve() }
const resolve = (plugins: RuntimePlugin[]) => resolvePluginDependencies(plugins) as RuntimePlugin[]

export const pluginOptionalLifecycleTests = async(test: (name: string, run: () => void | Promise<void>) => Promise<void>) => {
  await test('optional target attaches after A, detaches and reattaches without restarting A core', async() => {
    const starts: string[] = []; const stops: string[] = []
    const runtime = new PluginLifecycle({ start: async(p) => {
      starts.push(p.id)
      return { invoke: async(_handler, value: any) => ({ text: value.text.trim() }), dispose: async() => { stops.push(p.id) }, destroy: () => {} }
    } })
    await runtime.reconcile(resolve([enhancer()]))
    assert.equal(runtime.status('fixture.a').state, 'active')
    assert.equal(runtime.optionalDependencyStates('fixture.a')[0].available, false)
    await runtime.reconcile(resolve([enhancer(), owner()]))
    assert.equal(runtime.optionalDependencyStates('fixture.a')[0].available, true)
    assert.deepEqual(await runtime.process('fixture.b/query', { text: ' song ' }), { text: 'song' })
    await runtime.suspend('fixture.b')
    assert.equal(runtime.status('fixture.a').state, 'active')
    await runtime.reconcile(resolve([enhancer(), owner({ enabled: false })]))
    assert.equal(runtime.optionalDependencyStates('fixture.a')[0].available, false)
    await runtime.reconcile(resolve([enhancer(), owner()]))
    assert.deepEqual(starts, ['fixture.a']); assert.deepEqual(stops, [])
    assert.deepEqual(await runtime.process('fixture.b/query', { text: ' back ' }), { text: 'back' })
    await runtime.reconcile(resolve([enhancer()]))
    assert.equal(runtime.status('fixture.a').state, 'active')
    assert.equal(runtime.optionalDependencyStates('fixture.a')[0].available, false)
    await runtime.reconcile([])
    assert.deepEqual(stops, ['fixture.a'])
  })
  await test('optional ranges, point mismatch and missing permission withdraw integration without blocking core', async() => {
    const runtime = new PluginLifecycle({ start: async() => ({ invoke: async(_handler, value: any) => ({ text: value.text.trim() }), dispose: async() => {}, destroy: () => {} }) })
    for (const b of [owner({ version: '2.0.0', runtimeKey: 'v2' }), owner({ extensionPoints: [], runtimeKey: 'no-point' }), owner({ extensionPoints: [{ id: 'query', kind: 'processor', version: '2.0.0', input: schema, output: schema }], runtimeKey: 'point-v2' })]) {
      await runtime.reconcile(resolve([enhancer(), b]))
      assert.equal(runtime.status('fixture.a').state, 'active')
      assert.equal(runtime.optionalDependencyStates('fixture.a')[0].available, false)
    }
    await runtime.reconcile(resolve([enhancer(), owner()]))
    assert.deepEqual(await runtime.process('fixture.b/query', { text: ' ok ' }), { text: 'ok' })
    await runtime.reconcile(resolve([enhancer({ permissions: [], runtimeKey: 'no-permission' }), owner()]))
    assert.equal(runtime.status('fixture.a').state, 'active')
    assert.match(runtime.optionalDependencyStates('fixture.a')[0].reason!, /权限/)
    assert.deepEqual(await runtime.process('fixture.b/query', { text: ' unchanged ' }), { text: ' unchanged ' })
    await runtime.reconcile([])
  })
  await test('stopping optional owner immediately cancels pending handler, preserving A and its other owner', async() => {
    let release: (value: unknown) => void = () => {}; let cancelled = false
    const runtime = new PluginLifecycle({ start: async() => ({ invoke: async(_handler, value, signal) => {
      if ((value as any).text === 'pending') {
        signal.addEventListener('abort', () => { cancelled = true })
        return new Promise(resolve => { release = resolve })
      }
      return value
    }, dispose: async() => {}, destroy: () => {} }) })
    const c = owner({ id: 'fixture.c', runtimeKey: 'c' })
    const a = enhancer({ optionalDependencies: [{ id: 'fixture.b' }, { id: 'fixture.c' }], extensions: [...enhancer().extensions!, { id: 'other', target: 'fixture.c/query', version: '1.0.0', handler: 'other' }] })
    await runtime.reconcile(resolve([a, owner(), c]))
    const pending = runtime.process('fixture.b/query', { text: 'pending' })
    const rejection = assert.rejects(pending, /cancelled/)
    await flush(); await runtime.suspend('fixture.b')
    assert.equal(cancelled, true, 'target lifetime must cancel before handler settlement/timeout')
    await rejection; release({ text: 'late' }); await flush()
    assert.equal(runtime.status('fixture.a').state, 'active')
    assert.deepEqual(await runtime.process('fixture.c/query', { text: 'independent' }), { text: 'independent' })
    await runtime.reconcile([])
  })
  await test('optional provider, action and every UI kind cancel immediately when their target stops', async() => {
    for (const kind of ['provider', 'action', 'renderer', 'slot', 'toolbar'] as const) {
      let cancelled = false; let entered = false; let release: (value: unknown) => void = () => {}
      const runtime = new PluginLifecycle({ start: async() => ({ invoke: async(_handler, _value, signal) => {
        entered = true
        signal.addEventListener('abort', () => { cancelled = true })
        return new Promise(resolve => { release = resolve })
      }, dispose: async() => {}, destroy: () => {} }) })
      const ui = ['renderer', 'slot', 'toolbar'].includes(kind)
      const point: PluginExtensionPoint = { id: 'query', kind, version: '1.0.0', input: ui ? PLUGIN_UI_INPUT_SCHEMA : schema, output: ui ? PLUGIN_UI_SCHEMA : schema }
      const a = enhancer({ permissions: [kind === 'provider' ? 'extensions.provide' : kind === 'action' ? 'extensions.act' : 'extensions.render'] })
      await runtime.reconcile(resolve([a, owner({ extensionPoints: [point] })]))
      const input = ui ? { source: 'kw', suggestions: [], actions: [] } : { text: 'pending' }
      const pending = kind === 'provider' ? runtime.provide('fixture.b/query', input) : kind === 'action' ? runtime.act('fixture.b/query', 'fixture.a/clean', input) : runtime.render('fixture.b/query', 'fixture.a/clean', input)
      const rejection = assert.rejects(pending, /cancelled/)
      await flush(); assert.equal(entered, true, kind)
      await runtime.suspend('fixture.b')
      assert.equal(cancelled, true, kind)
      await rejection; release({ text: 'late' }); await flush()
      assert.equal(runtime.status('fixture.a').state, 'active', kind)
      await runtime.reconcile([])
    }
  })
  await test('optional owner crash does not quarantine A; explicit target retry restores only integration', async() => {
    let crash: (error: Error) => void = () => {}; const starts: string[] = []
    const backend: RuntimeBackend = { start: async(p, _signal, failed) => {
      starts.push(p.id); if (p.id === 'fixture.b') crash = failed
      return { invoke: async(_handler, value) => value, dispose: async() => {}, destroy: () => {} }
    } }
    const runtime = new PluginLifecycle(backend)
    const desired = resolve([enhancer(), owner({ runtime: { entry: 'runtime.html' } })])
    await runtime.reconcile(desired); crash(new Error('B crashed')); await flush()
    assert.equal(runtime.status('fixture.a').state, 'active')
    assert.equal(runtime.optionalDependencyStates('fixture.a')[0].available, false)
    await runtime.reconcile(desired); assert.equal(runtime.status('fixture.b').state, 'failed')
    runtime.retry('fixture.b'); await runtime.reconcile(desired)
    assert.equal(runtime.optionalDependencyStates('fixture.a')[0].available, true)
    assert.equal(starts.filter(id => id === 'fixture.a').length, 1)
    await runtime.reconcile([])
  })
  await test('optional cycle and mixed required edge activate deterministically and gate contributions after both cores start', async() => {
    const runtime = new PluginLifecycle({ start: async() => ({ invoke: async(_handler, value) => value, dispose: async() => {}, destroy: () => {} }) })
    const b = enhancer({ id: 'fixture.b', runtimeKey: 'b', optionalDependencies: [{ id: 'fixture.a' }], extensions: [{ id: 'reverse', target: 'fixture.a/query', version: '1.0.0', handler: 'clean' }], extensionPoints: owner().extensionPoints })
    const a = enhancer({ extensionPoints: owner().extensionPoints })
    await runtime.reconcile(resolve([a, b]))
    assert.equal(runtime.optionalDependencyStates('fixture.a')[0].available, true)
    assert.equal(runtime.optionalDependencyStates('fixture.b')[0].available, true)
    await runtime.reconcile([])
    await runtime.reconcile(resolve([a, { ...b, optionalDependencies: [], dependencies: [{ id: 'fixture.a' }] }]))
    assert.equal(runtime.status('fixture.b').state, 'active')
    assert.equal(runtime.optionalDependencyStates('fixture.a')[0].available, true)
    await runtime.reconcile([])
  })
  await test('optional event subscribers detach on owner stop and rejoin with the same subscriber runtime', async() => {
    let calls = 0; let starts = 0
    const runtime = new PluginLifecycle({ start: async() => { starts++; return { invoke: async() => { calls++; return {} }, dispose: async() => {}, destroy: () => {} } } })
    const eventOwner = owner({ permissions: ['events.publish'], extensionPoints: [{ id: 'ping', kind: 'event', version: '1.0.0', input: schema, output: { type: 'object', properties: {} } }] })
    const subscriber = enhancer({ permissions: ['extensions.subscribe'], extensions: [{ id: 'ping', target: 'fixture.b/ping', version: '1.0.0', handler: 'ping' }] })
    await runtime.reconcile(resolve([subscriber, eventOwner]))
    assert.deepEqual(await runtime.publishEvent('fixture.b', 'fixture.b/ping', { text: 'one' }), { delivered: 1, failed: 0, skipped: 0 })
    await runtime.suspend('fixture.b')
    await assert.rejects(runtime.publishEvent('fixture.b', 'fixture.b/ping', { text: 'old' }))
    await runtime.reconcile(resolve([subscriber, eventOwner]))
    assert.deepEqual(await runtime.publishEvent('fixture.b', 'fixture.b/ping', { text: 'two' }), { delivered: 1, failed: 0, skipped: 0 })
    assert.equal(calls, 2); assert.equal(starts, 1)
    await runtime.reconcile([])
  })
}
