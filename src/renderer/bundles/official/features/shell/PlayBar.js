import { appSetting } from '@renderer/store/setting'
import ThemePlayback from '@renderer/components/theme/ThemePlayback.vue'
import MiniWidthProgress from '@renderer/components/layout/PlayBar/MiniWidthProgress.vue'
import FullWidthProgress from '@renderer/components/layout/PlayBar/FullWidthProgress.vue'
import MiddleWidthProgress from '@renderer/components/layout/PlayBar/MiddleWidthProgress.vue'

export default {
  components: { MiniWidthProgress, FullWidthProgress, MiddleWidthProgress, ThemePlayback },
  setup() { return { appSetting } },
}
