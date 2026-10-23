<template lang="pug">
dt#update {{ $t('setting__update') }}
dd
  .gap-top
    base-checkbox(id="setting__update_tryAutoUpdate" :model-value="appSetting['common.tryAutoUpdate']" :label="$t('setting__update_try_auto_update')" @update:model-value="updateSetting({'common.tryAutoUpdate': $event})")
  .gap-top
    base-checkbox(id="setting__update_showChangeLog" :model-value="appSetting['common.showChangeLog']" :label="$t('setting__update_show_change_log')" @update:model-value="updateSetting({'common.showChangeLog': $event})")
  .gap-top
    .gap-top
      .p.small(@click="handleOpenDevTools") {{ $t('setting__update_current_label') }}{{ versionInfo.version }}
      .p.small(v-if="commit_id")
        | {{ $t('setting__update_commit_id') }}
        span.select {{ commit_id }}
      .p.small(v-if="commit_date") {{ $t('setting__update_commit_date') }}{{ commit_date }}

    .p.small.gap-top
      | {{ $t('setting__update_latest_label') }}{{ versionInfo.newVersion && versionInfo.newVersion.version != '0.0.0' ? versionInfo.newVersion.version : $t('setting__update_unknown') }}
    .p.small(v-if="downloadProgress" style="line-height: 1.5;")
      | {{ $t('setting__update_downloading') }}
      br
      | {{ $t('setting__update_progress') }}{{ downloadProgress }}
    template(v-if="versionInfo.newVersion || versionInfo.isLatest || versionInfo.isUnknown")
      .p(v-if="versionInfo.isLatest")
        span {{ $t('setting__update_latest') }}
      .p(v-else-if="versionInfo.isUnknown")
        span {{ $t('setting__update_unknown_tip') }}
      .p(v-else-if="versionInfo.status != 'downloading'")
        span {{ $t('setting__update_new_version') }}
      .p
        base-btn.btn.gap-left(min data-update-open @click="showUpdateModal") {{ $t('setting__update_open_version_modal_btn') }}
    .p.small(v-else-if="versionInfo.status =='checking'") {{ $t('setting__update_checking') }}
</template>


<style lang="less" module>
// .savePath {
//   font-size: 12px;
// }
</style>
