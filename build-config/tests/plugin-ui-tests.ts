import assert from 'node:assert/strict'
import {
  PluginLifecycle,
  PluginRuntimeBusyError,
  type RuntimeBackend,
  type RuntimePlugin,
} from '@main/modules/plugin/lifecycle'
import { validatePluginManifest } from '@common/plugin/security'
import {
  PLUGIN_UI_INPUT_SCHEMA,
  PLUGIN_UI_KINDS,
  PLUGIN_UI_SCHEMA,
  validatePluginUiDocument,
  type PluginUiDocument,
  type PluginUiInput,
  type PluginUiKind,
} from '@common/plugin/ui'
import { PLUGIN_API_VERSION, type ExtensionSchema } from '@common/plugin/types'

const flush = async() => {
  for (let index = 0; index < 16; index++) await Promise.resolve()
}

const plugin = (
  id: string,
  dependencies: string[] = [],
  extra: Partial<RuntimePlugin> = {},
): RuntimePlugin => ({
  id,
  name: id,
  version: '1.0.0',
  apiVersion: '1.7.0',
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

const uiInput = (): PluginUiInput => ({
  source: 'chengdu',
  suggestions: ['chengdu', 'rock'],
  actions: [{ id: 'fixture.action/open', title: 'Open' }],
})

const uiDocument = (overrides: Partial<PluginUiDocument> = {}): PluginUiDocument => ({
  layout: 'list',
  heading: 'Suggestions',
  items: [
    { label: 'Search again', command: 'text', value: '' },
    { label: 'chengdu', command: 'search', value: 'chengdu' },
    { label: 'Open', command: 'action', value: 'fixture.action/open' },
  ],
  ...overrides,
})

const owner = (kind: PluginUiKind = 'renderer', extra: Partial<RuntimePlugin> = {}) => plugin('fixture.owner', [], {
  name: 'Fixture UI owner',
  extensionPoints: [{
    id: 'surface',
    version: '1.0.0',
    kind,
    input: PLUGIN_UI_INPUT_SCHEMA,
    output: PLUGIN_UI_SCHEMA,
  }],
  ...extra,
})

const renderer = (
  id = 'fixture.renderer',
  title?: string,
  priority = 0,
  extra: Partial<RuntimePlugin> = {},
) => plugin(id, ['fixture.owner'], {
  name: `Renderer ${id}`,
  permissions: ['extensions.render'],
  runtime: { entry: 'runtime.html', timeoutMs: 100 },
  extensions: [{
    id: 'render',
    target: 'fixture.owner/surface',
    version: '1.0.0',
    handler: 'render',
    ...(title == null ? {} : { title }),
    priority,
  }],
  ...extra,
})

interface Invocation {
  plugin: RuntimePlugin
  handler: string
  value: unknown
  signal: AbortSignal
}

const recordingBackend = (
  invoke: (plugin: RuntimePlugin, handler: string, value: unknown, signal: AbortSignal) => unknown | Promise<unknown>,
) => {
  const calls: Invocation[] = []
  const starts: RuntimePlugin[] = []
  const backend: RuntimeBackend = {
    start: async(plugin) => {
      starts.push(plugin)
      return {
        invoke: async(handler, value, signal) => {
          calls.push({ plugin, handler, value, signal })
          return await invoke(plugin, handler, value, signal)
        },
        dispose: async() => {},
        destroy: () => {},
      }
    },
  }
  return { backend, calls, starts }
}

const reorderSchemaProperties = (schema: ExtensionSchema): ExtensionSchema => {
  if (schema.type === 'object') {
    return {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(schema.properties).reverse().map(([key, value]) => [key, reorderSchemaProperties(value)]),
      ),
    }
  }
  if (schema.type === 'array') {
    return { type: 'array', maxItems: schema.maxItems, items: reorderSchemaProperties(schema.items) }
  }
  return { ...schema }
}

const manifestOwner = (
  apiVersion = '1.7.0',
  kind: PluginUiKind = 'renderer',
  reordered = false,
  output: ExtensionSchema = PLUGIN_UI_SCHEMA,
) => ({
  id: 'fixture.manifest-owner',
  name: 'Fixture manifest owner',
  version: '1.0.0',
  apiVersion,
  main: 'index.html',
  permissions: [],
  extensionPoints: [{
    id: 'surface',
    version: '1.0.0',
    kind,
    input: reordered ? reorderSchemaProperties(PLUGIN_UI_INPUT_SCHEMA) : PLUGIN_UI_INPUT_SCHEMA,
    output: reordered ? reorderSchemaProperties(output) : output,
  }],
})

const manifestRenderer = (apiVersion = '1.7.0', extra: Record<string, unknown> = {}) => ({
  id: 'fixture.manifest-renderer',
  name: 'Fixture manifest renderer',
  version: '1.0.0',
  apiVersion,
  main: 'runtime.html',
  permissions: ['extensions.render'],
  dependencies: [{ id: 'fixture.manifest-owner' }],
  runtime: { entry: 'runtime.html' },
  extensions: [{
    id: 'render',
    title: 'Render',
    target: 'fixture.manifest-owner/surface',
    version: '1.0.0',
    handler: 'render',
  }],
  ...extra,
})

export const pluginUiTests = async(
  test: (name: string, run: () => void | Promise<void>) => Promise<void>,
) => {
  await test('bounds UI documents strictly and validates command references', () => {
    const input = uiInput()
    assert.equal(validatePluginUiDocument(uiDocument(), input), true)
    for (const layout of ['list', 'grid', 'row'] as const) {
      assert.equal(validatePluginUiDocument(uiDocument({ layout }), input), true)
    }
    assert.equal(validatePluginUiDocument(uiDocument({
      items: [{ label: '<img src=x onerror=alert(1)>', command: 'text', value: '' }],
    }), input), true, 'labels remain plain text data for host interpolation')

    const maximumInput: PluginUiInput = {
      source: 's'.repeat(32),
      suggestions: Array.from({ length: 12 }, (_, index) => {
        const prefix = `suggestion-${index}-`
        return `${prefix}${'s'.repeat(100 - prefix.length)}`
      }),
      actions: Array.from({ length: 12 }, (_, index) => {
        const prefix = `fixture.action/${index}/`
        return { id: `${prefix}${'a'.repeat(129 - prefix.length)}`, title: 't'.repeat(80) }
      }),
    }
    const maximumDocument: PluginUiDocument = {
      layout: 'grid',
      heading: 'h'.repeat(100),
      items: Array.from({ length: 24 }, (_, index) => (
        index % 3 === 0
          ? { label: 'l'.repeat(100), command: 'text', value: '' }
          : index % 3 === 1
            ? { label: 'l'.repeat(100), command: 'search', value: maximumInput.suggestions[index % 12] }
            : { label: 'l'.repeat(100), command: 'action', value: maximumInput.actions[index % 12].id }
      )),
    }
    assert.equal(validatePluginUiDocument(maximumDocument, maximumInput), true)

    const invalidInputs: unknown[] = [
      { ...input, source: 's'.repeat(33) },
      { ...input, suggestions: Array.from({ length: 13 }, () => 's') },
      { ...input, suggestions: ['s'.repeat(101)] },
      { ...input, actions: Array.from({ length: 13 }, () => ({ id: 'fixture.action/open', title: 'Open' })) },
      { ...input, actions: [{ id: 'a'.repeat(129), title: 't'.repeat(80) }], extra: true },
      { ...input, actions: [{ id: 'a'.repeat(130), title: 'Open' }] },
      { ...input, actions: [{ id: 'fixture.action/open', title: 't'.repeat(81) }] },
    ]
    for (const value of invalidInputs) assert.equal(validatePluginUiDocument(uiDocument(), value), false)

    const invalidDocuments: unknown[] = [
      { ...uiDocument(), items: [{ label: 'x', command: 'text', value: 'not-empty' }] },
      { ...uiDocument(), items: [{ label: 'x', command: 'search', value: 'foreign' }] },
      { ...uiDocument(), items: [{ label: 'x', command: 'action', value: 'fixture.action/foreign' }] },
      { ...uiDocument(), items: [{ label: 'x', command: 'eval', value: '' }] },
      { ...uiDocument(), layout: 'table' },
      { ...uiDocument(), layout: 'l'.repeat(9) },
      { ...uiDocument(), heading: 'h'.repeat(101) },
      { ...uiDocument(), items: Array.from({ length: 25 }, () => ({ label: 'x', command: 'text', value: '' })) },
      { ...uiDocument(), items: [{ label: 'l'.repeat(101), command: 'text', value: '' }] },
      { ...uiDocument(), items: [{ label: 'x', command: 'c'.repeat(9), value: '' }] },
      { ...uiDocument(), items: [{ label: 'x', command: 'text', value: 'v'.repeat(130) }] },
      { ...uiDocument(), extra: true },
      { ...uiDocument(), items: [{ ...uiDocument().items[0], html: '<b>x</b>' }] },
    ]
    for (const value of invalidDocuments) assert.equal(validatePluginUiDocument(value, input), false)
  })

  await test('lists active UI renderers and renders the explicitly selected implementation', async() => {
    const { backend, calls } = recordingBackend(async(plugin) => uiDocument({ heading: plugin.id }))
    const runtime = new PluginLifecycle(backend)
    const actionOwner = plugin('fixture.actions', [], {
      extensionPoints: [{
        id: 'surface',
        version: '1.0.0',
        kind: 'action',
        input: PLUGIN_UI_INPUT_SCHEMA,
        output: PLUGIN_UI_SCHEMA,
      }],
    })
    const actionImplementation = plugin('fixture.actions.impl', ['fixture.actions'], {
      permissions: ['extensions.act'],
      runtime: { entry: 'runtime.html', timeoutMs: 100 },
      extensions: [{
        id: 'run',
        target: 'fixture.actions/surface',
        version: '1.0.0',
        handler: 'run',
      }],
    })
    await runtime.reconcile([
      owner(),
      renderer('fixture.z', undefined, -10),
      renderer('fixture.a', 'A renderer', 10),
      renderer('fixture.disabled', 'Disabled renderer', 0, { enabled: false, available: false }),
      actionOwner,
      actionImplementation,
    ])

    assert.deepEqual(runtime.listRenderers('fixture.owner/surface'), [
      {
        id: 'fixture.z/render',
        title: 'Renderer fixture.z',
        pluginId: 'fixture.z',
        pluginName: 'Renderer fixture.z',
      },
      {
        id: 'fixture.a/render',
        title: 'A renderer',
        pluginId: 'fixture.a',
        pluginName: 'Renderer fixture.a',
      },
    ])
    assert.deepEqual(runtime.listRenderers('fixture.actions/surface'), [])
    assert.equal(calls.length, 0)

    await assert.rejects(
      runtime.render('fixture.owner/surface', 'fixture.a/render', { source: 'invalid' }),
      /invalid input/i,
    )
    assert.equal(calls.length, 0)
    assert.deepEqual(
      await runtime.render('fixture.owner/surface', 'fixture.a/render', uiInput()),
      uiDocument({ heading: 'fixture.a' }),
    )
    assert.deepEqual(calls.map(call => [call.plugin.id, call.handler]), [['fixture.a', 'render']])
    await assert.rejects(
      runtime.render('fixture.actions/surface', 'fixture.actions.impl/run', uiInput()),
      /UI extension unavailable/i,
    )

    await runtime.suspend('fixture.owner')
    assert.deepEqual(runtime.listRenderers('fixture.owner/surface'), [])
    await runtime.reconcile([])
  })

  await test('rejects duplicate in-flight renders without quarantining and releases capacity', async() => {
    let release: (value: unknown) => void = () => {}
    let calls = 0
    const { backend } = recordingBackend(async() => {
      calls++
      if (calls === 1) return await new Promise(resolve => { release = resolve })
      return uiDocument({ heading: 'after release' })
    })
    const runtime = new PluginLifecycle(backend)
    await runtime.reconcile([owner(), renderer()])

    const first = runtime.render('fixture.owner/surface', 'fixture.renderer/render', uiInput())
    await flush()
    await assert.rejects(
      runtime.render('fixture.owner/surface', 'fixture.renderer/render', uiInput()),
      (error: unknown) => error instanceof PluginRuntimeBusyError,
    )
    assert.equal(runtime.status('fixture.renderer').state, 'active')
    assert.equal(calls, 1)

    release(uiDocument({ heading: 'first' }))
    assert.deepEqual(await first, uiDocument({ heading: 'first' }))
    assert.deepEqual(
      await runtime.render('fixture.owner/surface', 'fixture.renderer/render', uiInput()),
      uiDocument({ heading: 'after release' }),
    )
    assert.equal(calls, 2)
    await runtime.reconcile([])
  })

  await test('owner revocation and committed settings reject stale render output', async() => {
    let cancelled = false
    const { backend } = recordingBackend(async(_plugin, _handler, _value, signal) => await new Promise(resolve => {
      signal.addEventListener('abort', () => {
        cancelled = true
        resolve(uiDocument({ heading: 'late' }))
      }, { once: true })
    }))
    const runtime = new PluginLifecycle(backend)
    await runtime.reconcile([owner(), renderer()])

    const pending = runtime.render('fixture.owner/surface', 'fixture.renderer/render', uiInput())
    const rejected = assert.rejects(pending, /cancelled/i)
    await flush()
    await runtime.reconcile([
      owner('renderer', { enabled: false, available: false }),
      renderer(),
    ])
    await rejected
    assert.equal(cancelled, true)
    await runtime.reconcile([])

    for (const changedId of ['fixture.owner', 'fixture.renderer']) {
      let calls = 0
      let settingsCancelled = false
      const { backend } = recordingBackend(async(_plugin, _handler, _value, signal) => {
        calls++
        if (calls > 1) return uiDocument({ heading: 'fresh' })
        return await new Promise(resolve => {
          signal.addEventListener('abort', () => {
            settingsCancelled = true
            resolve(uiDocument({ heading: 'stale' }))
          }, { once: true })
        })
      })
      const settingsRuntime = new PluginLifecycle(backend)
      await settingsRuntime.reconcile([owner(), renderer()])

      const stale = settingsRuntime.render('fixture.owner/surface', 'fixture.renderer/render', uiInput())
      const staleRejected = assert.rejects(stale, /cancelled/i)
      await flush()
      assert.deepEqual(settingsRuntime.settingsChanged(changedId), ['fixture.owner/surface'])
      await staleRejected
      assert.equal(settingsCancelled, true)
      assert.equal(settingsRuntime.status('fixture.owner').state, 'active')
      assert.equal(settingsRuntime.status('fixture.renderer').state, 'active')
      assert.deepEqual(
        await settingsRuntime.render('fixture.owner/surface', 'fixture.renderer/render', uiInput()),
        uiDocument({ heading: 'fresh' }),
      )
      await settingsRuntime.reconcile([])
    }
  })

  await test('permissions, dependencies, runtime and point versions block UI renderers', async() => {
    const noDependency = renderer('fixture.no-dependency', 'No dependency', 0, { dependencies: [] })
    const noPermission = renderer('fixture.no-permission', 'No permission', 0, { permissions: [] })
    const noRuntime = renderer('fixture.no-runtime', 'No runtime', 0, { runtime: undefined })
    const wrongVersion = renderer('fixture.wrong-version', 'Wrong version')
    wrongVersion.extensions![0].version = '2.0.0'
    const blocked = [noDependency, noPermission, noRuntime, wrongVersion]

    const { backend, calls, starts } = recordingBackend(async() => uiDocument())
    const runtime = new PluginLifecycle(backend)
    await runtime.reconcile([owner(), ...blocked])

    for (const implementation of blocked) {
      assert.equal(runtime.status(implementation.id).state, 'blocked', implementation.id)
      await assert.rejects(
        runtime.render('fixture.owner/surface', `${implementation.id}/render`, uiInput()),
      )
    }
    assert.deepEqual(runtime.listRenderers('fixture.owner/surface'), [])
    assert.equal(calls.length, 0)
    assert.deepEqual(starts, [])
    await runtime.reconcile([])
  })

  await test('API 1.7 gates all UI kinds and exact property-order-insensitive UI schemas', () => {
    assert.ok(Number(PLUGIN_API_VERSION.split('.')[1]) >= 7)
    assert.deepEqual(PLUGIN_UI_KINDS, ['renderer', 'slot', 'toolbar'])
    const canonicalOutput = PLUGIN_UI_SCHEMA as Extract<ExtensionSchema, { type: 'object' }>
    const mismatchedOutput: ExtensionSchema = {
      type: 'object',
      properties: {
        ...canonicalOutput.properties,
        heading: { type: 'string', maxLength: 99 },
      },
    }

    for (const kind of PLUGIN_UI_KINDS) {
      assert.equal(validatePluginManifest(manifestOwner('1.7.0', kind)).extensionPoints?.[0].kind, kind)
      assert.throws(() => validatePluginManifest(manifestOwner('1.6.0', kind)))
    }
    assert.deepEqual(
      validatePluginManifest(manifestOwner('1.7.0', 'slot', true)).extensionPoints?.[0].kind,
      'slot',
    )
    assert.throws(() => validatePluginManifest(manifestOwner('1.7.0', 'toolbar', false, mismatchedOutput)))

    assert.equal(validatePluginManifest(manifestRenderer()).permissions[0], 'extensions.render')
    assert.throws(() => validatePluginManifest(manifestRenderer('1.6.0')))
    assert.throws(() => validatePluginManifest(manifestRenderer('1.7.0', { runtime: undefined })))
    assert.throws(() => validatePluginManifest(manifestRenderer('1.7.0', { dependencies: [] })))
    assert.throws(() => validatePluginManifest(manifestRenderer('1.7.0', { permissions: [] })))
  })

  await test('invalid UI outputs quarantine only the selected renderer without fallback', async() => {
    const cases: Array<[string, unknown]> = [
      ['unsafe command', {
        layout: 'list',
        heading: 'Invalid command',
        items: [{ label: 'Run', command: 'eval', value: '' }],
      }],
      ['foreign action', {
        layout: 'row',
        heading: 'Invalid action',
        items: [{ label: 'Run', command: 'action', value: 'fixture.action/foreign' }],
      }],
      ['foreign search', {
        layout: 'grid',
        heading: 'Invalid search',
        items: [{ label: 'Search', command: 'search', value: 'foreign' }],
      }],
      ['non-empty text value', {
        layout: 'list',
        heading: 'Invalid text',
        items: [{ label: 'Text', command: 'text', value: 'unexpected' }],
      }],
      ['output attribute', { ...uiDocument(), script: 'alert(1)' }],
      ['item output attribute', {
        ...uiDocument(),
        items: [{ ...uiDocument().items[0], html: '<b>unsafe</b>' }],
      }],
      ['invalid layout', { ...uiDocument(), layout: 'table' }],
      ['schema mismatch', { layout: 'list', items: [] }],
    ]

    for (const [name, invalidOutput] of cases) {
      const { backend, calls } = recordingBackend(async(plugin) => (
        plugin.id === 'fixture.bad'
          ? invalidOutput
          : uiDocument({ heading: 'healthy' })
      ))
      const runtime = new PluginLifecycle(backend)
      await runtime.reconcile([
        owner(),
        renderer('fixture.bad', 'Bad renderer', -100),
        renderer('fixture.healthy', 'Healthy fallback', 100),
      ])

      assert.equal(validatePluginUiDocument(invalidOutput, uiInput()), false, name)
      await assert.rejects(
        runtime.render('fixture.owner/surface', 'fixture.bad/render', uiInput()),
        /invalid output/i,
        name,
      )
      await flush()
      assert.deepEqual(calls.map(call => call.plugin.id), ['fixture.bad'], name)
      assert.equal(runtime.status('fixture.bad').state, 'failed', name)
      assert.equal(runtime.status('fixture.healthy').state, 'active', name)
      assert.deepEqual(runtime.listRenderers('fixture.owner/surface').map(item => item.id), ['fixture.healthy/render'])
      assert.deepEqual(
        await runtime.render('fixture.owner/surface', 'fixture.healthy/render', uiInput()),
        uiDocument({ heading: 'healthy' }),
      )
      assert.deepEqual(calls.map(call => call.plugin.id), ['fixture.bad', 'fixture.healthy'])
      await runtime.reconcile([])
    }
  })
}
