import { ref, onBeforeUnmount, watch } from '@common/utils/vueTools'
import { hasInitedAdvancedAudioFeatures, setMediaDeviceId } from '@renderer/plugins/player'
import { dialog } from '@renderer/plugins/Dialog'
import { useI18n } from '@renderer/plugins/i18n'
import { appSetting, saveMediaDeviceId, updateSetting } from '@renderer/store/setting'
import { setPowerSaveBlocker } from '@renderer/core/player/utils'
import { isPlay } from '@renderer/store/player/state'
import { TRY_QUALITYS_LIST } from '@renderer/core/music/utils'
import { isMac } from '@common/utils'


export default {
  name: 'SettingPlay',
  setup() {
    const t = useI18n()
    const playQualityList = [...TRY_QUALITYS_LIST, '128k'].reverse()

    const mediaDevices = ref([])
    const getMediaDevice = async() => {
      const devices = await navigator.mediaDevices.enumerateDevices()
      let audioDevices = devices.filter(device => device.kind === 'audiooutput')
      mediaDevices.value = audioDevices
      // console.log(this.mediaDevices)
    }
    void getMediaDevice()

    navigator.mediaDevices.addEventListener('devicechange', getMediaDevice)
    onBeforeUnmount(() => {
      navigator.mediaDevices.removeEventListener('devicechange', getMediaDevice)
    })

    const mediaDeviceId = ref(appSetting['player.mediaDeviceId'])
    const handleMediaDeviceIdChnage = async() => {
      if (hasInitedAdvancedAudioFeatures()) {
        await dialog({
          message: t('setting__play_media_device_error_tip'),
          confirmButtonText: t('alert_button_text'),
        })
        mediaDeviceId.value = appSetting['player.mediaDeviceId']
      } else if (appSetting['player.audioVisualization']) {
        const confirm = await dialog.confirm({
          message: t('setting__play_media_device_tip'),
          cancelButtonText: t('cancel_button_text'),
          confirmButtonText: t('confirm_button_text'),
        })
        if (confirm) {
          updateSetting({
            'player.audioVisualization': false,
            'player.mediaDeviceId': mediaDeviceId.value,
          })
        } else {
          mediaDeviceId.value = appSetting['player.mediaDeviceId']
        }
      } else {
        appSetting['player.mediaDeviceId'] = mediaDeviceId.value
      }
    }
    watch(() => appSetting['player.mediaDeviceId'], val => {
      mediaDeviceId.value = val
    })

    const handleUpdatePowerSaveBlocker = (enabled) => {
      if (enabled) {
        if (isPlay.value) setPowerSaveBlocker(true, true)
      } else {
        setPowerSaveBlocker(false, true)
      }
      updateSetting({ 'player.powerSaveBlocker': enabled })
    }

    const isMaxOutputChannelCount = ref(appSetting['player.isMaxOutputChannelCount'])
    const handleUpdateMaxOutputChannelCount = async(enabled) => {
      isMaxOutputChannelCount.value = enabled
      if (appSetting['player.mediaDeviceId'] != 'default') {
        const confirm = await dialog.confirm({
          message: t('setting__play_advanced_audio_features_tip'),
          cancelButtonText: t('cancel_button_text'),
          confirmButtonText: t('confirm_button_text'),
        })
        if (!confirm) {
          isMaxOutputChannelCount.value = false
          return
        }
        await setMediaDeviceId('default').catch(_ => _)
        saveMediaDeviceId('default')
      }
      updateSetting({ 'player.isMaxOutputChannelCount': enabled })
    }


    return {
      appSetting,
      updateSetting,
      mediaDevices,
      mediaDeviceId,
      handleMediaDeviceIdChnage,
      handleUpdatePowerSaveBlocker,
      isMaxOutputChannelCount,
      handleUpdateMaxOutputChannelCount,
      playQualityList,
      isMac,
    }
  },
}
