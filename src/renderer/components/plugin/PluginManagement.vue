<template>
  <template v-if="section !== 'packages'">
  <dt id="collection">{{ $t('collection_provider_settings') }}</dt>
  <dd>
    <base-checkbox
      :model-value="preferences.enabled === true"
      :label="$t('collection_provider_experimental')"
      @update:model-value="setCollectionEnabled"
    />
    <h3>{{ $t('collection_provider_global') }}</h3>
    <div :class="$style.row">
      <base-selection
        :model-value="globalValue"
        :list="globalOptions"
        item-key="id"
        item-name="name"
        @update:model-value="handleGlobalChange"
      />
      <span v-if="state.globalInvalidPreference" :class="$style.warning">{{ $t('collection_provider_unavailable') }}: {{ state.globalInvalidPreference }}</span>
    </div>

    <h3>{{ $t('collection_provider_surface') }}</h3>
    <div v-for="surface in surfaces" :key="surface" :class="$style.row">
      <label :class="$style.label">{{ $t(surfaceLabel(surface)) }}</label>
      <base-selection
        :model-value="preferences.surfaceProviders[surface] ?? ''"
        :list="surfaceOptions(surface)"
        item-key="id"
        item-name="name"
        @update:model-value="handleSurfaceChange(surface, $event)"
      />
      <span :class="$style.resolved">
        → {{ providerLabel(state.resolved[surface]) }}
        <template v-if="state.invalidPreferences[surface] && state.invalidPreferences[surface] !== state.resolved[surface]">
          <span :class="$style.warning">({{ $t('collection_provider_unavailable') }}: {{ state.invalidPreferences[surface] }})</span>
        </template>
      </span>
    </div>

  </dd>
  </template>
  <template v-if="section !== 'collections'">
  <dt>{{ $t('collection_plugin_manage') }}</dt>
  <dd>
    <div :class="$style.row">
      <router-link to="/setting?name=ThemeSettings" :class="$style.button">主题与外观设置</router-link>
      <button type="button" :class="$style.button" data-plugin-install @click="installPlugin">{{ $t('collection_plugin_install') }}</button>
      <span :class="$style.hint">{{ plugins.length }} {{ $t('collection_plugin_manage').toLowerCase() }}</span>
    </div>
    <ul :class="$style.plugins">
      <li v-for="plugin in plugins" :key="plugin.id" :data-plugin-id="plugin.id" :class="$style.plugin">
        <div :class="$style.pluginHead">
          <strong>{{ plugin.name }}</strong>
          <span :class="$style.version">v{{ plugin.version }}</span>
          <span :class="[$style.badge, plugin.compatible ? '' : $style.badgeWarn]">{{ plugin.compatible ? plugin.source : (plugin.incompatibleReason || 'incompatible') }}</span>
        </div>
        <p :class="$style.hint">{{ plugin.description || plugin.author || plugin.id }}</p>
        <p :class="$style.hint">
          <code>{{ plugin.publicKeyFingerprint || 'development' }}</code>
        </p>
        <p :class="$style.hint">{{ plugin.permissions.join(' · ') }}</p>
        <p
          v-for="notice in optionalDependencyNotices(plugin)"
          :key="`optional-${plugin.id}-${notice.dependency.id}`"
          :class="$style.integration"
          :data-plugin-optional-status="notice.dependency.id"
        >
          可选集成 <code>{{ notice.dependency.id }}</code>
          <span :class="$style.relationRange">{{ dependencyRange(notice.dependency) }}</span>：{{ optionalDependencyStatus(notice.state) }}
        </p>
        <p
          v-for="conflict in pluginConflicts(plugin)"
          :key="`conflict-${plugin.id}-${conflict.id}`"
          :class="$style.integration"
          :data-plugin-conflict="conflict.id"
        >
          冲突声明：<code>{{ conflict.id }}</code>
          <span :class="$style.relationRange">{{ dependencyRange(conflict) }}</span>
        </p>
        <p v-if="plugin.blockedReason" :class="$style.warning">{{ plugin.blockedReason }}</p>
        <div :class="$style.row">
          <base-checkbox
            :id="`plugin-enable-${plugin.id}`"
            :model-value="plugin.enabled"
            :label="$t('enable')"
            @update:model-value="togglePlugin(plugin, $event)"
          />
          <button v-if="plugin.canRollback" type="button" :class="$style.button" @click="rollbackPlugin(plugin)">{{ $t('collection_plugin_rollback') }}</button>
          <button type="button" :class="$style.button" @click="uninstallPlugin(plugin)">{{ $t('delete') }}</button>
          <router-link :to="{ path: '/setting', query: { name: 'PluginSettings', section: plugin.id } }" :class="$style.button">插件设置</router-link>
        </div>
      </li>
    </ul>
  </dd>
  </template>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from '@common/utils/vueTools'
import { loadSettingsPlugins, settingsPlugins as plugins } from '@renderer/core/pluginCatalog'
import {
  COLLECTION_SURFACE_IDS,
  COLLECTION_SURFACE_LABELS,
  type CollectionProviderInfo,
  type CollectionProviderPreferences,
  type CollectionProviderState,
  type CollectionSurfaceId,
} from '@common/collection/types'
import { buildProviderState } from '@common/collection/resolve'
import { PLUGIN_EVENT_NAME } from '@common/ipcNames'
import { rendererInvoke } from '@common/rendererIpc'
import type { PluginDependency, PluginPublicInfo } from '@common/plugin/types'
import type { PluginInstallImpactResult } from '@common/plugin/installImpact'
import { pluginDisplayLabel } from '@common/plugin/display'
import { dialog } from '@renderer/plugins/Dialog'
import {
  loadProviderCatalog,
  readPreferences,
  setGlobalProvider,
  setCollectionEnabled,
  setSurfaceProvider,
  subscribePreferences,
} from '@renderer/core/collection/providers'
import { refreshNativeBundles } from '@renderer/core/features/state'
import { loadPluginPages } from '@renderer/core/pages'
import { removeContributedTheme, removePluginThemes } from '@renderer/core/theme'

withDefaults(defineProps<{ section?: 'all' | 'packages' | 'collections' }>(), { section: 'all' })

const providers = ref<CollectionProviderInfo[]>([])
const preferences = ref<CollectionProviderPreferences>(readPreferences())

const surfaces = COLLECTION_SURFACE_IDS

interface PluginInstallPreview {
  impact: PluginInstallImpactResult
  token: string
  id: string
  name: string
  version: string
  author?: string
  permissions: string[]
  dependencies: PluginDependency[]
  optionalDependencies: PluginDependency[]
  conflicts: PluginDependency[]
  fingerprint: string
  previousFingerprint?: string
  requiresConfirmation: boolean
}
interface OptionalDependencyNotice {
  dependency: PluginDependency
  state?: NonNullable<PluginPublicInfo['optionalDependencyStates']>[number]
}

const dependencyRange = (dependency: PluginDependency) => {
  const bounds: string[] = []
  if (dependency.minVersion) bounds.push(`>= ${dependency.minVersion}`)
  if (dependency.maxVersionExclusive) bounds.push(`< ${dependency.maxVersionExclusive}`)
  return bounds.join(', ') || '任意版本'
}
const optionalDependencyNotices = (plugin: PluginPublicInfo): OptionalDependencyNotice[] => {
  return (plugin.optionalDependencies ?? [])
    .map(dependency => ({
      dependency,
      state: plugin.optionalDependencyStates?.find(state => state.id === dependency.id),
    }))
}
const optionalDependencyStatus = (state?: OptionalDependencyNotice['state']) => {
  if (!state) return '待准备'
  const reason = state.reason?.trim() ?? ''
  return state.available ? '当前已接入' : `未接入：${reason.length ? reason : '原因未提供'}`
}
const pluginConflicts = (plugin: PluginPublicInfo) => plugin.conflicts ?? []
const formatDependency = (dependency: PluginDependency) => {
  const range = dependencyRange(dependency)
  return range === '任意版本' ? dependency.id : `${dependency.id} ${range}`
}
const formatDependencyList = (dependencies: PluginDependency[]) => {
  return dependencies.length ? dependencies.map(formatDependency).join('\n') : 'None'
}

const state = computed<CollectionProviderState>(() => buildProviderState(providers.value, preferences.value))

const globalOptions = computed(() => [
  { id: '', name: `Auto · ${officialLabel()}` },
  ...providers.value.map(provider => ({
    id: provider.qualifiedId,
    name: `${provider.displayName}${provider.available ? '' : ' (unavailable)'}`,
  })),
])

const globalValue = computed(() => preferences.value.globalProviderId ?? '')

const surfaceOptions = (surface: CollectionSurfaceId) => [
  { id: '', name: `Auto · ${providerLabel(state.value.resolved[surface])}` },
  ...providers.value
    .filter(provider => provider.surfaces.includes(surface))
    .map(provider => ({
      id: provider.qualifiedId,
      name: `${provider.displayName}${provider.available ? '' : ' (unavailable)'}`,
    })),
]

const officialLabel = () => {
  const official = providers.value.find(provider => provider.isOfficial)
  return official ? official.displayName : 'Host recovery list'
}

const providerLabel = (qualifiedId: string | null) => {
  if (!qualifiedId) return 'Host recovery list'
  return providers.value.find(provider => provider.qualifiedId === qualifiedId)?.displayName ?? qualifiedId
}

const surfaceLabel = (surface: CollectionSurfaceId) => COLLECTION_SURFACE_LABELS[surface]

const handleGlobalChange = (value: string) => {
  setGlobalProvider(value || null)
}

const handleSurfaceChange = (surface: CollectionSurfaceId, value: string) => {
  setSurfaceProvider(surface, value || null)
}

const refresh = async() => {
  providers.value = await loadProviderCatalog()
  await loadSettingsPlugins()
  preferences.value = readPreferences()
  await Promise.all([loadPluginPages(), refreshNativeBundles()])
  window.dispatchEvent(new Event('lx:collection-catalog-changed'))
}

const installImpactMessage = (impact: PluginInstallImpactResult): string => {
  const list = (values: string[]) => values.join(', ') || '无'
  const state = (value: boolean | null) => value == null ? '未声明 / 未安装' : value ? '声明可用' : '声明不可用'
  const changes = (value: { added: string[], removed: string[], changed?: string[] }) =>
    `新增 ${list(value.added)}；移除 ${list(value.removed)}${value.changed ? `；修改 ${list(value.changed)}` : ''}`
  return [
    '安装影响预览（按声明预估）',
    '不会执行候选插件；实际启动、外部服务与设置迁移成功尚未验证。',
    `操作：${impact.operation === 'install' ? '安装' : '升级'}；安装后${impact.plugin.enabledAfter ? '启用' : '保持停用'}`,
    `新增权限：${list(impact.plugin.permissions.added)}`,
    `移除权限：${list(impact.plugin.permissions.removed)}`,
    `设置版本：${impact.plugin.settings.beforeVersion ?? '新安装'} → ${impact.plugin.settings.afterVersion}${impact.plugin.settings.migrationRequired ? '（安装时需要迁移，可能失败）' : ''}`,
    `凭据键声明：${changes(impact.plugin.credentials)}`,
    `扩展点：${changes(impact.plugin.extensionPoints)}`,
    `扩展：${changes(impact.plugin.extensions)}`,
    '',
    `声明可用性变化：${impact.availabilityChanges.length ? '' : '无'}`,
    ...impact.availabilityChanges.map(change => `${change.pluginId}：${state(change.before)} → ${state(change.after)}${change.afterReason ? `（${change.afterReason}）` : ''}`),
    `可选集成变化：${impact.optionalDependencyChanges.length ? '' : '无'}`,
    ...impact.optionalDependencyChanges.map(change => `${change.pluginId} → ${change.dependencyId}：${state(change.before)} → ${state(change.after)}${change.afterReason ? `（${change.afterReason}）` : ''}`),
    `预计重建的插件：${list(impact.estimatedRestartPluginIds)}`,
    '确认前插件配置或安装包变化时，必须重新预览。',
  ].join('\n')
}

const installPlugin = async() => {
  try {
    const preview = await rendererInvoke<PluginInstallPreview | null>(PLUGIN_EVENT_NAME.install)
    if (!preview) return
    const confirmed = await dialog.confirm({
      message: [
        `名称：${pluginDisplayLabel(preview.name)} v${preview.version}`,
        `作者：${preview.author ? pluginDisplayLabel(preview.author) : '未声明'}`,
        '',
        `Ed25519 fingerprint:\n${preview.fingerprint}`,
        '',
        `Permissions:\n${preview.permissions.join(', ') || 'None'}`,
        '',
        `Required dependencies:\n${formatDependencyList(preview.dependencies)}`,
        '',
        `Optional dependencies:\n${formatDependencyList(preview.optionalDependencies)}`,
        '',
        `Conflicts:\n${formatDependencyList(preview.conflicts)}`,
        '',
        installImpactMessage(preview.impact),
        '',
        '确认安装此插件？',
      ].join('\n'),
      confirmButtonText: '安装',
      cancelButtonText: '取消',
    })
    if (!confirmed) {
      await rendererInvoke(PLUGIN_EVENT_NAME.cancel_install, { token: preview.token })
      return
    }
    await rendererInvoke(PLUGIN_EVENT_NAME.confirm_install, { token: preview.token })
    await refresh()
  } catch (error: any) {
    await dialog({ message: String(error?.message ?? error), confirmButtonText: 'OK' })
  }
}

const togglePlugin = async(plugin: PluginPublicInfo, enabled: boolean) => {
  try {
    await rendererInvoke(PLUGIN_EVENT_NAME.set_enabled, { pluginId: plugin.id, enabled })
    if (!enabled) removePluginThemes(plugin.id)
    await refresh()
  } catch (error: any) {
    await dialog({ message: String(error?.message ?? error), confirmButtonText: 'OK' })
  }
}

const rollbackPlugin = async(plugin: PluginPublicInfo) => {
  await rendererInvoke(PLUGIN_EVENT_NAME.rollback, { pluginId: plugin.id })
  await refresh()
}

const uninstallPlugin = async(plugin: PluginPublicInfo) => {
  const confirmed = await dialog.confirm({ message: `Uninstall ${plugin.name}?` })
  if (!confirmed) return
  await rendererInvoke(PLUGIN_EVENT_NAME.uninstall, { pluginId: plugin.id })
  removePluginThemes(plugin.id)
  await refresh()
}

let unsubscribePreferences: (() => void) | undefined
onBeforeUnmount(() => { unsubscribePreferences?.() })

onMounted(() => {
  void refresh()
  unsubscribePreferences = subscribePreferences(next => {
    preferences.value = next
  })
})

defineExpose({ removeContributedTheme })
</script>

<style lang="less" module>
.row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 6px 0;
}
.label {
  min-width: 120px;
}
.resolved {
  color: var(--lx-text-muted, var(--color-font-label));
  font-size: 12px;
}
.warning {
  color: var(--lx-danger, #d9534f);
  font-size: 12px;
}
.hint {
  color: var(--lx-text-muted, var(--color-font-label));
  font-size: 12px;
  margin: 2px 0;
}
.integration {
  color: var(--lx-text-muted, var(--color-font-label));
  font-size: 12px;
  margin: 3px 0;
}
.relationRange {
  margin-left: 4px;
  color: var(--color-font-label);
}
.button {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background: var(--color-button-background);
  color: var(--color-font);
  cursor: pointer;
}
.plugins {
  list-style: none;
  padding: 0;
  margin: 8px 0;
}
.plugin {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 8px;
}
.pluginHead {
  display: flex;
  align-items: center;
  gap: 8px;
}
.version {
  color: var(--lx-text-muted, var(--color-font-label));
  font-size: 12px;
}
.badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--color-primary-light-300-alpha-700);
}
.badgeWarn {
  color: var(--lx-danger, #d9534f);
}
</style>
