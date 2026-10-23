<template>
  <settings-workspace :groups="groups" :active-id="activeId" :title="title" breadcrumb="设置" @select="select">
    <settings-form><theme-settings v-if="activeId === 'themes'" /><plugin-settings v-else-if="activeId.startsWith('plugin:')" :plugin-id="activeId.slice(7)" /><feature-management v-else section="packages" /></settings-form>
  </settings-workspace>
</template>
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SettingsWorkspace from './SettingsWorkspace.vue'
import SettingsForm from './SettingsForm.vue'
import ThemeSettings from './ThemeSettings.vue'
import PluginSettings from './PluginSettings.vue'
import FeatureManagement from '@renderer/components/feature/FeatureManagement.vue'
import { settingsPlugins, loadSettingsPlugins } from '@renderer/core/pluginCatalog'
const route = useRoute(); const router = useRouter()
const activeId = computed(() => route.query.name === 'ThemeSettings' ? 'themes' : route.query.name === 'PluginSettings' && typeof route.query.section === 'string' ? `plugin:${route.query.section}` : 'packages')
const groups = computed(() => [
  { id: 'general', title: '常规', children: [{ id: 'themes', title: '主题与外观' }] },
  { id: 'plugins', title: '插件设置', children: [{ id: 'packages', title: '插件管理' }, ...settingsPlugins.value.map(plugin => ({ id: `plugin:${plugin.id}`, title: plugin.name }))] },
])
const title = computed(() => groups.value.flatMap(group => group.children).find(item => item.id === activeId.value)?.title ?? '插件管理')
const select = (id: string) => { void router.replace({ query: { name: id === 'themes' ? 'ThemeSettings' : id.startsWith('plugin:') ? 'PluginSettings' : 'FeatureManagement', section: id.startsWith('plugin:') ? id.slice(7) : 'packages' } }) }
const reload = () => { void loadSettingsPlugins().catch(error => { console.warn('[settings] catalog unavailable', error) }) }
onMounted(() => { reload(); window.addEventListener('lx:collection-catalog-changed', reload) })
onBeforeUnmount(() => { window.removeEventListener('lx:collection-catalog-changed', reload) })
</script>
