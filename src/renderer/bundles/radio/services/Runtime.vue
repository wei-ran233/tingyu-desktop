<template><span hidden data-service-id="lx.radio.runtime" /></template>
<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { featureEnabled } from '@renderer/core/features/state'
import { registerPlaybackExtension } from '@renderer/core/player/extensions'
import { getCurrentTime, getDuration } from '@renderer/plugins/player'
import { isPlay, playMusicInfo } from '@renderer/store/player/state'
import { registerAction } from '@renderer/store/list/action'
import { LIST_IDS } from '@common/constants'
import { recordPlayedSong, refreshUserProfileFavorites } from '../utils/userProfile'
import { createListeningTracker } from '../utils/listeningProfile'
import { notifyDjSongEnded, setDjActionHandler, setDjAutoContinueExecutor, stopDjSpeech } from '../player/djAudio'
import { deactivateRadioSession } from '../composables/useDjChat'
import { cancelWeatherRequests } from '../utils/weatherService'
import { cancelLocalDiscovery } from '../utils/ai/localDiscovery'
import { cancelRadioRequests } from '../utils/serviceBridge'

let sessionId = crypto.randomUUID()
const tracker = createListeningTracker(at => {
  const item = playMusicInfo.musicInfo
  const track = item && 'progress' in item ? item.metadata.musicInfo : item
  if (track) recordPlayedSong(track.name, track.singer, { sessionId, at, track })
})
let unregisterPlayback: (() => void) | null = null
let unregisterLists: (() => void) | null = null
const stopRadioActivity = () => {
  unregisterPlayback?.()
  unregisterPlayback = null
  unregisterLists?.()
  unregisterLists = null
  deactivateRadioSession()
  cancelRadioRequests()
  cancelWeatherRequests()
  cancelLocalDiscovery()
  setDjActionHandler(null)
  setDjAutoContinueExecutor(null)
  stopDjSpeech()
}
const refreshFavorites = () => { void refreshUserProfileFavorites().catch(error => { console.warn('[radio] favorites unavailable', error) }) }
// The service stays mounted for the plugin lifetime, including its settings.
// The playback subscription follows the radio function's narrower lifetime.
watch(() => featureEnabled('dj'), enabled => {
  if (!enabled) { stopRadioActivity(); return }
  sessionId = crypto.randomUUID()
  tracker.reset()
  unregisterPlayback = registerPlaybackExtension('lx.radio', {
    ended: notifyDjSongEnded,
    observe(event) {
      if (event === 'tick') tracker.tick(getCurrentTime(), getDuration(), isPlay.value)
      else if (event === 'reset') { sessionId = crypto.randomUUID(); tracker.reset() } else tracker.interrupt()
    },
  })
  unregisterLists = registerAction(ids => { if (ids.includes(LIST_IDS.LOVE)) refreshFavorites() })
  refreshFavorites()
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(stopRadioActivity)
</script>
