/** Privileged official service adapters are compiled with the application.
 * They own hardware/IPC integration; downloaded scripts never enter this path.
 */
import registerUserApi from '@main/modules/userApi'
import registerHotKey from '@main/modules/hotKey'
import registerTray from '@main/modules/tray'
import registerAppMenu from '@main/modules/appMenu'
import registerWinLyric from '@main/modules/winLyric'
import registerCommonRenderers from '@main/modules/commonRenderers'

export const registerOfficialServices = () => {
  registerUserApi()
  registerCommonRenderers()
  registerHotKey()
  registerTray()
  registerAppMenu()
  registerWinLyric()
}
