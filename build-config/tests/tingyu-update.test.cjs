const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const Vue = require('vue')

const root = path.resolve(__dirname, '../..')
const updateFile = path.join(root, 'src/renderer/bundles/official/services/runtime/useUpdate.ts')
const versionInfo = Vue.reactive({
  version: '2.12.3-beta.12',
  newVersion: null,
  showModal: false,
  isUnknown: false,
  isLatest: false,
  reCheck: false,
  status: 'checking',
  downloadProgress: null,
})
const isShowChangeLog = Vue.ref(true)
const beforeUnmountCallbacks = []
const activeListeners = new Map()
const removals = []
const sideEffects = []
let watchRegistrations = 0

const register = channel => listener => {
  assert.equal(typeof listener, 'function')
  assert.equal(activeListeners.has(channel), false, `duplicate listener for ${channel}`)
  activeListeners.set(channel, listener)
  return () => {
    assert.equal(activeListeners.get(channel), listener)
    activeListeners.delete(channel)
    removals.push(channel)
  }
}

const ipc = {
  onUpdateAvailable: register('update_available'),
  onUpdateNotAvailable: register('update_not_available'),
  onUpdateError: register('update_error'),
  onUpdateProgress: register('update_progress'),
  onUpdateDownloaded: register('update_downloaded'),
  downloadUpdate: () => { sideEffects.push('download') },
  saveAgreePact: () => { sideEffects.push('eula') },
}

const load = () => {
  const source = ts.transpileModule(fs.readFileSync(updateFile, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const module = { exports: {} }
  const dependencies = {
    '@common/utils/vueTools': {
      onBeforeUnmount: callback => { beforeUnmountCallbacks.push(callback) },
      watch: () => { watchRegistrations++ },
    },
    '@renderer/utils/ipc': ipc,
    '@renderer/store': { versionInfo, isShowChangeLog },
  }
  const run = vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
    console: { error: () => {} },
  }, { filename: updateFile })
  run(requireName => {
    if (requireName in dependencies) return dependencies[requireName]
    throw new Error(`Unexpected dependency: ${requireName}`)
  }, module, module.exports)
  return module.exports.default
}

const emit = (channel, params) => {
  const listener = activeListeners.get(channel)
  assert.equal(typeof listener, 'function', `missing listener for ${channel}`)
  listener({ event: {}, params })
}

const mount = useUpdate => {
  const callbackCount = beforeUnmountCallbacks.length
  useUpdate()
  assert.equal(beforeUnmountCallbacks.length, callbackCount + 1)
  return beforeUnmountCallbacks.at(-1)
}

const info = (version, releaseNotes) => ({
  version,
  releaseNotes,
  files: [],
  path: '',
  sha512: '',
  releaseDate: '',
})

const baseState = () => ({
  newVersion: versionInfo.newVersion,
  showModal: versionInfo.showModal,
  isUnknown: versionInfo.isUnknown,
  isLatest: versionInfo.isLatest,
  reCheck: versionInfo.reCheck,
  status: versionInfo.status,
  downloadProgress: versionInfo.downloadProgress,
})

const run = async() => {
  const useUpdate = load()
  let cleanup = mount(useUpdate)

  assert.deepEqual({
    showModal: versionInfo.showModal,
    isUnknown: versionInfo.isUnknown,
    isLatest: versionInfo.isLatest,
    newVersion: versionInfo.newVersion,
    reCheck: versionInfo.reCheck,
    status: versionInfo.status,
    downloadProgress: versionInfo.downloadProgress,
    showChangeLog: isShowChangeLog.value,
  }, {
    showModal: false,
    isUnknown: false,
    isLatest: true,
    newVersion: null,
    reCheck: false,
    status: 'idle',
    downloadProgress: null,
    showChangeLog: false,
  })
  assert.equal(activeListeners.size, 5)
  assert.equal(watchRegistrations, 0, 'the hook must not force-close the update modal')

  const available = info('2.13.0', [
    { version: '2.13.0', note: 'Stable release' },
    { version: '2.12.4', note: 'Previous fixes' },
  ])
  emit('update_available', available)
  assert.deepEqual(JSON.parse(JSON.stringify(versionInfo.newVersion)), {
    version: '2.13.0',
    desc: 'Stable release',
    history: [
      { version: '2.13.0', desc: 'Stable release' },
      { version: '2.12.4', desc: 'Previous fixes' },
    ],
  })
  assert.equal(versionInfo.isLatest, false)
  assert.equal(versionInfo.isUnknown, false)
  assert.equal(versionInfo.status, 'idle')
  assert.equal(versionInfo.showModal, false, 'background checks update state without interrupting the user')

  versionInfo.showModal = true
  await Vue.nextTick()
  assert.equal(versionInfo.showModal, true, 'a requested modal stays open')

  versionInfo.showModal = false
  versionInfo.reCheck = true
  emit('update_available', available)
  assert.equal(versionInfo.showModal, true, 'an explicit recheck opens its result')
  assert.equal(versionInfo.reCheck, false)

  emit('update_progress', {
    total: 100,
    delta: 25,
    transferred: 25,
    percent: 25,
    bytesPerSecond: 1024,
  })
  assert.equal(versionInfo.status, 'downloading')
  assert.equal(versionInfo.downloadProgress.percent, 25)
  assert.equal(versionInfo.showModal, true, 'progress does not close the modal')

  versionInfo.showModal = false
  emit('update_error', 'checksum mismatch')
  assert.equal(versionInfo.status, 'error')
  assert.equal(versionInfo.isUnknown, true)
  assert.equal(versionInfo.isLatest, false)
  assert.equal(versionInfo.showModal, true, 'errors remain visible with the existing retry UI')
  assert.equal(versionInfo.newVersion.version, '2.13.0', 'a download error keeps the known release available for retry')

  const latest = info('2.12.3-beta.12', 'Current release')
  versionInfo.showModal = false
  versionInfo.reCheck = true
  emit('update_not_available', latest)
  assert.equal(versionInfo.newVersion.version, '2.12.3-beta.12')
  assert.equal(versionInfo.newVersion.desc, 'Current release')
  assert.equal(versionInfo.status, 'idle')
  assert.equal(versionInfo.isLatest, true)
  assert.equal(versionInfo.isUnknown, false)
  assert.equal(versionInfo.showModal, true)

  versionInfo.showModal = false
  emit('update_not_available', null)
  assert.equal(versionInfo.newVersion, null, 'a missing release must not be turned into a version object')
  assert.equal(versionInfo.status, 'idle')
  assert.equal(versionInfo.isLatest, true)
  assert.equal(versionInfo.isUnknown, false)
  assert.equal(versionInfo.downloadProgress, null)

  const downloaded = info('2.13.0', 'Stable release')
  emit('update_downloaded', downloaded)
  assert.equal(versionInfo.newVersion.version, '2.13.0')
  assert.equal(versionInfo.status, 'downloaded')
  assert.equal(versionInfo.isLatest, false)
  assert.equal(versionInfo.isUnknown, false)
  assert.equal(versionInfo.showModal, true)

  cleanup()
  assert.equal(activeListeners.size, 0)
  assert.deepEqual(removals, [
    'update_available',
    'update_not_available',
    'update_error',
    'update_progress',
    'update_downloaded',
  ])
  const unmountedState = baseState()
  assert.throws(() => emit('update_available', info('9.0.0', 'stale')), /missing listener/)
  assert.deepEqual(baseState(), unmountedState, 'removed listeners no longer reach renderer state')

  versionInfo.showModal = true
  versionInfo.newVersion = info('9.0.0', 'stale')
  versionInfo.status = 'downloaded'
  cleanup = mount(useUpdate)
  assert.equal(activeListeners.size, 5)
  assert.equal(versionInfo.showModal, false)
  assert.equal(versionInfo.newVersion, null)
  assert.equal(versionInfo.status, 'idle')
  assert.equal(versionInfo.isLatest, true)
  assert.equal(versionInfo.isUnknown, false)

  emit('update_available', info('2.14.0', 'Remounted release'))
  assert.equal(versionInfo.newVersion.version, '2.14.0')
  assert.equal(versionInfo.newVersion.desc, 'Remounted release')
  cleanup()
  assert.equal(activeListeners.size, 0)
  assert.equal(removals.length, 10)
  assert.equal(sideEffects.length, 0, 'the event chain never accepts terms or starts a download')
  assert.equal(watchRegistrations, 0)

  console.log('PASS update events, null release, error/progress/downloaded state, modal persistence, cleanup and remount')
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
