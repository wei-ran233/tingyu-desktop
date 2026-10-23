<template>
  <teleport to="#view">
    <div v-show="isShow" ref="dom_container" :class="$style.container">
      <transition enter-active-class="animated-fast zoomIn" leave-active-class="animated zoomOut" @after-leave="handleAnimated">
        <div v-show="visible" :class="$style.search">
          <div :class="$style.form">
            <input
              ref="dom_input" v-model.trim="text" class="ignore-esc" :placeholder="placeholder" @input="handleDelaySearch"
              @keydown.arrow-down.arrow-up.prevent @keyup.arrow-down.prevent.exact="handleKeyDown" @keyup.arrow-up.prevent.exact="handleKeyUp"
              @keyup.enter="handleTemplistClick(selectIndex)"
              @keyup.escape.prevent.exact="handleKeyEsc" @keydown.control.prevent="handle_key_mod_down" @keydown.meta.prevent="handle_key_mod_down"
              @keyup.control.prevent="handle_key_mod_up" @keyup.meta.prevent="handle_key_mod_up" @contextmenu="handleContextMenu"
            >
            <button type="button" @click="handleHide">
              <slot>
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="70%" viewBox="0 0 212.982 212.982" space="preserve">
                  <use :xlink:href="$themeIconRef('#icon-delete')" />
                </svg>
              </slot>
            </button>
          </div>
          <div v-if="resultList" ref="dom_scrollContainer" class="scroll" :class="$style.list" :style="listStyle">
            <ul ref="dom_list">
              <li v-for="(item, index) in resultList" :key="item.songmid" :class="selectIndex === index ? $style.select : null" @mouseenter="selectIndex = index" @click="handleTemplistClick(index)">
                <div :class="$style.img" />
                <div :class="$style.text">
                  <h3 :class="$style.text">{{ item.name }} - {{ item.singer }}</h3>
                  <h3 v-if="item.meta.albumName" :class="[$style.text, $style.albumName]">{{ item.meta.albumName }}</h3>
                </div>
                <div :class="$style.source">{{ item.source }}</div>
              </li>
            </ul>
          </div>
        </div>
      </transition>
    </div>
  </teleport>
</template>

<script lang="js" src="@renderer/bundles/official/features/List/MusicList/components/SearchList.js"></script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 20px;
  width: 45%;
  min-width: 180px;
  height: var(--layout-search-height);
  z-index: 99;
}

.search {
  position: absolute;
  width: 100%;
  border-radius: var(--radius-pill);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition: box-shadow .4s ease, background-color @transition-normal, border-radius @transition-fast;
  display: flex;
  flex-flow: column nowrap;
  background-color: var(--color-primary-light-600-alpha-100);
  box-shadow: 0 1px 2px rgba(0,0,0,0.07),
                0 2px 4px rgba(0,0,0,0.07),
                0 4px 8px rgba(0,0,0,0.07),
                0 8px 16px rgba(0,0,0,0.07),
                0 16px 32px rgba(0,0,0,0.07),
                0 32px 64px rgba(0,0,0,0.07);

  &.active {
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    box-shadow: 0 0 0 2px var(--color-primary-alpha-300),
                0 1px 2px rgba(0,0,0,0.07),
                0 2px 4px rgba(0,0,0,0.07),
                0 4px 8px rgba(0,0,0,0.07),
                0 8px 16px rgba(0,0,0,0.07),
                0 16px 32px rgba(0,0,0,0.07),
                0 32px 64px rgba(0,0,0,0.07);
    .form {
      input {
        border-bottom-left-radius: 0;

      }
      button {
        border-bottom-right-radius: 0;
      }
    }
  }
  .form {
    display: flex;
    height: var(--layout-search-height);
    position: relative;
    input {
      flex: auto;
      // border: 1px solid;
      border-top-left-radius: var(--radius-pill);
      border-bottom-left-radius: var(--radius-pill);
      background-color: transparent;
      // border-bottom: 2px solid var(--color-primary);
      // border-color: var(--color-primary);
      border: none;

      outline: none;
      // height: @height-toolbar * .7;
      padding: 0 5px;
      overflow: hidden;
      font-size: 13.5px;
      line-height: calc(var(--layout-search-height) + 5px);
      &::placeholder {
        color: var(--color-button-font);
        font-size: .98em;
      }
    }
    button {
      flex: none;
      border: none;
      // background-color: @color-search-form-background;
      background-color: transparent;
      outline: none;
      border-top-right-radius: var(--radius-pill);
      border-bottom-right-radius: var(--radius-pill);
      cursor: pointer;
      height: 100%;
      padding: 6px 9px;
      color: var(--color-button-font);
      transition: background-color .2s ease;
      opacity: 0.8;

      &:hover {
        background-color: var(--color-button-background-hover);
      }
      &:active {
        background-color: var(--color-button-background-active);
      }
    }
  }
  .list {
    // background-color: @color-search-form-background;
    font-size: 13px;
    transition: .3s ease;
    height: 0;
    transition-property: height;
    position: relative;
    scroll-behavior: smooth;

    li {
      position: relative;
      cursor: pointer;
      padding: 8px 5px;
      transition: background-color .2s ease;
      line-height: 1.3;
      // overflow: hidden;
      display: flex;
      flex-flow: row nowrap;

      &.select {
        background-color: var(--color-primary-dark-100-alpha-700);
      }
      border-radius: var(--radius-xs);
      // &:last-child {
      //   border-bottom-left-radius: 4px;
      //   border-bottom-right-radius: 4px;
      // }
    }
  }
}

.img {
  flex: none;
}
.text {
  flex: auto;
  .mixin-ellipsis-1();
}
.albumName {
  font-size: 12px;
  opacity: 0.6;
  .mixin-ellipsis-1();
}
.source {
  flex: none;
  font-size: 12px;
  opacity: 0.5;
  padding: 0 5px;
  display: flex;
  align-items: center;
  // transform: rotate(45deg);
  // background-color:
}

@media (max-width: 920px) {
  .container {
    width: calc(100% - 24px);
    min-width: 0;
  }
}

</style>
