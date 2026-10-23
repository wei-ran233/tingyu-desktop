/* Real production Electron, signed fixtures, disposable profile and UI evidence. */
const { app, BrowserWindow, globalShortcut, webContents, dialog } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const JSZip = require('jszip')

const root = path.resolve(__dirname, '../..')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-plugin-ui-app-'))
const evidence = process.env.LX_PLUGIN_UI_EVIDENCE_DIR
  ? path.resolve(process.env.LX_PLUGIN_UI_EVIDENCE_DIR)
  : path.join(root, '.runtime/plugin-ui-20261021/app')
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
const screenshots = []
const observations = {}
let host
let finished = false
let deadline

const describeError = error => String(error?.stack ?? error?.message ?? error)
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const observe = promise => promise.then(
  value => ({ status: 'fulfilled', value }),
  error => ({ status: 'rejected', reason: describeError(error) }),
)

app.on('browser-window-created', (_event, win) => {
  Object.assign(global.lx?.appSetting ?? {}, {
    'common.isAgreePact': true,
    'common.langId': 'zh-cn',
    'player.startupAutoPlay': false,
    'search.isShowHotSearch': false,
    'search.isShowHistorySearch': false,
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
  let lastError
  while (Date.now() < end) {
    try {
      const value = await fn()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await delay(50)
  }
  throw new Error('Timed out: ' + label + (lastError ? ' (' + lastError.message + ')' : ''))
}

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
    apiVersion: '1.7.0',
    defaultEnabled: true,
    main: 'index.html',
    permissions: [],
    runtime: { entry: 'runtime.html', timeoutMs: 5000 },
    ...overrides,
    publicKey: key.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  }
  const files = new Map([
    ['index.html', Buffer.from('<!doctype html><html><body>Plugin UI fixture</body></html>')],
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
  await host.webContents.executeJavaScript(`(() => {
    document.getElementById('__lx_plugin_ui_evidence')?.remove()
    const data = ${JSON.stringify({ title, lines })}
    const panel = document.createElement('section')
    panel.id = '__lx_plugin_ui_evidence'
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
    observations,
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
      await showEvidenceOverlay(
        code === 0 ? 'Declarative plugin UI acceptance passed' : 'Declarative plugin UI acceptance failed',
        [
          'Renderer, slot and toolbar host surfaces: verified',
          'Shared search model and next-set action: verified',
          'Theme, disable/re-enable and persisted preference: verified',
          'Malformed signed renderer is isolated by lifecycle: verified',
          error ? 'Failure: ' + error.message : 'All recorded checks passed',
        ],
      )
      await captureSnapshot('plugin-ui-summary.png')
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
  void finish(1, new Error('Plugin UI app test exceeded 240 seconds'))
}, 240000)
deadline.unref()

// The acceptance must run the exact production main entry used by the app.
require(path.join(root, 'dist/main.js'))

app.whenReady().then(async() => {
  host = await waitFor(
    () => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/index.html')),
    'built application host window',
  )
  host.webContents.setBackgroundThrottling(false)
  host.show()
  host.focus()

  const run = code => host.webContents.executeJavaScript(code)
  const ipc = async(name, params) => run(
    `require('electron').ipcRenderer.invoke(${JSON.stringify(name)},${JSON.stringify(params)})`,
  )
  const navigate = async url => run(
    `document.getElementById('root').__vue_app__.config.globalProperties.$router.push(${JSON.stringify(url)})`,
  )
  const info = async id => (await ipc('plugin_list')).find(plugin => plugin.id === id)
  const toggle = async(id, enabled) => ipc('plugin_set_enabled', { pluginId: id, enabled })
  const waitPlugin = async(id, state) => waitFor(
    async() => (await info(id))?.lifecycleState === state,
    `${id} lifecycle ${state}`,
  )
  const runtimeContents = id => webContents.getAllWebContents().find(contents =>
    contents.getURL().startsWith(`lxplugin://${id}/runtime.html`),
  )
  const install = async file => {
    dialog.showOpenDialog = async() => ({ canceled: false, filePaths: [file] })
    const preview = await ipc('plugin_install')
    return ipc('plugin_confirm_install', { token: preview.token })
  }

  await waitFor(() => run("Boolean(document.getElementById('root')?.__vue_app__)"), 'Vue application')
  await waitPlugin('lx.official-suite', 'active')
  await waitPlugin('lx.theme-studio', 'active')

  const official = await info('lx.official-suite')
  const layouts = await info('lx.search-layouts')
  const starters = await info('lx.search-starters')
  const themeStudio = await info('lx.theme-studio')
  assert.ok(official, 'official suite is bundled')
  assert.ok(layouts, 'search layouts sample is bundled')
  assert.ok(starters, 'search starters sample is bundled')
  assert.equal(layouts.enabled, false, 'search layouts sample is disabled by default')
  assert.equal(starters.enabled, false, 'search starters sample is disabled by default')
  assert.equal(layouts.apiVersion, '1.7.0')
  assert.ok(layouts.dependencies.some(dependency => dependency.id === 'lx.official-suite'))
  assert.equal(themeStudio.enabled, true)
  observations.initialPlugins = {
    officialSuite: official.lifecycleState,
    searchLayouts: { enabled: layouts.enabled, state: layouts.lifecycleState },
    searchStarters: { enabled: starters.enabled, state: starters.lifecycleState },
    themeStudio: themeStudio.lifecycleState,
  }
  observations.windowReloadPersistence = {
    status: 'not-run',
    reason: 'Optional reload check omitted; theme navigation and disable/re-enable verify localStorage preferences.',
  }

  await run("localStorage.removeItem('lx.plugin-ui.v1');void 0")
  await run(`(() => {
    window.__findFeature = (value, name) => {
      if (!value) return null
      if (value.component) {
        if ((value.component.type.name || value.component.type.__name) === name) return value.component
        const found = window.__findFeature(value.component.subTree, name)
        if (found) return found
      }
      if (value.suspense) {
        const found = window.__findFeature(value.suspense.activeBranch, name)
        if (found) return found
      }
      if (Array.isArray(value.children)) {
        for (const child of value.children) {
          const found = window.__findFeature(child, name)
          if (found) return found
        }
      }
      return null
    }
    window.__searchModel = () => document.getElementById('root').__vue_app__.config.globalProperties.$router.currentRoute.value.matched.at(-1)?.instances.default
    window.__blankModel = () => {
      const model = window.__searchModel()
      return model ? window.__findFeature(model.$.subTree, 'BlankView')?.proxy : null
    }
    void 0
  })()`)

  await navigate('/search?source=kw&type=music&text=')
  await waitFor(
    () => run("Boolean(window.__searchModel()&&window.__blankModel())"),
    'classic search and BlankView model',
  )
  await waitFor(
    () => run("['renderer','slot','toolbar'].every(kind=>Boolean(document.querySelector('[data-plugin-ui=\"'+kind+'\"]')))"),
    'three declarative UI host surfaces',
  )
  assert.equal(await run("window.__blankModel().appSetting['search.isShowHotSearch']"), false)
  assert.equal(await run("window.__blankModel().appSetting['search.isShowHistorySearch']"), false)
  assert.equal(await run("document.querySelectorAll('[data-plugin-ui] [data-ui-document]').length"), 0)
  observations.nativeDefault = {
    rendererDocument: await run("Boolean(document.querySelector('[data-plugin-ui=renderer] [data-ui-document]'))"),
    slotDocument: await run("Boolean(document.querySelector('[data-plugin-ui=slot] [data-ui-document]'))"),
    toolbarDocument: await run("Boolean(document.querySelector('[data-plugin-ui=toolbar] [data-ui-document]'))"),
  }

  await toggle('lx.search-starters', true)
  await waitPlugin('lx.search-starters', 'active')
  await ipc('plugin_set_setting', {
    pluginId: 'lx.search-starters',
    key: 'queries',
    value: 'alpha;beta;gamma;delta;epsilon',
  })
  await ipc('plugin_set_setting', {
    pluginId: 'lx.search-starters',
    key: 'pageSize',
    value: 3,
  })
  await waitFor(
    () => run("Array.from(document.querySelectorAll('[data-search-suggestion]'),button=>button.textContent).join('|')==='alpha|beta|gamma'"),
    'native suggestions from enabled search starters',
  )
  assert.deepEqual(
    await ipc('plugin_search_suggestions', { source: 'kw' }),
    { suggestions: ['alpha', 'beta', 'gamma'] },
  )

  await run(`(() => {
    const ipcRenderer = require('electron').ipcRenderer
    const original = ipcRenderer.invoke
    window.__uiRenderProbe = []
    window.__restoreUiRenderProbe = () => { ipcRenderer.invoke = original }
    ipcRenderer.invoke = function(channel, params) {
      if (channel === 'plugin_render_search_ui') window.__uiRenderProbe.push(JSON.parse(JSON.stringify(params)))
      return original.call(this, channel, params)
    }
  })()`)

  await toggle('lx.search-layouts', true)
  await waitPlugin('lx.search-layouts', 'active')
  await waitFor(
    () => run("['renderer','slot','toolbar'].every(kind=>Boolean(document.querySelector('[data-plugin-ui=\"'+kind+'\"] select[data-ui-choice]')))"),
    'three renderer choice controls',
  )

  const catalog = {}
  for (const kind of ['renderer', 'slot', 'toolbar']) {
    catalog[kind] = await ipc('plugin_search_ui', { kind })
  }
  assert.deepEqual(
    catalog.renderer.map(choice => choice.id).sort(),
    ['lx.search-layouts/layout-grid', 'lx.search-layouts/layout-list'],
  )
  assert.deepEqual(catalog.slot.map(choice => choice.id), ['lx.search-layouts/hint'])
  assert.deepEqual(catalog.toolbar.map(choice => choice.id), ['lx.search-layouts/tools'])
  observations.catalog = Object.fromEntries(
    Object.entries(catalog).map(([kind, choices]) => [kind, choices.map(choice => choice.id)]),
  )

  assert.deepEqual(await run(`(() => {
    const read = kind => document.querySelector('[data-plugin-ui="' + kind + '"] select[data-ui-choice]').value
    return ['renderer', 'slot', 'toolbar'].map(read)
  })()`), ['', '', ''])
  assert.equal(await run('window.__uiRenderProbe.length'), 0, 'no UI renderer runs before manual selection')
  observations.manualOnlyBeforeSelection = 0

  const layoutSettings = await ipc('plugin_get_settings', { pluginId: 'lx.search-layouts' })
  assert.equal(typeof layoutSettings.title, 'string', 'sample declares a string title setting')
  await ipc('plugin_set_setting', {
    pluginId: 'lx.search-layouts',
    key: 'title',
    value: 'Search layouts',
  })

  const choose = async(kind, id) => {
    const selector = `[data-plugin-ui="${kind}"] select[data-ui-choice]`
    await waitFor(
      () => run(`Array.from(document.querySelector(${JSON.stringify(selector)}).options).some(option => option.value === ${JSON.stringify(id)})`),
      `${kind} option ${id}`,
    )
    await run(`(() => {
      const select = document.querySelector(${JSON.stringify(selector)})
      select.value = ${JSON.stringify(id)}
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await waitFor(
      () => run(`document.querySelector(${JSON.stringify(selector)}).value === ${JSON.stringify(id)} && Boolean(document.querySelector(${JSON.stringify(`[data-plugin-ui="${kind}"] [data-ui-document]`)}))`),
      `${kind} document ${id}`,
    )
  }

  const readSurface = async kind => waitFor(() => run(`(() => {
    const root = document.querySelector(${JSON.stringify(`[data-plugin-ui="${kind}"]`)})
    const select = root?.querySelector('select[data-ui-choice]')
    const documentNode = root?.querySelector('[data-ui-document]')
    return documentNode ? {
      selected: select?.value,
      layout: documentNode.dataset.uiLayout,
      text: documentNode.textContent,
      searches: Array.from(documentNode.querySelectorAll('[data-ui-command=search]'), button => button.dataset.uiValue),
      actions: Array.from(documentNode.querySelectorAll('[data-ui-command=action]'), button => button.dataset.uiValue),
    } : null
  })()`), 'rendered ' + kind + ' surface')

  const blankUid = await run('window.__blankModel().$.uid')
  const searchUid = await run('window.__searchModel().$.uid')

  await choose('renderer', 'lx.search-layouts/layout-list')
  let rendererSurface = await readSurface('renderer')
  assert.equal(rendererSurface.layout, 'list')
  assert.deepEqual(rendererSurface.searches, ['alpha', 'beta', 'gamma'])

  await choose('renderer', 'lx.search-layouts/layout-grid')
  rendererSurface = await readSurface('renderer')
  assert.equal(rendererSurface.layout, 'grid')
  assert.deepEqual(rendererSurface.searches, ['alpha', 'beta', 'gamma'])

  await choose('slot', 'lx.search-layouts/hint')
  const slotSurface = await readSurface('slot')
  assert.equal(slotSurface.selected, 'lx.search-layouts/hint')
  assert.ok(slotSurface.text.trim().length > 0, 'slot document displays text')

  await choose('toolbar', 'lx.search-layouts/tools')
  const toolbarSurface = await readSurface('toolbar')
  assert.ok(
    toolbarSurface.actions.includes('lx.search-starters/next-set'),
    'toolbar next button carries the qualified action id',
  )

  assert.equal(await run('window.__blankModel().$.uid'), blankUid)
  assert.equal(await run('window.__searchModel().$.uid'), searchUid)
  assert.deepEqual(JSON.parse(await run("localStorage.getItem('lx.plugin-ui.v1')")), {
    renderer: 'lx.search-layouts/layout-grid',
    slot: 'lx.search-layouts/hint',
    toolbar: 'lx.search-layouts/tools',
  })
  observations.listGrid = {
    listSearches: ['alpha', 'beta', 'gamma'],
    gridSearches: rendererSurface.searches,
    blankUid,
    searchUid,
  }
  checks.push('default remains native; list/grid and slot/toolbar choices execute only after manual select changes')

  await run("document.querySelector('[data-plugin-ui=renderer]').scrollIntoView({block:'center'});void 0")
  await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,400))))')
  await captureSnapshot('plugin-ui-selection.png')

  const beforeAction = await ipc('plugin_search_suggestions', { source: 'kw' })
  assert.deepEqual(beforeAction, { suggestions: ['alpha', 'beta', 'gamma'] })
  const initialSlotText = (await readSurface('slot')).text
  const slotRendersBeforeAction = await run(
    "window.__uiRenderProbe.filter(call=>call.kind==='slot').length",
  )
  const actionButtonSelector = '[data-plugin-ui="toolbar"] [data-ui-command="action"][data-ui-value="lx.search-starters/next-set"]'
  assert.equal(await run(`Boolean(document.querySelector(${JSON.stringify(actionButtonSelector)}))`), true)
  await run(`document.querySelector(${JSON.stringify(actionButtonSelector)}).click()`)

  let nextSuggestions
  await waitFor(async() => {
    const current = (await ipc('plugin_search_suggestions', { source: 'kw' })).suggestions
    if (JSON.stringify(current) === JSON.stringify(beforeAction.suggestions)) return false
    nextSuggestions = current
    return current.length > 0
  }, 'toolbar next-set action advances the shared provider group')

  await waitFor(async() => {
    const renderer = await readSurface('renderer')
    const slot = await readSurface('slot')
    const modelSuggestions = await run('Array.from(window.__blankModel().pluginSuggestions)')
    return (
      JSON.stringify(renderer?.searches) === JSON.stringify(nextSuggestions)
      && JSON.stringify(modelSuggestions) === JSON.stringify(nextSuggestions)
      && slot?.text !== initialSlotText
    )
  }, 'renderer and slot refresh from the same search model after next-set')
  const slotRendersAfterAction = await run(
    "window.__uiRenderProbe.filter(call=>call.kind==='slot').length",
  )
  assert.ok(slotRendersAfterAction > slotRendersBeforeAction, 'slot requested a fresh document after action')

  assert.equal(await run('window.__blankModel().$.uid'), blankUid)
  assert.equal(await run('window.__searchModel().$.uid'), searchUid)
  assert.equal(await run('window.__searchModel().searchText'), '')
  observations.nextSet = {
    before: beforeAction.suggestions,
    after: nextSuggestions,
    rendererSearches: (await readSurface('renderer')).searches,
    slotText: (await readSurface('slot')).text,
    slotRendersBeforeAction,
    slotRendersAfterAction,
    blankUid,
    searchUid,
    searchText: await run('window.__searchModel().searchText'),
  }
  checks.push('toolbar action uses the original BlankView handleAction path and refreshes renderer/slot without remounting Search')

  const unsafeTitle = '<img src=x onerror="window.__pluginUiInjected=1">'
  await run('window.__pluginUiInjected=0;void 0')
  await ipc('plugin_set_setting', {
    pluginId: 'lx.search-layouts',
    key: 'title',
    value: unsafeTitle,
  })
  await waitFor(
    () => run(`document.querySelector('[data-plugin-ui=renderer] [data-ui-document]')?.textContent.includes(${JSON.stringify(unsafeTitle)})`),
    'unsafe title rendered as literal text',
  )
  assert.equal(await run("document.querySelectorAll('[data-plugin-ui] img').length"), 0)
  assert.equal(await run('window.__pluginUiInjected'), 0)
  observations.unsafeTitle = {
    literalTextVisible: true,
    imageElements: 0,
    injected: false,
  }
  checks.push('plugin heading and labels are interpolated as text; HTML-looking title creates no image or event handler')

  await ipc('plugin_set_setting', {
    pluginId: 'lx.search-layouts',
    key: 'title',
    value: 'Search layouts',
  })
  await waitFor(
    () => run("document.querySelector('[data-plugin-ui=renderer] [data-ui-document]')?.textContent.includes('Search layouts')"),
    'safe title restored',
  )

  const groupBeforeTheme = await ipc('plugin_search_suggestions', { source: 'kw' })
  await navigate('/setting?name=ThemeSettings')
  await waitFor(
    () => run("Boolean(document.querySelector('[data-theme-choice=tide]'))"),
    'tide theme choice',
  )
  await run("document.querySelector('[data-theme-choice=tide]').click()")
  await waitFor(
    () => run("document.documentElement.dataset.lxIdentity==='tide'"),
    'tide theme applied',
  )
  await navigate('/search?source=kw&type=music&text=')
  await waitFor(
    () => run("document.querySelector('[data-feature=search]')?.dataset.renderer==='theme-tide'&&window.__searchModel()&&Boolean(window.__blankModel())"),
    'shared BlankView inside tide search',
  )
  await waitFor(
    () => run("['renderer','slot','toolbar'].every(kind=>document.querySelector('[data-plugin-ui=\"'+kind+'\"] select[data-ui-choice]')?.value.startsWith('lx.search-layouts/')&&document.querySelector('[data-plugin-ui=\"'+kind+'\"] [data-ui-document]'))"),
    'plugin UI preferences restored after tide navigation',
  )

  const groupAfterTheme = await ipc('plugin_search_suggestions', { source: 'kw' })
  assert.deepEqual(groupAfterTheme, groupBeforeTheme, 'theme navigation must not advance search starters')
  assert.deepEqual(
    {
      renderer: (await readSurface('renderer')).selected,
      slot: (await readSurface('slot')).selected,
      toolbar: (await readSurface('toolbar')).selected,
    },
    {
      renderer: 'lx.search-layouts/layout-grid',
      slot: 'lx.search-layouts/hint',
      toolbar: 'lx.search-layouts/tools',
    },
  )
  assert.deepEqual((await readSurface('renderer')).searches, groupAfterTheme.suggestions)
  const themedSearchUid = await run('window.__searchModel().$.uid')
  assert.equal(await run('window.__searchModel().$.uid'), themedSearchUid)
  assert.equal(await run('window.__searchModel().searchText'), '')
  observations.tide = {
    identity: await run('document.documentElement.dataset.lxIdentity'),
    providerGroupBefore: groupBeforeTheme.suggestions,
    providerGroupAfter: groupAfterTheme.suggestions,
    selections: {
      renderer: (await readSurface('renderer')).selected,
      slot: (await readSurface('slot')).selected,
      toolbar: (await readSurface('toolbar')).selected,
    },
    searchUid: themedSearchUid,
  }
  checks.push('tide theme keeps all three UI choices and the current starters group; BlankView still shares the themed Search model')

  const preferencesBeforeDisable = JSON.parse(await run("localStorage.getItem('lx.plugin-ui.v1')"))
  const disableStarted = Date.now()
  await toggle('lx.search-layouts', false)
  await waitPlugin('lx.search-layouts', 'disabled')
  await waitFor(
    () => run("document.querySelectorAll('[data-plugin-ui] [data-ui-document]').length===0"),
    'native fallback immediately after layout plugin disable',
  )
  const fallbackMilliseconds = Date.now() - disableStarted
  assert.ok(fallbackMilliseconds < 5000, 'native fallback returns promptly')
  await waitFor(
    () => run("document.querySelector('[data-plugin-ui=renderer] [data-plugin-search-suggestions]')?.textContent.includes('delta')"),
    'native renderer keeps the current starters group',
  )
  assert.deepEqual(JSON.parse(await run("localStorage.getItem('lx.plugin-ui.v1')")), preferencesBeforeDisable)

  await toggle('lx.search-layouts', true)
  await waitPlugin('lx.search-layouts', 'active')
  await waitFor(
    () => run("document.querySelector('[data-plugin-ui=renderer] [data-ui-document]')?.dataset.uiLayout==='grid'&&document.querySelector('[data-plugin-ui=slot] [data-ui-document]')&&document.querySelector('[data-plugin-ui=toolbar] [data-ui-document]')"),
    'saved UI choices restored after plugin re-enable',
  )
  assert.deepEqual(
    {
      renderer: (await readSurface('renderer')).selected,
      slot: (await readSurface('slot')).selected,
      toolbar: (await readSurface('toolbar')).selected,
    },
    {
      renderer: 'lx.search-layouts/layout-grid',
      slot: 'lx.search-layouts/hint',
      toolbar: 'lx.search-layouts/tools',
    },
  )
  assert.deepEqual(
    (await ipc('plugin_search_suggestions', { source: 'kw' })).suggestions,
    groupAfterTheme.suggestions,
  )
  observations.disableRestore = {
    fallbackMilliseconds,
    preferencesBeforeDisable,
    restored: {
      renderer: (await readSurface('renderer')).selected,
      slot: (await readSurface('slot')).selected,
      toolbar: (await readSurface('toolbar')).selected,
    },
    groupStable: true,
  }
  checks.push('disabling the sample shows native fallback in place; re-enabling restores all saved choices and the same group')

  const badId = 'fixture.bad'
  const badRenderId = 'fixture.bad/bad'
  const badRendererScript = `
let calls = 0
document.body.dataset.runtimeSurface = JSON.stringify({
  require: typeof require,
  ipcRenderer: typeof window.ipcRenderer,
  lxRuntimeStart: typeof window.lxRuntime?.start,
})
void lxRuntime.start({
  handlers: {
    bad: () => {
      calls++
      document.body.dataset.calls = String(calls)
      document.body.dataset.pending = 'true'
      return new Promise(resolve => {
        window.__releaseBadUi = () => {
          document.body.dataset.pending = 'false'
          resolve({ layout: 'list', heading: 'Invalid renderer', items: 'invalid' })
        }
      })
    },
  },
})
`
  const badPackage = await packageFixture(badId, {
    permissions: ['extensions.render'],
    dependencies: [{ id: 'lx.official-suite' }],
    extensions: [{
      id: 'bad',
      target: 'lx.official-suite/search.suggestions.renderer',
      version: '1.0.0',
      handler: 'bad',
      title: 'Invalid renderer',
    }],
  }, badRendererScript)
  await install(badPackage)
  await waitPlugin(badId, 'active')
  const badRuntime = runtimeContents(badId)
  assert.ok(badRuntime, 'signed bad renderer runtime is active')
  const badRuntimeSurface = JSON.parse(
    await badRuntime.executeJavaScript('document.body.dataset.runtimeSurface'),
  )
  assert.deepEqual(
    badRuntimeSurface,
    { require: 'undefined', ipcRenderer: 'undefined', lxRuntimeStart: 'function' },
  )

  const badCatalog = await ipc('plugin_search_ui', { kind: 'renderer' })
  assert.ok(badCatalog.some(choice => choice.id === badRenderId))
  const invalidRequest = {
    kind: 'renderer',
    renderId: badRenderId,
    input: { source: 'kw', suggestions: ['x'], actions: [] },
  }

  const malformedIdentity = await observe(ipc('plugin_render_search_ui', {
    ...invalidRequest,
    renderId: 'fixture.bad',
  }))
  assert.equal(malformedIdentity.status, 'rejected')
  assert.match(malformedIdentity.reason, /Invalid UI request/)
  expectedFailures.push({ scenario: 'malformed-render-identity', error: malformedIdentity.reason })

  const missingRendererIdentity = await observe(ipc('plugin_render_search_ui', {
    ...invalidRequest,
    renderId: 'fixture.bad/missing',
  }))
  assert.equal(missingRendererIdentity.status, 'rejected')
  expectedFailures.push({ scenario: 'unknown-renderer-identity', error: missingRendererIdentity.reason })
  assert.equal(await badRuntime.executeJavaScript("document.body.dataset.calls||'0'"), '0')

  const badRenderOutcome = observe(ipc('plugin_render_search_ui', invalidRequest))
  await waitFor(
    () => badRuntime.executeJavaScript("document.body.dataset.pending==='true'"),
    'bad renderer handler entered',
  )
  const badHandlerCalls = await badRuntime.executeJavaScript('document.body.dataset.calls')
  assert.equal(badHandlerCalls, '1')
  await badRuntime.executeJavaScript('window.__releaseBadUi();void 0')
  const badRender = await badRenderOutcome
  assert.equal(badRender.status, 'rejected')
  assert.match(badRender.reason, /invalid output/i)
  expectedFailures.push({ scenario: 'invalid-renderer-output', error: badRender.reason })
  await waitPlugin(badId, 'failed')
  assert.equal((await info('lx.official-suite')).lifecycleState, 'active')
  assert.equal((await info('lx.search-layouts')).lifecycleState, 'active')
  await waitFor(
    async() => !(await ipc('plugin_search_ui', { kind: 'renderer' })).some(choice => choice.id === badRenderId),
    'failed renderer removed from host catalog',
  )
  await waitFor(
    () => run("document.querySelector('[data-plugin-ui=renderer] select[data-ui-choice]')?.value==='lx.search-layouts/layout-grid'&&Boolean(document.querySelector('[data-plugin-ui=renderer] [data-ui-document]'))"),
    'healthy selected renderer remains in the UI after fixture isolation',
  )

  const healthyRenderer = await ipc('plugin_render_search_ui', {
    kind: 'renderer',
    renderId: 'lx.search-layouts/layout-grid',
    input: {
      source: 'kw',
      suggestions: groupAfterTheme.suggestions,
      actions: [{ id: 'lx.search-starters/next-set', title: 'Next set' }],
    },
  })
  assert.equal(healthyRenderer.layout, 'grid')
  assert.deepEqual(
    healthyRenderer.items.filter(item => item.command === 'search').map(item => item.value),
    groupAfterTheme.suggestions,
  )
  observations.invalidRenderer = {
    malformedIdentityRejected: true,
    unknownIdentityRejected: true,
    handlerCalls: Number(badHandlerCalls),
    invalidOutputRejected: true,
    runtimeSurface: badRuntimeSurface,
    isolatedState: {
      fixture: (await info(badId)).lifecycleState,
      officialSuite: (await info('lx.official-suite')).lifecycleState,
      searchLayouts: (await info('lx.search-layouts')).lifecycleState,
    },
    healthyRendererLayout: healthyRenderer.layout,
  }
  checks.push('main rejects malformed/foreign UI identities; one invalid signed renderer output quarantines only that runtime')

  await run('window.__restoreUiRenderProbe?.();void 0')
  const renderCalls = await run('JSON.parse(JSON.stringify(window.__uiRenderProbe))')
  assert.ok(renderCalls.some(call => call.kind === 'renderer' && call.renderId === 'lx.search-layouts/layout-grid'))
  assert.ok(renderCalls.some(call => call.kind === 'slot' && call.renderId === 'lx.search-layouts/hint'))
  assert.ok(renderCalls.some(call => call.kind === 'toolbar' && call.renderId === 'lx.search-layouts/tools'))
  observations.renderCalls = renderCalls.map(call => ({ kind: call.kind, renderId: call.renderId }))

  await run("document.querySelector('[data-plugin-ui=renderer]').scrollIntoView({block:'center'});void 0")
  await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,400))))')
  await captureSnapshot('plugin-ui-final-state.png')

  assert.deepEqual(unexpectedErrors, [])
  await finish(0)
}).catch(error => {
  console.error(error)
  void finish(1, error)
})
