import registerWinMain from './winMain'
import { registerPluginModule } from './plugin'
import { registerOfficialServices } from '@main/bundles/official'
let isRegistered = false
export default () => {
  if (isRegistered) return
  registerOfficialServices()
  registerPluginModule()
  registerWinMain()
  isRegistered = true
}
