<template>
  <div :class="[$style.toolbar, { [$style.fullscreen]: isFullscreen }, appSetting['common.controlBtnPosition'] == 'left' ? $style.controlBtnLeft : $style.controlBtnRight]">
    <SearchInput />
    <div :class="$style.actions">
      <div v-if="appSetting['common.controlBtnPosition'] == 'left'" :class="$style.logo">TY</div>
      <ControlBtns v-else />
    </div>
  </div>
</template>

<script setup>
import { isFullscreen } from '@renderer/store'
import { appSetting } from '@renderer/store/setting'
import ControlBtns from './ControlBtns.vue'
import SearchInput from './SearchInput.vue'

</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.toolbar {
  display: flex;
  height: var(--layout-toolbar-height);
  align-items: center;
  justify-content: space-between;
  padding-left: var(--space-content-x);
  gap: 10px;
  min-width: 0;
  -webkit-app-region: drag;
  z-index: 2;

  &.fullscreen {
    -webkit-app-region: no-drag;
    .logo {
      display: none;
    }
  }

  &.controlBtnLeft {
    .control {
      display: none;
    }
  }
  &.controlBtnRight {
    justify-content: space-between;
  }
}

.actions {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  flex: none;
  min-width: 0;
}

.logo {
  box-sizing: border-box;
  padding: 0 calc(var(--layout-toolbar-height) * .4);
  height: var(--layout-toolbar-height);
  color: var(--color-primary);
  flex: none;
  text-align: center;
  line-height: var(--layout-toolbar-height);
  font-weight: bold;
  // -webkit-app-region: no-drag;
}

@media (max-width: 920px) {
  .toolbar {
    padding-left: 10px;
  }

  .logo {
    display: none;
  }
}

</style>
