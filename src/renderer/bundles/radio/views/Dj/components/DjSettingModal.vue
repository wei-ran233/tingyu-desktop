<template>
  <Teleport to="body">
    <div v-if="visible" :class="$style.overlay" @click.self="close" @keydown.esc.stop="close">
      <div :class="$style.modal" role="dialog" aria-modal="true" aria-label="AI 电台设置">
        <settings-workspace :groups="menuGroups" :active-id="activeCategory" title="AI 电台设置" @select="activeCategory = $event">
          <template #header-actions><button type="button" :class="$style.closeBtn" aria-label="关闭" @click="close"><DjIcon name="close" /></button></template>
          <radio-settings :section="activeCategory" :embedded="false" @update:visible="!$event && close()" @save="save" />
        </settings-workspace>
      </div>
    </div>
  </Teleport>
</template>
<script lang="js" src="@renderer/bundles/radio/features/Dj/components/DjSettingModal.js"></script>
<style lang="less" module>
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.65); backdrop-filter: blur(6px); z-index: 9999; display: flex; align-items: center; justify-content: center; }
.modal { width: min(760px, 94vw); height: min(680px, 90vh); min-height: 0; overflow: hidden; border-radius: 16px; background: var(--color-content-background); box-shadow: 0 16px 40px rgba(0,0,0,.35); border: 1px solid var(--color-primary-alpha-200); }
.modal :global(.settings-workspace) { --settings-nav-width: 160px; }
.closeBtn { border: 0; background: transparent; color: var(--color-font-label); padding: 6px; cursor: pointer; font-size: 16px; &:hover { color: var(--color-font); } }
</style>
