<template lang="pug">
dt#download {{ $t('setting__download') }}
dd
  .gap-top
    base-checkbox(id="setting_download_enable" :model-value="appSetting['download.enable']" :label="$t('setting__download_enable')" @update:model-value="updateSetting({'download.enable': $event})")
  .gap-top
    base-checkbox(id="setting_download_on_play" :disabled="!appSetting['download.enable']" :model-value="appSetting['download.isDownloadOnPlay']" :label="$t('setting__download_on_play')" @update:model-value="updateSetting({'download.isDownloadOnPlay': $event})")
  .gap-top
    base-checkbox(id="setting_download_skip_exist_file" :model-value="appSetting['download.skipExistFile']" :label="$t('setting__download_skip_exist_file')" @update:model-value="updateSetting({'download.skipExistFile': $event})")
  .gap-top
    base-checkbox(id="setting_download_save_group_list_name" :model-value="appSetting['download.isSavePathGroupByListName']" :label="$t('setting_download_save_group_list_name')" @update:model-value="updateSetting({'download.isSavePathGroupByListName': $event})")
dd(:aria-label="$t('setting__download_path_title')")
  h3#download_path {{ $t('setting__download_path') }}
  div
    .p
      | {{ $t('setting__download_path_label') }}
      span.auto-hidden.hover(:class="$style.savePath" :aria-label="$t('setting__download_path_open_label')" @click="openDirInExplorer(appSetting['download.savePath'])") {{ appSetting['download.savePath'] }}
    .p
      base-btn.btn(min @click="handleChangeSavePath") {{ $t('setting__download_path_change_btn') }}

dd
  h3#download_max_num
    | {{ $t('setting__download_max_num') }}
    svg-icon(class="help-icon" name="help-circle-outline" :aria-label="$t('setting__download_max_num_tooltip')")
  div
    p
      base-selection.gap-left(:class="$style.selectWidth" :model-value="appSetting['download.maxDownloadNum']" :list="maxNums" item-key="id" item-name="id" @change="handleUpdateMaxNum")

dd
  h3#download_use_other_source
    | {{ $t('setting__download_use_other_source') }}
    svg-icon(class="help-icon" name="help-circle-outline" :aria-label="$t('setting__download_use_other_source_tip')")
  div
    base-checkbox(id="setting_download_isUseOtherSource" :model-value="appSetting['download.isUseOtherSource']" :label="$t('setting__is_enable')" @update:model-value="updateSetting({'download.isUseOtherSource': $event})")
  div
dd(:aria-label="$t('setting__download_name_title')")
  h3#download_name {{ $t('setting__download_name') }}
  div
    base-checkbox.gap-left(
        v-for="item in musicNames" :id="`setting_download_musicName_${item.value}`" :key="item.value" name="setting_download_musicName" :value="item.value"
        need :model-value="appSetting['download.fileName']" :label="item.name" @update:model-value="updateSetting({'download.fileName': $event})")
dd
  h3#download_data_embed {{ $t('setting__download_data_embed') }}
  .gap-top
    base-checkbox(id="setting_download_isEmbedPic" :model-value="appSetting['download.isEmbedPic']" :label="$t('setting__download_embed_pic')" @update:model-value="updateSetting({'download.isEmbedPic': $event})")
  .gap-top
    base-checkbox(id="setting_download_isEmbedLyric" :model-value="appSetting['download.isEmbedLyric']" :label="$t('setting__download_embed_lyric')" @update:model-value="updateSetting({'download.isEmbedLyric': $event})")
  .gap-top
    base-checkbox(id="setting_download_isEmbedLyricT" :disabled="!appSetting['download.isEmbedLyric']" :model-value="appSetting['download.isEmbedLyricT']" :label="$t('setting__download_embed_tlyric')" @update:model-value="updateSetting({'download.isEmbedLyricT': $event})")
  .gap-top
    base-checkbox(id="setting_download_isEmbedLyricR" :disabled="!appSetting['download.isEmbedLyric']" :model-value="appSetting['download.isEmbedLyricR']" :label="$t('setting__download_embed_rlyric')" @update:model-value="updateSetting({'download.isEmbedLyricR': $event})")
  .gap-top
    base-checkbox(id="setting_download_isEmbedLyricLx" :disabled="!appSetting['download.isEmbedLyric']" :model-value="appSetting['download.isEmbedLyricLx']" :label="$t('setting__download_embed_lxlyric')" @update:model-value="updateSetting({'download.isEmbedLyricLx': $event})")
dd(:aria-label="$t('setting__download_lyric_title')")
  h3#download_lyric {{ $t('setting__download_lyric') }}
  .gap-top
    base-checkbox(id="setting_download_isDownloadLrc" :model-value="appSetting['download.isDownloadLrc']" :label="$t('setting__is_enable')" @update:model-value="updateSetting({'download.isDownloadLrc': $event})")
  .gap-top
    base-checkbox(id="setting_download_isDownloadTLrc" :disabled="!appSetting['download.isDownloadLrc']" :model-value="appSetting['download.isDownloadTLrc']" :label="$t('setting__download_tlyric')" @update:model-value="updateSetting({'download.isDownloadTLrc': $event})")
  .gap-top
    base-checkbox(id="setting_download_isDownloadRLrc" :disabled="!appSetting['download.isDownloadLrc']" :model-value="appSetting['download.isDownloadRLrc']" :label="$t('setting__download_rlyric')" @update:model-value="updateSetting({'download.isDownloadRLrc': $event})")
  .gap-top
    base-checkbox(id="setting_download_isDownloadLxLrc" :disabled="!appSetting['download.isDownloadLrc']" :model-value="appSetting['download.isDownloadLxLrc']" :label="$t('setting__download_lxlyric')" @update:model-value="updateSetting({'download.isDownloadLxLrc': $event})")
dd
  h3#download_lyric_format
    | {{ $t('setting__download_lyric_format') }}
    svg-icon(class="help-icon" name="help-circle-outline" :aria-label="$t('setting__download_lyric_format_tip')")
  div
    base-checkbox.gap-left(
      v-for="item in lrcFormatList" :id="`setting_download_lrcFormat_${item.id}`" :key="item.id"
      name="setting_download_lrcFormat" need :model-value="appSetting['download.lrcFormat']" :value="item.id" :label="item.name"
      @update:model-value="updateSetting({'download.lrcFormat': $event})")
</template>


<style lang="less" module>
// .savePath {
//   font-size: 12px;
// }
.selectWidth {
  width: 60px;
}
</style>
