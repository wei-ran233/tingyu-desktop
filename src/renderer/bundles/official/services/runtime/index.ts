import { onBeforeUnmount } from '@common/utils/vueTools'
import { getEnvParams, sendInited, checkUpdate } from '@renderer/utils/ipc'
import { appSetting } from '@renderer/store/setting'
import useSync from './useSync'
import useOpenAPI from './useOpenAPI'
import useStatusbarLyric from './useStatusbarLyric'
import useUpdate from './useUpdate'
import useDataInit from './useDataInit'
import useHandleEnvParams from './useHandleEnvParams'
import useDeeplink from './useDeeplink'
import usePlayer from './usePlayer'
import useSettingSync from './useSettingSync'
import handleListAutoUpdate from './listAutoUpdate'

export default () => {
  let disposed = false
  onBeforeUnmount(() => { disposed = true })
  const initSync = useSync()
  const initOpenAPI = useOpenAPI()
  const initLyrics = useStatusbarLyric()
  const initPlayer = usePlayer()
  const handleEnvParams = useHandleEnvParams()
  const initData = useDataInit()
  const initDeeplink = useDeeplink()
  useUpdate()
  useSettingSync()
  void getEnvParams().then(async envParams => {
    await initData()
    if (disposed) return
    initPlayer()
    handleEnvParams(envParams)
    void initDeeplink(envParams)
    void initSync()
    void initOpenAPI()
    void initLyrics()
    sendInited()
    handleListAutoUpdate()
    if (window.lx.isProd && appSetting['common.isAgreePact']) checkUpdate()
  }).catch(error => { console.error('[official runtime]', error) })
}
