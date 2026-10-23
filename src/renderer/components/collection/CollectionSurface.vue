<template>
  <div :class="$style.surface">
    <div v-if="notice" :class="$style.notice">
      <span>{{ notice }}</span>
      <button :class="$style.noticeBtn" type="button" @click="retry">{{ $t('confirm_button_text') }}</button>
    </div>
    <div :class="$style.body">
      <plugin-surface
        v-if="activeProvider && !crashed && controller?.contextId === contextId"
        :key="`${activeProvider?.qualifiedId}:${contextId}:${viewGeneration}`"
        :plugin-id="activeProvider?.pluginId || ''"
        :provider-id="activeProvider?.id"
        :surface-id="surfaceId"
        :context-id="contextId"
        :entry="activeProvider?.entry || 'index.html'"
        @error="handleViewError"
      />
      <recovery-collection v-else-if="preferences.enabled && controller?.contextId === contextId" :key="contextId" :controller="controller" />
      <slot v-else-if="!preferences.enabled" />
      <div v-else>{{ $t('list__loading') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from '@common/utils/vueTools'
import type {
  CollectionProviderInfo,
  CollectionProviderPreferences,
  CollectionSurfaceId,
} from '@common/collection/types'
import { resolveCollectionProvider } from '@common/collection/resolve'
import { PLUGIN_EVENT_NAME } from '@common/ipcNames'
import { rendererInvoke } from '@common/rendererIpc'
import { playMusicInfo } from '@renderer/store/player/state'
import { getCollectionSession } from '@renderer/core/collection/sessions'
import { CollectionController } from '@renderer/core/collection/controller'
import { createAdapter } from '@renderer/core/collection/adapters'
import { registerCollectionController } from '@renderer/core/collection/gateway'
import { loadProviderCatalog, readPreferences, subscribePreferences } from '@renderer/core/collection/providers'
import type { PluginViewEvent } from '@renderer/core/collection/gateway'
import RecoveryCollection from './RecoveryCollection.vue'
import PluginSurface from '@renderer/components/plugin/PluginSurface.vue'

const emit = defineEmits<(e: 'active-change', active: boolean) => void>()

const props = defineProps<{
  surfaceId: CollectionSurfaceId
  params: Record<string, string>
}>()

const catalog = ref<CollectionProviderInfo[]>([])
const preferences = ref<CollectionProviderPreferences>(readPreferences())
const crashed = ref(false)
const viewGeneration = ref(0)
const notice = ref('')
const controller = shallowRef<CollectionController | null>(null)
let unsubscribeController: (() => void) | null = null
let unsubscribePreferences: (() => void) | null = null
let crashTimes: number[] = []
let disposed = false
let catalogRevision = 0

const session = computed(() => getCollectionSession(JSON.stringify([props.surfaceId, Object.entries(props.params).sort(([a], [b]) => a.localeCompare(b))])))
const contextId = computed(() => `${props.surfaceId}:${session.value.id}`)

const resolution = computed(() => resolveCollectionProvider(catalog.value, preferences.value, props.surfaceId))
const activeProvider = computed(() => {
  if (!preferences.value.enabled || resolution.value.source === 'recovery') return null
  return catalog.value.find(provider => provider.qualifiedId === resolution.value.providerId) ?? null
})

watch(() => preferences.value.enabled === true && !!controller.value, active => { emit('active-change', active) }, { immediate: true })

const adapter = computed(() => createAdapter(props.surfaceId, props.params))

const teardown = () => {
  unsubscribeController?.()
  unsubscribeController = null
  controller.value = null
}

const setup = async() => {
  if (!preferences.value.enabled) { teardown(); return }
  if (controller.value?.contextId === contextId.value) {
    unsubscribeController?.()
    controller.value.attachProvider(activeProvider.value)
    unsubscribeController = activeProvider.value ? registerCollectionController(controller.value) : null
    return
  }
  teardown()
  // Old pages own their stores while the migration switch is off.
  if (!preferences.value.enabled) return
  const next = session.value.controller ?? new CollectionController({
    surfaceId: props.surfaceId,
    contextId: contextId.value,
    params: props.params,
    adapter: adapter.value,
    provider: activeProvider.value,
  })
  session.value.controller = next
  next.attachProvider(activeProvider.value)
  controller.value = next
  if (activeProvider.value) unsubscribeController = registerCollectionController(next)
  await next.refresh()
  syncPlaying()
}

const syncPlaying = () => {
  const info = playMusicInfo.musicInfo
  if (!controller.value || !info || 'progress' in info) {
    controller.value?.setPlayingKey(undefined)
    return
  }
  controller.value.setPlayingKey(controller.value.adapterInstance.keyForMusic?.(info))
}

const retry = async() => {
  if (activeProvider.value) await rendererInvoke(PLUGIN_EVENT_NAME.retry_view, { pluginId: activeProvider.value.pluginId })
  crashed.value = false
  notice.value = ''
  crashTimes = []
  await setup()
}

const handleViewError = (error: unknown) => {
  console.warn('[collection] plugin view failed', error)
  notice.value = window.i18n.t('collection_plugin_unavailable')
  crashed.value = true
}

const handleViewEvent = (event: Event) => {
  const detail = (event as CustomEvent<PluginViewEvent>).detail
  if (!detail || detail.surfaceId !== props.surfaceId) return
  if (detail.pluginId && activeProvider.value && detail.pluginId !== activeProvider.value.pluginId) return
  const now = Date.now()
  crashTimes = [...crashTimes.filter(at => now - at < 60_000), now]
  if (detail.type === 'recover' || crashTimes.length >= 2) {
    notice.value = window.i18n.t('collection_plugin_crashed_fallback')
    crashed.value = true
  } else {
    notice.value = window.i18n.t('collection_plugin_crashed_retry')
    viewGeneration.value++
  }
}

onMounted(async() => {
  await loadCatalog()
  if (disposed) return
  unsubscribePreferences = subscribePreferences(next => {
    preferences.value = next
  })
  window.addEventListener('lx:plugin-view-event', handleViewEvent)
  window.addEventListener('lx:collection-catalog-changed', loadCatalog)
  await setup()
})

onBeforeUnmount(() => {
  disposed = true
  catalogRevision++
  window.removeEventListener('lx:plugin-view-event', handleViewEvent)
  window.removeEventListener('lx:collection-catalog-changed', loadCatalog)
  unsubscribePreferences?.()
  teardown()
})

const loadCatalog = async() => {
  const request = ++catalogRevision
  const result = await loadProviderCatalog()
  if (!disposed && request === catalogRevision) catalog.value = result
}

watch(() => [preferences.value.enabled, activeProvider.value?.qualifiedId], async() => {
  crashed.value = false
  notice.value = ''
  await setup()
})

watch(() => JSON.stringify(props.params), async() => {
  await setup()
})

watch(() => playMusicInfo.musicInfo, syncPlaying, { deep: false })

defineExpose({
  controller,
  provider: activeProvider,
  resolution,
  reloadCatalog: loadCatalog,
})
</script>

<style lang="less" module>
.surface {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
.notice {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 12px;
  font-size: 0.8em;
  color: var(--lx-text-secondary, var(--color-font-label));
  background: var(--lx-surface-raised, var(--color-content-background));
  border-bottom: 1px solid var(--color-border);
}
.noticeBtn {
  flex: none;
  cursor: pointer;
  color: var(--lx-accent, var(--color-theme));
  background: transparent;
  border: 1px solid currentColor;
  border-radius: 3px;
  padding: 2px 8px;
}
.body {
  position: relative;
  flex: auto;
  min-width: 0;
  min-height: 0;
}
</style>
