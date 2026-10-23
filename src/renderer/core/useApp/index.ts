import { getEnvParams, sendInited } from '@renderer/utils/ipc'
import { proxy, isFullscreen, themeId, themeInfo } from '@renderer/store'
import { appSetting } from '@renderer/store/setting'
import useEventListener from './useEventListener'
import { applyTheme, getThemes } from '@renderer/store/utils'
import { bundleAvailable } from '@renderer/core/features/state'

/** Window, theme, routing and recovery bootstrap belong to the host. */
export default () => {
  proxy.enable = appSetting['network.proxy.enable']
  proxy.host = appSetting['network.proxy.host']
  proxy.port = appSetting['network.proxy.port']
  isFullscreen.value = appSetting['common.startInFullscreen']
  themeId.value = appSetting['theme.id']
  getThemes(() => {
    applyTheme(appSetting['theme.id'], appSetting['theme.lightId'], appSetting['theme.darkId'], themeInfo.dataPath)
  })
  useEventListener()
  void getEnvParams().then(envParams => {
    const envProxy = envParams.cmdParams['proxy-server']
    if (envProxy && typeof envProxy === 'string') {
      const [host, port = ''] = envProxy.split(':')
      proxy.envProxy = { host, port }
    }
    if (!bundleAvailable.value) sendInited()
  })
}
