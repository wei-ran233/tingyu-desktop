import {
  createAudio,
} from '@renderer/plugins/player'
import useMediaDevice from '@renderer/bundles/official/services/runtime/usePlayer/useMediaDevice'
import usePlayerEvent from '@renderer/bundles/official/services/runtime/usePlayer/usePlayerEvent'
import usePlayer from '@renderer/bundles/official/services/runtime/usePlayer/usePlayer'
import usePlayStatus from '@renderer/bundles/official/services/runtime/usePlayer/usePlayStatus'

export default () => {
  createAudio()

  usePlayerEvent()
  useMediaDevice() // 初始化音频驱动输出设置
  usePlayer()
  const initPlayStatus = usePlayStatus()

  return () => {
    void initPlayStatus()
  }
}

