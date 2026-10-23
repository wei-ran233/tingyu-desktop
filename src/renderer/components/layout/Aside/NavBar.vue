<template>
  <div ref="dom_menu" data-theme-navigation :class="$style.menu">
    <ul :class="$style.list" role="toolbar">
      <li v-for="item in menus" :key="item.path" :class="$style.navItem" role="presentation" :data-page-id="item.id">
        <router-link :class="[$style.link, {[$style.active]: isActive(item)}]" role="tab" :aria-selected="isActive(item)" :to="item.path" :aria-label="item.label">
          <img v-if="item.iconUrl && !$themeIdentity" :class="$style.iconImage" :src="item.iconUrl" :alt="item.label">
          <svg v-else version="1.1" xmlns="http://www.w3.org/2000/svg" :viewBox="$themeIdentity ? '0 0 24 24' : item.iconViewBox" :height="size" :width="size" space="preserve">
            <use :xlink:href="$themeIconRef(item.iconRef || '#icon-extension')" />
          </svg>
          <span class="theme-nav-label">{{ item.label }}</span>
        </router-link>
      </li>
    </ul>
  </div>
</template>

<script lang="ts">
import { appSetting } from '@renderer/store/setting'
import { useI18n } from '@root/lang'
import { ref, computed } from '@common/utils/vueTools'
import { useIconSize } from '@renderer/utils/compositions/useIconSize'
import { useRoute } from '@common/utils/vueRouter'
import { visiblePages } from '@renderer/core/pages'

export default {
  name: 'NavBar',
  setup() {
    const t = useI18n()
    const dom_menu = ref<HTMLElement>()
    const iconSize = useIconSize(dom_menu, 0.32)
    const route = useRoute()

    const menus = computed(() => {
      const size = iconSize.value
      return visiblePages.value.map(page => ({
        path: page.path,
        label: page.titleIsKey ? t(page.title as any) : page.title,
        iconRef: page.iconRef,
        iconViewBox: page.iconViewBox,
        iconUrl: page.iconUrl,
        size,
        id: page.id,
        routeName: page.routeName,
      }))
    })

    const isActive = (item: { routeName: string }) => route.meta.name === item.routeName

    return {
      appSetting,
      menus,
      dom_menu,
      size: iconSize,
      isActive,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.menu {
  flex: auto;
  // &.controlBtnLeft {
  //   display: flex;
  //   flex-flow: column nowrap;
  //   justify-content: center;
  //   padding-bottom: @control-btn-height;
  // }
  // padding: 5px;
}
:global(.theme-nav-label) { display: none; }
.list {
  -webkit-app-region: no-drag;
  // margin-bottom: 15px;
  &:last-child {
    margin-bottom: 0;
  }
  // background-color: pink;
  // dt {
  //   padding-left: 5px;
  //   font-size: 11px;
  //   transition: @transition-normal;
  //   transition-property: color;
  //   color: @color-theme-font-label;
  //   .mixin-ellipsis-1();
  // }
}
.navItem {
  position: relative;
  &:before {
    content: '';
    display: block;
    width: 100%;
    padding-bottom: 84%;
  }
}
.link {
  position: absolute;
  left: 0%;
  top: 0%;
  width: 100%;
  height: 100%;
  // left: 15%;
  // top: 15%;
  // width: 70%;
  // height: 70%;
  // display: block;
  box-sizing: border-box;
  // text-decoration: none;
  // border-radius: 20%;

  // padding: 18px 3px;
  // margin: 5px 0;
  // border-left: 5px solid transparent;
  transition: @transition-fast;
  transition-property: background-color, opacity;
  color: var(--color-nav-font);
  cursor: pointer;
  // font-size: 11.5px;
  text-align: center;
  outline: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);

  // border-radius: @radius-border;
  .mixin-ellipsis-1();
  &:before {
    .mixin-after();
    left: 0;
    top: 0;
    width: 3px;
    height: 100%;
    background-color: var(--color-primary-dark-200-alpha-700);
    border-radius: 4px;
    transform: translateX(-100%);
    transition: transform @transition-fast;
  }

  &.active {
    // border-left-color: @color-theme-active;
    background-color: var(--color-primary-light-300-alpha-700);
    box-shadow: inset 0 0 0 1px var(--color-primary-alpha-200);

    &:before {
      transform: translateX(0);
    }

    &:hover {
      background-color: var(--color-primary-light-300-alpha-800);
    }
  }


  &:hover {
    color: var(--color-nav-font);

    &:not(.active) {
      opacity: .8;
      background-color: var(--color-primary-light-400-alpha-700);
    }
  }
  &:active:not(.active) {
    opacity: .6;
    background-color: var(--color-primary-light-300-alpha-600);
  }
}

// .icon {
//   // margin-bottom: 5px;
//   &> svg {
//     width: 32%;
//   }
// }
.iconImage {
  width: 32%;
  height: 32%;
  object-fit: contain;
  display: block;
}

</style>
