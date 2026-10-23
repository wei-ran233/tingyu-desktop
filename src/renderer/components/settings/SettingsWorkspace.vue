<template>
  <section class="settings-workspace" :class="{ 'settings-workspace-compact': compact }" :aria-label="title">
    <header class="settings-header">
      <div><span v-if="breadcrumb" class="settings-breadcrumb">{{ breadcrumb }}</span><h2>{{ title }}</h2></div>
      <slot name="header-actions" />
    </header>
    <div class="settings-workspace-body">
      <nav class="settings-navigation scroll" aria-label="设置分类">
        <div v-for="group in groups" :key="group.id" class="settings-menu-group">
          <template v-if="group.children?.length">
            <button type="button" class="settings-group-button" :class="{ 'is-active-group': isGroupActive(group) }" :aria-expanded="openedGroup === group.id" @click="openedGroup = openedGroup === group.id ? '' : group.id">
              <span>{{ group.title }}</span><span class="settings-chevron" :class="{ 'is-open': openedGroup === group.id }" aria-hidden="true">›</span>
            </button>
            <div v-show="openedGroup === group.id" class="settings-submenu">
              <button v-for="item in group.children" :key="item.id" type="button" class="settings-menu-item" :class="{ 'is-selected': item.id === activeId }" :aria-current="item.id === activeId ? 'page' : undefined" @click="$emit('select', item.id)">{{ item.title }}</button>
            </div>
          </template>
          <button v-else type="button" class="settings-menu-item settings-menu-leaf" :class="{ 'is-selected': group.id === activeId }" :aria-current="group.id === activeId ? 'page' : undefined" @click="$emit('select', group.id)">{{ group.title }}</button>
        </div>
      </nav>
      <div class="settings-content"><slot /></div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
interface MenuItem { id: string, title: string }
interface MenuGroup extends MenuItem { children?: MenuItem[] }
const props = defineProps<{ groups: MenuGroup[], activeId: string, title: string, breadcrumb?: string, compact?: boolean }>()
defineEmits<(event: 'select', id: string) => void>()
const openedGroup = ref('')
const isGroupActive = (group: MenuGroup) => group.children?.some((item: MenuItem) => item.id === props.activeId) ?? false
watch(() => [props.activeId, props.groups] as const, () => {
  const group = props.groups.find((group: MenuGroup) => isGroupActive(group))
  if (group) openedGroup.value = group.id
}, { immediate: true })
</script>
<style lang="less">
.settings-workspace {
  --settings-nav-width: 176px;
  --settings-space: 24px;
  --settings-line: var(--lx-border);
  display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0;
  color: var(--color-font); background: var(--color-content-background); font-size: 13px;
  button, input, select, textarea { font-family: inherit; }
  button { cursor: pointer; }
  button:focus-visible, summary:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
}
.settings-header {
  flex: none; min-height: 56px; padding: 10px var(--settings-space); box-sizing: border-box;
  border-bottom: 1px solid var(--settings-line); display: flex; align-items: center; justify-content: space-between; gap: 12px;
  > div { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
  h2 { font-size: 15px; font-weight: 600; line-height: 1.5; margin: 0; }
}
.settings-breadcrumb { font-size: 12px; color: var(--color-font-label); white-space: nowrap; }
.settings-workspace-body { display: flex; flex: 1; min-height: 0; min-width: 0; }
.settings-navigation {
  flex: 0 0 var(--settings-nav-width); min-width: 0; overflow: auto; padding: 10px 8px; box-sizing: border-box;
  background: var(--color-primary-light-900-alpha-500); border-right: 1px solid var(--settings-line);
  button { width: 100%; border: 0; background: transparent; color: var(--color-font); text-align: left; font-size: 13px; line-height: 1.5; }
}
.settings-menu-group + .settings-menu-group { margin-top: 4px; }
.settings-group-button { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px; border-radius: 6px; font-weight: 500; }
.settings-chevron { font-size: 18px; line-height: 1; color: var(--color-font-label); transform: rotate(0); &.is-open { transform: rotate(90deg); } }
.settings-submenu { padding: 2px 0 6px 8px; }
.settings-navigation .settings-menu-item { padding: 9px 10px; border-radius: 6px; color: var(--color-font); overflow-wrap: anywhere; }
.settings-menu-item.is-selected, .settings-navigation .is-active-group { color: var(--color-font); font-weight: 600; }
.settings-navigation .settings-menu-item.is-selected { background: var(--color-primary-light-900); color: var(--color-font); font-weight: 600; box-shadow: inset 3px 0 var(--color-primary); }
.settings-navigation button:hover { background: var(--color-primary-light-900-alpha-500); }
.settings-content { flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
.settings-workspace-compact { --settings-nav-width: 160px; --settings-space: 20px; }
@media (max-width: 800px) {
  .settings-workspace { --settings-nav-width: 146px; --settings-space: 16px; }
  .settings-header > div { gap: 8px; }
}
</style>
