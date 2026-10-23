import { onBeforeUnmount } from '@common/utils/vueTools'
import type { UpdateInfo } from 'electron-updater'
import {
  onUpdateAvailable,
  onUpdateDownloaded,
  onUpdateError,
  onUpdateNotAvailable,
  onUpdateProgress,
} from '@renderer/utils/ipc'
import { isShowChangeLog, versionInfo } from '@renderer/store'

type VersionDetails = NonNullable<typeof versionInfo.newVersion>

const createVersionDetails = (info: UpdateInfo): VersionDetails => {
  if (Array.isArray(info.releaseNotes)) {
    return {
      version: info.version,
      desc: info.releaseNotes[0]?.note ?? '',
      history: info.releaseNotes.map(({ version, note }) => ({
        version,
        desc: note ?? '',
      })),
    }
  }
  return {
    version: info.version,
    desc: typeof info.releaseNotes == 'string' ? info.releaseNotes : '',
  }
}

export default () => {
  versionInfo.showModal = false
  versionInfo.isLatest = true
  versionInfo.isUnknown = false
  versionInfo.newVersion = null
  versionInfo.reCheck = false
  versionInfo.status = 'idle'
  versionInfo.downloadProgress = null
  isShowChangeLog.value = false

  const showRecheckResult = () => {
    if (versionInfo.reCheck) versionInfo.showModal = true
    versionInfo.reCheck = false
  }

  const rUpdateAvailable = onUpdateAvailable(({ params }) => {
    versionInfo.newVersion = createVersionDetails(params)
    versionInfo.isUnknown = false
    versionInfo.isLatest = false
    versionInfo.status = 'idle'
    versionInfo.downloadProgress = null
    showRecheckResult()
  })
  const handleUpdateNotAvailable: LX.IpcRendererEventListenerParams<UpdateInfo | null> = ({ params }) => {
    versionInfo.newVersion = params == null ? null : createVersionDetails(params)
    versionInfo.isUnknown = false
    versionInfo.isLatest = true
    versionInfo.status = 'idle'
    versionInfo.downloadProgress = null
    showRecheckResult()
  }
  const rUpdateNotAvailable = onUpdateNotAvailable(handleUpdateNotAvailable)
  const rUpdateError = onUpdateError(({ params }) => {
    versionInfo.isUnknown = true
    versionInfo.isLatest = false
    versionInfo.status = 'error'
    versionInfo.downloadProgress = null
    versionInfo.reCheck = false
    versionInfo.showModal = true
    console.error('[updater]', params)
  })
  const rUpdateProgress = onUpdateProgress(({ params }) => {
    versionInfo.isUnknown = false
    versionInfo.isLatest = false
    versionInfo.status = 'downloading'
    versionInfo.downloadProgress = params
    versionInfo.reCheck = false
  })
  const rUpdateDownloaded = onUpdateDownloaded(({ params }) => {
    versionInfo.newVersion = createVersionDetails(params)
    versionInfo.isUnknown = false
    versionInfo.isLatest = false
    versionInfo.status = 'downloaded'
    versionInfo.reCheck = false
    versionInfo.showModal = true
  })

  onBeforeUnmount(() => {
    rUpdateAvailable()
    rUpdateNotAvailable()
    rUpdateError()
    rUpdateProgress()
    rUpdateDownloaded()
  })
}
