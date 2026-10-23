<template>
  <section class="theme-page" :data-page-theme="identity" :data-page-kind="kind">
    <header class="theme-page-intro">
      <div class="theme-page-title"><h1>{{ title }}</h1><p>{{ subtitle || descriptions[kind] || '让喜欢的声音留在身边。' }}</p></div>
      <svg v-if="identity === 'tide'" class="theme-page-art" viewBox="0 0 400 160" aria-hidden="true"><g fill="none" stroke="currentColor"><ellipse v-for="n in 9" :key="n" cx="290" cy="115" :rx="35 + n * 15" :ry="15 + n * 6" :opacity=".2 + n * .06" /><path d="M0 120q90-120 180-20t220-30" stroke-width="2" /></g></svg>
      <svg v-else-if="identity === 'signal'" class="theme-page-art" viewBox="0 0 240 80" aria-hidden="true"><path d="M0 40h24l8-22 12 44 14-54 14 64 12-43 8 11h28l10-23 12 48 15-59 12 68 13-34h48" fill="none" stroke="currentColor" stroke-width="2" /></svg>
      <svg v-else class="theme-page-art" viewBox="0 0 200 300" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1"><path d="M100 290Q50 160 110 20M89 220C-20 160 20 90 89 220ZM90 185c125-60 95-140 0 0ZM92 125C0 100 30 30 92 125ZM104 68c90-50 55-90 0 0Z" /><circle cx="80" cy="245" r="25" /></g></svg>
    </header>
    <div v-if="$slots.controls" class="theme-page-controls"><slot name="controls" /></div>
    <div class="theme-page-workspace">
      <aside v-if="$slots.navigation" class="theme-page-navigation"><slot name="navigation" /></aside>
      <main class="theme-page-content"><slot /></main>
    </div>
  </section>
</template>
<script setup lang="ts">
import type { ThemeIdentity } from '@renderer/core/theme/icons'
defineProps<{ identity: ThemeIdentity, title: string, subtitle?: string, kind: string }>()
const descriptions: Record<string, string> = { search: '从一个名字开始，遇见下一首喜欢的歌。', library: '收藏、整理，再听一次。', leaderboard: '听见此刻正在流行的声音。', songlists: '让不同的心情，找到自己的歌单。' }
</script>
