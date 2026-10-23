<template lang="pug">
dt#other {{ $t('setting__other') }}
dd
  div
    .gap-top
      base-checkbox(id="setting_transparent_window" :model-value="appSetting['common.transparentWindow']" :label="$t('setting__other_transparent_window')" @update:model-value="updateSetting({'common.transparentWindow': $event})")
      svg-icon(class="help-icon" name="help-circle-outline" :aria-label="$t('setting__other_transparent_window_tip')")

dd
  h3#other_tray_theme {{ $t('setting__other_tray_theme') }}
  div
    base-checkbox.gap-left(
      v-for="item in trayThemeList" :id="'setting_tray_theme_' + item.id" :key="item.id" :model-value="appSetting['tray.themeId']" name="setting_tray_theme"
      need :label="item.label" :value="item.id" @update:model-value="updateSetting({'tray.themeId': $event})")
dd
  h3#other_resource_cache
    | {{ $t('setting__other_resource_cache') }}
    svg-icon(class="help-icon" name="help-circle-outline" :aria-label="$t('setting__other_resource_cache_tip')")
  div
    .p
      | {{ $t('setting__other_resource_cache_label') }}
      span.auto-hidden {{ cacheSize }}
    .p
      base-btn.btn(min :disabled="isDisabledResourceCacheClear" @click="clearResourceCache") {{ $t('setting__other_resource_cache_clear_btn') }}

dd
  h3#other_other_source {{ $t('setting__other_other_cache') }}
  div
    .p
      | {{ $t('setting__other_other_source_label') }}
      span.auto-hidden {{ otherSourceCount }}
    .p
      | {{ $t('setting__other_music_url_label') }}
      span.auto-hidden {{ musicUrlCount }}
    .p
      | {{ $t('setting__other_lyric_raw_label') }}
      span.auto-hidden {{ lyricRawCount }}
    .p
      base-btn.btn(min :disabled="isDisabledOtherSourceCacheClear" @click="handleClearOtherSourceCache") {{ $t('setting__other_other_source_clear_btn') }}
      base-btn.btn(min :disabled="isDisabledMusicUrlCacheClear" @click="handleClearMusicUrlCache") {{ $t('setting__other_music_url_clear_btn') }}
      base-btn.btn(min :disabled="isDisabledLyricRawCacheClear" @click="handleClearLyricRawCache") {{ $t('setting__other_lyric_raw_clear_btn') }}

dd
  h3#other_lyric_edited {{ $t('setting__other_dislike_list') }}
  div
    .p
      | {{ $t('setting__other_dislike_list_label') }}
      span.auto-hidden {{ dislikeRuleCount }}
    .p
      base-btn.btn(min @click="isShowDislikeList = true") {{ $t('setting__other_dislike_list_show_btn') }}
  DislikeListModal(v-model="isShowDislikeList")

dd
  h3#other_lyric_edited {{ $t('setting__other_lyric_edited_cache') }}
  div
    .p
      | {{ $t('setting__other_lyric_edited_label') }}
      span.auto-hidden {{ lyricEditedCount }}
    .p
      base-btn.btn(min :disabled="isDisabledLyricEditedCacheClear" @click="handleClearLyricEditedCache") {{ $t('setting__other_lyric_edited_clear_btn') }}

dd
  h3#other_lyric_edited {{ $t('setting__other_listdata') }}
  div
    .p
      base-btn.btn(min @click="handleClearListData") {{ $t('setting__other_listdata_clear_btn') }}

</template>


