<template>
  <section class="feature-management">
    <template v-if="section === 'all' || section === 'functions'">
    <h2 v-if="section === 'all'">功能与渲染</h2>
    <p>官方整合包提供默认功能。功能开关与渲染方式分别保存；切换渲染方式不改变功能配置。</p>
    <button v-for="bundle in missingBundles" :key="bundle.id" type="button" @click="restoreBundle(bundle.id)">恢复{{ bundle.name }}</button>
    <button type="button" @click="restoreDefaultLayout">恢复默认功能和原版布局</button>
    <p v-if="!bundleAvailable">官方整合包不可用。请在下方插件管理中启用或重新安装。</p>
    <div v-for="feature in features" :key="feature.id" :data-feature-id="feature.id" class="feature-row">
      <label><input type="checkbox" :checked="featureEnabled(feature.id)" :disabled="!nativeBundleEnabled(feature.pluginId)" @change="toggle(feature.id, $event)"> {{ title(feature.displayName) }}</label>
      <span class="feature-owner">{{ bundleTitle(feature.pluginId) }}</span>
      <span v-if="themeViewOverrides[feature.id]" class="feature-theme-view">由主题控制</span>
      <select :value="themeViewOverrides[feature.id] || featurePreferences.views[feature.id] || feature.defaultView" :disabled="!nativeBundleEnabled(feature.pluginId) || !!themeViewOverrides[feature.id]" :aria-label="`${title(feature.displayName)}渲染方式`" :title="themeViewOverrides[feature.id] ? '在设置的主题与外观中恢复默认后可修改' : undefined" @change="changeView(feature.id, $event)">
        <option v-for="view in getFeatureViews(feature.id).filter(view => !view.themeIdentity || view.themeIdentity === $themeIdentity)" :key="view.id" :value="view.id">{{ view.displayName }}</option>
      </select>
    </div>
    </template>
    <dl v-if="section !== 'functions'"><setting-collection :key="bundleAvailable ? 'available' : 'unavailable'" :section="section === 'all' ? 'all' : section" /></dl>
  </section>
</template>
<script setup lang="ts">
import { getFeatures, getFeatureViews } from '@renderer/core/features/registry'
import { bundleAvailable, availableBundles, nativeBundleEnabled, featurePreferences, featureEnabled, setFeatureEnabled, setFeatureView, restoreFeatureDefaults, refreshNativeBundles } from '@renderer/core/features/state'
import { setCollectionEnabled } from '@renderer/core/collection/providers'
import { rendererInvoke } from '@common/rendererIpc'
import { PLUGIN_EVENT_NAME } from '@common/ipcNames'
import { NATIVE_BUNDLES } from '@common/bundles'
import SettingCollection from '@renderer/components/plugin/PluginManagement.vue'
import { computed } from 'vue'
import { resetPluginTheme } from '@renderer/core/theme'
import { themeViewOverrides } from '@renderer/core/theme/state'
defineExpose({ setFeatureView, setFeatureEnabled, restoreFeatureDefaults })
withDefaults(defineProps<{ section?: 'all' | 'functions' | 'packages' | 'collections' }>(), { section: 'all' })
const bundleTitle = (id: string) => NATIVE_BUNDLES.find(bundle => bundle.id === id)?.name ?? id
const restoreDefaultLayout = () => { resetPluginTheme(); restoreFeatureDefaults(); setCollectionEnabled(false) }
const features = computed(getFeatures)
const missingBundles = computed(() => NATIVE_BUNDLES.filter(bundle => !availableBundles.value.includes(bundle.id)))
const restoreBundle = async(id: string) => {
  await rendererInvoke(PLUGIN_EVENT_NAME.restore_bundled, id)
  await refreshNativeBundles()
  window.dispatchEvent(new Event('lx:collection-catalog-changed'))
}
const title = (key: string) => window.i18n.t(key as any)
const toggle = (id: string, event: Event) => { setFeatureEnabled(id, (event.target as HTMLInputElement).checked) }
const changeView = (id: string, event: Event) => { setFeatureView(id, (event.target as HTMLSelectElement).value) }
</script>
<style>
.feature-management { padding: 0; box-sizing: border-box; color: var(--color-font); }
.feature-management p { line-height: 1.7; }
.feature-row { display: flex; align-items: center; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--lx-border); }
.feature-row label { flex: 1; }
.feature-owner { flex: 0 1 160px; color: var(--color-font-label); font-size: 12px; }
.feature-theme-view { color: var(--color-primary); font-size: 11px; }
.feature-row select { width: 140px; }
@media (max-width: 800px) { .feature-owner { display: none; } .feature-row { gap: 8px; } }
.feature-row select, .feature-management button { color: inherit; background: var(--lx-surface); border: 1px solid var(--lx-border); border-radius: 4px; padding: 5px 10px; }
</style>
