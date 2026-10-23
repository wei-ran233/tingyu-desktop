<template lang="pug">
dt#sync
  | {{ $t('setting__sync') }}
  button(class="help-btn" :aria-label="$t('setting__sync_tip')" @click="openUrl('https://github.com/wei-ran233/tingyu-desktop/tree/main/doc')")
    svg-icon(name="help-circle-outline")
dd
  base-checkbox(id="setting_sync_enable" :model-value="appSetting['sync.enable']" :label="$t('setting__sync_enable')" @update:model-value="updateSetting({ 'sync.enable': $event })")

dd
  h3#sync_mode {{ $t('setting__sync_mode') }}
  div
    base-checkbox.gap-left(id="setting_sync_mode_server" :disabled="sync.enable" :model-value="appSetting['sync.mode']" need value="server" :label="$t('setting__sync_mode_server')" @update:model-value="updateSetting({ 'sync.mode': $event })")
    base-checkbox.gap-left(id="setting_sync_mode_client" :disabled="sync.enable" :model-value="appSetting['sync.mode']" need value="client" :label="$t('setting__sync_mode_client')" @update:model-value="updateSetting({ 'sync.mode': $event })")


SyncClient(v-if="sync.mode == 'client'")
SyncServer(v-else)

</template>


