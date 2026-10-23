<template>
  <section class="theme-playback" :data-player-theme="identity">
    <button type="button" class="theme-player-cover" :disabled="!musicInfo.id" :aria-label="$t('player__pic_tip')" @click="setShowPlayerDetail(true)"><img v-if="musicInfo.pic" :src="musicInfo.pic" alt=""><theme-brand v-else compact /></button>
    <div class="theme-player-track"><strong>{{ musicInfo.name || '选一首喜欢的歌' }}</strong><span>{{ musicInfo.singer || emptyCaption }}</span></div>
    <div class="theme-player-progress"><span>{{ nowPlayTimeStr }}</span><common-progress-bar v-if="!isShowPlayerDetail" :progress="progress" :handle-transition-end="handleTransitionEnd" :is-active-transition="isActiveTransition" /><span>{{ maxPlayTimeStr }}</span></div>
    <div class="theme-player-transports"><button type="button" :aria-label="$t('player__prev')" @click="playPrev()"><svg viewBox="0 0 24 24"><use :xlink:href="$themeIconRef('#icon-prevMusic')" /></svg></button><button type="button" class="theme-player-toggle" :aria-label="isPlay ? $t('player__pause') : $t('player__play')" @click="togglePlay()"><svg viewBox="0 0 24 24"><use :xlink:href="$themeIconRef(isPlay ? '#icon-pause' : '#icon-play')" /></svg></button><button type="button" :aria-label="$t('player__next')" @click="playNext()"><svg viewBox="0 0 24 24"><use :xlink:href="$themeIconRef('#icon-nextMusic')" /></svg></button></div>
    <control-btns class="theme-player-options" />
  </section>
</template>
<script setup lang="ts">
import { musicInfo, isPlay, isShowPlayerDetail } from '@renderer/store/player/state'
import { setShowPlayerDetail } from '@renderer/store/player/action'
import { playNext, playPrev, togglePlay } from '@renderer/core/player'
import usePlayProgress from '@renderer/utils/compositions/usePlayProgress'
import ControlBtns from '@renderer/components/layout/PlayBar/ControlBtns.vue'
import type { ThemeIdentity } from '@renderer/core/theme/icons'
import { computed } from 'vue'
const props = defineProps<{ identity: ThemeIdentity }>()
const captions: Record<string, string> = { tide: '此刻，让声音流动。', signal: '播放控制台已就绪', petals: '把音乐放进日常。' }
const emptyCaption = computed(() => captions[props.identity])
const { nowPlayTimeStr, maxPlayTimeStr, progress, handleTransitionEnd, isActiveTransition } = usePlayProgress()
</script>
