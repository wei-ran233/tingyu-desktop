<template lang="pug">
dt#sync {{ $t('setting__open_api') }}
dd.gap-top
  div
    .p
      base-checkbox(id="setting_open_api_enable" :model-value="appSetting['openAPI.enable']" :label="$t('setting__open_api_enable')" @update:model-value="updateSetting({ 'openAPI.enable': $event })")
    .p.gap-top
      base-checkbox(id="setting_open_api_bind_lan" :model-value="appSetting['openAPI.bindLan']" :label="$t('setting__open_api_bind_lan')" @update:model-value="updateSetting({ 'openAPI.bindLan': $event })")
    .p.gap-top.small
      | {{ $t('setting__open_api_address') }}
      span.select {{ openAPI.address }}
    .p.small(v-if="openAPI.message") {{ openAPI.message }}
    .p
      .p.small {{ $t('setting__open_api_port') }}
      div
        base-input.gap-left(:class="$style.portInput" :model-value="appSetting['openAPI.port']" type="number" :placeholder="$t('setting__open_api_port_tip')" @update:model-value="setPort")

dd.gap-top
  div
    .p
      | {{ $t('setting__open_api_tip') }}
      strong.hover.underline(aria-label="https://github.com/wei-ran233/tingyu-desktop/tree/main/doc" @click="openUrl('https://github.com/wei-ran233/tingyu-desktop/tree/main/doc')") {{ $t('setting__open_api_tip_link') }}
</template>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';
.portInput[disabled], .hostInput[disabled] {
  opacity: .8 !important;
}
</style>
