<template>
  <section :class="$style.recovery">
    <header>
      <strong>{{ snapshot.title }}</strong>
      <span>{{ snapshot.total }}</span>
      <button type="button" @click="refresh">{{ $t('collection_refresh') }}</button>
    </header>
    <p v-if="error">{{ error }}</p>
    <p v-else-if="snapshot.status === 'loading'">{{ $t('list__loading') }}</p>
    <p v-else-if="snapshot.status === 'empty'">{{ $t('no_item') }}</p>
    <ol :start="offset + 1">
      <li v-for="item in items" :key="item.key">
        <span>{{ item.name }} <small>{{ item.singer }}</small></span>
        <button type="button" :disabled="!item.available" @click="play(item.key)">{{ $t('list__play') }}</button>
      </li>
    </ol>
    <footer>
      <button type="button" :disabled="offset === 0" @click="move(-100)">←</button>
      <span>{{ offset + (items.length ? 1 : 0) }}–{{ offset + items.length }} / {{ snapshot.total }}</span>
      <button type="button" :disabled="offset + items.length >= snapshot.total" @click="move(100)">→</button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef } from '@common/utils/vueTools'
import type { MusicItemSummary, MusicCollectionSnapshot } from '@common/collection/types'
import type { CollectionController } from '@renderer/core/collection/controller'

const props = defineProps<{ controller: CollectionController }>()
const snapshot = shallowRef(props.controller.snapshot())
const items = ref<MusicItemSummary[]>([])
const offset = ref(snapshot.value.scrollAnchor?.offset ?? 0)
const error = ref('')
let request = 0
const load = async() => {
  const id = ++request
  try {
    const page = await props.controller.getItems({ revision: snapshot.value.revision, offset: offset.value, limit: 100 })
    if (id !== request) return
    items.value = page.items
    error.value = ''
  } catch (err: any) {
    if (id === request) error.value = String(err?.message ?? err)
  }
}
const unsubscribe = props.controller.subscribe((next: MusicCollectionSnapshot) => {
  snapshot.value = next
  if (offset.value >= next.total) offset.value = Math.max(0, next.total - 100)
  if (next.status === 'ready' || next.status === 'empty') void load()
  else if (next.status === 'error') error.value = next.error?.message ?? ''
})
const move = async(delta: number) => {
  offset.value = Math.max(0, offset.value + delta)
  props.controller.setScrollAnchor({ offset: offset.value })
  await load()
}
const play = async(key: string) => {
  try { await props.controller.dispatch({ revision: snapshot.value.revision, command: 'playItem', target: { kind: 'item', keys: [key] } }) } catch (err: any) { error.value = String(err?.message ?? err) }
}
const refresh = async() => { await props.controller.refresh() }
onBeforeUnmount(() => { request++; unsubscribe() })
</script>

<style lang="less" module>
.recovery {
  height: 100%;
  overflow: auto;
  color: var(--color-font);
  header, footer, li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; }
  header, footer { border-bottom: 1px solid var(--color-border); }
  ol { padding: 0; margin: 0; }
  li { min-height: 38px; border-bottom: 1px solid var(--color-border); }
  small { color: var(--color-font-label); }
  button { color: inherit; background: transparent; border: 1px solid var(--color-border); padding: 4px 10px; cursor: pointer; }
  button:disabled { opacity: 0.4; cursor: default; }
}
</style>
