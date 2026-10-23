import { useTimeout, startTimeoutStop, stopTimeoutStop } from '@renderer/core/player/timeoutStop'
import { ref } from '@common/utils/vueTools'
import { appSetting, updateSetting } from '@renderer/store/setting'

const MAX_MIN = 1440

const rxp = /([1-9]\d*)/

export default {
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const { timeLabel } = useTimeout()
    const time = ref(appSetting['player.waitPlayEndStopTime'])

    const handleCloseModal = () => {
      emit('update:modelValue', false)
    }
    const handleCancel = () => {
      if (timeLabel.value) {
        stopTimeoutStop()
      }
      handleCloseModal()
    }
    const verify = () => {
      const orgText = time.value
      let text = time.value

      if (rxp.test(text)) {
        text = RegExp.$1
        if (parseInt(text) > MAX_MIN) {
          text = MAX_MIN
        }
      } else {
        text = ''
      }
      time.value = text
      return text && orgText == text ? parseInt(text) : ''
    }
    const handleConfirm = () => {
      let time = verify()
      if (time == '') return
      if (appSetting['player.waitPlayEndStopTime'] != time) updateSetting({ 'player.waitPlayEndStopTime': time })
      startTimeoutStop(time * 60)
      handleCloseModal()
    }
    return {
      appSetting,
      updateSetting,
      timeLabel,
      time,
      handleCloseModal,
      handleCancel,
      handleConfirm,
    }
  },
}
