<template>
  <section :data-plugin-ui="kind" :class="$style.surface">
    <label v-if="choices.length" :class="$style.choice">
      <span>{{ $t(`plugin_ui__${kind}`) }}</span>
      <select data-ui-choice :value="selected" @change="select(($event.target as HTMLSelectElement).value)">
        <option value="">{{ $t('plugin_ui__default') }}</option>
        <option v-for="choice in choices" :key="choice.id" :value="choice.id">{{ choice.title }}</option>
      </select>
    </label>
    <div v-if="document" data-ui-document :data-ui-layout="document.layout" :class="[$style.document, $style[document.layout]]">
      <p v-if="document.heading" :class="$style.heading">{{ document.heading }}</p>
      <template v-for="(item, index) in document.items" :key="index">
        <span v-if="item.command === 'text'" :class="$style.text">{{ item.label }}</span>
        <button v-else type="button" :data-ui-command="item.command" :data-ui-value="item.value" :disabled="busy || !visible" @click="invoke(item)">{{ item.label }}</button>
      </template>
    </div>
    <slot v-else />
  </section>
</template>
<script setup lang="ts">
import { ref, shallowRef, watch, onBeforeUnmount } from 'vue'
import type { PluginActionInfo } from '@common/plugin/types'
import { validatePluginUiDocument, type PluginUiDocument, type PluginUiInput, type PluginUiKind } from '@common/plugin/ui'
import { getSearchUi, renderSearchUi } from '@renderer/core/pluginExtensions'
import { createLatestLoader } from '@renderer/core/latestLoader'

const props = defineProps<{ kind: PluginUiKind, input: PluginUiInput, busy: boolean, visible: boolean }>()
const emit = defineEmits<{ (event: 'search', value: string): void, (event: 'action', value: string): void }>()
const KEY = 'lx.plugin-ui.v1'
const preferences = (): Record<string, string> => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([key, id]) => ['renderer', 'slot', 'toolbar'].includes(key) && typeof id === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}\/[a-z0-9][a-z0-9._-]{0,63}$/.test(id)))
  } catch { return {} }
}
const selected = ref(preferences()[props.kind] ?? '')
const choices = shallowRef<PluginActionInfo[]>([])
const document = shallowRef<PluginUiDocument | null>(null)
const rendering = createLatestLoader(async(job: { id: string, input: PluginUiInput }) => {
  const result = await renderSearchUi(props.kind, job.id, job.input)
  if (!validatePluginUiDocument(result, job.input)) throw new Error('Invalid UI document')
  return result
}, result => { document.value = result }, () => { document.value = null })
const render = () => {
  rendering.cancel(); document.value = null
  if (!props.visible || !selected.value || !choices.value.some(choice => choice.id === selected.value)) return
  rendering.request({ id: selected.value, input: JSON.parse(JSON.stringify(props.input)) as PluginUiInput })
}
const catalog = createLatestLoader(async() => getSearchUi(props.kind), result => { choices.value = result; render() }, () => { choices.value = []; render() })
const refresh = () => { rendering.cancel(); document.value = null; choices.value = []; catalog.request(undefined) }
const select = (value: string) => {
  selected.value = value
  const values = preferences()
  if (value) values[props.kind] = value
  else values[props.kind] = ''
  try { localStorage.setItem(KEY, JSON.stringify(values)) } catch {}
  render()
}
const invoke = (item: PluginUiDocument['items'][number]) => {
  if (!props.visible || props.busy || !document.value || !choices.value.some(choice => choice.id === selected.value)) return
  // Recheck the current model at interaction time, not only the rendered snapshot.
  if (item.command === 'search' && props.input.suggestions.includes(item.value)) emit('search', item.value)
  if (item.command === 'action' && props.input.actions.some((action: PluginUiInput['actions'][number]) => action.id === item.value)) emit('action', item.value)
}
watch(() => JSON.stringify([props.input, props.visible]), render)
window.addEventListener('lx:collection-catalog-changed', refresh)
window.addEventListener('lx:plugin-settings-changed', refresh)
onBeforeUnmount(() => {
  catalog.dispose(); rendering.dispose()
  window.removeEventListener('lx:collection-catalog-changed', refresh)
  window.removeEventListener('lx:plugin-settings-changed', refresh)
})
refresh()
</script>
<style lang="less" module>
.surface { min-width: 0; }
.choice { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 12px; color: var(--lx-text-secondary, var(--color-font-label)); select { color: var(--color-font); background: var(--color-button-background); border: 1px solid var(--lx-border); border-radius: 6px; padding: 5px 8px; max-width: 240px; } }
.document { margin: 8px 0 16px; gap: 8px; button { color: var(--color-font); background: var(--color-button-background); border: 1px solid var(--lx-border); border-radius: 8px; padding: 10px 14px; font: inherit; text-align: left; cursor: pointer; overflow-wrap: anywhere; &:focus-visible { outline: 2px solid var(--color-primary); } &:disabled { opacity: .5; cursor: default; } } }
.heading { font-size: 14px; grid-column: 1 / -1; width: 100%; margin: 0 0 4px; }
.text { color: var(--color-font-label); font-size: 13px; overflow-wrap: anywhere; }
.list { display: flex; flex-direction: column; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.row { display: flex; flex-wrap: wrap; align-items: center; }
</style>
