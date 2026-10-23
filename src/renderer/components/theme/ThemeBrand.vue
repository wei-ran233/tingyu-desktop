<template>
  <div class="theme-brand" :class="{ 'theme-brand-compact': compact }" :data-brand="currentIdentity" role="img" :aria-label="brandName" ignore-tip>
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path v-if="customBrand" :d="customBrand.path" :fill="customBrand.filled ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" transform="scale(2)" />
      <g v-else-if="currentIdentity === 'tide'" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M7 24a17 17 0 0 1 32-8M41 24A17 17 0 0 1 9 32" /><path d="M5 28q10-22 19-5t19-3M9 35q8-11 16-4t14-5" /></g>
      <g v-else-if="currentIdentity === 'signal'" fill="currentColor"><path d="M5 5h15v38H5ZM28 5h15v38H28Z" /><path d="M20 17h8v14h-8Z" opacity=".35" /></g>
      <g v-else fill="none" stroke="currentColor" stroke-width="1.8"><path d="M24 40C3 36 5 12 24 24 16 1 44 5 34 25c18 5 4 19-10 15ZM24 24v16" /><path d="M24 24q8-4 10 1M24 27q-9-2-12-8" /></g>
    </svg>
    <span v-if="!compact"><strong>{{ brandName }}</strong><small>{{ brandCaption }}</small></span>
  </div>
</template>
<script setup lang="ts">
import { themeIdentity } from '@renderer/core/theme/identity'
import { computed } from 'vue'
import { activeThemeName, activeThemeDescription, activeThemeResources } from '@renderer/core/theme/state'
const props = withDefaults(defineProps<{ compact?: boolean, identity?: string }>(), { compact: false, identity: undefined })
const currentIdentity = computed(() => props.identity ?? themeIdentity.value ?? 'tide')
const names: Record<string, string> = { tide: '潮汐', signal: '信号', petals: '花间' }
const captions: Record<string, string> = { tide: '让声音流动', signal: '声音工作台', petals: '音乐与日常' }
const customBrand = computed(() => !props.identity || props.identity === themeIdentity.value ? activeThemeResources.value.icons.brand : undefined)
const brandName = computed(() => names[currentIdentity.value] ?? (!props.identity ? activeThemeName.value : props.identity))
const brandCaption = computed(() => captions[currentIdentity.value] ?? (!props.identity ? activeThemeDescription.value : ''))
</script>
<style lang="less">
.theme-brand { display: flex; align-items: center; gap: 10px; color: var(--lx-accent); min-width: 0; }
.theme-brand > svg { width: 38px; height: 38px; flex: none; }
.theme-brand strong { display: block; color: var(--lx-text); font-size: 20px; font-weight: 500; letter-spacing: .12em; }
.theme-brand small { display: block; color: var(--lx-text-muted); font-size: 9px; line-height: 1.8; }
.theme-brand[data-brand=petals] strong { font-family: 'Noto Serif CJK SC', 'Songti SC', serif; font-size: 23px; }
.theme-brand[data-brand=signal] > svg { width: 30px; height: 30px; }
.theme-brand-compact > svg { width: 100%; height: 100%; }
</style>
