<template>
  <div style="height:100%;overflow:auto;padding:20px;box-sizing:border-box">
    <feature-management />
  </div>
</template>
<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import FeatureManagement from './FeatureManagement.vue'
import { loadSettingsPlugins } from '@renderer/core/pluginCatalog'

const reload = () => { void loadSettingsPlugins().catch(error => { console.warn('[extensions] plugin catalog unavailable', error) }) }
onMounted(() => { reload(); window.addEventListener('lx:collection-catalog-changed', reload) })
onBeforeUnmount(() => { window.removeEventListener('lx:collection-catalog-changed', reload) })
</script>
