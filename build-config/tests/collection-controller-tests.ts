import assert from 'node:assert/strict'
import { CollectionController } from '@renderer/core/collection/controller'
import type { CollectionAdapter, AdapterSelection } from '@renderer/core/collection/types'
import { COLLECTION_SURFACE_COMMANDS, type CollectionDispatchRequest, type CollectionProviderInfo } from '@common/collection/types'
import { authorizePluginRequest } from '@common/plugin/requests'

export const controllerTests = async(test: (name: string, run: () => void | Promise<void>) => Promise<void>) => {
  const create = () => {
    const effects: Array<{ request: CollectionDispatchRequest, selection: AdapterSelection }> = []
    const adapter: CollectionAdapter = {
      surfaceId: 'list-music', commands: COLLECTION_SURFACE_COMMANDS['list-music'], supportsSort: true, supportsFilters: true,
      hasKey: key => /^k\d+$/.test(key) && Number(key.slice(1)) < 10000,
      refresh: async() => ({ total: 10000, page: 1, pageCount: 1, pageSize: 100, facets: [], status: 'ready' }),
      getItems: async(offset, limit) => Array.from({ length: Math.min(limit, 10000 - offset) }, (_, i) => ({ key: `k${i + offset}`, name: `Song ${i + offset}`, available: true })),
      dispatch: async(request, _query, selection) => { effects.push({ request, selection }); return true },
      getOptions: async() => ({ options: [{ id: 'internal-playlist-id', label: 'Destination' }] }),
    }
    const provider: CollectionProviderInfo = { id: 'list', pluginId: 'lx.test', qualifiedId: 'lx.test/list', displayName: 'Test', apiVersion: '1.0.0', surfaces: ['list-music'], entry: 'index.html', icon: '', available: true, enabled: true, isOfficial: false }
    const controller = new CollectionController({ surfaceId: 'list-music', contextId: 'test', params: {}, adapter, provider })
    const dispatch = async(command: CollectionDispatchRequest['command'], rest: Partial<CollectionDispatchRequest> = {}) => controller.dispatch({ revision: controller.snapshot().revision, command, ...rest })
    const read = async(offset = 0, limit = 100) => controller.getItems({ revision: controller.snapshot().revision, offset, limit })
    return { controller, adapter, provider, dispatch, read, effects }
  }

  await test('controller rejects stale reads, stale commands and oversized reads', async() => {
    const c = create(); await c.controller.refresh()
    const revision = c.controller.snapshot().revision
    await c.dispatch('selectAll')
    await assert.rejects(c.controller.getItems({ revision, offset: 0, limit: 10 }), /stale/)
    await assert.rejects(c.controller.dispatch({ revision, command: 'clearSelection' }), /stale/)
    await assert.rejects(c.read(0, 101), /limit/)
  })
  await test('10,000-song selection excludes one item and remains bounded', async() => {
    const c = create(); await c.controller.refresh(); await c.dispatch('selectAll')
    await c.dispatch('select', { target: { kind: 'item', keys: ['k5'] }, value: 'remove' })
    assert.deepEqual(c.controller.snapshot().selection, { mode: 'some', count: 9999 })
    const items = (await c.read()).items
    assert.equal(items[5].selected, false); assert.equal(items[6].selected, true)
    await c.dispatch('playLater', { target: { kind: 'selection' } })
    assert.deepEqual(c.effects[0].selection, { mode: 'all', keys: [], excludedKeys: ['k5'] })
    assert.ok(JSON.stringify(c.controller.snapshot()).length < 10000)
  })
  await test('host stores more than 100 selected keys without sending a key array', async() => {
    const c = create(); await c.controller.refresh()
    for (let i = 0; i < 3; i++) await c.dispatch('select', { target: { kind: 'item', keys: Array.from({ length: 100 }, (_, j) => `k${i * 100 + j}`) }, value: 'add' })
    await c.dispatch('playLater', { target: { kind: 'selection' } })
    assert.equal(c.effects[0].selection.keys.length, 300)
    assert.deepEqual(c.effects[0].request.target, { kind: 'selection' })
  })
  await test('unknown keys and missing or overly broad item targets are rejected', async() => {
    const c = create(); await c.controller.refresh()
    await assert.rejects(c.dispatch('select', { target: { kind: 'item', keys: ['forged'] }, value: 'add' }), /belong/)
    await assert.rejects(c.dispatch('playLater'), /target/)
    await assert.rejects(c.dispatch('replaceSource', { target: { kind: 'collection' } }), /one item/)
    assert.equal(c.effects.length, 0)
  })
  await test('option grants bind revision, action and target and hide internal ids', async() => {
    const c = create(); await c.controller.refresh()
    const request: CollectionDispatchRequest = { revision: c.controller.snapshot().revision, command: 'addToPlaylist', target: { kind: 'item', keys: ['k0'] } }
    const options = await c.controller.getOptions(request)
    const optionId = options!.options[0].id
    assert.notEqual(optionId, 'internal-playlist-id')
    await assert.rejects(c.dispatch('addToPlaylist', { target: request.target, optionId: 'forged' }), /issued/)
    await assert.rejects(c.dispatch('addToPlaylist', { target: { kind: 'item', keys: ['k1'] }, optionId }), /issued/)
    await c.controller.dispatch({ ...request, optionId })
    assert.equal(c.effects[0].request.optionId, 'internal-playlist-id')
    await assert.rejects(c.controller.dispatch({ ...request, optionId }), /stale/)
  })
  await test('concurrent commands based on one revision execute at most once', async() => {
    const c = create(); await c.controller.refresh()
    const request: CollectionDispatchRequest = { revision: c.controller.snapshot().revision, command: 'playLater', target: { kind: 'item', keys: ['k0'] } }
    const results = await Promise.allSettled([c.controller.dispatch(request), c.controller.dispatch(request)])
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    assert.equal(c.effects.length, 1)
  })
  await test('read completing after a revision change is rejected', async() => {
    const c = create(); await c.controller.refresh()
    let finish!: () => void
    c.adapter.getItems = async() => new Promise(resolve => { finish = () => resolve([{ key: 'k0', name: 'Song', available: true }]) })
    const pending = c.read()
    await c.dispatch('selectAll'); finish()
    await assert.rejects(pending, /stale/)
  })
  await test('provider changes preserve host selection, query and scroll anchor', async() => {
    const c = create(); await c.controller.refresh()
    await c.dispatch('setSort', { value: 'name' }); await c.dispatch('selectAll')
    c.controller.setScrollAnchor({ offset: 500 })
    c.controller.attachProvider({ ...c.provider, id: 'cards', qualifiedId: 'lx.test/cards' })
    assert.equal(c.controller.snapshot().selection.count, 10000)
    assert.equal(c.controller.snapshot().query.sort, 'name')
    assert.equal(c.controller.snapshot().scrollAnchor?.offset, 500)
  })
  await test('disposed and replacement controllers never accept an old revision', async() => {
    const a = create(); await a.controller.refresh(); const revision = a.controller.snapshot().revision; a.controller.dispose()
    const b = create(); await b.controller.refresh()
    assert.notEqual(b.controller.snapshot().revision, revision)
    await assert.rejects(a.controller.getItems({ revision, offset: 0, limit: 1 }), /stale/)
    await assert.rejects(b.controller.dispatch({ revision, command: 'selectAll' }), /stale/)
  })
  await test('request permissions reject read-only writes and ungranted storage', () => {
    assert.doesNotThrow(() => authorizePluginRequest(['collection.read'], 'items'))
    assert.throws(() => authorizePluginRequest(['collection.read'], 'dispatch'), /permission/)
    assert.throws(() => authorizePluginRequest(['collection.commands'], 'storage.set'), /permission/)
    assert.throws(() => authorizePluginRequest(['collection.read'], 'navigate'), /permission/)
    assert.throws(() => authorizePluginRequest([], '__proto__'), /Unknown/)
  })
}
