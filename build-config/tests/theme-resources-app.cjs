/* Built application, signed API 1.8 theme fixtures, disposable profile and evidence. */
const { app, BrowserWindow, globalShortcut, dialog } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const JSZip = require('jszip')

const root = path.resolve(__dirname, '../..')
const sampleDir = path.join(root, 'plugin-samples/paper-theme')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-theme-resources-'))
const evidence = process.env.LX_THEME_RESOURCES_EVIDENCE_DIR
  ? path.resolve(process.env.LX_THEME_RESOURCES_EVIDENCE_DIR)
  : path.join(root, '.runtime/theme-resources-20261021/app')
fs.mkdirSync(evidence, { recursive: true })
fs.mkdirSync(path.join(profile, 'LxDatas'), { recursive: true })

app.commandLine.appendSwitch('user-data-dir', profile); app.setPath('userData', profile)
app.getVersion = () => require(path.join(root, 'package.json')).version
app.setAsDefaultProtocolClient = () => false
globalShortcut.register = () => false

const healthyId = 'lx.paper-theme'
const brokenId = 'fixture.broken-paper'
const selectionKey = 'lx.theme.plugin.v1'
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

const signingKey = crypto.createPrivateKey(
  fs.readFileSync(path.join(root, 'plugin-samples/keys/sample-private.pem')),
)
const publicKey = crypto.createPublicKey(
  fs.readFileSync(path.join(root, 'plugin-samples/keys/sample-public.pem')),
)
const publicKeyBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')

const packageFixture = async(id, inputManifest, files) => {
  const manifest = { ...inputManifest, publicKey: publicKeyBase64 }
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
    signingKey,
  ).toString('base64')
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify(manifest))
  for (const [name, data] of files) zip.file(name, data)
  const file = path.join(profile, id + '.lxplugin')
  fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }))
  return file
}

const pngHeader = (width, height) => {
  const data = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data)
  data.writeUInt32BE(13, 8)
  data.write('IHDR', 12, 'ascii')
  data.writeUInt32BE(width, 16)
  data.writeUInt32BE(height, 20)
  data.set([8, 6, 0, 0, 0], 24)
  return data
}

const pngChunk = (type, body) => {
  const data = Buffer.alloc(12 + body.length)
  data.writeUInt32BE(body.length, 0)
  data.write(type, 4, 'ascii')
  body.copy(data, 8)
  return data
}

const insertBeforeIend = (png, chunk) => Buffer.concat([
  png.subarray(0, png.length - 12),
  chunk,
  png.subarray(png.length - 12),
])

const writeResults = (passed, error) => {
  fs.writeFileSync(path.join(evidence, 'app-results.json'), JSON.stringify({
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
    unexpectedErrors,
    screenshots,
    error: error ? { message: error.message, stack: error.stack } : undefined,
  }, null, 2))
}

const capture = async name => {
  if (!host || host.isDestroyed()) return
  host.show()
  host.focus()
  await host.webContents.executeJavaScript(
    'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 350))))',
  )
  fs.writeFileSync(path.join(evidence, name), (await host.webContents.capturePage()).toPNG())
  screenshots.push(name)
}

const finish = async(code, error) => {
  if (finished) return
  finished = true
  clearTimeout(deadline)
  if (code !== 0) {
    try { await capture('theme-resources-failure.png') } catch (captureError) {
      unexpectedErrors.push('failure screenshot: ' + describeError(captureError))
    }
  }
  writeResults(code === 0, error)
  try { global.lx.isSkipTrayQuit = true } catch {}
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.destroy()
  }
  fs.rmSync(profile, { recursive: true, force: true })
  app.exit(code)
}

deadline = setTimeout(() => {
  void finish(1, new Error('Theme resource app test exceeded 180 seconds'))
}, 180000)
deadline.unref()

// The acceptance must execute the exact production main entry used by the app.
require(path.join(root, 'dist/main.js'))

app.whenReady().then(async() => {
  const paperManifest = JSON.parse(fs.readFileSync(path.join(sampleDir, 'manifest.json'), 'utf8'))
  const paperIndex = fs.readFileSync(path.join(sampleDir, 'index.html'))
  const paperPng = fs.readFileSync(path.join(sampleDir, 'assets/paper.png'))
  const appearance = {
    identity: 'paper',
    layout: 'sidebar',
    background: 'image',
    detail: 'sleeve',
    content: 'full',
    metrics: { sidebarWidth: 176, radius: 18, spacing: 12 },
    motion: { durationMs: 8000, enabled: true },
  }
  const searchPath = paperManifest.themes[0].resources.icons.search.path
  const brandPath = paperManifest.themes[0].resources.icons.brand.path

  assert.equal(paperManifest.id, healthyId)
  assert.equal(paperManifest.defaultEnabled, false)
  assert.equal(paperManifest.apiVersion, '1.8.0')
  assert.deepEqual(
    [...paperManifest.permissions].sort(),
    ['theme.appearance', 'theme.contribute', 'theme.resources'],
  )
  assert.ok(paperManifest.dependencies.some(dependency => dependency.id === 'lx.official-suite'))
  assert.deepEqual(paperManifest.themes.map(theme => theme.id), ['paper-light', 'paper-dark'])
  assert.deepEqual(paperManifest.themes.map(theme => theme.name), ['纸间 · 日光', '纸间 · 夜读'])
  for (const theme of paperManifest.themes) {
    assert.deepEqual(theme.appearance, appearance)
    assert.equal(theme.resources.background, 'assets/paper.png')
    assert.match(theme.resources.icons.search.path, /^M/)
    assert.match(theme.resources.icons.brand.path, /^M/)
  }

  const healthyPackage = await packageFixture(healthyId, paperManifest, new Map([
    ['index.html', paperIndex],
    ['assets/paper.png', paperPng],
  ]))
  const brokenPngs = {
    'broken-actl': insertBeforeIend(paperPng, pngChunk('acTL', Buffer.alloc(8))),
    'broken-incomplete': paperPng.subarray(0, paperPng.length - 12),
    'broken-iend': Buffer.concat([paperPng, Buffer.from([0])]),
    'broken-width': pngHeader(4097, 1),
    'broken-pixels': pngHeader(4096, 2049),
    'broken-bytes': Buffer.alloc(2 * 1024 * 1024 + 1),
  }
  brokenPngs['broken-bytes'].set(pngHeader(1, 1))
  const brokenThemes = Object.keys(brokenPngs).map(id => ({
    id,
    name: `Broken paper ${id.slice(7)}`,
    isDark: false,
    tokens: JSON.parse(JSON.stringify(paperManifest.themes[0].tokens)),
    appearance: JSON.parse(JSON.stringify(appearance)),
    resources: { background: `assets/${id}.png` },
  }))
  const brokenManifest = {
    ...JSON.parse(JSON.stringify(paperManifest)),
    id: brokenId,
    name: 'Broken Paper Resource Fixture',
    defaultEnabled: false,
    themes: brokenThemes,
  }
  const brokenFiles = new Map([
    ['index.html', paperIndex],
    ...Object.entries(brokenPngs).map(([id, data]) => [`assets/${id}.png`, data]),
  ])
  const brokenPackage = await packageFixture(brokenId, brokenManifest, brokenFiles)

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
  const navigate = url => run(
    `document.getElementById('root').__vue_app__.config.globalProperties.$router.push(${JSON.stringify(url)})`,
  )
  const info = async id => (await ipc('plugin_list')).find(plugin => plugin.id === id)
  const toggle = (id, enabled) => ipc('plugin_set_enabled', { pluginId: id, enabled })
  const waitPlugin = (id, state) => waitFor(
    async() => (await info(id))?.lifecycleState === state,
    `${id} lifecycle ${state}`,
  )
  const install = async file => {
    dialog.showOpenDialog = async() => ({ canceled: false, filePaths: [file] })
    const preview = await ipc('plugin_install')
    assert.equal(preview.id, path.basename(file, '.lxplugin'))
    return ipc('plugin_confirm_install', { token: preview.token })
  }
  const expectResourceRejection = async(scenario, params, pattern) => {
    const result = await observe(ipc('plugin_theme_resources', params))
    assert.equal(result.status, 'rejected', scenario)
    assert.match(result.reason, pattern, scenario)
    expectedFailures.push({ scenario, error: result.reason })
  }
  const summarizeResources = resources => {
    const encoded = resources.background?.split(',', 2)[1] ?? ''
    const bytes = Buffer.from(encoded, 'base64')
    return {
      background: {
        prefix: resources.background?.slice(0, 22),
        bytes: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      },
      icons: resources.icons,
    }
  }
  const readThemeState = () => run(`(() => {
    const root = document.documentElement
    const brand = document.querySelector('.theme-aside-brand.theme-brand')
    const searchUse = document.querySelector('[data-theme-navigation] [data-page-id="search"] use')
    const backdrop = document.querySelector('.theme-backdrop')
    const searchSymbol = document.getElementById('lx-icon-paper-search')
    return {
      theme: root.dataset.lxTheme,
      identity: root.dataset.lxIdentity,
      layout: root.dataset.lxLayout,
      scheme: root.dataset.lxScheme,
      background: root.dataset.lxBackground,
      detail: root.dataset.lxDetail,
      content: root.dataset.lxContent,
      motion: root.dataset.lxMotion,
      variables: {
        sidebarWidth: root.style.getPropertyValue('--lx-theme-sidebar-width'),
        radius: root.style.getPropertyValue('--lx-theme-radius'),
        spacing: root.style.getPropertyValue('--lx-theme-spacing'),
        duration: root.style.getPropertyValue('--lx-theme-motion-duration'),
      },
      backdropImage: backdrop ? getComputedStyle(backdrop).backgroundImage : '',
      brand: brand ? {
        ariaLabel: brand.getAttribute('aria-label'),
        text: brand.querySelector('strong')?.textContent?.trim(),
        dataBrand: brand.dataset.brand,
        iconPath: brand.querySelector('svg path')?.getAttribute('d'),
      } : null,
      searchSymbolPath: searchSymbol?.querySelector('path')?.getAttribute('d'),
      searchHref: searchUse?.getAttribute('xlink:href') || searchUse?.getAttribute('href'),
    }
  })()`)
  const selectTheme = async(id, name, scheme) => {
    await waitFor(
      () => run(`(() => {
        const choice = document.querySelector('[data-theme-choice="${id}"]')
        return Boolean(choice) && !choice.disabled
      })()`),
      `${id} enabled theme choice`,
    )
    await run(`document.querySelector('[data-theme-choice="${id}"]').click()`)
    await waitFor(
      () => run(`document.documentElement.dataset.lxTheme==='plugin:${healthyId}:${id}'`),
      `${id} applied`,
    )
    const state = await readThemeState()
    assert.equal(state.identity, 'paper')
    assert.equal(state.layout, 'sidebar')
    assert.equal(state.background, 'image')
    assert.equal(state.detail, 'sleeve')
    assert.equal(state.content, 'full')
    assert.equal(state.scheme, scheme)
    assert.equal(state.motion, 'on')
    assert.deepEqual(state.variables, {
      sidebarWidth: '176px',
      radius: '18px',
      spacing: '12px',
      duration: '8000ms',
    })
    assert.match(state.backdropImage, /url\("data:image\/png;base64,/)
    assert.equal(state.brand.ariaLabel, name)
    assert.equal(state.brand.text, name)
    assert.equal(state.brand.dataBrand, 'paper')
    assert.equal(state.brand.iconPath, brandPath)
    assert.equal(state.searchSymbolPath, searchPath)
    assert.equal(state.searchHref, '#lx-icon-paper-search')
    return state
  }

  await waitFor(() => run("Boolean(document.getElementById('root')?.__vue_app__)"), 'Vue application')
  assert.equal(await run('window === window.top && window.parent === window'), true)
  await waitPlugin('lx.official-suite', 'active')
  await waitPlugin('lx.theme-studio', 'active')
  const initialHealth = {
    official: (await info('lx.official-suite')).lifecycleState,
    themeStudio: (await info('lx.theme-studio')).lifecycleState,
  }

  await install(healthyPackage)
  const healthyInfo = await info(healthyId)
  assert.equal(healthyInfo.enabled, false)
  assert.equal(healthyInfo.runtime, undefined)
  await waitPlugin(healthyId, 'disabled')
  await expectResourceRejection(
    'disabled plugin resource access',
    { pluginId: healthyId, themeId: 'paper-light' },
    /disabled|unavailable|停用/i,
  )

  await toggle(healthyId, true)
  await waitPlugin(healthyId, 'active')
  const resources = await ipc('plugin_theme_resources', {
    pluginId: healthyId,
    themeId: 'paper-light',
  })
  assert.match(resources.background, /^data:image\/png;base64,/)
  assert.deepEqual(resources.icons, paperManifest.themes[0].resources.icons)
  const normalizedPng = Buffer.from(resources.background.split(',', 2)[1], 'base64')
  assert.ok(normalizedPng.length > 33)
  assert.ok(normalizedPng.length <= 2 * 1024 * 1024)
  assert.deepEqual([...normalizedPng.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  observations.resourceResponse = summarizeResources(resources)
  observations.initialHealth = initialHealth
  checks.push('signed API 1.8 sample is disabled by default; enabled resource IPC returns normalized static PNG and custom icons')

  await expectResourceRejection(
    'unknown plugin',
    { pluginId: 'fixture.missing-theme', themeId: 'paper-light' },
    /not found|not_found|unavailable/i,
  )
  await expectResourceRejection(
    'unknown theme',
    { pluginId: healthyId, themeId: 'missing-theme' },
    /not found|not_found|unavailable|permission/i,
  )
  await expectResourceRejection(
    'plugin without theme.resources',
    { pluginId: 'lx.theme-studio', themeId: 'tide' },
    /permission|unavailable/i,
  )
  await expectResourceRejection(
    'theme id path guess',
    { pluginId: healthyId, themeId: 'assets/paper.png' },
    /invalid theme identity/i,
  )
  await expectResourceRejection(
    'cross plugin path parameter',
    {
      pluginId: healthyId,
      themeId: '../fixture.broken-paper/assets/broken-actl.png',
      path: '../fixture.broken-paper/assets/broken-actl.png',
    },
    /invalid theme identity/i,
  )
  const forgedPath = await ipc('plugin_theme_resources', {
    pluginId: healthyId,
    themeId: 'paper-light',
    path: '../fixture.broken-paper/assets/broken-actl.png',
    background: 'assets/broken-actl.png',
  })
  assert.deepEqual(forgedPath.icons, resources.icons)
  assert.equal(forgedPath.background, resources.background)
  observations.forgedPathIgnored = true
  checks.push('missing plugin/theme, missing permission and guessed/cross-plugin paths cannot select package resources')

  await navigate('/setting?name=ThemeSettings')
  await waitFor(
    () => run("Boolean(document.querySelector('[data-theme-choice=paper-light]'))"),
    'paper theme catalog',
  )
  const lightState = await selectTheme('paper-light', '纸间 · 日光', 'light')
  await capture('paper-light.png')
  await run("document.querySelector('.theme-studio-controls input').click()")
  await waitFor(
    () => run("document.documentElement.dataset.lxMotion==='off'"),
    'motion UI disabled',
  )
  await run("document.querySelector('.theme-studio-controls input').click()")
  await waitFor(
    () => run("document.documentElement.dataset.lxMotion==='on'"),
    'motion UI restored',
  )
  const reducedMotionRule = await run(`(() => {
    const visit = rules => Array.from(rules).some(rule => {
      if (rule.conditionText?.includes('prefers-reduced-motion') && rule.cssText.includes('animation') && rule.cssText.includes('none')) return true
      return Boolean(rule.cssRules && visit(rule.cssRules))
    })
    return Array.from(document.styleSheets).some(sheet => {
      try { return visit(sheet.cssRules) } catch { return false }
    })
  })()`)
  assert.equal(reducedMotionRule, true)
  observations.light = lightState
  checks.push('light theme applies identity/layout/scheme, metrics, image backdrop, brand and themed search icon')

  const darkState = await selectTheme('paper-dark', '纸间 · 夜读', 'dark')
  await capture('paper-dark.png')
  observations.dark = darkState
  observations.motion = {
    uiToggle: true,
    reducedMotionCssRule: reducedMotionRule,
  }
  checks.push('dark selection preserves resource metrics while switching scheme; motion UI and reduced-motion CSS are present')

  await install(brokenPackage)
  await toggle(brokenId, false)
  await waitPlugin(brokenId, 'disabled')
  await toggle(brokenId, true)
  await waitPlugin(brokenId, 'active')
  const brokenPatterns = {
    'broken-actl': /animated|PNG/i,
    'broken-incomplete': /incomplete|PNG/i,
    'broken-iend': /incomplete|PNG/i,
    'broken-width': /oversized|dimensions|PNG/i,
    'broken-pixels': /dimensions|PNG/i,
    'broken-bytes': /oversized|PNG/i,
  }
  for (const [themeId, pattern] of Object.entries(brokenPatterns)) {
    await expectResourceRejection(
      `native PNG rejection: ${themeId}`,
      { pluginId: brokenId, themeId },
      pattern,
    )
  }
  await navigate('/setting?name=ThemeSettings')
  await waitFor(
    () => run("Boolean(document.querySelector('[data-theme-choice=broken-actl]'))"),
    'broken theme choice',
  )
  await run("document.querySelector('[data-theme-choice=broken-actl]').click()")
  await waitFor(
    () => run("document.querySelector('[role=alert]')?.textContent?.includes('PNG')"),
    'broken theme UI rejection',
  )
  const afterBrokenSelection = await readThemeState()
  assert.equal(afterBrokenSelection.theme, `plugin:${healthyId}:paper-dark`)
  assert.equal(afterBrokenSelection.scheme, 'dark')
  assert.equal(afterBrokenSelection.backdropImage, darkState.backdropImage)
  observations.nativePngRejections = Object.keys(brokenPatterns)
  checks.push('signed bad PNG variants are rejected; failed UI selection keeps the healthy dark theme active')

  await toggle(healthyId, false)
  await waitPlugin(healthyId, 'disabled')
  await waitFor(
    () => run("!document.documentElement.hasAttribute('data-lx-identity')"),
    'theme identity cleanup',
  )
  const cleanup = await run(`(() => {
    const root = document.documentElement
    const searchUse = document.querySelector('[data-theme-navigation] [data-page-id="search"] use')
    return {
      theme: root.hasAttribute('data-lx-theme'),
      identity: root.hasAttribute('data-lx-identity'),
      layout: root.hasAttribute('data-lx-layout'),
      scheme: root.hasAttribute('data-lx-scheme'),
      background: root.hasAttribute('data-lx-background'),
      backdrop: Boolean(document.querySelector('.theme-backdrop')),
      brand: Boolean(document.querySelector('.theme-aside-brand')),
      paperIcons: document.querySelectorAll('[id^=lx-icon-paper-]').length,
      variables: [
        '--lx-theme-sidebar-width',
        '--lx-theme-radius',
        '--lx-theme-spacing',
        '--lx-theme-motion-duration',
      ].map(name => root.style.getPropertyValue(name)),
      selected: localStorage.getItem(${JSON.stringify(selectionKey)}),
      searchHref: searchUse?.getAttribute('xlink:href') || searchUse?.getAttribute('href'),
    }
  })()`)
  assert.deepEqual(cleanup, {
    theme: false,
    identity: false,
    layout: false,
    scheme: false,
    background: false,
    backdrop: false,
    brand: false,
    paperIcons: 0,
    variables: ['', '', '', ''],
    selected: null,
    searchHref: '#icon-search-2',
  })
  await expectResourceRejection(
    'resource access after selected plugin disable',
    { pluginId: healthyId, themeId: 'paper-dark' },
    /disabled|unavailable|停用/i,
  )
  const finalHealth = {
    official: (await info('lx.official-suite')).lifecycleState,
    themeStudio: (await info('lx.theme-studio')).lifecycleState,
  }
  assert.equal(finalHealth.official, initialHealth.official)
  assert.equal(finalHealth.themeStudio, initialHealth.themeStudio)
  observations.cleanup = cleanup
  observations.finalHealth = finalHealth
  await capture('theme-resources-cleanup.png')
  checks.push('disabling the selected plugin removes identity, backdrop, icons and metrics while unrelated plugins stay healthy')
  assert.deepEqual(unexpectedErrors, [])
  console.log('THEME RESOURCES APP PASS', JSON.stringify(checks))
  await finish(0)
}).catch(error => {
  console.error(error)
  void finish(1, error)
})
