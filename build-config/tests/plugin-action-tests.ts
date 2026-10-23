import assert from 'node:assert/strict'
import {
  PluginLifecycle,
  PluginRuntimeBusyError,
  type RuntimeBackend,
  type RuntimePlugin,
} from '@main/modules/plugin/lifecycle'
import { validatePluginManifest } from '@common/plugin/security'
import type { ExtensionSchema } from '@common/plugin/types'

const inputSchema: ExtensionSchema = {
  type: 'object',
  properties: {
    source: { type: 'string', maxLength: 32 },
  },
}
const outputSchema: ExtensionSchema = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      maxItems: 12,
      items: { type: 'string', maxLength: 100 },
    },
  },
}

const flush = async() => {
  for (let index = 0; index < 12; index++) await Promise.resolve()
}

const plugin = (
  id: string,
  dependencies: string[] = [],
  extra: Partial<RuntimePlugin> = {},
): RuntimePlugin => ({
  id,
  name: id,
  version: '1.0.0',
  apiVersion: '1.5.0',
  enabled: true,
  compatible: true,
  available: true,
  permissions: [],
  source: 'installed',
  publicKeyFingerprint: '',
  providers: [],
  pages: [],
  themes: [],
  official: false,
  canRollback: false,
  runtimeKey: id,
  dependencies: dependencies.map(id => ({ id })),
  ...extra,
})

const owner = (overrides: Partial<RuntimePlugin> = {}) => plugin('fixture.owner', [], {
  name: 'Fixture owner',
  extensionPoints: [{
    id: 'next',
    version: '1.0.0',
    kind: 'action',
    input: inputSchema,
    output: outputSchema,
  }],
  ...overrides,
})

const action = (
  id = 'fixture.action',
  title = 'Next suggestions',
  priority = 0,
  overrides: Partial<RuntimePlugin> = {},
) => plugin(id, ['fixture.owner'], {
  name: `Action ${id}`,
  permissions: ['extensions.act'],
  runtime: { entry: 'runtime.html', timeoutMs: 100 },
  extensions: [{
    id: 'next',
    title,
    target: 'fixture.owner/next',
    version: '1.0.0',
    handler: 'next',
    priority,
  }],
  ...overrides,
})

const recordingBackend = (
  invoke: (plugin: RuntimePlugin, handler: string, value: unknown, signal: AbortSignal) => Promise<unknown>,
) => {
  const calls: Array<{ pluginId: string, handler: string, value: unknown }> = []
  const backend: RuntimeBackend = {
    start: async(plugin) => ({
      invoke: async(handler, value, signal) => {
        calls.push({ pluginId: plugin.id, handler, value })
        return await invoke(plugin, handler, value, signal)
      },
      dispose: async() => {},
      destroy: () => {},
    }),
  }
  return { backend, calls }
}

export const pluginActionTests = async(
  test: (name: string, run: () => void | Promise<void>) => Promise<void>,
) => {
  await test('lists actions only for an active owner and active implementations', async() => {
    const { backend, calls } = recordingBackend(async() => ({ suggestions: ['fresh'] }))
    const runtime = new PluginLifecycle(backend)
    await runtime.reconcile([
      owner(),
      action('fixture.z', 'Z suggestions', -10),
      action('fixture.a', 'A suggestions', 10),
      action('fixture.disabled', 'Disabled suggestions', 0, { enabled: false, available: false }),
    ])

    const listed = runtime.listActions('fixture.owner/next')
    assert.deepEqual(calls, [])
    assert.deepEqual(listed.map(item => item.id).sort(), ['fixture.a/next', 'fixture.z/next'])
    assert.deepEqual(listed.find(item => item.id === 'fixture.a/next'), {
      id: 'fixture.a/next',
      title: 'A suggestions',
      pluginId: 'fixture.a',
      pluginName: 'Action fixture.a',
    })
    assert.deepEqual(runtime.listActions('fixture.missing/next'), [])

    await runtime.suspend('fixture.owner')
    assert.deepEqual(runtime.listActions('fixture.owner/next'), [])
    await runtime.reconcile([])
  })

  await test('executes the explicit action id instead of a higher-priority implementation', async() => {
    const { backend, calls } = recordingBackend(async(plugin) => ({ suggestions: [plugin.id] }))
    const runtime = new PluginLifecycle(backend)
    await runtime.reconcile([
      owner(),
      owner({ id: 'fixture.other', name: 'Other owner' }),
      action('fixture.high', 'High priority', -100),
      action('fixture.selected', 'Selected action', 100),
    ])

    assert.deepEqual(
      await runtime.act('fixture.owner/next', 'fixture.selected/next', { source: '成都' }),
      { suggestions: ['fixture.selected'] },
    )
    assert.deepEqual(calls.map(call => call.pluginId), ['fixture.selected'])

    await assert.rejects(runtime.act('fixture.owner/next', 'fixture.missing/next', { source: 'test' }))
    await assert.rejects(runtime.act('fixture.other/next', 'fixture.selected/next', { source: 'test' }))
    assert.deepEqual(calls.map(call => call.pluginId), ['fixture.selected'])
    await runtime.reconcile([])
  })

  await test('rejects a concurrent call to the same action without quarantining it', async() => {
    let release: (value: unknown) => void = () => {}
    let calls = 0
    const { backend } = recordingBackend(async() => {
      calls++
      if (calls === 1) return await new Promise(resolve => { release = resolve })
      return { suggestions: ['fresh'] }
    })
    const runtime = new PluginLifecycle(backend)
    await runtime.reconcile([owner(), action()])

    const first = runtime.act('fixture.owner/next', 'fixture.action/next', { source: 'first' })
    await flush()
    await assert.rejects(
      runtime.act('fixture.owner/next', 'fixture.action/next', { source: 'second' }),
      (error: unknown) => error instanceof PluginRuntimeBusyError,
    )
    assert.equal(runtime.status('fixture.action').state, 'active')
    assert.equal(calls, 1)

    release({ suggestions: ['first'] })
    assert.deepEqual(await first, { suggestions: ['first'] })
    assert.deepEqual(
      await runtime.act('fixture.owner/next', 'fixture.action/next', { source: 'after' }),
      { suggestions: ['fresh'] },
    )
    assert.equal(calls, 2)
    await runtime.reconcile([])
  })

  await test('quarantines an invalid selected implementation and never invokes a fallback', async() => {
    const { backend, calls } = recordingBackend(async(plugin) => (
      plugin.id === 'fixture.bad'
        ? { suggestions: ['x'.repeat(101)] }
        : { suggestions: ['healthy'] }
    ))
    const runtime = new PluginLifecycle(backend)
    await runtime.reconcile([
      owner(),
      action('fixture.bad', 'Bad output', -100),
      action('fixture.healthy', 'Healthy fallback', 100),
    ])

    await assert.rejects(
      runtime.act('fixture.owner/next', 'fixture.bad/next', { source: 'test' }),
      /invalid output/i,
    )
    await flush()
    assert.deepEqual(calls.map(call => call.pluginId), ['fixture.bad'])
    assert.equal(runtime.status('fixture.bad').state, 'failed')
    assert.equal(runtime.status('fixture.healthy').state, 'active')
    assert.deepEqual(runtime.listActions('fixture.owner/next').map(item => item.id), ['fixture.healthy/next'])
    assert.deepEqual(
      await runtime.act('fixture.owner/next', 'fixture.healthy/next', { source: 'test' }),
      { suggestions: ['healthy'] },
    )
    assert.deepEqual(calls.map(call => call.pluginId), ['fixture.bad', 'fixture.healthy'])
    await runtime.reconcile([])
  })

  await test('quarantines a timed-out selected implementation without switching implementations', async() => {
    const { backend, calls } = recordingBackend(async(plugin) => (
      plugin.id === 'fixture.timeout'
        ? await new Promise(() => {})
        : { suggestions: ['healthy'] }
    ))
    const runtime = new PluginLifecycle(backend)
    await runtime.reconcile([
      owner(),
      action('fixture.timeout', 'Slow action', -100),
      action('fixture.healthy', 'Healthy fallback', 100),
    ])

    await assert.rejects(
      runtime.act('fixture.owner/next', 'fixture.timeout/next', { source: 'test' }),
      /timed out/i,
    )
    await flush()
    assert.deepEqual(calls.map(call => call.pluginId), ['fixture.timeout'])
    assert.equal(runtime.status('fixture.timeout').state, 'failed')
    assert.equal(runtime.status('fixture.healthy').state, 'active')
    await runtime.reconcile([])
  })

  await test('disabling the owner cancels its in-flight action and rejects the old output', async() => {
    let cancelled = false
    const { backend } = recordingBackend(async(_plugin, _handler, _value, signal) => await new Promise(resolve => {
      signal.addEventListener('abort', () => {
        cancelled = true
        resolve({ suggestions: ['late'] })
      }, { once: true })
    }))
    const runtime = new PluginLifecycle(backend)
    await runtime.reconcile([owner(), action()])

    const pending = runtime.act('fixture.owner/next', 'fixture.action/next', { source: 'old' })
    const rejected = assert.rejects(pending, /cancelled/i)
    await flush()
    await runtime.reconcile([
      owner({ enabled: false, available: false }),
      action(),
    ])
    await rejected
    assert.equal(cancelled, true)
    await runtime.reconcile([])
  })

  await test('owner and action settings changes cancel in-flight work while preserving runtimes', async() => {
    for (const changedId of ['fixture.owner', 'fixture.action']) {
      let calls = 0
      let cancelled = false
      const { backend } = recordingBackend(async(_plugin, _handler, _value, signal) => {
        calls++
        if (calls > 1) return { suggestions: ['fresh'] }
        return await new Promise(resolve => {
          signal.addEventListener('abort', () => {
            cancelled = true
            resolve({ suggestions: ['late'] })
          }, { once: true })
        })
      })
      const runtime = new PluginLifecycle(backend)
      await runtime.reconcile([owner(), action()])

      const pending = runtime.act('fixture.owner/next', 'fixture.action/next', { source: 'old' })
      const rejected = assert.rejects(pending, /cancelled/i)
      await flush()
      assert.deepEqual(runtime.settingsChanged(changedId), ['fixture.owner/next'])
      await rejected
      assert.equal(cancelled, true)
      assert.equal(runtime.status('fixture.owner').state, 'active')
      assert.equal(runtime.status('fixture.action').state, 'active')
      assert.deepEqual(
        await runtime.act('fixture.owner/next', 'fixture.action/next', { source: 'fresh' }),
        { suggestions: ['fresh'] },
      )
      await runtime.reconcile([])
    }
  })

  await test('dependency, permission and point-version mismatches block action implementations', async() => {
    const noDependency = action('fixture.nodep', 'No dependency', 0, { dependencies: [] })
    const noPermission = action('fixture.nopermission', 'No permission', 0, { permissions: ['extensions.process'] })
    const wrongVersion = action('fixture.wrongversion', 'Wrong version', 0)
    wrongVersion.extensions![0].version = '2.0.0'

    const { backend } = recordingBackend(async() => ({ suggestions: ['unexpected'] }))
    const runtime = new PluginLifecycle(backend)
    await runtime.reconcile([owner(), noDependency, noPermission, wrongVersion])

    assert.equal(runtime.status('fixture.nodep').state, 'blocked')
    assert.equal(runtime.status('fixture.nopermission').state, 'blocked')
    assert.equal(runtime.status('fixture.wrongversion').state, 'blocked')
    assert.deepEqual(runtime.listActions('fixture.owner/next'), [])
    for (const actionId of ['fixture.nodep/next', 'fixture.nopermission/next', 'fixture.wrongversion/next']) {
      await assert.rejects(runtime.act('fixture.owner/next', actionId, { source: 'test' }))
    }
    await runtime.reconcile([])
  })

  await test('API 1.4 rejects action declarations and titles while API 1.5 accepts them', () => {
    const ownerManifest = (apiVersion: string) => ({
      id: 'fixture.owner',
      name: 'Fixture owner',
      version: '1.0.0',
      apiVersion,
      main: 'index.html',
      permissions: [],
      extensionPoints: [{
        id: 'next',
        version: '1.0.0',
        kind: 'action',
        input: inputSchema,
        output: outputSchema,
      }],
    })
    const actionManifest = (apiVersion: string, title = 'Next suggestions') => ({
      id: 'fixture.action',
      name: 'Fixture action',
      version: '1.0.0',
      apiVersion,
      main: 'runtime.html',
      permissions: ['extensions.act'],
      dependencies: [{ id: 'fixture.owner' }],
      runtime: { entry: 'runtime.html' },
      extensions: [{
        id: 'next',
        title,
        target: 'fixture.owner/next',
        version: '1.0.0',
        handler: 'next',
      }],
    })
    const titledProcessor = {
      id: 'fixture.processor',
      name: 'Fixture processor',
      version: '1.0.0',
      apiVersion: '1.4.0',
      main: 'runtime.html',
      permissions: ['extensions.process'],
      dependencies: [{ id: 'fixture.owner' }],
      runtime: { entry: 'runtime.html' },
      extensions: [{
        id: 'normalize',
        title: 'Normalize',
        target: 'fixture.owner/next',
        version: '1.0.0',
        handler: 'normalize',
      }],
    }

    assert.throws(() => validatePluginManifest(ownerManifest('1.4.0')))
    assert.equal(validatePluginManifest(ownerManifest('1.5.0')).extensionPoints?.[0].kind, 'action')
    assert.throws(() => validatePluginManifest(actionManifest('1.4.0')))
    assert.equal(validatePluginManifest(actionManifest('1.5.0')).extensions?.[0].title, 'Next suggestions')
    assert.throws(() => validatePluginManifest(titledProcessor))
    assert.throws(() => validatePluginManifest(actionManifest('1.5.0', '')))
    assert.throws(() => validatePluginManifest(actionManifest('1.5.0', 'x'.repeat(81))))
  })
}
