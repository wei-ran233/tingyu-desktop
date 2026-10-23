<template>
  <section v-if="supported" class="plugin-credentials" data-plugin-credentials aria-label="插件凭据">
    <h4>插件凭据</h4>
    <p>单独加密保存，不进入参数备份。保存后插件将重新初始化；请仅向可信插件提供凭据。</p>
    <p v-if="status && !status.available" role="status" data-credential-unavailable>系统加密存储不可用，请解锁系统密钥环后重试。</p>
    <div v-for="field in fields" :key="field.key" class="plugin-credential-field" :data-credential-field="field.key">
      <label :for="`credential-${plugin.id}-${field.key}`">{{ field.title }}</label>
      <div>
        <input
          :id="`credential-${plugin.id}-${field.key}`"
          v-model="drafts[field.key]"
          :data-credential-key="field.key"
          type="password"
          autocomplete="new-password"
          :maxlength="field.maxLength ?? 4096"
          :disabled="busy || !status?.available"
          placeholder="输入新凭据"
        >
        <small v-if="field.description">{{ field.description }}</small>
        <div class="plugin-credential-actions">
          <span :data-credential-configured="field.key">{{ status ? (status.configured[field.key] ? '已配置' : '未配置') : '状态未知' }}</span>
          <button type="button" :data-credential-save="field.key" :disabled="busy || !status?.available || !drafts[field.key]" @click="save(field.key)">保存凭据</button>
          <button type="button" :data-credential-remove="field.key" :disabled="busy || !status?.configured[field.key]" @click="remove(field.key)">删除凭据</button>
        </div>
      </div>
    </div>
    <button type="button" data-credential-refresh :disabled="busy" @click="refresh">刷新存储状态</button>
    <button type="button" data-credential-clear :disabled="busy" @click="clearAll">删除全部凭据</button>
    <p v-if="message" role="status" data-credential-status>{{ message }}</p>
    <p v-if="error" role="alert" data-credential-error>{{ error }}</p>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { PluginCredentialStatus, PluginPublicInfo } from '@common/plugin/types'
import { PLUGIN_EVENT_NAME } from '@common/ipcNames'
import { rendererInvoke } from '@common/rendererIpc'
import { loadSettingsPlugins } from '@renderer/core/pluginCatalog'

const props = defineProps<{ plugin: PluginPublicInfo }>()
const supported = computed(() => props.plugin.source !== 'development' && props.plugin.permissions.includes('credentials.scoped'))
const fields = computed(() => props.plugin.source === 'development' ? [] : props.plugin.credentials ?? [])
const drafts = ref<Record<string, string>>({})
const status = ref<PluginCredentialStatus>()
const busy = ref(false)
const error = ref('')
const message = ref('')
let revision = 0
const refresh = async() => {
  const current = ++revision
  const id = props.plugin.id
  busy.value = true; error.value = ''
  try {
    const result = await rendererInvoke<{ pluginId: string }, PluginCredentialStatus>(PLUGIN_EVENT_NAME.credential_status, { pluginId: id })
    if (current === revision) status.value = result
  } catch {
    if (current === revision) error.value = '无法读取凭据存储状态。可重试，或确认删除全部凭据后重新填写。'
  } finally { if (current === revision) busy.value = false }
}
watch(() => JSON.stringify([props.plugin.id, props.plugin.publicKeyFingerprint, props.plugin.version, props.plugin.credentials]), () => {
  drafts.value = {}; status.value = undefined; message.value = ''; error.value = ''; revision++
  if (supported.value) void refresh()
}, { immediate: true })
onBeforeUnmount(() => { revision++; drafts.value = {} })
const mutate = async(key: string, remove: boolean) => {
  const current = revision
  const pluginId = props.plugin.id
  const signerFingerprint = props.plugin.publicKeyFingerprint
  const value = drafts.value[key]
  drafts.value[key] = ''
  busy.value = true; error.value = ''; message.value = ''
  try {
    const result = await rendererInvoke<{ pluginId: string, key: string, signerFingerprint: string, value?: string }, PluginCredentialStatus>(
      remove ? PLUGIN_EVENT_NAME.remove_credential : PLUGIN_EVENT_NAME.set_credential,
      remove ? { pluginId, key, signerFingerprint } : { pluginId, key, value, signerFingerprint },
    )
    if (current === revision) {
      status.value = result
      message.value = remove ? '凭据已删除。' : '凭据已保存。'
    }
    await loadSettingsPlugins()
  } catch {
    if (current === revision) error.value = '凭据操作失败，请检查系统加密存储并重试。'
  } finally { if (current === revision) busy.value = false }
}
const save = async(key: string) => mutate(key, false)
const remove = async(key: string) => mutate(key, true)
const clearAll = async() => {
  const current = revision
  const pluginId = props.plugin.id
  const signerFingerprint = props.plugin.publicKeyFingerprint
  drafts.value = {}; busy.value = true; message.value = ''; error.value = ''
  try {
    const result = await rendererInvoke<{ pluginId: string, signerFingerprint: string }, { cancelled: boolean, status?: PluginCredentialStatus }>(PLUGIN_EVENT_NAME.clear_credentials, { pluginId, signerFingerprint })
    if (current === revision && !result.cancelled) {
      status.value = result.status
      message.value = '全部凭据已删除。'
    }
    await loadSettingsPlugins()
  } catch {
    if (current === revision) error.value = '无法删除凭据，请重试。'
  } finally { if (current === revision) busy.value = false }
}
</script>
<style lang="less">
.plugin-credentials { margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--lx-border); h4 { margin: 0 0 10px; } p, small { color: var(--color-font-label); } button { min-height: 32px; padding: 6px 14px; border: 1px solid var(--lx-border); border-radius: 6px; background: var(--color-content-background); color: var(--color-font); cursor: pointer; &:disabled { opacity: .55; cursor: default; } &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; } } }
.plugin-credential-field { display: grid; grid-template-columns: minmax(100px, 1fr) minmax(80px, 2fr); gap: 8px 20px; margin: 18px 0; input { width: 100%; box-sizing: border-box; } small { display: block; margin-top: 6px; } }
.plugin-credential-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; span { margin-right: auto; color: var(--color-font-label); } }
</style>
