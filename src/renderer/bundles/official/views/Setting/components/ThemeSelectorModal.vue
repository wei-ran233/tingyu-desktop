<template>
  <material-modal :show="modelValue" bg-close="bg-close" teleport="#view" @close="$emit('update:modelValue', false)">
    <main :class="$style.main">
      <h2>{{ $t('theme_selector_modal__title') }}</h2>
      <div class="scroll" :class="$style.content">
        <div>
          <h3>{{ $t('theme_selector_modal__light_title') }}</h3>
          <ul :class="$style.theme">
            <li
              v-for="theme in themeInfo.themeLights" :key="theme.id"
              :style="theme.styles" :aria-label="theme.name"
              :class="[{[$style.active]: appSetting['theme.lightId'] == theme.id}]" @click="setLightId(theme.id)"
            >
              <span :class="$style.bg" />
              <label>{{ theme.name }}</label>
            </li>
          </ul>
        </div>
        <div>
          <h3>{{ $t('theme_selector_modal__dark_title') }}</h3>
          <ul :class="$style.theme">
            <li
              v-for="theme in themeInfo.themeDarks" :key="theme.id"
              :style="theme.styles" :aria-label="theme.name"
              :class="[{[$style.active]: appSetting['theme.darkId'] == theme.id}]" @click="setDarkId(theme.id)"
            >
              <span :class="$style.bg" />
              <label>{{ theme.name }}</label>
            </li>
          </ul>
        </div>
      </div>
      <div :class="$style.note">
        <p>{{ $t('theme_selector_modal__title_tip') }}</p>
      </div>
    </main>
  </material-modal>
</template>

<script lang="js" src="@renderer/bundles/official/features/Setting/components/ThemeSelectorModal.js"></script>

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
  padding: 15px;
  display: flex;
  flex-flow: column nowrap;
  gap: 15px;
}
.theme {
  display: flex;
  flex-flow: row wrap;
  // padding: 0 15px;

  li {
    display: flex;
    flex-flow: column nowrap;
    align-items: center;
    cursor: pointer;
    // color: var(--color-primary);
    margin-right: 4px;
    transition: color .3s ease;
    margin-bottom: 15px;
    width: 86px;

    &:last-child {
      margin-right: 0;
    }

    &.active {
      color: var(--color-primary-theme);
      .bg {
        border-color: var(--color-primary-theme);
      }
    }

    .bg {
      display: block;
      width: 36px;
      height: 36px;
      margin-bottom: 5px;
      border: 2px solid transparent;
      padding: 2px;
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

    label {
      width: 100%;
      text-align: center;
      height: 1.2em;
      font-size: 14px;
    }
  }
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

</style>
