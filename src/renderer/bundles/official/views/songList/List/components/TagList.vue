<template>
  <div :class="[$style.tagList, {[$style.active]: popupVisible}]">
    <div ref="dom_btn" :class="$style.label" @click.stop="handleShow">
      <span>{{ tagName }}</span>
      <div :class="$style.icon">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 451.847 451.847" space="preserve">
          <use :xlink:href="$themeIconRef('#icon-down')" />
        </svg>
      </div>
    </div>
    <div :class="$style.popup" :style="popupStyle" :aria-hidden="!popupVisible" @click.stop>
      <div :class="$style.list" class="scroll">
        <div :class="$style.tag" @click="handleToggleTag('')">{{ $t('default') }}</div>
        <dl v-for="tagInfo in list" :key="tagInfo.name">
          <dt :class="$style.type">{{ tagInfo.name }}</dt>
          <dd v-for="tag in tagInfo.list" :key="tag.id" :class="$style.tag" @click="handleToggleTag(tag.id)">{{ tag.name }}</dd>
        </dl>
      </div>
    </div>
  </div>
</template>

<script lang="js" src="@renderer/bundles/official/features/songList/List/components/TagList.js"></script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.tagList {
  font-size: 12px;
  position: relative;

  &.active {
    .label {
      .icon {
        svg{
          transform: rotate(180deg);
        }
      }
    }
    .popup {
      opacity: 1;
      transform: scale(1);
      pointer-events: initial;
    }
  }
}

.label {
  padding: 8px 15px;
  // background-color: var(--color-button-background);
  transition: color @transition-normal;
  // border-top: 2px solid @color-tab-border-bottom;
  // border-left: 2px solid @color-tab-border-bottom;
  box-sizing: border-box;
  text-align: center;
  // border-top-left-radius: 3px;
  color: var(--color-font);
  cursor: pointer;

  display: flex;

  span {
    flex: auto;
  }
  .icon {
    flex: none;
    margin-left: 7px;
    line-height: 0;
    svg {
      width: .8em;
      transition: transform .2s ease;
      transform: rotate(0);
    }
  }

  &:hover {
    color: var(--color-primary-font-hover);
  }
  &:active {
    color: var(--color-primary-font-active);
  }
}

.popup {
  position: absolute;
  top: 100%;
  width: 645px;
  left: 8px;
  margin-top: 12px;
  border-radius: 4px;
  background-color: var(--color-content-background);
  opacity: 0;
  transform: scale(.95, .8);
  transform-origin: 0 0 0;
  transition: .25s ease;
  transition-property: transform, opacity;
  max-height: 250px;
  z-index: 10;
  pointer-events: none;
  filter: drop-shadow(0px 0px 4px rgba(0, 0, 0, .15));
  display: flex;

  &:before {
    content: " ";
    position: absolute;
    top: -6px;
    left: 20px;
    width: 0;
    height: 0;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-bottom: 8px solid var(--color-content-background);
  }
}
.list {
  padding: 10px;
  box-sizing: border-box;
  // box-shadow: 0 0 4px rgba(0, 0, 0, .2);
}

.type {
  padding-top: 10px;
  padding-bottom: 3px;
  color: var(--color-font-label);
}

.tag {
  display: inline-block;
  margin: 5px;
  background-color: var(--color-button-background);
  padding: 8px 10px;
  border-radius: @radius-progress-border;
  transition: background-color @transition-normal;
  cursor: pointer;
  &:hover {
    background-color: var(--color-button-background-hover);
  }
  &:active {
    background-color: var(--color-button-background-active);
  }
}

</style>
