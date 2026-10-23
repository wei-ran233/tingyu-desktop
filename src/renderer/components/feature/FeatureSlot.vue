<template>
  <component :is="component" v-if="featureEnabled(featureId)" />
</template>
<script setup lang="ts">
import { defineAsyncComponent, computed } from 'vue'
import { featureEnabled } from '@renderer/core/features/state'
import { loadFeatureComponent } from '@renderer/core/features/component'
const props = defineProps<{ featureId: string }>()
const component = computed(() => defineAsyncComponent(async() => loadFeatureComponent(props.featureId)))
</script>
