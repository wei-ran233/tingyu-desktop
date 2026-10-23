<template>
  <div v-if="activeAppearance" class="theme-backdrop" :class="{ 'theme-is-playing': isPlay, 'theme-is-hidden': hidden }" aria-hidden="true" :style="backgroundStyle">
    <div class="theme-atmosphere"><i v-for="n in 5" :key="n" :style="{ '--i': n }" /></div>
    <svg class="theme-tide-lines" viewBox="0 0 1200 700" preserveAspectRatio="none"><path v-for="n in 9" :key="n" :d="`M-100 ${360 + n * 28} Q220 ${100 + n * 18} 580 ${360 + n * 16} T1300 ${160 + n * 22}`" fill="none" stroke="currentColor" :opacity=".06 + n * .015" /></svg>
    <div class="theme-scan" />
    <svg class="theme-botanical" viewBox="0 0 600 900"><path d="M380 900Q170 540 340 0M282 710C-170 510 80 340 282 710ZM260 510C780 230 590 70 260 510ZM290 330C-20 180 120-40 290 330ZM327 145C650 20 470-130 327 145Z" fill="currentColor" opacity=".11" /></svg>
    <div class="theme-signal"><i v-for="n in 24" :key="n" :style="{ '--i': n, '--level': 15 + (n * 19) % 75 }" /></div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { activeAppearance, activeThemeResources } from '@renderer/core/theme/state'
import { isPlay } from '@renderer/store/player/state'
const backgroundStyle = computed(() => activeThemeResources.value.background ? { backgroundImage: `url(${activeThemeResources.value.background})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined)
const hidden = ref(document.hidden)
const visibility = () => { hidden.value = document.hidden }
onMounted(() => { document.addEventListener('visibilitychange', visibility) })
onBeforeUnmount(() => { document.removeEventListener('visibilitychange', visibility) })
</script>
