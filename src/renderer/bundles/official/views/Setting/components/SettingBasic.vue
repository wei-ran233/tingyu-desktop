<template lang="pug">
dt#basic {{ $t('setting__basic') }}
dd
  div
    .gap-top
      base-checkbox(id="setting_show_animate" :model-value="appSetting['common.isShowAnimation']" :label="$t('setting__basic_show_animation')" @update:model-value="updateSetting({'common.isShowAnimation': $event})")
    .gap-top
      base-checkbox(id="setting_animate" :disabled="!appSetting['common.isShowAnimation']" :model-value="appSetting['common.randomAnimate']" :label="$t('setting__basic_animation')" @update:model-value="updateSetting({'common.randomAnimate': $event})")
    .gap-top
      base-checkbox(id="setting_start_in_fullscreen" :model-value="appSetting['common.startInFullscreen']" :label="$t('setting__basic_start_in_fullscreen')" @update:model-value="updateSetting({'common.startInFullscreen': $event})")
    .gap-top
      base-checkbox(id="setting_to_tray" :model-value="appSetting['tray.enable']" :label="$t('setting__basic_to_tray')" @update:model-value="updateSetting({'tray.enable': $event})")
    .p.gap-top
      base-btn.btn(min @click="isShowPlayTimeoutModal = true") {{ $t('setting__play_timeout')}} {{ timeLabel ? ` (${timeLabel})` : '' }}

dd
  h3#basic_theme {{ $t('setting__basic_theme') }}
  div
    router-link.theme-studio-link(to="/setting?name=ThemeSettings") 主题与外观设置
    ul(:class="$style.theme")
      li(v-for="theme in themeList" :key="theme.id" :aria-label="theme.name" :style="theme.styles" :class="[$style.themeItem, {[$style.active]: themeId == theme.id}]" @click="toggleTheme(theme)" @contextmenu="handleEditTheme(theme)")
        div(:class="$style.bg")
        span(:class="$style.label") {{ theme.name }}
      li(v-if="showAllTheme || themeId == 'auto'" :aria-label="$t('theme_auto_tip')" :style="autoTheme" :class="[$style.themeItem, $style.auto, {[$style.active]: themeId == 'auto'}]" @click="handleSetThemeAuto" @contextmenu="isShowThemeSelectorModal = true")
        div(:class="$style.bg")
          div(:class="$style.bgContent")
            div(:class="$style.light")
            div(:class="$style.dark")
        span(:class="$style.label") {{ $t('theme_auto') }}
      li(v-if="showAllTheme" :aria-label="$t('theme_add')" :class="[$style.themeItem, $style.add]" @click="handleEditTheme()")
        div(:class="$style.bg")
          div(:class="$style.bgContent")
            svg-icon(:class="$style.icon" name="plus")
        span(:class="$style.label") {{ $t('theme_add') }}
      li(v-if="!showAllTheme" :aria-label="$t('theme_more_btn_show')" :class="[$style.themeItem, $style.moreThme]" @click="showAllTheme = true")
        span(:class="$style.label") {{ $t('theme_more_btn_show') }}
        svg-icon(name="angle-right-solid" :class="$style.activeIcon")

dd
  h3#basic_source {{ $t('setting__basic_source') }}
  div
    .gap-top(v-for="item in apiSources" :key="item.id")
      base-checkbox(
        :id="`setting_api_source_${item.id}`" name="setting_api_source"
        need :model-value="appSetting['common.apiSource']" :disabled="item.disabled" :value="item.id" :aria-label="item.label" @update:model-value="updateSetting({'common.apiSource': $event})")
        span(:class="$style.sourceLabel")
          | {{ item.name }}
          span(v-if="item.desc" :class="$style.desc") {{ item.desc }}
          span(v-if="item.statusLabel" :class="$style.status") {{ item.statusLabel }}
    .p.gap-top
      base-btn.btn(min @click="isShowUserApiModal = true") {{ $t('setting__basic_source_user_api_btn') }}

dd
  h3#basic_window_size {{ $t('setting__basic_window_size') }}
  div
    base-checkbox.gap-left(
      v-for="item in windowSizeList" :id="`setting_window_size_${item.id}`" :key="item.id"
      name="setting_window_size" need :model-value="appSetting['common.windowSizeId']" :disabled="isFullscreen" :value="item.id" :label="$t('setting__basic_window_size_' + item.name)"
      @update:model-value="updateSetting({'common.windowSizeId': $event})")

dd
  h3#basic_page_scale 界面缩放
  div
    base-checkbox.gap-left(
      v-for="scale in [0.75, 0.85, 1, 1.15, 1.25, 1.5]" :id="`setting_page_scale_${scale}`" :key="scale"
      name="setting_page_scale" need :model-value="appSetting['common.pageScale']" :value="scale" :label="`${Math.round(scale * 100)}%`"
      @update:model-value="updateSetting({'common.pageScale': $event})")

dd
  h3#basic_font_size {{ $t('setting__basic_font_size') }}
  div
    //- base-selection.gap-teft(:list="fontSizeList" :model-value="appSetting['common.fontSize']" @update:model-value="updateSetting({'common.fontSize': $event})")
    base-checkbox.gap-left(
      v-for="item in fontSizeList" :id="`setting_basic_font_size_${item.id}`" :key="item.id"
      name="setting_basic_font_size" need :model-value="appSetting['common.fontSize']" :value="item.id"
      :label="item.label" :disabled="isFullscreen" @update:model-value="updateSetting({'common.fontSize': $event})")

dd
  h3#basic_font {{ $t('setting__basic_font') }}
  div(style="--selection-width: 12rem;")
    base-selection.gap-left(:list="fontList" :model-value="fonts[0]" item-key="id" item-name="label" @update:model-value="updateFonts($event, fonts[1])")
    base-selection.gap-left(v-if="fonts[0]" :list="fontList" :model-value="fonts[1]" item-key="id" item-name="label" @update:model-value="updateFonts(fonts[0], $event)")
    //- base-selection.gap-teft(:list="fontList" :model-value="appSetting['common.font']" item-key="id" item-name="label" @update:model-value="updateSetting({'common.font': $event})")

dd
  h3#basic_lang {{ $t('setting__basic_lang') }}
  div
    base-checkbox.gap-left(
      v-for="item in langList" :id="`setting_lang_${item.locale}`" :key="item.locale" name="setting_lang"
      need :model-value="appSetting['common.langId']" :value="item.locale" :label="item.name" @update:model-value="updateSetting({'common.langId': $event})")

dd
  h3#basic_sourcename {{ $t('setting__basic_sourcename') }}
  div
    base-checkbox.gap-left(
      v-for="item in sourceNameTypes" :id="`setting_abasic_sourcename_${item.id}`" :key="item.id"
      name="setting_basic_sourcename" need :model-value="appSetting['common.sourceNameType']" :value="item.id" :label="item.label" @update:model-value="updateSetting({'common.sourceNameType': $event})")
dd
  h3#basic_control_btn_position {{ $t('setting__basic_control_btn_position') }}
  div
    base-checkbox.gap-left(
      v-for="item in controlBtnPositionList" :id="`setting_basic_control_btn_position_${item.id}`" :key="item.id"
      name="setting_basic_control_btn_position" need :model-value="appSetting['common.controlBtnPosition']" :value="item.id" :label="item.name" @update:model-value="updateSetting({'common.controlBtnPosition': $event})")
dd
  h3#basic_playbar_progress_style {{ $t('setting__basic_playbar_progress_style') }}
  div
    base-checkbox.gap-left(
      id="setting_basic_playbar_progress_style_mini" name="setting_basic_playbar_progress_style"
      need :model-value="appSetting['common.playBarProgressStyle']" value="mini" :label="$t('setting__basic_playbar_progress_style_mini')" @update:model-value="updateSetting({'common.playBarProgressStyle': $event})")
    base-checkbox.gap-left(
      id="setting_basic_playbar_progress_style_middle" name="setting_basic_playbar_progress_style"
      need :model-value="appSetting['common.playBarProgressStyle']" value="middle" :label="$t('setting__basic_playbar_progress_style_middle')" @update:model-value="updateSetting({'common.playBarProgressStyle': $event})")
    base-checkbox.gap-left(
      id="setting_basic_playbar_progress_style_full" name="setting_basic_playbar_progress_style"
      need :model-value="appSetting['common.playBarProgressStyle']" value="full" :label="$t('setting__basic_playbar_progress_style_full')" @update:model-value="updateSetting({'common.playBarProgressStyle': $event})")

ThemeSelectorModal(v-model="isShowThemeSelectorModal")
ThemeEditModal(v-model="isShowThemeEditModal" :theme-id="editThemeId" @submit="handleRefreshTheme")
play-timeout-modal(v-model="isShowPlayTimeoutModal")
user-api-modal(v-model="isShowUserApiModal")
</template>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.theme {
  display: flex;
  flex-flow: row wrap;
  // padding: 0 15px;
  margin-bottom: -20px;

  .themeItem {
    display: flex;
    flex-flow: column nowrap;
    align-items: center;
    cursor: pointer;
    // color: var(--color-primary);
    margin-right: 8px;
    transition: .3s ease;
    transition-property: color, opacity;
    margin-bottom: 18px;
    width: 86px;

    &:hover {
      opacity: .7;
    }

    &:last-child {
      margin-right: 0;
    }

    &.active {
      color: var(--color-primary-font-active);
      .bg {
        border-color: var(--color-primary-font-active);
      }

      &:hover {
        opacity: 1;
      }
    }

    .bg {
      display: block;
      width: 36px;
      height: 36px;
      margin-bottom: 5px;
      border: 2Px solid transparent;
      padding: 2Px;
      transition: border-color .3s ease;
      border-radius: 5px;
      &:after {
        display: block;
        content: ' ';
        width: 100%;
        height: 100%;
        border-radius: @radius-border;
        background-position: center;
        background-size: cover;
        background-repeat: no-repeat;
        background-color: var(--color-primary-theme);
        background-image: var(--background-image-theme);
      }
    }

    .label {
      width: 100%;
      text-align: center;
      height: 1.2em;
    }

    &.auto {

      &.active {
        color: var(--color-primary-font-active);
        .bg {
          border-color: var(--color-primary-font-active);
        }
      }

      >.bg {
        &:after {
          content: none;
        }
      }
      .bgContent {
        position: relative;
        height: 100%;
        overflow: hidden;
        border-radius: 5px;
      }
      .light, .dark {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        &:after {
          display: block;
          content: ' ';
          width: 100%;
          height: 100%;
          background-position: center;
          background-size: cover;
          background-repeat: no-repeat;
        }
      }
      .light {
        &:after {
          clip-path: polygon(0 0, 100% 0, 0 100%);
        }
        svg {
          fill: var(--color-primary-theme-light);
        }
        &:after {
          background-color: var(--color-primary-theme-light);
          background-image: var(--background-image-theme-light);
        }
      }
      .dark {
        &:after {
          clip-path: polygon(0 100%, 100% 0, 100% 100%);
        }
        svg {
          fill: var(--color-primary-theme-dark);
        }
        &:after {
          background-color: var(--color-primary-theme-dark);
          background-image: var(--background-image-theme-dark);
        }
      }
    }

    &.add {
      >.bg {
        &:after {
          content: none;
        }
        .bgContent {
          transition: .3s ease;
          transition-property: border, color;
          box-sizing: border-box;
          border: 1Px dashed var(--color-primary-light-100-alpha-300);
          color: var(--color-primary-light-100-alpha-300);
          position: relative;
          height: 100%;
          overflow: hidden;
          border-radius: 5px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .icon {
          // position: absolute;
          // font-size: 16px;
          width: 66%;
          height: auto;
        }
      }
      .label {
        color: var(--color-primary-dark-100-alpha-300);
      }
    }

    &.moreThme {
      flex-direction: row;
      width: auto;
      gap: 5px;
      color: var(--color-primary-font-active);
      .label {
        height: auto;
      }
    }
  }
}

.sourceLabel {
  flex: auto;
  margin-left: 5px;
  line-height: 1.5;
  cursor: pointer;

  .desc {
    color: var(--color-500);
    font-size: 12px;
    margin-left: 5px;
  }

  .status {
    margin-left: 5px;
  }
}

</style>
