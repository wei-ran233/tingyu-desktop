<template>
  <svg v-if="definitions.length" width="0" height="0" class="theme-icon-definitions" aria-hidden="true">
    <defs><symbol v-for="definition in definitions" :id="definition.id" :key="definition.id" viewBox="0 0 24 24"><path :d="definition.glyph.path" :fill="definition.glyph.filled ? 'currentColor' : 'none'" stroke="currentColor" :stroke-width="themeIdentity === 'signal' ? 1.8 : 1.45" :stroke-linecap="themeIdentity === 'signal' ? 'square' : 'round'" :stroke-linejoin="themeIdentity === 'signal' ? 'miter' : 'round'" /></symbol></defs>
  </svg>
</template>
<script setup lang="ts">
import { themeIdentity, activeThemeGlyphs } from '@renderer/core/theme/identity'
import { computed } from 'vue'
const definitions = computed(() => {
  const identity = themeIdentity.value
  return identity ? Object.entries(activeThemeGlyphs.value).map(([name, glyph]) => ({ id: `lx-icon-${identity}-${name}`, glyph })) : []
})
</script>
<style>.theme-icon-definitions { position: absolute; overflow: hidden; pointer-events: none; }</style>
