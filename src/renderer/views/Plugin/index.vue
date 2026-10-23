<template>
  <div :class="$style.container">
    <plugin-surface
      v-if="page"
      :key="`${pluginId}/${pageId}`"
      :plugin-id="pluginId"
      :page-id="pageId"
      :context-id="`page:${pluginId}:${pageId}`"
      surface-id=""
      :entry="page?.entry || 'index.html'"
      @error="handleError"
    />
    <div v-else :class="$style.empty">{{ $t('collection_plugin_page_missing') }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from '@common/utils/vueTools'
import { useRoute } from '@common/utils/vueRouter'
import { findPluginPage, loadPluginPages } from '@renderer/core/pages'
import PluginSurface from '@renderer/components/plugin/PluginSurface.vue'

const route = useRoute()
const pluginId = computed(() => String(route.params.pluginId ?? ''))
const pageId = computed(() => String(route.params.pageId ?? ''))
const page = computed(() => findPluginPage(pluginId.value, pageId.value))

const handleError = (error: unknown) => {
  console.warn('[plugin page] failed to open', error)
}

onMounted(() => {
  void loadPluginPages()
})
</script>

<style lang="less" module>
.container {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--lx-text-secondary, var(--color-font-label));
}
</style>
