<template>
  <div ref="host" :class="$style.host" :style="{ visibility: hidden ? 'hidden' : 'visible' }">
    <div v-if="!ready" :class="$style.loading">{{ $t('list__loading') }}</div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from '@common/utils/vueTools'
import { PLUGIN_EVENT_NAME } from '@common/ipcNames'
import { rendererInvoke } from '@common/rendererIpc'
import { isShowPlayerDetail } from '@renderer/store/player/state'
import { useRoute } from '@common/utils/vueRouter'

const props = defineProps<{
  pluginId: string
  providerId?: string
  surfaceId: string
  contextId: string
  pageId?: string
  entry: string
}>()

const emit = defineEmits<(e: 'error', error: unknown) => void>()

const host = ref<HTMLElement>()
const ready = ref(false)
const hidden = ref(false)
let observer: ResizeObserver | null = null
let mutationObserver: MutationObserver | null = null
let raf = 0
const ownerId = globalThis.crypto.randomUUID()
let shown = false
let showing = false
let destroyed = false
const route = useRoute()

const bounds = () => {
  const el = host.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.max(0, Math.round(rect.width)),
    height: Math.max(0, Math.round(rect.height)),
  }
}

const isOverlayOpen = () => {
  return !!document.querySelector('#root.show-modal, #view.show-modal, .show-modal') ||
    isShowPlayerDetail.value
}

const syncBounds = () => {
  if (!shown) return
  const next = bounds()
  if (!next || next.width < 2 || next.height < 2) {
    void hide()
    return
  }
  void rendererInvoke(PLUGIN_EVENT_NAME.set_view_bounds, { bounds: next, ownerId }).catch(() => {})
}

const scheduleSync = () => {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    if (shown) syncBounds()
    else if (!isOverlayOpen()) void show()
  })
}

const hide = async() => {
  if (!shown) return
  shown = false
  await rendererInvoke(PLUGIN_EVENT_NAME.hide_view, { ownerId }).catch(() => {})
}

const show = async() => {
  if (destroyed || showing) return
  const next = bounds()
  if (!next || next.width < 2 || next.height < 2) return
  showing = true
  try {
    await rendererInvoke(PLUGIN_EVENT_NAME.show_view, {
      ownerId,
      kind: props.pageId ? 'page' : 'collection',
      pluginId: props.pluginId,
      providerId: props.providerId,
      surfaceId: props.surfaceId,
      contextId: props.contextId,
      pageId: props.pageId,
      entry: props.entry,
      bounds: next,
    })
    shown = true
    if (destroyed) { await hide(); return }
    ready.value = true
    hidden.value = isOverlayOpen()
    if (hidden.value) await hide()
  } catch (error) {
    emit('error', error)
  } finally {
    // eslint-disable-next-line require-atomic-updates
    showing = false
  }
}

const syncVisibility = () => {
  if (destroyed) return
  const shouldHide = isOverlayOpen() || document.visibilityState === 'hidden'
  if (shouldHide === hidden.value && (shown || shouldHide || showing)) return
  hidden.value = shouldHide
  if (shouldHide) void hide()
  else void show()
}

watch(isShowPlayerDetail, () => { syncVisibility() })

const onWindowResize = () => {
  scheduleSync()
}

onMounted(() => {
  observer = new ResizeObserver(() => { scheduleSync() })
  if (host.value) observer.observe(host.value)
  window.addEventListener('resize', onWindowResize)
  document.addEventListener('visibilitychange', syncVisibility)
  mutationObserver = new MutationObserver(syncVisibility)
  mutationObserver.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] })
  void show()
})

onBeforeUnmount(() => {
  destroyed = true
  observer?.disconnect()
  mutationObserver?.disconnect()
  window.removeEventListener('resize', onWindowResize)
  document.removeEventListener('visibilitychange', syncVisibility)
  if (raf) cancelAnimationFrame(raf)
  void hide()
})

watch(() => route.fullPath, () => {
  void hide()
  window.setTimeout(() => {
    void show()
  }, 30)
})

watch(() => [props.pluginId, props.providerId, props.contextId, props.entry, props.pageId], () => {
  void hide()
  ready.value = false
  window.setTimeout(() => {
    void show()
  }, 30)
})

defineExpose({ show, hide, syncBounds })
</script>

<style lang="less" module>
.host {
  position: absolute;
  inset: 0;
  min-width: 0;
  min-height: 0;
  contain: strict;
}
.loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--lx-text-secondary, var(--color-font-label));
  font-size: 0.9em;
}
</style>
