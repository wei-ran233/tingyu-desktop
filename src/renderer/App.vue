<template>
  <div id="container" class="view-container">
    <theme-backdrop />
    <theme-icon-definitions />
    <service-host />
    <layout-aside id="left" />
    <div id="right">
      <feature-slot id="toolbar" feature-id="navigation.search" />
      <layout-view id="view" />
      <feature-slot id="player" feature-id="playback" />
    </div>
    <layout-icons />
    <feature-slot feature-id="updates.changelog" />
    <feature-slot feature-id="updates.notice" />
    <feature-slot feature-id="terms" />
    <feature-slot feature-id="sync.mode" />
    <feature-slot feature-id="sync.auth" />
    <feature-slot feature-id="playback.detail" />
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from '@common/utils/vueTools'
import ThemeBackdrop from '@renderer/components/theme/ThemeBackdrop.vue'
import ThemeIconDefinitions from '@renderer/components/theme/ThemeIconDefinitions.vue'
import { initializePluginThemes } from '@renderer/core/theme'
// import BubbleCursor from '@common/utils/effects/cursor-effects/bubbleCursor'
// import '@common/utils/effects/snow.min'
import ServiceHost from '@renderer/components/feature/ServiceHost.vue'
import FeatureSlot from '@renderer/components/feature/FeatureSlot.vue'
import useApp from '@renderer/core/useApp'

useApp()
let disposeThemes
onBeforeUnmount(() => { disposeThemes?.() })

onMounted(() => {
  disposeThemes = initializePluginThemes()
  document.getElementById('root').style.display = 'block'

  // const styles = getComputedStyle(document.documentElement)
  // window.lxData.bubbleCursor = new BubbleCursor({
  //   fillStyle: styles.getPropertyValue('--color-primary-alpha-900'),
  //   strokeStyle: styles.getPropertyValue('--color-primary-alpha-700'),
  // })
})

// onBeforeUnmount(() => {
//   window.lxData.bubbleCursor?.destroy()
// })

</script>


<style lang="less">
@import './assets/styles/index.less';
@import './assets/styles/layout.less';
@import './assets/styles/pages.less';
@import './assets/styles/theme-appearance.less';
@import './assets/styles/theme-identities.less';

/* Each rendering provider owns its density; never scale nested function views globally. */

html {
  height: 100vh;
}
html, body {
  overflow: hidden;
  box-sizing: border-box;
}

body {
  user-select: none;
  height: 100%;
}
#root {
  height: 100%;
  position: relative;
  overflow: hidden;
  color: var(--color-font);
  background: var(--background-image) var(--background-image-position) no-repeat;
  background-size: var(--background-image-size);
  transition: background-color @transition-normal;
  background-color: var(--color-content-background);
  box-sizing: border-box;
}

.disableAnimation * {
  transition: none !important;
  animation: none !important;
}

.transparent {
  background: transparent;
  padding: var(--layout-shadow-size);
  // #waiting-mask {
  //   border-radius: @radius-border;
  //   left: @shadow-app;
  //   right: @shadow-app;
  //   top: @shadow-app;
  //   bottom: @shadow-app;
  // }
  #body {
    border-radius: var(--radius-sm);
  }
  #root {
    isolation: isolate;
    box-shadow: 0 0 var(--layout-shadow-size) rgba(0, 0, 0, 0.5);
    border-radius: var(--radius-sm);
  }
  // #container {
    // border-radius: @radius-border;
    // background-color: transparent;
  // }
}
.disableTransparent {
  background-color: var(--color-content-background);

  #body {
    border: 1Px solid var(--color-primary-light-500);
  }

  #right {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }

  // #view { // 偏移5px距离解决非透明模式下右侧滚动条无法拖动的问题
  //   margin-right: 5Px;
  // }
}
.fullscreen,
.maximized {
  background-color: var(--color-content-background);
  padding: 0;

  #body,
  #root {
    border-radius: 0;
  }
  #root {
    box-shadow: none;
  }
  #right {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
}

#container {
  border-radius: inherit;
  position: relative;
  display: flex;
  height: 100%;
  background-color: var(--color-app-background);
}

#left {
  flex: none;
  width: var(--layout-sidebar-width);
}
#right {
  flex: auto;
  min-width: 0;
  display: flex;
  flex-flow: column nowrap;
  transition: background-color @transition-normal;
  background-color: var(--color-main-background);

  border-top-left-radius: var(--radius-sm);
  border-bottom-left-radius: var(--radius-sm);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
#toolbar, #player {
  flex: none;
}
#view {
  position: relative;
  flex: auto;
  // display: flex;
  min-height: 0;
}

.view-container {
  transition: opacity @transition-normal;
}
#root.show-modal > .view-container {
  opacity: .9;
}
#view.show-modal > .view-container {
  opacity: .2;
}

</style>

