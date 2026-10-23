<template lang="pug">
dt#hot_key {{ $t('setting__hot_key') }}
dd
  h3#hot_key_local_title {{ $t('setting__hot_key_local_title') }}
  div
    base-checkbox(id="setting_download_hotKeyLocal" v-model="current_hot_key.local.enable" :label="$t('setting__is_enable')" @change="handleHotKeySaveConfig")
  div(:class="$style.hotKeyContainer" :style="{ opacity: current_hot_key.local.enable ? 1 : .6 }")
    div(v-for="(item, index) in allHotKeys.local" :key="index" :class="$style.hotKeyItem")
      h4(:class="$style.hotKeyItemTitle") {{ $t('setting__hot_key_' + item.name) }}
      base-input(
        :class="$style.hotKeyItemInput" readonly :auto-paste="false"
        :placeholder="$t('setting__hot_key_unset_input')" :value="hotKeyConfig.local[item.name] && formatHotKeyName(hotKeyConfig.local[item.name].key)"
        @keyup.prevent
        @focus="handleHotKeyFocus($event, item, 'local')"
        @blur="handleHotKeyBlur($event, item, 'local')")
dd
  h3#hot_key_global_title {{ $t('setting__hot_key_global_title') }}
  div
    base-checkbox(id="setting_download_hotKeyGlobal" v-model="current_hot_key.global.enable" :label="$t('setting__is_enable')" @change="handleEnableHotKey")
  div(:class="$style.hotKeyContainer" :style="{ opacity: current_hot_key.global.enable ? 1 : .6 }")
    div(v-for="(item, index) in allHotKeys.global" :key="index" :class="$style.hotKeyItem")
      h4(:class="$style.hotKeyItemTitle") {{ $t('setting__hot_key_' + item.name) }}
      base-input(
        :class="[$style.hotKeyItemInput, hotKeyConfig.global[item.name] && hotKeyStatus[hotKeyConfig.global[item.name].key] && hotKeyStatus[hotKeyConfig.global[item.name].key].status === false ? $style.hotKeyFailed : null]"
        :value="hotKeyConfig.global[item.name] && formatHotKeyName(hotKeyConfig.global[item.name].key)" :auto-paste="false" readonly :placeholder="$t('setting__hot_key_unset_input')" @input.prevent
        @focus="handleHotKeyFocus($event, item, 'global')"
        @blur="handleHotKeyBlur($event, item, 'global')")
</template>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.hotKeyContainer {
  display: flex;
  flex-flow: row wrap;
  // margin-top: -15px;
  margin-bottom: 15px;
  transition: opacity @transition-normal;
}
.hotKeyItem {
  width: 30%;
  padding-right: 35px;
  margin-top: 15px;
  box-sizing: border-box;
}
.hotKeyItemTitle {
  .mixin-ellipsis-1();
  padding-bottom: 5px;
  color: var(--color-font-label);
  font-size: 12px;
}
.hotKeyItemInput {
  width: 100%;
  box-sizing: border-box;
  // font-family: monospace;
  &:focus {
    background-color: var(--color-primary-background-active);
    text-decoration: none;
  }
  &::placeholder {
    color: var(--color-200) !important;
  }
}
.hotKeyFailed {
  text-decoration: line-through;
}

// .delLine {
//   position: relative;
//   &:before {
//     display: block;
//     height: 1px;
//     position: absolute;
//     width: 110%;
//     content: ' ';
//     left: 0;
//     background-color: #000;
//     transform: rotate(-24deg);
//     transform-origin: 0;
//     top: 83%;
//     z-index: 1;
//   }
//   &:after {
//     display: block;
//     height: 1px;
//     position: absolute;
//     width: 110%;
//     content: ' ';
//     left: 0;
//     background-color: #000;
//     transform: rotate(23deg);
//     transform-origin: 0px;
//     top: 2px;
//     z-index: 1;
//   }
// }

</style>
