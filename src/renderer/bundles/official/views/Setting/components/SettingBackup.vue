<template lang="pug">
dt#backup {{ $t('setting__backup') }}
dd
  h3#backup_part {{ $t('setting__backup_part') }}
  div
    base-btn.btn.gap-left(min @click="handleImportPlayList") {{ $t('setting__backup_part_import_list') }}
    base-btn.btn.gap-left(min @click="handleExportPlayList") {{ $t('setting__backup_part_export_list') }}
    base-btn.btn.gap-left(min @click="handleImportSetting") {{ $t('setting__backup_part_import_setting') }}
    base-btn.btn.gap-left(min @click="handleExportSetting") {{ $t('setting__backup_part_export_setting') }}
dd
  h3#backup_all {{ $t('setting__backup_all') }}
  div
    base-btn.btn.gap-left(min @click="handleImportAllData") {{ $t('setting__backup_all_import') }}
    base-btn.btn.gap-left(min @click="handleExportAllData") {{ $t('setting__backup_all_export') }}
dd
  h3#backup_other {{ $t('setting__backup_other') }}
  div
    base-btn.btn.gap-left(min @click="handleExportPlayListToText") {{ $t('setting__backup_other_export_list_text') }}
    base-btn.btn.gap-left(min @click="handleExportPlayListToCsv") {{ $t('setting__backup_other_export_list_csv') }}
</template>


<style lang="less" module>
.savePath {
  font-size: 12px;
}
</style>
