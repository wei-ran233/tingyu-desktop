<template>
  <component :is="service.component" v-for="service in activeServices" :key="service.id" />
</template>
<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { getServices } from '@renderer/core/features/services'
import { nativeBundleEnabled, featureEnabled } from '@renderer/core/features/state'
const services = getServices().map(service => ({ ...service, component: defineAsyncComponent(service.load) }))
const activeServices = computed(() => services.filter(service => nativeBundleEnabled(service.pluginId) && (!service.featureId || featureEnabled(service.featureId))))
</script>
