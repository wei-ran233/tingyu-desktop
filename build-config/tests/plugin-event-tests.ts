import assert from 'node:assert/strict'
import {
  PluginLifecycle,
  PluginRuntimeBusyError,
  type EventPublisher,
  type RuntimeBackend,
  type RuntimePlugin,
} from '@main/modules/plugin/lifecycle'
import { validatePluginManifest } from '@common/plugin/security'
import type { ExtensionSchema } from '@common/plugin/types'

const payloadSchema: ExtensionSchema = {
  type: 'object',
  properties: {
    sequence: { type: 'number' },
    meta: {
      type: 'object',
      properties: {
        count: { type: 'number' },
      },
    },
  },
}
const emptyOutput: ExtensionSchema = { type: 'object', properties: {} }
const payload = (sequence = 1) => ({ sequence, meta: { count: sequence } })

const deferred = <T = undefined>() => {
  let settle!: (value: T | PromiseLike<T>) => void
  let fail!: (reason?: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve
    fail = reject
  })
  return { promise, resolve: (value: T = undefined as T) => { settle(value) }, reject: fail }
}

const within = async<T>(promise: Promise<T>, label: string, timeoutMs = 500): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { reject(new Error(`${label} timed out`)) }, timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer != null) clearTimeout(timer)
  }
}

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
  apiVersion: '1.6.0',
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

const owner = (id = 'fixture.owner', extra: Partial<RuntimePlugin> = {}) => plugin(id, [], {
  permissions: ['events.publish'],
  runtime: { entry: 'runtime.html', timeoutMs: 100 },
  extensionPoints: [{
    id: 'tick',
    version: '1.0.0',
    kind: 'event',
    input: payloadSchema,
    output: emptyOutput,
  }],
  ...extra,
})

const subscriber = (
  id: string,
  targets: string | string[] = 'fixture.owner/tick',
  extra: Partial<RuntimePlugin> = {},
) => {
  const targetList = Array.isArray(targets) ? targets : [targets]
  const dependencies = [...new Set(targetList.map(target => target.split('/')[0]))]
  return plugin(id, dependencies, {
    permissions: ['extensions.subscribe'],
    runtime: { entry: 'runtime.html', timeoutMs: 100 },
    extensions: targetList.map((target, index) => ({
      id: `subscribe${index}`,
      target,
      version: '1.0.0',
      handler: `handle${index}`,
    })),
    ...extra,
  })
}

interface Invocation {
  plugin: RuntimePlugin
  handler: string
  value: unknown
  signal: AbortSignal
}
interface StartCall {
  plugin: RuntimePlugin
  signal: AbortSignal
  publishEvent: EventPublisher
}

const recordingBackend = (
  invoke: (plugin: RuntimePlugin, handler: string, value: unknown, signal: AbortSignal) => unknown | Promise<unknown>,
) => {
  const calls: Invocation[] = []
  const starts: StartCall[] = []
  const backend: RuntimeBackend = {
    start: async(plugin, signal, _failed, publishEvent) => {
      starts.push({ plugin, signal, publishEvent })
      return {
        invoke: async(handler, value, requestSignal) => {
          calls.push({ plugin, handler, value, signal: requestSignal })
          return await invoke(plugin, handler, value, requestSignal)
        },
        dispose: async() => {},
        destroy: () => {},
      }
    },
  }
  return { backend, calls, starts }
}

export async function pluginEventTests(
  test: (name: string, run: () => Promise<void> | void) => Promise<void>,
): Promise<void> {
  await test('API 1.6 gates event declarations, permissions and empty acknowledgements', async() => {
    const eventPoint = {
      id: 'tick',
      version: '1.0.0',
      kind: 'event' as const,
      input: payloadSchema,
      output: emptyOutput,
    }
    const eventOwner = (apiVersion: string, permissions: string[] = ['events.publish'], output: ExtensionSchema = emptyOutput) => ({
      id: 'fixture.manifest-owner',
      name: 'Manifest owner',
      version: '1.0.0',
      apiVersion,
      main: 'index.html',
      permissions,
      extensionPoints: [{ ...eventPoint, output }],
    })
    const eventSubscriber = (apiVersion: string, extra: Record<string, unknown> = {}) => ({
      id: 'fixture.manifest-subscriber',
      name: 'Manifest subscriber',
      version: '1.0.0',
      apiVersion,
      main: 'runtime.html',
      permissions: ['extensions.subscribe'],
      dependencies: [{ id: 'fixture.manifest-owner' }],
      runtime: { entry: 'runtime.html' },
      extensions: [{
        id: 'subscribe',
        target: 'fixture.manifest-owner/tick',
        version: '1.0.0',
        handler: 'handle',
      }],
      ...extra,
    })

    assert.equal(validatePluginManifest(eventOwner('1.6.0')).extensionPoints?.[0].kind, 'event')
    assert.equal(validatePluginManifest(eventSubscriber('1.6.0')).permissions[0], 'extensions.subscribe')
    assert.throws(() => validatePluginManifest(eventOwner('1.5.0')))
    assert.throws(() => validatePluginManifest(eventSubscriber('1.5.0')))
    assert.throws(() => validatePluginManifest(eventOwner('1.5.0', [], undefined)))
    assert.throws(() => validatePluginManifest(eventOwner('1.6.0', [])))
    assert.throws(() => validatePluginManifest(eventOwner('1.6.0', ['events.publish'], {
      type: 'object',
      properties: { accepted: { type: 'boolean' } },
    })))
    assert.throws(() => validatePluginManifest(eventSubscriber('1.5.0', {
      runtime: undefined,
      extensions: undefined,
    })))
    assert.throws(() => validatePluginManifest(eventSubscriber('1.6.0', { runtime: undefined })))
    assert.throws(() => validatePluginManifest(eventSubscriber('1.6.0', { dependencies: [] })))

    const actionPoint = {
      id: 'action',
      version: '1.0.0',
      kind: 'action' as const,
      input: payloadSchema,
      output: emptyOutput,
    }
    const contractOwner = owner('fixture.contract-owner', {
      extensionPoints: [
        { id: 'tick', version: '1.0.0', kind: 'event', input: payloadSchema, output: emptyOutput },
        actionPoint,
      ],
    })
    const noRuntime = subscriber('fixture.no-runtime', 'fixture.contract-owner/tick')
    delete noRuntime.runtime
    const blockedSubscribers = [
      noRuntime,
      subscriber('fixture.no-permission', 'fixture.contract-owner/tick', { permissions: [] }),
      subscriber('fixture.event-act-permission', 'fixture.contract-owner/tick', { permissions: ['extensions.act'] }),
      subscriber('fixture.no-dependency', 'fixture.contract-owner/tick', { dependencies: [] }),
      subscriber('fixture.wrong-version', 'fixture.contract-owner/tick', {
        extensions: [{
          id: 'subscribe0',
          target: 'fixture.contract-owner/tick',
          version: '2.0.0',
          handler: 'handle0',
        }],
      }),
      subscriber('fixture.wrong-kind', 'fixture.contract-owner/action'),
    ]
    const { backend } = recordingBackend(async() => ({}))
    const runtime = new PluginLifecycle(backend)
    await runtime.reconcile([contractOwner, ...blockedSubscribers])
    for (const blocked of blockedSubscribers) {
      assert.equal(runtime.status(blocked.id).state, 'blocked', blocked.id)
    }
    assert.deepEqual(
      await runtime.publishEvent('fixture.contract-owner', 'fixture.contract-owner/tick', payload()),
      { delivered: 0, failed: 0, skipped: 0 },
    )
    await runtime.reconcile([])
  })

  await test('publish rejects foreign, inactive, non-event, invalid, oversized and foreign-signal calls', async() => {
    const { backend, starts } = recordingBackend(async() => ({}))
    const validOwner = owner()
    const otherOwner = owner('fixture.other-owner')
    const nonEvent = plugin('fixture.non-event', [], {
      permissions: ['events.publish'],
      runtime: { entry: 'runtime.html', timeoutMs: 100 },
      extensionPoints: [{
        id: 'tick',
        version: '1.0.0',
        kind: 'action',
        input: payloadSchema,
        output: emptyOutput,
      }],
    })
    const noPermission = owner('fixture.no-publish', { permissions: [] })
    const inactive = owner('fixture.inactive', { enabled: false, available: false })
    const arrayInput: ExtensionSchema = {
      type: 'array',
      maxItems: 32,
      items: { type: 'string', maxLength: 4096 },
    }
    const largeOwner = owner('fixture.large', {
      extensionPoints: [{
        id: 'tick',
        version: '1.0.0',
        kind: 'event',
        input: arrayInput,
        output: emptyOutput,
      }],
    })
    const runtime = new PluginLifecycle(backend)
    await runtime.reconcile([validOwner, otherOwner, nonEvent, noPermission, inactive, largeOwner])

    const validStart = starts.find(start => start.plugin.id === validOwner.id)!
    assert.deepEqual(
      await runtime.publishEvent(validOwner.id, 'fixture.owner/tick', payload()),
      { delivered: 0, failed: 0, skipped: 0 },
    )
    assert.deepEqual(
      await runtime.publishEvent(validOwner.id, 'fixture.owner/tick', payload(2), validStart.signal),
      { delivered: 0, failed: 0, skipped: 0 },
    )
    assert.deepEqual(
      await validStart.publishEvent('fixture.owner/tick', payload(3)),
      { delivered: 0, failed: 0, skipped: 0 },
    )

    await assert.rejects(runtime.publishEvent(otherOwner.id, 'fixture.owner/tick', payload()), /Event point/)
    await assert.rejects(runtime.publishEvent(validOwner.id, 'fixture.owner/tick/extra', payload()), /Event point/)
    await assert.rejects(runtime.publishEvent(nonEvent.id, 'fixture.non-event/tick', payload()), /Event point/)
    await assert.rejects(runtime.publishEvent(noPermission.id, 'fixture.no-publish/tick', payload()), /Event point/)
    await assert.rejects(runtime.publishEvent(inactive.id, 'fixture.inactive/tick', payload()), /Event point/)
    await assert.rejects(
      runtime.publishEvent(validOwner.id, 'fixture.owner/tick', { sequence: 'invalid', meta: { count: 1 } }),
      /Event point/,
    )
    await assert.rejects(
      runtime.publishEvent(validOwner.id, 'fixture.owner/tick', payload(), new AbortController().signal),
      /Event point/,
    )
    await assert.rejects(
      runtime.publishEvent(largeOwner.id, 'fixture.large/tick', Array.from({ length: 32 }, () => 'x'.repeat(4096))),
      /size/i,
    )
    assert.equal(runtime.status(validOwner.id).state, 'active')
    await runtime.reconcile([])
  })

  await test('event inputs accept only bounded plain JSON containers without hidden or executable payloads', async() => {
    const emptyOwner = owner('fixture.strict-empty', {
      extensionPoints: [{
        id: 'empty',
        version: '1.0.0',
        kind: 'event',
        input: emptyOutput,
        output: emptyOutput,
      }],
    })
    const arrayOwner = owner('fixture.strict-array', {
      extensionPoints: [{
        id: 'list',
        version: '1.0.0',
        kind: 'event',
        input: {
          type: 'array',
          maxItems: 2,
          items: { type: 'string', maxLength: 10 },
        },
        output: emptyOutput,
      }],
    })
    const { backend, calls } = recordingBackend(async() => ({}))
    const runtime = new PluginLifecycle(backend)
    await runtime.reconcile([
      owner(),
      emptyOwner,
      arrayOwner,
      subscriber('fixture.strict-subscriber', [
        'fixture.owner/tick',
        'fixture.strict-empty/empty',
        'fixture.strict-array/list',
      ]),
    ])

    for (const value of [
      new Date(),
      new Map(),
      new Set(),
      new ArrayBuffer(64 * 1024 + 1),
      new Uint8Array(1),
    ]) {
      const before = calls.length
      await assert.rejects(
        runtime.publishEvent(emptyOwner.id, 'fixture.strict-empty/empty', value),
        /invalid publisher\/input/,
      )
      assert.equal(calls.length, before)
      assert.equal(runtime.status(emptyOwner.id).state, 'active')
    }

    let getterCalls = 0
    let toJSONCalls = 0
    const accessorPayload = payload()
    Object.defineProperty(accessorPayload, 'sequence', {
      enumerable: true,
      get() {
        getterCalls++
        return 1
      },
    })
    const toJSONPayload: Record<string, unknown> = {
      ...payload(),
      toJSON() {
        toJSONCalls++
        return payload()
      },
    }
    const symbolicPayload = payload() as ReturnType<typeof payload> & Record<PropertyKey, unknown>
    symbolicPayload[Symbol('hidden')] = 'payload'
    const nonEnumerablePayload = payload()
    Object.defineProperty(nonEnumerablePayload, 'hidden', { value: 'payload' })
    for (const value of [
      accessorPayload,
      toJSONPayload,
      symbolicPayload,
      nonEnumerablePayload,
      Object.assign(Object.create({ inherited: true }), payload()),
    ]) {
      const before = calls.length
      await assert.rejects(
        runtime.publishEvent('fixture.owner', 'fixture.owner/tick', value),
        /invalid publisher\/input/,
      )
      assert.equal(calls.length, before)
    }
    assert.equal(getterCalls, 0)
    assert.equal(toJSONCalls, 0)

    let arrayGetterCalls = 0
    const accessorArray = ['ok']
    Object.defineProperty(accessorArray, '0', {
      enumerable: true,
      get() {
        arrayGetterCalls++
        return 'ok'
      },
    })
    const nonEnumerableIndex = ['ok']
    Object.defineProperty(nonEnumerableIndex, '0', { value: 'ok', enumerable: false })
    const extraArrayField = ['ok'] as string[] & { hidden?: unknown }
    extraArrayField.hidden = 'payload'
    const symbolicArray = ['ok'] as string[] & Record<PropertyKey, unknown>
    symbolicArray[Symbol('hidden')] = 'payload'
    const arrayToJSON = ['ok'] as string[] & { toJSON: () => unknown }
    arrayToJSON.toJSON = () => ['payload']
    for (const value of [
      new Array(1),
      accessorArray,
      nonEnumerableIndex,
      extraArrayField,
      symbolicArray,
      arrayToJSON,
    ]) {
      const before = calls.length
      await assert.rejects(
        runtime.publishEvent(arrayOwner.id, 'fixture.strict-array/list', value),
        /invalid publisher\/input/,
      )
      assert.equal(calls.length, before)
    }
    assert.equal(arrayGetterCalls, 0)

    const emptyNullPrototype = Object.create(null) as Record<string, never>
    const payloadNullPrototype = Object.assign(Object.create(null), payload(2)) as ReturnType<typeof payload>
    const arrayNullPrototype = ['ok']
    Object.setPrototypeOf(arrayNullPrototype, null)
    for (const [publisherId, target, value] of [
      [emptyOwner.id, 'fixture.strict-empty/empty', {}],
      [emptyOwner.id, 'fixture.strict-empty/empty', emptyNullPrototype],
      ['fixture.owner', 'fixture.owner/tick', payloadNullPrototype],
      [arrayOwner.id, 'fixture.strict-array/list', ['ok']],
      [arrayOwner.id, 'fixture.strict-array/list', arrayNullPrototype],
    ] as const) {
      assert.deepEqual(await runtime.publishEvent(publisherId, target, value), { delivered: 1, failed: 0, skipped: 0 })
    }
    assert.deepEqual(calls.map(call => call.plugin.id), Array.from({ length: 5 }, () => 'fixture.strict-subscriber'))
    await runtime.reconcile([])
  })

  await test('fanout is parallel, acknowledgements are empty, and payload clones isolate subscribers', async() => {
    const bothStarted = deferred<undefined>()
    const mutationFinished = deferred<undefined>()
    let started = 0
    let observedByB: unknown
    const { backend } = recordingBackend(async(plugin, _handler, input) => {
      if (plugin.id === 'fixture.a') {
        started++
        if (started === 2) bothStarted.resolve()
        await bothStarted.promise
        const mutableInput = input as ReturnType<typeof payload>
        mutableInput.meta.count = 99
        mutationFinished.resolve()
      } else {
        started++
        if (started === 2) bothStarted.resolve()
        await bothStarted.promise
        await mutationFinished.promise
        observedByB = structuredClone(input)
      }
      return {}
    })
    const runtime = new PluginLifecycle(backend)
    const input = payload()
    await runtime.reconcile([owner(), subscriber('fixture.a'), subscriber('fixture.b')])

    assert.deepEqual(
      await within(
        runtime.publishEvent('fixture.owner', 'fixture.owner/tick', input),
        'parallel event fanout',
      ),
      { delivered: 2, failed: 0, skipped: 0 },
    )
    assert.deepEqual(observedByB, payload())
    assert.deepEqual(input, payload())
    await runtime.reconcile([])
  })

  await test('publisher snapshots active subscribers and late subscribers receive no history', async() => {
    const firstStarted = deferred<undefined>()
    const releaseFirst = deferred<undefined>()
    let firstInvocation = true
    const { backend, calls } = recordingBackend(async(plugin) => {
      if (plugin.id === 'fixture.a' && firstInvocation) {
        firstInvocation = false
        firstStarted.resolve()
        await releaseFirst.promise
      }
      return {}
    })
    const runtime = new PluginLifecycle(backend)
    const ownerPlugin = owner()
    const subscriberA = subscriber('fixture.a')
    const subscriberB = subscriber('fixture.b')
    await runtime.reconcile([ownerPlugin, subscriberA])

    const first = runtime.publishEvent(ownerPlugin.id, 'fixture.owner/tick', payload(1))
    await within(firstStarted.promise, 'initial subscriber start')
    await runtime.reconcile([ownerPlugin, subscriberA, subscriberB])
    releaseFirst.resolve()
    assert.deepEqual(await first, { delivered: 1, failed: 0, skipped: 0 })
    assert.deepEqual(calls.map(call => call.plugin.id), ['fixture.a'])

    assert.deepEqual(
      await runtime.publishEvent(ownerPlugin.id, 'fixture.owner/tick', payload(2)),
      { delivered: 2, failed: 0, skipped: 0 },
    )
    assert.equal(calls.filter(call => call.plugin.id === 'fixture.a').length, 2)
    assert.equal(calls.filter(call => call.plugin.id === 'fixture.b').length, 1)
    await runtime.reconcile([])
  })

  await test('publisher FIFO admits 16 in-flight events while another publisher runs independently', async() => {
    const releaseA = deferred<undefined>()
    const releaseB = deferred<undefined>()
    const startedA = deferred<undefined>()
    const startedB = deferred<undefined>()
    const { backend, calls } = recordingBackend(async(plugin, _handler, input) => {
      if (plugin.id === 'fixture.a') {
        if ((input as ReturnType<typeof payload>).sequence === 1) {
          startedA.resolve()
          await releaseA.promise
        }
      } else {
        startedB.resolve()
        await releaseB.promise
      }
      return {}
    })
    const runtime = new PluginLifecycle(backend)
    await runtime.reconcile([
      owner('fixture.owner-a'),
      subscriber('fixture.a', 'fixture.owner-a/tick'),
      owner('fixture.owner-b'),
      subscriber('fixture.b', 'fixture.owner-b/tick'),
    ])

    const receipts = [
      runtime.publishEvent('fixture.owner-a', 'fixture.owner-a/tick', payload(1)),
      runtime.publishEvent('fixture.owner-b', 'fixture.owner-b/tick', payload(1)),
    ]
    await within(Promise.all([startedA.promise, startedB.promise]), 'cross-owner event start')
    for (let sequence = 2; sequence <= 16; sequence++) {
      receipts.push(runtime.publishEvent('fixture.owner-a', 'fixture.owner-a/tick', payload(sequence)))
    }
    await assert.rejects(
      runtime.publishEvent('fixture.owner-a', 'fixture.owner-a/tick', payload(17)),
      (error: unknown) => error instanceof PluginRuntimeBusyError,
    )
    await flush()
    assert.deepEqual(
      calls.filter(call => call.plugin.id === 'fixture.a').map(call => (call.value as ReturnType<typeof payload>).sequence),
      [1],
    )
    assert.deepEqual(
      calls.filter(call => call.plugin.id === 'fixture.b').map(call => (call.value as ReturnType<typeof payload>).sequence),
      [1],
    )

    releaseA.resolve()
    releaseB.resolve()
    assert.deepEqual(await Promise.all(receipts), [
      ...Array.from({ length: 16 }, () => ({ delivered: 1, failed: 0, skipped: 0 })),
      { delivered: 1, failed: 0, skipped: 0 },
    ])
    assert.deepEqual(
      calls.filter(call => call.plugin.id === 'fixture.a').map(call => (call.value as ReturnType<typeof payload>).sequence),
      Array.from({ length: 16 }, (_, index) => index + 1),
    )
    assert.equal(runtime.status('fixture.owner-a').state, 'active')
    assert.equal(runtime.status('fixture.a').state, 'active')
    await runtime.reconcile([])
  })

  await test('global event capacity rejects the 65th accepted event without quarantining runtimes', async() => {
    const release = deferred<undefined>()
    const fiveHeadsStarted = deferred<undefined>()
    let invocations = 0
    const { backend, calls } = recordingBackend(async() => {
      invocations++
      if (invocations === 5) fiveHeadsStarted.resolve()
      await release.promise
      return {}
    })
    const runtime = new PluginLifecycle(backend)
    const desired: RuntimePlugin[] = []
    const targets: Array<{ publisherId: string, target: string }> = []
    for (let ownerIndex = 0; ownerIndex < 5; ownerIndex++) {
      const ownerId = `fixture.global-owner-${ownerIndex}`
      const subscriberId = `fixture.global-subscriber-${ownerIndex}`
      const extensionPoints = Array.from({ length: 13 }, (_, eventIndex) => ({
        id: `event${eventIndex}`,
        version: '1.0.0',
        kind: 'event' as const,
        input: payloadSchema,
        output: emptyOutput,
      }))
      const eventTargets = extensionPoints.map(point => `${ownerId}/${point.id}`)
      desired.push(
        owner(ownerId, { extensionPoints }),
        subscriber(subscriberId, eventTargets),
      )
      for (const target of eventTargets) targets.push({ publisherId: ownerId, target })
    }
    await runtime.reconcile(desired)

    const receipts = targets.slice(0, 64).map(async({ publisherId, target }, index) => (
      runtime.publishEvent(publisherId, target, payload(index))
    ))
    const overflowTarget = targets[64]
    await assert.rejects(
      runtime.publishEvent(overflowTarget.publisherId, overflowTarget.target, payload(65)),
      (error: unknown) => error instanceof PluginRuntimeBusyError,
    )
    await within(fiveHeadsStarted.promise, 'five publisher queue heads')
    assert.equal(calls.length, 5)
    release.resolve()
    const results = await Promise.all(receipts)
    assert.ok(results.every(result => result.delivered === 1 && result.failed === 0 && result.skipped === 0))
    assert.equal(calls.length, 64)
    assert.ok(desired.every(plugin => runtime.status(plugin.id).state === 'active'))
    await runtime.reconcile([])
  })

  await test('more than 64 active subscribers is rejected as runtime backpressure', async() => {
    const { backend, calls } = recordingBackend(async() => ({}))
    const runtime = new PluginLifecycle(backend)
    const ownerPlugin = owner()
    const subscribers = Array.from(
      { length: 65 },
      (_, index) => subscriber(`fixture.subscriber-${index}`),
    )
    await runtime.reconcile([ownerPlugin, ...subscribers])

    await assert.rejects(
      runtime.publishEvent(ownerPlugin.id, 'fixture.owner/tick', payload()),
      (error: unknown) => error instanceof PluginRuntimeBusyError,
    )
    assert.equal(calls.length, 0)
    assert.equal(runtime.status(ownerPlugin.id).state, 'active')
    assert.ok(subscribers.every(item => runtime.status(item.id).state === 'active'))
    await runtime.suspend(ownerPlugin.id)
  })

  await test('throw and invalid acknowledgement quarantine only the failing subscriber and never retry', async() => {
    for (const mode of ['throw', 'invalid'] as const) {
      let badCalls = 0
      const { backend } = recordingBackend(async(plugin) => {
        if (plugin.id === 'fixture.bad') {
          badCalls++
          if (mode === 'throw') throw new Error('subscriber failed')
          return { unexpected: true }
        }
        return {}
      })
      const runtime = new PluginLifecycle(backend)
      await runtime.reconcile([
        owner(),
        subscriber('fixture.bad'),
        subscriber('fixture.good'),
        plugin('fixture.dependent', ['fixture.bad']),
      ])

      assert.deepEqual(
        await runtime.publishEvent('fixture.owner', 'fixture.owner/tick', payload(1)),
        { delivered: 1, failed: 1, skipped: 0 },
      )
      await flush()
      assert.equal(runtime.status('fixture.bad').state, 'failed')
      assert.equal(runtime.status('fixture.dependent').state, 'blocked')
      assert.equal(runtime.status('fixture.good').state, 'active')
      assert.deepEqual(
        await runtime.publishEvent('fixture.owner', 'fixture.owner/tick', payload(2)),
        { delivered: 1, failed: 0, skipped: 0 },
      )
      assert.equal(badCalls, 1)
      await runtime.reconcile([])
    }
  })

  await test('non-JSON acknowledgements quarantine only the failing subscriber', async() => {
    for (const [kind, createInvalidAck] of [
      ['Date', () => new Date()],
      ['Map', () => new Map()],
      ['ArrayBuffer', () => new ArrayBuffer(64 * 1024 + 1)],
    ] as const) {
      let badCalls = 0
      const { backend } = recordingBackend(async(plugin) => {
        if (plugin.id === 'fixture.bad-ack') {
          badCalls++
          return createInvalidAck()
        }
        return Object.create(null)
      })
      const runtime = new PluginLifecycle(backend)
      await runtime.reconcile([
        owner(`fixture.owner-${kind}`),
        subscriber('fixture.bad-ack', `fixture.owner-${kind}/tick`),
        subscriber('fixture.good-ack', `fixture.owner-${kind}/tick`),
        plugin('fixture.dependent-ack', ['fixture.bad-ack']),
      ])

      assert.deepEqual(
        await runtime.publishEvent(`fixture.owner-${kind}`, `fixture.owner-${kind}/tick`, payload(1)),
        { delivered: 1, failed: 1, skipped: 0 },
        kind,
      )
      await flush()
      assert.equal(runtime.status('fixture.bad-ack').state, 'failed', kind)
      assert.equal(runtime.status('fixture.dependent-ack').state, 'blocked', kind)
      assert.equal(runtime.status('fixture.good-ack').state, 'active', kind)
      assert.deepEqual(
        await runtime.publishEvent(`fixture.owner-${kind}`, `fixture.owner-${kind}/tick`, payload(2)),
        { delivered: 1, failed: 0, skipped: 0 },
        kind,
      )
      assert.equal(badCalls, 1, kind)
      await runtime.reconcile([])
    }
  })

  await test('a timed-out handler is quarantined without affecting a healthy subscriber or retrying', async() => {
    let badCalls = 0
    const { backend } = recordingBackend(async(plugin) => {
      if (plugin.id === 'fixture.timeout') {
        badCalls++
        return await new Promise(() => {})
      }
      return {}
    })
    const runtime = new PluginLifecycle(backend)
    await runtime.reconcile([
      owner(),
      subscriber('fixture.timeout'),
      subscriber('fixture.good'),
      plugin('fixture.timeout-dependent', ['fixture.timeout']),
    ])

    assert.deepEqual(
      await within(
        runtime.publishEvent('fixture.owner', 'fixture.owner/tick', payload(1)),
        'event handler timeout isolation',
        3500,
      ),
      { delivered: 1, failed: 1, skipped: 0 },
    )
    await flush()
    assert.equal(runtime.status('fixture.timeout').state, 'failed')
    assert.equal(runtime.status('fixture.timeout-dependent').state, 'blocked')
    assert.equal(runtime.status('fixture.good').state, 'active')
    assert.deepEqual(
      await runtime.publishEvent('fixture.owner', 'fixture.owner/tick', payload(2)),
      { delivered: 1, failed: 0, skipped: 0 },
    )
    assert.equal(badCalls, 1)
    await runtime.reconcile([])
  })

  await test('owner disable, replacement and settings changes cancel its executing and queued events', async() => {
    for (const mode of ['disable', 'replace', 'settings'] as const) {
      const started = deferred<undefined>()
      const { backend, calls } = recordingBackend(async(_plugin, _handler, _value, signal) => {
        started.resolve()
        return await new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => { reject(new Error('invocation cancelled')) }, { once: true })
        })
      })
      const runtime = new PluginLifecycle(backend)
      const ownerPlugin = owner(`fixture.owner-${mode}`)
      const subscriberPlugin = subscriber(`fixture.subscriber-${mode}`, `${ownerPlugin.id}/tick`)
      await runtime.reconcile([ownerPlugin, subscriberPlugin])

      const first = runtime.publishEvent(ownerPlugin.id, `${ownerPlugin.id}/tick`, payload(1))
      await within(started.promise, `${mode} event start`)
      const second = runtime.publishEvent(ownerPlugin.id, `${ownerPlugin.id}/tick`, payload(2))
      await flush()
      assert.equal(calls.length, 1)

      if (mode === 'disable') {
        await runtime.reconcile([
          { ...ownerPlugin, enabled: false, available: false },
          subscriberPlugin,
        ])
      } else if (mode === 'replace') {
        await runtime.reconcile([
          { ...ownerPlugin, runtimeKey: `${ownerPlugin.runtimeKey}-replacement` },
          subscriberPlugin,
        ])
      } else {
        assert.ok(runtime.settingsChanged(ownerPlugin.id).includes(`${ownerPlugin.id}/tick`))
      }

      await Promise.all([
        assert.rejects(first, /cancel|abort/i),
        assert.rejects(second, /cancel|abort/i),
      ])
      assert.equal(calls.length, 1)
      await runtime.reconcile([])
    }
  })

  await test('subscriber disable and settings changes skip queued delivery while other subscribers continue', async() => {
    for (const mode of ['disable', 'settings'] as const) {
      const blockerStarted = deferred<undefined>()
      const releaseBlocker = deferred<undefined>()
      let blockerCalls = 0
      const { backend, calls } = recordingBackend(async(plugin) => {
        if (plugin.id === 'fixture.blocker') {
          blockerCalls++
          if (blockerCalls === 1) {
            blockerStarted.resolve()
            await releaseBlocker.promise
          }
        }
        return {}
      })
      const runtime = new PluginLifecycle(backend)
      const ownerPlugin = owner(`fixture.owner-${mode}`)
      const blocker = subscriber('fixture.blocker', `${ownerPlugin.id}/tick`)
      const victim = subscriber(`fixture.victim-${mode}`, `${ownerPlugin.id}/tick`)
      await runtime.reconcile([ownerPlugin, blocker, victim])

      const first = runtime.publishEvent(ownerPlugin.id, `${ownerPlugin.id}/tick`, payload(1))
      await within(blockerStarted.promise, `${mode} blocker start`)
      const second = runtime.publishEvent(ownerPlugin.id, `${ownerPlugin.id}/tick`, payload(2))
      await flush()

      if (mode === 'disable') {
        await runtime.reconcile([
          ownerPlugin,
          blocker,
          { ...victim, enabled: false, available: false },
        ])
      } else {
        runtime.settingsChanged(victim.id)
      }
      releaseBlocker.resolve()
      assert.equal((await first).delivered, 2)
      assert.deepEqual(await second, { delivered: 1, failed: 0, skipped: 1 })
      assert.equal(calls.filter(call => call.plugin.id === victim.id).length, 1)
      await runtime.reconcile([])
    }
  })

  await test('queued events are skipped by a replacement subscriber instead of using the old instance', async() => {
    const oldStarted = deferred<undefined>()
    const { backend, calls } = recordingBackend(async(plugin, _handler, _value, signal) => {
      if (plugin.runtimeKey === 'fixture.subscriber') {
        oldStarted.resolve()
        return await new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => { reject(new Error('old instance cancelled')) }, { once: true })
        })
      }
      return {}
    })
    const runtime = new PluginLifecycle(backend)
    const ownerPlugin = owner()
    const oldSubscriber = subscriber('fixture.subscriber')
    await runtime.reconcile([ownerPlugin, oldSubscriber])

    const first = runtime.publishEvent(ownerPlugin.id, 'fixture.owner/tick', payload(1))
    await within(oldStarted.promise, 'old subscriber start')
    const queued = runtime.publishEvent(ownerPlugin.id, 'fixture.owner/tick', payload(2))
    await runtime.reconcile([
      ownerPlugin,
      { ...oldSubscriber, runtimeKey: 'fixture.subscriber-replacement' },
    ])

    assert.deepEqual(await first, { delivered: 0, failed: 0, skipped: 1 })
    assert.deepEqual(await queued, { delivered: 0, failed: 0, skipped: 1 })
    assert.deepEqual(calls.map(call => call.plugin.runtimeKey), ['fixture.subscriber'])
    assert.deepEqual(
      await runtime.publishEvent(ownerPlugin.id, 'fixture.owner/tick', payload(3)),
      { delivered: 1, failed: 0, skipped: 0 },
    )
    assert.deepEqual(calls.map(call => call.plugin.runtimeKey), [
      'fixture.subscriber',
      'fixture.subscriber-replacement',
    ])
    await runtime.reconcile([])
  })
}
