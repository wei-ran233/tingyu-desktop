<template>
  <material-modal :show="modelValue" max-height="90%" teleport="#view" @close="handleCancel">
    <main :class="$style.main">
      <h2>{{ themeId ? $t('theme_edit_modal__title_edit') : $t('theme_edit_modal__title_add') }}</h2>
      <div class="scroll" :class="$style.content">
        <div :class="[$style.group, $style.base]">
          <div :class="$style.groupContent">
            <div :class="$style.item">
              <div ref="primary_color_ref" :class="$style.color" />
              <div :class="$style.label">{{ $t('theme_edit_modal__primary') }}</div>
            </div>
            <div :class="$style.item">
              <div ref="font_color_ref" :class="$style.color" />
              <div :class="$style.label">{{ $t('theme_edit_modal__font') }}</div>
            </div>
            <div :class="$style.item">
              <div ref="app_bg_color_ref" :class="$style.color" />
              <div :class="$style.label">{{ $t('theme_edit_modal__app_bg') }}</div>
            </div>
            <div :class="$style.item">
              <div ref="aside_font_color_ref" :class="$style.color" />
              <div :class="$style.label">{{ $t('theme_edit_modal__aside_color') }}</div>
            </div>
            <div :class="$style.item">
              <div ref="main_bg_color_ref" :class="$style.color" />
              <div :class="$style.label">{{ $t('theme_edit_modal__main_bg') }}</div>
            </div>
            <div :class="[$style.item, $style.bg]">
              <div :class="[$style.bgImg, {[$style.hasBg]: !!bgImg}]" @click="selectBgImg">
                <img v-if="bgImg" loading="lazy" decoding="async" :class="$style.img" :src="bgImg" alt="Background Image">
                <svg-icon v-else :class="$style.icon" name="plus" />
                <button :class="$style.removeBtn" type="button" @click.stop="removeBgImg">
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 212.982 212.982" space="preserve">
                    <use :xlink:href="$themeIconRef('#icon-delete')" />
                  </svg>
                </button>
              </div>
              <div :class="$style.label">{{ $t('theme_edit_modal__bg_image') }}</div>
            </div>
          </div>
        </div>
        <div :class="$style.groupContent">
          <div :class="$style.group">
            <div :class="$style.groupTitle">
              <span :class="$style.title">{{ $t('theme_edit_modal__badge') }}</span>
              <span class="badge badge-theme-primary">{{ $t('tag__lossless') }}</span>
              <span class="badge badge-theme-secondary">{{ $t('tag__high_quality') }}</span>
              <span class="badge badge-theme-tertiary">kw</span>
            </div>
            <div :class="$style.groupContent">
              <div :class="$style.item">
                <div ref="badge_primary_color_ref" :class="$style.color" />
                <div :class="$style.label">{{ $t('theme_edit_modal__badge_primary') }}</div>
              </div>
              <div :class="$style.item">
                <div ref="badge_secondary_color_ref" :class="$style.color" />
                <div :class="$style.label">{{ $t('theme_edit_modal__badge_secondary') }}</div>
              </div>
              <div :class="$style.item">
                <div ref="badge_tertiary_color_ref" :class="$style.color" />
                <div :class="$style.label">{{ $t('theme_edit_modal__badge_tertiary') }}</div>
              </div>
            </div>
          </div>
          <div :class="$style.group">
            <div :class="$style.groupTitle">
              <span>{{ $t('theme_edit_modal__control_btn') }}</span>
              <div :class="$style.controlBtn">
                <button type="button" :class="$style.hide">
                  <svg :class="$style.controlBtnIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="80%" viewBox="0 0 30.727 30.727" space="preserve">
                    <use :xlink:href="$themeIconRef('#icon-window-hide')" />
                  </svg>
                </button>
                <button type="button" :class="$style.min">
                  <svg :class="$style.controlBtnIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="100%" viewBox="0 0 24 24" space="preserve">
                    <use :xlink:href="$themeIconRef('#icon-window-minimize')" />
                  </svg>
                </button>
                <button type="button" :class="$style.close">
                  <svg :class="$style.controlBtnIcon" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="100%" viewBox="0 0 24 24" space="preserve">
                    <use :xlink:href="$themeIconRef('#icon-window-close')" />
                  </svg>
                </button>
              </div>
            </div>
            <div :class="$style.groupContent">
              <div :class="$style.item">
                <div ref="close_btn_color_ref" :class="$style.color" />
                <div :class="$style.label">{{ $t('theme_edit_modal__close_btn') }}</div>
              </div>
              <div :class="$style.item">
                <div ref="min_btn_color_ref" :class="$style.color" />
                <div :class="$style.label">{{ $t('theme_edit_modal__min_btn') }}</div>
              </div>
              <div :class="$style.item">
                <div ref="hide_btn_color_ref" :class="$style.color" />
                <div :class="$style.label">{{ $t('theme_edit_modal__hide_btn') }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div :class="$style.footer">
        <div :class="$style.subContent" style="flex-wrap: wrap;">
          <base-input v-model="themeName" :class="$style.input" :placeholder="$t('theme_selector_modal__theme_name')" />
          <div :class="$style.subContent" style="flex-wrap: wrap;">
            <base-checkbox id="theme_edit_modal__dark" v-model="isDark" :class="$style.checkbox" :label="$t('theme_edit_modal__dark')" @change="handleDark" />
            <div :class="$style.subContent" style="flex-wrap: wrap;">
              <base-checkbox id="theme_edit_modal__dark_font" v-model="isDarkFont" :class="$style.checkbox" :label="$t('theme_edit_modal__dark_font')" @change="handleDarkFont" />
              <base-checkbox id="theme_edit_modal__preview" v-model="preview" :class="$style.checkbox" :label="$t('theme_edit_modal__preview')" @change="handlePreview" />
            </div>
          </div>
        </div>
        <div :class="$style.subContent" style="flex: none;">
          <base-btn v-if="themeId" :class="$style.btn" @click="handleRemove">{{ $t('theme_edit_modal__remove') }}</base-btn>
          <base-btn v-if="themeId" :class="$style.btn" @click="handleSaveNew">{{ $t('theme_edit_modal__save_new') }}</base-btn>
          <!-- <base-btn :class="$style.btn" @click="handleCancel">{{ $t('btn_cancel') }}</base-btn> -->
          <base-btn :class="$style.btn" @click="handleSubmit">{{ $t('btn_save') }}</base-btn>
        </div>
      </div>
    </main>
  </material-modal>
</template>

<script lang="js" src="@renderer/bundles/official/features/Setting/components/ThemeEditModal/index.js"></script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';
.main {
  // padding: 15px;
  // max-width: 400px;
  min-width: 300px;
  min-height: 0;
  // max-height: 100%;
  // overflow: hidden;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  min-height: 0;
  h2 {
    flex: none;
    font-size: 16px;
    color: var(--color-font);
    line-height: 1.3;
    text-align: center;
    padding: 15px;
  }
  h3 {
    font-size: 16px;
    color: var(--color-font);
    line-height: 1.3;
    padding-bottom: 15px;
    font-size: 15px;
  }
}
.content {
  flex: auto;
  // padding: 15px 0;
  font-size: 14px;
  gap: 5px;
  display: flex;
  flex-flow: column nowrap;
}
.group {

}
.groupTitle {
  padding: 20px 20px 0;
  display: flex;
  flex-flow: row wrap;

  .title {
    margin-right: 5px;
  }
}
.groupContent {
  display: flex;
  flex-flow: row wrap;
}
.item {
  padding: 15px 20px 0;
  width: 74px;
  display: flex;
  flex-flow: column nowrap;
  align-items: center;
}
.base {
  .color {
    width: 100%;
  }
}
.color {
  width: 80%;
  aspect-ratio: 1 / 1;
  background-color: var(--pcr-color);
  border-radius: @radius-border;
  cursor: pointer;
  transition: @transition-fast !important;
  transition-property: background-color, opacity !important;
  box-shadow: 0 0 3px var(--color-primary-light-100-alpha-300);
  &:hover {
    opacity: .7;
  }
}
.label {
  padding-top: 10px;
  text-align: center;
}

.bg {
  // width: 0;
  // flex: 1 1 auto;
  width: 150px;
  // min-width: 60px;
  // max-width: 200px;
}
.bgImg {
  width: 100%;
  height: 60px;
  border: 1Px dashed var(--color-primary-light-100-alpha-300);
  transition: .3s ease;
  transition-property: border, color;
  box-sizing: border-box;
  border: 1px dashed var(--color-primary-light-100-alpha-300);
  color: var(--color-primary-light-100-alpha-300);
  position: relative;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: @transition-fast !important;
  transition-property: background-color, opacity !important;
  overflow: hidden;
  &:hover {
    opacity: .7;
  }

  &.hasBg {
    border: none;

    .removeBtn {
      display: block;
    }
  }

  .img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .removeBtn {
    position: absolute;
    right: 0;
    top: 0;
    border: none;
    cursor: pointer;
    padding: 6px 8px;
    background-color: rgba(0, 0, 0, 0.6);
    color: rgba(255, 255, 255, 0.9);
    outline: none;
    transition: background-color 0.2s ease;
    line-height: 0;
    display: none;

    svg {
      height: .7em;
    }

    &:hover {
      background-color: rgba(0, 0, 0, 0.7);
    }
    &:active {
      background-color: rgba(0, 0, 0, 0.8);
    }
  }
  .icon {
    // position: absolute;
    // font-size: 16px;
    width: auto;
    height: 66%;
  }
}

@control-btn-width: @height-toolbar * .26;
.controlBtn {
  display: flex;
  -webkit-app-region: no-drag;
  align-items: center;
  padding: 0 @control-btn-width;
  flex-direction: row-reverse;
  // height: @height-toolbar * .7;
  transition: opacity @transition-normal;
  opacity: .5;
  &:hover {
    opacity: .8;
    .controlBtnIcon {
      opacity: 1;
    }
  }

  button {
    display: flex;
    position: relative;
    background: none;
    border: none;
    outline: none;
    padding: 1px;
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: center;
    width: @control-btn-width;
    height: @control-btn-width;
    border-radius: 50%;
    color: var(--color-font);
    + button {
      margin-right: (@control-btn-width / 2);
    }

    &.hide {
      background-color: var(--color-btn-hide);
    }
    &.min, &.fullscreenExit {
      background-color: var(--color-btn-min);
    }
    // &.max {
    //   background-color: var(--color-btn-max);
    // }
    &.close {
      background-color: var(--color-btn-close);
    }
  }
}

.controlBtnIcon {
  opacity: 0;
  transition: opacity 0.2s ease-in-out;
}

.note {
  padding: 8px 15px;
  font-size: 13px;
  line-height: 1.25;
  color: var(--color-font);
  // p {
  //   + p {
  //     margin-top: 5px;
  //   }
  // }
}
.footer {
  padding: 15px;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  font-size: 14px;
  .subContent {
    display: flex;
    flex-flow: row nowrap;
    align-items: center;
    gap: 10px;
  }

  .checkbox {
    flex: none;
  }
  .input {
    max-width: 150px;
    flex: 0 1 auto;
  }
}


.btn {
  // box-sizing: border-box;
  // margin-left: 15px;
  // margin-bottom: 15px;
  // height: 36px;
  // line-height: 36px;
  // padding: 0 10px !important;
  min-width: 70px;
  // .mixin-ellipsis-1();
}

</style>
