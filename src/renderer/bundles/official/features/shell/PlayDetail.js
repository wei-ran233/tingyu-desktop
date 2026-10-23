import { ref, watch, onBeforeUnmount } from '@common/utils/vueTools'
import { isFullscreen } from '@renderer/store'
import {
  isShowPlayerDetail,
  isShowPlayComment,
  musicInfo,
  playMusicInfo,
} from '@renderer/store/player/state'
import {
  setShowPlayerDetail,
  setShowPlayComment,
  setShowPlayLrcSelectContentLrc,
} from '@renderer/store/player/action'
import LyricPlayer from '@renderer/components/layout/PlayDetail/LyricPlayer.vue'
import PlayBar from '@renderer/components/layout/PlayDetail/PlayBar.vue'
import MusicComment from '@renderer/components/layout/PlayDetail/components/MusicComment/index.vue'
import ControlBtnsLeftHeader from '@renderer/components/layout/PlayDetail/ControlBtnsLeftHeader.vue'
import ControlBtnsRightHeader from '@renderer/components/layout/PlayDetail/ControlBtnsRightHeader.vue'
import { registerAutoHideMounse, unregisterAutoHideMounse } from '@renderer/components/layout/PlayDetail/autoHideMounse'
import { appSetting } from '@renderer/store/setting'
import { closeWindow, maxWindow, minWindow, setFullScreen } from '@renderer/utils/ipc'

export default {
  name: 'CorePlayDetail',
  components: {
    ControlBtnsLeftHeader,
    ControlBtnsRightHeader,
    LyricPlayer,
    PlayBar,
    MusicComment,
  },
  setup() {
    const visibled = ref(false)

    let clickTime = 0

    const hide = () => {
      setShowPlayerDetail(false)
    }
    const handleContextMenu = () => {
      if (window.performance.now() - clickTime > 400) {
        clickTime = window.performance.now()
        return
      }
      clickTime = 0
      hide()
    }

    const hideComment = () => {
      setShowPlayComment(false)
    }

    const handleAfterEnter = () => {
      if (!isShowPlayerDetail.value) return
      if (isFullscreen.value) registerAutoHideMounse()
      visibled.value = true
    }

    const handleAfterLeave = () => {
      if (isShowPlayerDetail.value) return
      setShowPlayLrcSelectContentLrc(false)
      hideComment(false)
      visibled.value = false

      unregisterAutoHideMounse()
    }

    watch([isFullscreen, isShowPlayerDetail], ([fullscreen, visible]) => {
      (fullscreen && visible ? registerAutoHideMounse : unregisterAutoHideMounse)()
    }, { immediate: true })
    onBeforeUnmount(() => {
      setShowPlayerDetail(false)
      setShowPlayComment(false)
      setShowPlayLrcSelectContentLrc(false)
      unregisterAutoHideMounse()
    })


    return {
      appSetting,
      playMusicInfo,
      isShowPlayerDetail,
      isShowPlayComment,
      musicInfo,
      hide,
      handleContextMenu,
      hideComment,
      handleAfterEnter,
      handleAfterLeave,
      visibled,
      isFullscreen,
      fullscreenExit() {
        void setFullScreen(false).then((fullscreen) => {
          isFullscreen.value = fullscreen
        })
      },
      min() {
        minWindow()
      },
      max() {
        maxWindow()
      },
      close() {
        closeWindow()
      },
    }
  },
}
