<template>
  <div v-if="plugin" class="plugin-settings" :data-plugin-settings="plugin.id">
    <h3>{{ plugin.name }}</h3>
    <p>{{ plugin.description || '此插件没有额外说明。' }}</p>
    <label class="plugin-settings-switch"><input type="checkbox" :checked="plugin.enabled" :disabled="busy" @change="toggle(($event.target as HTMLInputElement).checked)"> 启用插件</label>
    <p v-if="plugin.available === false" role="status">{{ plugin.blockedReason || plugin.incompatibleReason || '当前不可用' }}</p>
    <p v-if="plugin.lifecycleState">运行状态：{{ lifecycleLabels[plugin.lifecycleState] }}</p>
    <button v-if="plugin.enabled && plugin.lifecycleState === 'failed'" type="button" :disabled="busy" data-plugin-retry @click="toggle(true)">重新初始化插件</button>
    <dl class="plugin-settings-info">
      <dt>版本</dt>
      <dd>{{ plugin.version }}</dd>
      <dt>权限</dt>
      <dd>{{ plugin.permissions.join('、') || '无额外权限' }}</dd>
      <dt>必需依赖</dt>
      <dd data-plugin-required-dependencies>
        <template v-if="plugin.dependencies?.length">
          <p v-for="dependency in plugin.dependencies" :key="dependency.id" :data-plugin-required-dependency="dependency.id">
            <code>{{ dependency.id }}</code>
            <span class="plugin-settings-dependency-range">{{ dependencyRange(dependency) }}</span>
          </p>
        </template>
        <span v-else>无必需依赖</span>
      </dd>
      <dt>可选依赖</dt>
      <dd data-plugin-optional-dependencies>
        <template v-if="optionalDependencies.length">
          <p v-for="dependency in optionalDependencies" :key="dependency.id" :data-plugin-optional-dependency="dependency.id">
            <code>{{ dependency.id }}</code>
            <span class="plugin-settings-dependency-range">{{ dependencyRange(dependency) }}</span>
            <span :class="['plugin-settings-integration', optionalDependencyStateClass(dependency.id)]" data-plugin-optional-dependency-state>
              {{ optionalDependencyStateLabel(dependency.id) }}
            </span>
          </p>
        </template>
        <span v-else>无可选依赖</span>
      </dd>
      <dt>冲突</dt>
      <dd data-plugin-conflicts>
        <template v-if="conflicts.length">
          <p v-for="conflict in conflicts" :key="conflict.id" :data-plugin-conflict="conflict.id">
            <code>{{ conflict.id }}</code>
            <span class="plugin-settings-dependency-range">{{ dependencyRange(conflict) }}</span>
          </p>
        </template>
        <span v-else>无冲突声明</span>
      </dd>
    </dl>
    <p v-if="plugin.themes.length"><router-link to="/setting?name=ThemeSettings">设置此插件的主题与动态效果</router-link></p>
    <p v-for="section in nativeSettings" :key="section.id"><router-link :to="{ path: '/setting', query: { name: section.id } }">{{ $t(section.titleKey) }}</router-link></p>
    <div v-if="fields.length" class="plugin-settings-fields">
      <label v-for="field in fields" :key="field.key" class="plugin-setting-field">
        <span>{{ field.title }}</span>
        <input v-if="field.type === 'boolean'" type="checkbox" :data-setting-key="field.key" :checked="values[field.key] === true" :disabled="busy || !configurable" @change="save(field.key, ($event.target as HTMLInputElement).checked)">
        <select v-else-if="field.type === 'select'" :data-setting-key="field.key" :value="values[field.key]" :disabled="busy || !configurable" @change="save(field.key, ($event.target as HTMLSelectElement).value)"><option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option></select>
        <input v-else :data-setting-key="field.key" :type="field.type === 'number' ? 'number' : 'text'" :value="values[field.key]" :min="field.min" :max="field.max" :maxlength="field.maxLength || 500" :disabled="busy || !configurable" @change="save(field.key, field.type === 'number' ? ($event.target as HTMLInputElement).valueAsNumber : ($event.target as HTMLInputElement).value)">
        <small v-if="field.description">{{ field.description }}</small>
      </label>
      <div v-if="hasExportableFields" class="plugin-settings-transfer">
        <p>仅备份插件明确允许导出的参数，其他本机参数保持不变。</p>
        <div class="plugin-settings-transfer-actions">
          <button type="button" class="plugin-settings-transfer-button" :disabled="busy || !configurable" data-plugin-settings-export @click="exportSettings">导出参数</button>
          <button type="button" class="plugin-settings-transfer-button" :disabled="busy || !configurable" data-plugin-settings-import @click="importSettings">导入参数</button>
        </div>
      </div>
      <div class="plugin-settings-reset-row"><button type="button" class="plugin-settings-reset" :disabled="busy || !configurable" data-plugin-settings-reset @click="resetSettings">恢复默认参数</button></div>
    </div>
    <p v-else-if="!plugin.themes.length && !nativeSettings.length && !plugin.credentials?.length" class="plugin-settings-empty">此插件没有额外参数，使用默认行为。</p>
    <PluginCredentials :plugin="plugin" />
    <p v-if="statusMessage" role="status" data-plugin-settings-transfer-status>{{ statusMessage }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
  <p v-else>请选择一个已安装的插件。</p>
</template>
<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { settingsPlugins, loadSettingsPlugins } from '@renderer/core/pluginCatalog'
import { rendererInvoke } from '@common/rendererIpc'
import { PLUGIN_EVENT_NAME } from '@common/ipcNames'
import { loadPluginPages } from '@renderer/core/pages'
import { refreshNativeBundles } from '@renderer/core/features/state'
import { loadPluginThemes } from '@renderer/core/theme'
import { loadProviderCatalog } from '@renderer/core/collection/providers'
import type { PluginDependency, PluginPublicInfo, PluginSettingsChange } from '@common/plugin/types'
import { NATIVE_SETTINGS } from '@common/bundles'
import PluginCredentials from '@renderer/components/plugin/PluginCredentials.vue'
const props = defineProps<{ pluginId: string }>()
const lifecycleLabels: Record<string, string> = { installed: '已安装', disabled: '已停用', blocked: '依赖或扩展点不可用', resolving: '检查依赖', activating: '正在初始化', active: '运行中', stopping: '正在停止', failed: '初始化或执行失败' }
const plugin = computed<PluginPublicInfo | undefined>(() => settingsPlugins.value.find(plugin => plugin.id === props.pluginId))
const optionalDependencies = computed(() => plugin.value?.optionalDependencies ?? [])
const conflicts = computed(() => plugin.value?.conflicts ?? [])
const nativeSettings = computed(() => plugin.value?.available === false ? [] : NATIVE_SETTINGS.filter(section => section.pluginId === props.pluginId))
const configurable = computed(() => plugin.value?.available === true)
const fields = computed(() => (plugin.value?.settings ?? []).map(field => ({ ...field, options: field.options ?? [] })))
const hasExportableFields = computed(() => plugin.value?.source !== 'development' && fields.value.some(field => field.exportable === true))
const dependencyRange = (dependency: PluginDependency) => {
  const bounds: string[] = []
  if (dependency.minVersion) bounds.push(`>= ${dependency.minVersion}`)
  if (dependency.maxVersionExclusive) bounds.push(`< ${dependency.maxVersionExclusive}`)
  return bounds.join(', ') || '任意版本'
}
const optionalDependencyState = (id: string) => plugin.value?.optionalDependencyStates?.find(state => state.id === id)
const optionalDependencyStateLabel = (id: string) => {
  const state = optionalDependencyState(id)
  if (!state) return '待准备'
  const reason = state.reason?.trim() ?? ''
  return state.available ? '当前已接入' : `未接入：${reason.length ? reason : '原因未提供'}`
}
const optionalDependencyStateClass = (id: string) => {
  const state = optionalDependencyState(id)
  if (!state) return 'is-pending'
  return state.available ? 'is-ready' : 'is-unavailable'
}
const values = ref<Record<string, unknown>>({})
const busy = ref(false)
const error = ref('')
const statusMessage = ref('')
let request = 0
let settingsRevision = 0
const settingsChanged = (event: Event) => {
  const change = (event as CustomEvent<PluginSettingsChange>).detail
  if (change.pluginId !== props.pluginId) return
  settingsRevision++
  values.value = change.settings
}
window.addEventListener('lx:plugin-settings-changed', settingsChanged)
onBeforeUnmount(() => { request++; window.removeEventListener('lx:plugin-settings-changed', settingsChanged) })
watch(() => props.pluginId, async id => {
  const current = ++request
  const revision = settingsRevision
  values.value = {}; error.value = ''; statusMessage.value = ''; busy.value = true
  try { const result = await rendererInvoke<{ pluginId: string }, Record<string, unknown>>(PLUGIN_EVENT_NAME.get_settings, { pluginId: id }); if (request === current && settingsRevision === revision) values.value = result } catch (reason: any) { if (request === current) error.value = String(reason.message) } finally { if (request === current) busy.value = false }
}, { immediate: true })
const save = async(key: string, value: unknown) => {
  const current = request
  const revision = settingsRevision
  busy.value = true; error.value = ''; statusMessage.value = ''
  try { const result = await rendererInvoke<{ pluginId: string, key: string, value: unknown }, Record<string, unknown>>(PLUGIN_EVENT_NAME.set_setting, { pluginId: props.pluginId, key, value }); if (current === request && settingsRevision === revision) values.value = result } catch (reason: any) { if (current === request) error.value = String(reason.message) } finally { if (current === request) busy.value = false }
}
const resetSettings = async() => {
  const current = request
  const revision = settingsRevision
  busy.value = true; error.value = ''; statusMessage.value = ''
  try { const result = await rendererInvoke<{ pluginId: string }, Record<string, unknown>>(PLUGIN_EVENT_NAME.reset_settings, { pluginId: props.pluginId }); if (current === request && settingsRevision === revision) values.value = result } catch (reason: any) { if (current === request) error.value = String(reason.message) } finally { if (current === request) busy.value = false }
}
const exportSettings = async() => {
  const current = request
  const id = props.pluginId
  busy.value = true; error.value = ''; statusMessage.value = ''
  try {
    const result = await rendererInvoke<{ pluginId: string }, { cancelled: boolean, settings?: Record<string, string | number | boolean>, count?: number }>(PLUGIN_EVENT_NAME.export_settings, { pluginId: id })
    if (current !== request || props.pluginId !== id) return
    if (!result.cancelled) statusMessage.value = `已导出 ${result.count ?? 0} 项参数`
  } catch (reason: any) {
    if (current === request && props.pluginId === id) error.value = String(reason.message)
  } finally {
    if (current === request && props.pluginId === id) busy.value = false
  }
}
const importSettings = async() => {
  const current = request
  const id = props.pluginId
  const revision = settingsRevision
  busy.value = true; error.value = ''; statusMessage.value = ''
  try {
    const result = await rendererInvoke<{ pluginId: string }, { cancelled: boolean, settings?: Record<string, string | number | boolean>, count?: number }>(PLUGIN_EVENT_NAME.import_settings, { pluginId: id })
    if (current !== request || props.pluginId !== id) return
    if (!result.cancelled) {
      statusMessage.value = `已导入 ${result.count ?? 0} 项参数`
      if (result.settings && settingsRevision === revision) values.value = result.settings
    }
  } catch (reason: any) {
    if (current === request && props.pluginId === id) error.value = String(reason.message)
  } finally {
    if (current === request && props.pluginId === id) busy.value = false
  }
}
const toggle = async(enabled: boolean) => {
  const current = request
  busy.value = true; error.value = ''; statusMessage.value = ''
  try {
    await rendererInvoke(PLUGIN_EVENT_NAME.set_enabled, { pluginId: props.pluginId, enabled })
    await Promise.all([loadSettingsPlugins(), loadPluginPages(), refreshNativeBundles(), loadPluginThemes(), loadProviderCatalog()])
    window.dispatchEvent(new Event('lx:collection-catalog-changed'))
  } catch (reason: any) { if (current === request) error.value = String(reason.message) } finally { if (current === request) busy.value = false }
}
</script>
<style lang="less">
.plugin-settings { font-size: 13px; line-height: 1.7; p { margin: 0 0 14px; } a { color: var(--color-primary); text-decoration: underline; text-underline-offset: 3px; } }
.plugin-settings-switch { display: flex; align-items: center; gap: 8px; margin: 18px 0; }
.plugin-settings-info { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 10px 20px; margin: 20px 0; dt, dd { padding: 0; margin: 0; border: 0; font-size: 12px; } dt { color: var(--color-font-label); } dd { overflow-wrap: anywhere; } dd p { margin: 0; } code { font-family: monospace; font-size: 12px; } }
.plugin-settings-dependency-range { margin-left: 8px; color: var(--color-font-label); }
.plugin-settings-integration { display: inline-block; margin-left: 8px; padding: 0 6px; border: 1px solid var(--lx-border); border-radius: 4px; color: var(--color-font-label); font-size: 11px; line-height: 1.6; }
.plugin-settings-integration.is-ready { color: var(--color-primary); }
.plugin-settings-integration.is-unavailable { color: var(--lx-warning, #9a6700); }
.plugin-setting-field { display: grid; grid-template-columns: minmax(100px, 1fr) minmax(80px, 2fr); gap: 8px 20px; align-items: center; padding: 16px 0; border-top: 1px solid var(--lx-border); small { grid-column: 2; color: var(--color-font-label); } input[type=checkbox] { justify-self: start; } }
.plugin-settings-transfer { padding: 16px 0 0; }
.plugin-settings-transfer p { margin-bottom: 10px; color: var(--color-font-label); }
.plugin-settings-transfer-actions, .plugin-settings-reset-row { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.plugin-settings-reset-row { padding: 16px 0 0; }
.plugin-settings-reset, .plugin-settings-transfer-button { min-height: 32px; padding: 6px 14px; border: 1px solid var(--lx-border); border-radius: 6px; color: var(--color-font); background: var(--color-content-background); cursor: pointer; &:disabled { cursor: default; opacity: .55; } &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; } }
.plugin-settings-empty { color: var(--color-font-label); }
</style>
