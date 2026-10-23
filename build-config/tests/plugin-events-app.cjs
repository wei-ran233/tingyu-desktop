/* Real production Electron, signed event fixtures, disposable profile and evidence. */
const { app, BrowserWindow, globalShortcut, webContents, dialog } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const JSZip = require('jszip')

const root = path.resolve(__dirname, '../..')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-plugin-events-app-'))
const evidence = process.env.LX_PLUGIN_EVENTS_EVIDENCE_DIR
  ? path.resolve(process.env.LX_PLUGIN_EVENTS_EVIDENCE_DIR)
  : path.join(root, '.runtime/plugin-events-20261021/app')
fs.mkdirSync(evidence, { recursive: true })
fs.mkdirSync(path.join(profile, 'LxDatas'))
app.commandLine.appendSwitch('user-data-dir', profile); app.setPath('userData', profile)
app.getVersion = () => require(path.join(root, 'package.json')).version
app.setAsDefaultProtocolClient = () => false
globalShortcut.register = () => false

const startedAt = new Date().toISOString()
const checks = []
const expectedFailures = []
const unexpectedErrors = []
const receipts = {}
const screenshots = []
let host
let finished = false
let deadline
let queueEvidence
let searchEvidence

const describeError = error => String(error?.stack ?? error?.message ?? error)

app.on('browser-window-created', (_event, win) => {
  Object.assign(global.lx?.appSetting ?? {}, {
    'common.isAgreePact': true,
    'common.langId': 'zh-cn',
    'player.startupAutoPlay': false,
  })
  win.webContents.on('console-message', event => {
    if (
      event.level === 'error'
      && /TypeError|ReferenceError|Unhandled|uncaught/.test(event.message)
      && win.webContents.getURL().includes('/index.html')
    ) unexpectedErrors.push(event.message)
  })
})

process.on('unhandledRejection', reason => {
  unexpectedErrors.push('unhandledRejection: ' + describeError(reason))
})
process.on('uncaughtException', error => {
  unexpectedErrors.push('uncaughtException: ' + describeError(error))
})

const waitFor = async(fn, label, timeout = 30000) => {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    try {
      const value = await fn()
      if (value) return value
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('Timed out: ' + label)
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const observe = promise => promise.then(
  value => ({ status: 'fulfilled', value }),
  error => ({ status: 'rejected', reason: describeError(error) }),
)

const canonical = value => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(
        Object.keys(value)
          .filter(key => value[key] !== undefined)
          .sort()
          .map(key => [key, canonical(value[key])]),
      )
    : value

const key = crypto.generateKeyPairSync('ed25519')
const packageFixture = async(id, overrides, script) => {
  const manifest = {
    id,
    name: id,
    version: '1.0.0',
    apiVersion: '1.6.0',
    defaultEnabled: true,
    main: 'index.html',
    permissions: [],
    runtime: { entry: 'runtime.html', timeoutMs: 5000 },
    ...overrides,
    publicKey: key.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  }
  const files = new Map([
    ['index.html', Buffer.from('<!doctype html><html><body>Event fixture</body></html>')],
    ['runtime.html', Buffer.from('<!doctype html><html><meta charset="utf-8"><body><script src="runtime.js"></script></body></html>')],
    ['runtime.js', Buffer.from(script)],
  ])
  const digests = [...files]
    .map(([filePath, data]) => ({
      path: filePath,
      sha256: crypto.createHash('sha256').update(data).digest('hex'),
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
  manifest.signature = crypto.sign(
    null,
    Buffer.from(JSON.stringify(canonical({
      format: 'lxplugin-signature/1',
      manifest,
      files: digests,
    }))),
    key.privateKey,
  ).toString('base64')
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify(manifest))
  for (const [name, data] of files) zip.file(name, data)
  const file = path.join(profile, id + '.lxplugin')
  fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }))
  return file
}

const showEvidenceOverlay = async(title, lines) => {
  if (!host || host.isDestroyed()) return
  const data = JSON.stringify({ title, lines })
  await host.webContents.executeJavaScript(`(() => {
    document.getElementById('__lx_event_evidence')?.remove()
    const data = ${data}
    const panel = document.createElement('section')
    panel.id = '__lx_event_evidence'
    Object.assign(panel.style, {
      position: 'fixed',
      inset: '28px',
      zIndex: '2147483647',
      padding: '28px',
      borderRadius: '10px',
      background: 'rgba(17, 24, 39, 0.96)',
      color: '#f8fafc',
      border: '2px solid #38bdf8',
      boxShadow: '0 24px 80px rgba(0, 0, 0, 0.55)',
      fontFamily: 'sans-serif',
      fontSize: '18px',
      lineHeight: '1.55',
      whiteSpace: 'pre-wrap',
    })
    const heading = document.createElement('h1')
    heading.textContent = data.title
    heading.style.margin = '0 0 18px'
    heading.style.fontSize = '30px'
    panel.appendChild(heading)
    for (const line of data.lines) {
      const row = document.createElement('div')
      row.textContent = line
      panel.appendChild(row)
    }
    document.body.appendChild(panel)
  })()`)
  await host.webContents.executeJavaScript(
    'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
  )
}

const captureSnapshot = async name => {
  if (!host || host.isDestroyed()) return
  fs.writeFileSync(path.join(evidence, name), (await host.webContents.capturePage()).toPNG())
  screenshots.push(name)
}

const writeResults = (passed, error) => {
  const result = {
    passed,
    startedAt,
    completedAt: new Date().toISOString(),
    electron: process.versions.electron,
    node: process.versions.node,
    profile: 'temporary',
    source: 'dist/main.js',
    checks,
    receipts,
    queueEvidence,
    searchEvidence,
    expectedFailures,
    unexpectedErrors: [...unexpectedErrors],
    screenshots: [...screenshots],
    error: error ? { message: error.message, stack: error.stack } : undefined,
  }
  fs.writeFileSync(path.join(evidence, 'app-results.json'), JSON.stringify(result, null, 2))
}

const finish = async(code, error) => {
  if (finished) return
  finished = true
  clearTimeout(deadline)
  try {
    if (host && !host.isDestroyed()) {
      await showEvidenceOverlay(code === 0 ? 'Plugin event acceptance passed' : 'Plugin event acceptance failed', [
        'Runtime-originated publications: verified',
        'Delivery, clone, quarantine and lifecycle: verified',
        'Queue limit 16 + 1 busy: verified',
        error ? 'Failure: ' + error.message : 'All recorded checks passed',
      ])
      await captureSnapshot('plugin-events-summary.png')
    }
  } catch (captureError) {
    unexpectedErrors.push('evidence capture: ' + describeError(captureError))
  }
  writeResults(code === 0, error)
  try {
    global.lx.isSkipTrayQuit = true
  } catch {}
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.destroy()
  }
  fs.rmSync(profile, { recursive: true, force: true })
  app.exit(code)
}

deadline = setTimeout(() => {
  void finish(1, new Error('Plugin event app test exceeded 180 seconds'))
}, 180000)
deadline.unref()

const ownerId = 'fixture.events.owner'
const cloneAId = 'fixture.events.clone-a'
const cloneBId = 'fixture.events.clone-b'
const badAckId = 'fixture.events.bad-ack'
const lateId = 'fixture.events.late'
const searchObserverId = 'fixture.events.search-observer'
const ownerTarget = ownerId + '/changed'

const eventPoint = {
  id: 'changed',
  version: '1.0.0',
  kind: 'event',
  input: {
    type: 'object',
    properties: {
      text: { type: 'string', maxLength: 100 },
    },
  },
  output: { type: 'object', properties: {} },
}

const subscriberOptions = {
  permissions: ['extensions.subscribe'],
  dependencies: [{ id: ownerId }],
  extensions: [{
    id: 'listen',
    target: ownerTarget,
    version: '1.0.0',
    handler: 'listen',
  }],
}

const ownerScript = `
window.lxRuntime.start({
  activate(context) {
    window.__context = context
    document.body.dataset.contextReady = '1'
    document.body.dataset.activation = 'pending'
    return new Promise(resolve => {
      window.__releaseActivation = () => {
        document.body.dataset.activation = 'released'
        resolve()
      }
    })
  },
  handlers: {},
  deactivate() {
    document.body.dataset.activation = 'deactivated'
  },
})
`

const cloneAScript = `
window.__history = []
window.lxRuntime.start({
  handlers: {
    listen(value) {
      const original = value.text
      window.__history.push(original)
      document.body.dataset.history = JSON.stringify(window.__history)
      document.body.dataset.count = String(window.__history.length)
      value.text = 'mutated:' + original
      document.body.dataset.mutated = value.text
      return {}
    },
  },
})
`

const cloneBScript = `
window.__history = []
window.lxRuntime.start({
  handlers: {
    listen(value) {
      window.__history.push(value.text)
      document.body.dataset.history = JSON.stringify(window.__history)
      document.body.dataset.count = String(window.__history.length)
      return {}
    },
  },
})
`

const badAckScript = `
window.__history = []
window.lxRuntime.start({
  handlers: {
    listen(value) {
      window.__history.push(value.text)
      document.body.dataset.count = String(window.__history.length)
      return { unexpected: true }
    },
  },
})
`

const lateScript = `
window.__history = []
window.lxRuntime.start({
  handlers: {
    listen(value, context) {
      window.__history.push(value.text)
      document.body.dataset.history = JSON.stringify(window.__history)
      document.body.dataset.handled = String(window.__history.length)
      if (value.text === 'flood:0' && document.body.dataset.gateArmed !== '1') {
        document.body.dataset.gateArmed = '1'
        document.body.dataset.gatePending = '1'
        return new Promise(resolve => {
          window.__releaseFloodGate = () => {
            document.body.dataset.gatePending = '0'
            document.body.dataset.gateReleased = '1'
            resolve({})
          }
          context.onCancel(() => {
            document.body.dataset.gateCancelled = '1'
            document.body.dataset.gatePending = '0'
            resolve({})
          })
        })
      }
      return {}
    },
  },
})
`

const searchObserverScript = `
window.__events = []
window.lxRuntime.start({
  handlers: {
    listen(value) {
      window.__events.push(value)
      document.body.dataset.events = JSON.stringify(window.__events)
      document.body.dataset.count = String(window.__events.length)
      return {}
    },
  },
})
`

require(path.join(root, 'dist/main.js'))

app.whenReady().then(async() => {
  host = await waitFor(
    () => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/index.html')),
    'built app main window',
  )
  host.webContents.setBackgroundThrottling(false)
  host.show()
  host.focus()

  const run = code => host.webContents.executeJavaScript(code)
  await waitFor(
    () => run("Boolean(document.getElementById('root')?.__vue_app__)"),
    'Vue application',
  )
  const ipc = async(name, params) => run(
    `require('electron').ipcRenderer.invoke(${JSON.stringify(name)},${JSON.stringify(params)})`,
  )
  const info = async id => (await ipc('plugin_list')).find(plugin => plugin.id === id)
  const toggle = async(id, enabled) => ipc('plugin_set_enabled', { pluginId: id, enabled })
  const runtimeContents = id => webContents.getAllWebContents().find(
    contents => contents.getURL().startsWith(`lxplugin://${id}/runtime.html`),
  )
  const install = async file => {
    dialog.showOpenDialog = async() => ({ canceled: false, filePaths: [file] })
    const preview = await ipc('plugin_install')
    return ipc('plugin_confirm_install', { token: preview.token })
  }
  const waitPlugin = (id, state, timeout) => waitFor(
    async() => (await info(id))?.lifecycleState === state,
    `${id} reaches ${state}`,
    timeout,
  )

  const publish = async(target, value) => {
    const contents = runtimeContents(ownerId)
    assert.ok(contents, 'owner runtime must exist for publication')
    return contents.executeJavaScript(`window.__context.publishEvent(
      ${JSON.stringify(target)},
      ${JSON.stringify(value)}
    ).then(
      receipt => ({ ok: true, receipt }),
      error => ({ ok: false, error: String(error?.message ?? error) })
    )`)
  }

  const publishMany = texts => {
    const contents = runtimeContents(ownerId)
    assert.ok(contents, 'owner runtime must exist for ordered publication')
    return contents.executeJavaScript(`Promise.allSettled(
      ${JSON.stringify(texts)}.map(text => window.__context.publishEvent(
        ${JSON.stringify(ownerTarget)},
        { text }
      ))
    ).then(results => results.map(result => result.status === 'fulfilled'
      ? { ok: true, receipt: result.value }
      : { ok: false, error: String(result.reason?.message ?? result.reason) }
    ))`)
  }

  const ownerPackage = await packageFixture(ownerId, {
    permissions: ['events.publish'],
    runtime: { entry: 'runtime.html', timeoutMs: 10000 },
    extensionPoints: [eventPoint,
      { id: 'empty', version: '1.0.0', kind: 'event', input: { type: 'object', properties: {} }, output: { type: 'object', properties: {} } },
      { id: 'wide', version: '1.0.0', kind: 'event', input: { type: 'array', maxItems: 32, items: { type: 'string', maxLength: 4096 } }, output: { type: 'object', properties: {} } },
    ],
  }, ownerScript)
  const cloneAPackage = await packageFixture(cloneAId, subscriberOptions, cloneAScript)
  const cloneBPackage = await packageFixture(cloneBId, subscriberOptions, cloneBScript)
  const badAckPackage = await packageFixture(badAckId, subscriberOptions, badAckScript)
  const latePackage = await packageFixture(lateId, subscriberOptions, lateScript)

  const installingOwner = observe(install(ownerPackage))
  await waitPlugin(ownerId, 'activating')
  await waitFor(
    () => runtimeContents(ownerId)?.executeJavaScript(
      "document.body.dataset.contextReady === '1'",
    ),
    'owner exposes its runtime context while activating',
  )
  const preActive = await publish(ownerTarget, { text: 'before-active' })
  assert.equal(preActive.ok, false, 'an owner must not publish while activation is pending')
  expectedFailures.push({
    scenario: 'publish-before-active',
    error: preActive.error,
  })
  await runtimeContents(ownerId).executeJavaScript('window.__releaseActivation();void 0')
  const ownerInstall = await installingOwner
  assert.equal(ownerInstall.status, 'fulfilled', ownerInstall.reason)
  await waitPlugin(ownerId, 'active')
  const ownerInfo = await info(ownerId)
  assert.equal(ownerInfo.available, true)
  assert.deepEqual(ownerInfo.extensionPoints[0], eventPoint)
  checks.push('signed owner activates before publication; calling its activation context early is rejected')

  for (const [id, file] of [
    [cloneAId, cloneAPackage],
    [cloneBId, cloneBPackage],
  ]) {
    const installed = await observe(install(file))
    assert.equal(installed.status, 'fulfilled', installed.reason)
    await waitPlugin(id, 'active')
  }

  const cloneReceipt = await publish(ownerTarget, { text: 'clone' })
  assert.equal(cloneReceipt.ok, true, cloneReceipt.error)
  receipts.clone = cloneReceipt.receipt
  assert.deepEqual(cloneReceipt.receipt, { delivered: 2, failed: 0, skipped: 0 })
  const cloneAState = await runtimeContents(cloneAId).executeJavaScript(`({
    history: window.__history,
    mutated: document.body.dataset.mutated
  })`)
  const cloneBState = await runtimeContents(cloneBId).executeJavaScript(`({
    history: window.__history
  })`)
  assert.deepEqual(cloneAState.history, ['clone'])
  assert.equal(cloneAState.mutated, 'mutated:clone')
  assert.deepEqual(cloneBState.history, ['clone'])
  checks.push('owner publication reaches both signed subscribers; each receives an independent cloned payload')

  for (const id of [cloneAId, cloneBId]) {
    await runtimeContents(id).executeJavaScript(
      "window.__history.length=0;document.body.dataset.history='[]';document.body.dataset.count='0';void 0",
    )
  }
  const ordered = await publishMany(['order-1', 'order-2', 'order-3'])
  assert.deepEqual(ordered.map(result => result.ok), [true, true, true])
  assert.deepEqual(
    ordered.map(result => result.receipt),
    [
      { delivered: 2, failed: 0, skipped: 0 },
      { delivered: 2, failed: 0, skipped: 0 },
      { delivered: 2, failed: 0, skipped: 0 },
    ],
  )
  await waitFor(
    () => runtimeContents(cloneBId)?.executeJavaScript('window.__history.length===3'),
    'ordered events reach subscriber B',
  )
  const orderA = await runtimeContents(cloneAId).executeJavaScript('window.__history')
  const orderB = await runtimeContents(cloneBId).executeJavaScript('window.__history')
  assert.deepEqual(orderA, ['order-1', 'order-2', 'order-3'])
  assert.deepEqual(orderB, ['order-1', 'order-2', 'order-3'])
  receipts.ordered = ordered.map(result => result.receipt)
  checks.push('concurrent runtime publications are delivered in FIFO order to both subscribers')

  const isolation = await runtimeContents(ownerId).executeJavaScript(`({
    requireType: typeof require,
    processType: typeof process,
    ipcRendererType: typeof window.ipcRenderer,
    hostBridgeType: typeof window.lxPlugin,
    runtimeKeys: Object.keys(window.lxRuntime || {}).sort(),
    contextKeys: Object.keys(window.__context || {}).sort()
  })`)
  assert.equal(isolation.requireType, 'undefined')
  assert.equal(isolation.processType, 'undefined')
  assert.equal(isolation.ipcRendererType, 'undefined')
  assert.equal(isolation.hostBridgeType, 'undefined')
  assert.deepEqual(isolation.runtimeKeys, ['start'])
  assert.ok(!isolation.contextKeys.includes('ipcRenderer'))
  assert.equal(
    await runtimeContents(ownerId).executeJavaScript(
      "fetch('https://example.invalid/lx-plugin-event').then(() => false, () => true)",
    ),
    true,
  )
  assert.equal(
    await runtimeContents(ownerId).executeJavaScript(
      `fetch('lxplugin://${cloneAId}/runtime.html').then(response => response.ok, () => false)`,
    ),
    false,
  )
  assert.equal(
    await runtimeContents(ownerId).executeJavaScript(
      "window.open('https://example.invalid') === null",
    ),
    true,
  )
  checks.push('event sender is a sandboxed runtime with no Node, arbitrary IPC, host bridge, external network or popup path')

  const invalidLength = await publish(ownerTarget, { text: 'x'.repeat(101) })
  const invalidExtra = await publish(ownerTarget, { text: 'valid', extra: true })
  const forgedOwner = await publish('fixture.events.forged/changed', { text: 'forged' })
  const extraTarget = await publish(ownerTarget + '/extra', { text: 'extra' })
  for (const [scenario, result] of [
    ['invalid-length', invalidLength],
    ['invalid-extra-property', invalidExtra],
    ['forged-owner', forgedOwner],
    ['extra-target-segment', extraTarget],
  ]) {
    assert.equal(result.ok, false, scenario + ' must be rejected')
    expectedFailures.push({ scenario, error: result.error })
  }
  checks.push('schema-invalid payloads, forged owner targets and ambiguous target segments are rejected')

  for (const [name, expression] of [
    ['Date', 'new Date()'],
    ['Map', "new Map([['hidden',new ArrayBuffer(65537)]])"],
    ['Set', 'new Set([new ArrayBuffer(65537)])'],
    ['ArrayBuffer', 'new ArrayBuffer(65537)'],
  ]) {
    const result = await runtimeContents(ownerId).executeJavaScript(`
      window.__context.publishEvent(${JSON.stringify(ownerId + '/empty')}, ${expression}).then(
        receipt => ({ ok: true, receipt }),
        error => ({ ok: false, error: String(error?.message ?? error) })
      )`)
    assert.equal(result.ok, false, name + ' is not a plain empty JSON payload')
    expectedFailures.push({ scenario: 'non-json-payload-' + name, error: result.error })
  }
  const envelopeBoundary = await runtimeContents(ownerId).executeJavaScript(`(() => {
    const value = Array.from({length:16},(_,i)=>'x'.repeat(i===15?4031:4096))
    const payloadBytes = new TextEncoder().encode(JSON.stringify(value)).length
    const messageBytes = new TextEncoder().encode(JSON.stringify({kind:'publish-event',target:${JSON.stringify(ownerId + '/wide')},value})).length
    return window.__context.publishEvent(${JSON.stringify(ownerId + '/wide')},value).then(
      receipt=>({ok:true,receipt,payloadBytes,messageBytes}),
      error=>({ok:false,error:String(error?.message??error),payloadBytes,messageBytes})
    )
  })()`)
  assert.ok(envelopeBoundary.payloadBytes < 64 * 1024)
  assert.ok(envelopeBoundary.messageBytes > 64 * 1024)
  assert.equal(envelopeBoundary.ok, false)
  assert.match(envelopeBoundary.error, /size/i)
  receipts.envelopeBoundary = envelopeBoundary
  checks.push('non-JSON empty payloads and a sub-64KiB payload with an oversized envelope are rejected')


  const badAckInstall = await observe(install(badAckPackage))
  assert.equal(badAckInstall.status, 'fulfilled', badAckInstall.reason)
  await waitPlugin(badAckId, 'active')
  const ackReceipt = await publish(ownerTarget, { text: 'ack' })
  assert.equal(ackReceipt.ok, true, ackReceipt.error)
  assert.deepEqual(ackReceipt.receipt, { delivered: 2, failed: 1, skipped: 0 })
  receipts.invalidAck = ackReceipt.receipt
  await waitPlugin(badAckId, 'failed')
  const failedAckInfo = await info(badAckId)
  assert.equal(failedAckInfo.lifecycleState, 'failed')
  expectedFailures.push({
    scenario: 'invalid-subscriber-ack',
    error: failedAckInfo.blockedReason,
  })
  assert.equal((await info(cloneAId)).lifecycleState, 'active')
  assert.equal((await info(cloneBId)).lifecycleState, 'active')
  const afterBadAck = await publish(ownerTarget, { text: 'after-bad-ack' })
  assert.equal(afterBadAck.ok, true, afterBadAck.error)
  assert.deepEqual(afterBadAck.receipt, { delivered: 2, failed: 0, skipped: 0 })
  receipts.afterInvalidAck = afterBadAck.receipt
  const healthyHistory = await runtimeContents(cloneBId).executeJavaScript('window.__history')
  assert.equal(healthyHistory.at(-1), 'after-bad-ack')
  checks.push('an invalid acknowledgement quarantines only its subscriber; healthy subscribers keep receiving')

  for (const [name, expression] of [['map', "new Map([['unexpected',true]])"], ['date', 'new Date()'], ['buffer', 'new ArrayBuffer(1)']]) {
    const id = 'fixture.events.bad-' + name
    const file = await packageFixture(id, subscriberOptions, `window.lxRuntime.start({handlers:{listen:()=>${expression}}})`)
    await install(file)
    await waitPlugin(id, 'active')
    const result = await publish(ownerTarget, { text: 'invalid-' + name })
    assert.equal(result.ok, true)
    assert.deepEqual(result.receipt, { delivered: 2, failed: 1, skipped: 0 })
    await waitPlugin(id, 'failed')
    expectedFailures.push({ scenario: 'non-json-ack-' + name, error: (await info(id)).blockedReason })
  }
  checks.push('Map, Date and ArrayBuffer acknowledgements fail and quarantine only the faulty subscriber')


  const ownerRuntimeBeforeDisable = runtimeContents(ownerId).id
  const cloneARuntimeBeforeDisable = runtimeContents(cloneAId).id
  await toggle(ownerId, false)
  await waitFor(
    async() => {
      const ownerState = await info(ownerId)
      const cloneAState = await info(cloneAId)
      const cloneBState = await info(cloneBId)
      return ownerState?.lifecycleState === 'disabled'
        && cloneAState?.lifecycleState === 'blocked'
        && cloneBState?.lifecycleState === 'blocked'
        && !runtimeContents(ownerId)
        && !runtimeContents(cloneAId)
        && !runtimeContents(cloneBId)
    },
    'disabling the event owner disposes dependent subscribers',
  )
  checks.push('disabling the owner stops and removes every dependent subscriber runtime')

  const reenablingOwner = observe(toggle(ownerId, true))
  await waitFor(() => runtimeContents(ownerId)?.executeJavaScript("typeof window.__releaseActivation==='function'"), 'new owner activation gate')
  await runtimeContents(ownerId).executeJavaScript('window.__releaseActivation();void 0')
  const reenabled = await reenablingOwner
  assert.equal(reenabled.status, 'fulfilled', reenabled.reason)
  await waitFor(
    async() => {
      const states = await Promise.all([ownerId, cloneAId, cloneBId].map(
        async id => (await info(id))?.lifecycleState,
      ))
      return states.every(state => state === 'active')
        && runtimeContents(ownerId)
        && runtimeContents(cloneAId)
        && runtimeContents(cloneBId)
    },
    're-enabling the event owner restores subscribers',
  )
  assert.notEqual(runtimeContents(ownerId).id, ownerRuntimeBeforeDisable)
  assert.notEqual(runtimeContents(cloneAId).id, cloneARuntimeBeforeDisable)
  const restored = await publish(ownerTarget, { text: 'restored' })
  assert.equal(restored.ok, true, restored.error)
  assert.deepEqual(restored.receipt, { delivered: 2, failed: 0, skipped: 0 })
  await waitFor(
    () => runtimeContents(cloneAId)?.executeJavaScript("document.body.dataset.history.includes('restored')"),
    'restored subscriber A receives a fresh event',
  )
  await waitFor(
    () => runtimeContents(cloneBId)?.executeJavaScript("document.body.dataset.history.includes('restored')"),
    'restored subscriber B receives a fresh event',
  )
  receipts.restored = restored.receipt
  checks.push('re-enabling the owner creates fresh subscriber runtimes and event delivery resumes')

  const lateInstall = await observe(install(latePackage))
  assert.equal(lateInstall.status, 'fulfilled', lateInstall.reason)
  await waitPlugin(lateId, 'active')
  await delay(300)
  assert.deepEqual(
    await runtimeContents(lateId).executeJavaScript('window.__history'),
    [],
    'a late subscriber must not receive a replay',
  )
  const afterLate = await publish(ownerTarget, { text: 'after-late' })
  assert.equal(afterLate.ok, true, afterLate.error)
  assert.deepEqual(afterLate.receipt, { delivered: 3, failed: 0, skipped: 0 })
  await waitFor(
    () => runtimeContents(lateId)?.executeJavaScript("document.body.dataset.history.includes('after-late')"),
    'late subscriber receives the next event',
  )
  assert.deepEqual(
    await runtimeContents(lateId).executeJavaScript('window.__history'),
    ['after-late'],
  )
  receipts.afterLate = afterLate.receipt
  checks.push('a late subscriber receives no historical replay and starts with the next publication')

  await runtimeContents(lateId).executeJavaScript(`window.__history.length=0;
    document.body.dataset.history='[]';
    document.body.dataset.handled='0';
    document.body.dataset.gateArmed='0';
    document.body.dataset.gatePending='0';void 0`)
  await runtimeContents(ownerId).executeJavaScript(`document.body.dataset.floodAccepted='0';
    document.body.dataset.floodBusy='0';
    document.body.dataset.floodDone='0';
    window.__floodResults=new Array(17);void 0`)
  await runtimeContents(ownerId).executeJavaScript(`(() => {
    window.__floodResults = new Array(17)
    const tasks = Array.from({ length: 17 }, (_, index) =>
      window.__context.publishEvent(${JSON.stringify(ownerTarget)}, { text: 'flood:' + index }).then(
        receipt => {
          window.__floodResults[index] = { status: 'fulfilled', receipt }
          document.body.dataset.floodAccepted = String(
            Number(document.body.dataset.floodAccepted || 0) + 1
          )
          return { status: 'fulfilled', receipt }
        },
        error => {
          const message = String(error?.message ?? error)
          window.__floodResults[index] = { status: 'rejected', error: message }
          if (/busy/i.test(message)) {
            document.body.dataset.floodBusy = String(
              Number(document.body.dataset.floodBusy || 0) + 1
            )
          }
          throw error
        }
      )
    )
    window.__floodPromise = Promise.allSettled(tasks).then(results => {
      document.body.dataset.floodDone = '1'
      document.body.dataset.floodSettled = results.map(result => result.status).join(',')
      return results
    })
  })()`)

  await waitFor(
    () => runtimeContents(lateId)?.executeJavaScript("document.body.dataset.gatePending === '1'"),
    'late subscriber gates the first flood publication',
  )
  await waitFor(
    () => runtimeContents(ownerId)?.executeJavaScript("document.body.dataset.floodBusy === '1'"),
    'seventeenth concurrent publication is rejected as busy',
  )
  const pendingFlood = await runtimeContents(ownerId).executeJavaScript(`({
    accepted: Number(document.body.dataset.floodAccepted || 0),
    busy: Number(document.body.dataset.floodBusy || 0),
    done: document.body.dataset.floodDone === '1',
    gatePending: true
  })`)
  await showEvidenceOverlay('Event queue backpressure', [
    'Concurrent publications: 17',
    'Admitted while the subscriber gate is held: 16',
    'Busy rejections observed: 1',
    'Completion awaits the first subscriber acknowledgement',
  ])
  await captureSnapshot('queue-flood.png')
  assert.equal(pendingFlood.accepted, 0)
  assert.equal(pendingFlood.busy, 1)
  assert.equal(pendingFlood.done, false)

  await runtimeContents(lateId).executeJavaScript('window.__releaseFloodGate();void 0')
  await waitFor(
    () => runtimeContents(ownerId)?.executeJavaScript("document.body.dataset.floodDone === '1'"),
    'all admitted flood publications settle',
  )
  const floodResults = await runtimeContents(ownerId).executeJavaScript(
    'window.__floodResults.map(result => result?.status ?? null)',
  )
  const floodHistory = await runtimeContents(lateId).executeJavaScript('window.__history')
  const floodAccepted = floodResults.filter(status => status === 'fulfilled').length
  const floodBusy = floodResults.filter(status => status === 'rejected').length
  const busyErrors = await runtimeContents(ownerId).executeJavaScript(
    "window.__floodResults.filter(result => result?.status === 'rejected').map(result => result.error)",
  )
  const floodHandled = await runtimeContents(lateId).executeJavaScript(
    "Number(document.body.dataset.handled || 0)",
  )
  assert.equal(floodAccepted, 16)
  assert.equal(floodBusy, 1)
  assert.equal(floodHandled, 16)
  assert.deepEqual(
    floodHistory,
    Array.from({ length: 16 }, (_, index) => 'flood:' + index),
  )
  assert.ok(
    await runtimeContents(ownerId).executeJavaScript(
      "window.__floodResults.filter(result => result?.status === 'fulfilled').every(result => result.receipt.delivered === 3)",
    ),
  )
  for (const error of busyErrors) {
    expectedFailures.push({ scenario: 'queue-busy', error })
  }
  queueEvidence = {
    concurrentPublications: 17,
    admitted: floodAccepted,
    busy: floodBusy,
    subscriberHandled: floodHandled,
    deliveredPerReceipt: 3,
    order: floodHistory,
    allSettled: await runtimeContents(ownerId).executeJavaScript(
      'document.body.dataset.floodSettled',
    ),
  }
  checks.push('17 concurrent publications admit 16 FIFO events, reject one as busy, settle every promise and deliver in order')

  const searchObserverOptions = {
    permissions: ['extensions.subscribe'],
    dependencies: [{ id: 'lx.search-starters' }],
    extensions: [{
      id: 'listen',
      target: 'lx.search-starters/suggestions.changed',
      version: '1.0.0',
      handler: 'listen',
    }],
  }
  const searchObserverPackage = await packageFixture(
    searchObserverId,
    searchObserverOptions,
    searchObserverScript,
  )
  const searchObserverInstall = await observe(install(searchObserverPackage))
  assert.equal(searchObserverInstall.status, 'fulfilled', searchObserverInstall.reason)
  await waitPlugin(searchObserverId, 'blocked')
  await toggle('lx.search-starters', true)
  await waitFor(
    async() => {
      const owner = await info('lx.search-starters')
      const observer = await info(searchObserverId)
      return owner?.lifecycleState === 'active' && observer?.lifecycleState === 'active'
    },
    'search inspiration owner and event observer become active',
  )
  const initialRead = await ipc('plugin_search_suggestions', { source: 'kw' })
  await delay(300)
  assert.ok(initialRead.suggestions.length <= 12)
  assert.deepEqual(
    await runtimeContents(searchObserverId).executeJavaScript('window.__events'),
    [],
    'provider reads must not publish suggestions.changed',
  )
  await ipc('plugin_set_setting', {
    pluginId: 'lx.search-starters',
    key: 'queries',
    value: 'group-a;group-b;group-c;group-d',
  })
  await ipc('plugin_set_setting', {
    pluginId: 'lx.search-starters',
    key: 'pageSize',
    value: 2,
  })
  await runtimeContents(searchObserverId).executeJavaScript('window.__events=[];void 0')
  const firstGroup = await ipc('plugin_run_search_action', {
    actionId: 'lx.search-starters/next-set',
    source: 'kw',
  })
  await waitFor(
    () => runtimeContents(searchObserverId)?.executeJavaScript('window.__events.length===1'),
    'search inspiration publishes its first changed event',
  )
  const firstSearchEvents = await runtimeContents(searchObserverId).executeJavaScript('window.__events')
  assert.deepEqual(firstSearchEvents, [firstGroup])
  assert.ok(firstSearchEvents[0].suggestions.length <= 12)
  assert.ok(firstSearchEvents[0].suggestions.every(item => item.length <= 100))

  await runtimeContents('lx.search-starters').executeJavaScript(
    "delete document.body.dataset.lastEvent;void 0",
  )
  const resetDefaults = await ipc('plugin_reset_settings', { pluginId: 'lx.search-starters' })
  assert.equal(resetDefaults.pageSize, 4)
  const secondGroup = await ipc('plugin_run_search_action', {
    actionId: 'lx.search-starters/next-set',
    source: 'kw',
  })
  await waitFor(
    () => runtimeContents(searchObserverId)?.executeJavaScript('window.__events.length===2'),
    'search inspiration publishes after resetting and changing groups',
  )
  const searchEvents = await runtimeContents(searchObserverId).executeJavaScript('window.__events')
  assert.deepEqual(searchEvents, [firstGroup, secondGroup])
  await waitFor(
    () => runtimeContents('lx.search-starters')?.executeJavaScript(
      "Boolean(document.body.dataset.lastEvent)",
    ),
    'search inspiration records its event receipt',
  )
  const rawSearchReceipt = await runtimeContents('lx.search-starters').executeJavaScript(
    'document.body.dataset.lastEvent',
  )
  assert.match(rawSearchReceipt, /^\{/)
  const searchReceipt = JSON.parse(rawSearchReceipt)
  assert.deepEqual(searchReceipt, { delivered: 1, failed: 0, skipped: 0 })
  searchEvidence = {
    providerReadPublished: false,
    firstGroup,
    secondGroup,
    settingsReset: resetDefaults,
    receipt: searchReceipt,
    bounded: searchEvents.every(event =>
      event.suggestions.length <= 12 && event.suggestions.every(item => item.length <= 100),
    ),
  }
  await toggle('lx.search-starters', false)
  await waitPlugin(searchObserverId, 'blocked')
  checks.push('search inspiration reads without events, then publishes bounded changes for first and post-reset group actions')

  assert.deepEqual(unexpectedErrors, [])
  await showEvidenceOverlay('Plugin event acceptance', [
    'Signed owner and subscriber fixtures: PASS',
    'Runtime-only publication and payload clone: PASS',
    'Invalid input, forged owner and invalid ack isolation: PASS',
    'Disable/re-enable cleanup and late subscriber no replay: PASS',
    'Queue flood 16 admitted + 1 busy: PASS',
    'Search inspiration suggestions.changed: PASS',
  ])
  await finish(0)
}).catch(error => {
  console.error(error)
  void finish(1, error)
})
