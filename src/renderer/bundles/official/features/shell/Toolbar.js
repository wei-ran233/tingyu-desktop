import { isFullscreen } from '@renderer/store'
import { appSetting } from '@renderer/store/setting'
import ControlBtns from '@renderer/components/layout/Toolbar/ControlBtns.vue'
import SearchInput from '@renderer/components/layout/Toolbar/SearchInput.vue'

export default {
  components: { ControlBtns, SearchInput },
  setup() { return { isFullscreen, appSetting } },
}
