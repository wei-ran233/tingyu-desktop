<template lang="pug">
dt#network {{ $t('setting__network') }}
dd
  h3#network_proxy_title {{ $t('setting__network_proxy_title') }}
  div
    .p
      base-checkbox(id="setting_network_proxy_enable" :model-value="appSetting['network.proxy.enable']" :label="$t('setting__is_enable')" @update:model-value="updateSetting({'network.proxy.enable': $event})")
    .p
      base-input(:model-value="appSetting['network.proxy.host']" :placeholder="proxy.envProxy ? proxy.envProxy.host : $t('setting__network_proxy_host')" @update:model-value="setHost")
    .p
      base-input(:model-value="appSetting['network.proxy.port']" :placeholder="proxy.envProxy ? proxy.envProxy.port : $t('setting__network_proxy_port')" @update:model-value="setPort")

</template>


