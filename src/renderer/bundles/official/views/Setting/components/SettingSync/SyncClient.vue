<template lang="pug">
dd
  h3 {{ $t('setting__sync_client_mode') }}
  div
    .p.small {{ $t('setting__sync_client_status', { status: clientStatus }) }}
    .p.small {{ $t('setting__sync_client_address', { address: sync.client.status.address.join(', ') || '' }) }}
    .p
      .p.small {{ $t('setting__sync_client_host') }}
      div
        base-input.gap-left(:class="$style.hostInput" :model-value="appSetting['sync.client.host']" :disabled="sync.enable" :placeholder="$t('setting__sync_client_host_tip')" @update:model-value="setSyncClientHost")
</template>

<script lang="js" src="@renderer/bundles/official/features/Setting/components/SettingSync/SyncClient.js"></script>

<style lang="less" module>
.hostInput[disabled] {
  opacity: .8 !important;
}

.hostInput {
  min-width: 380px;
}
</style>
