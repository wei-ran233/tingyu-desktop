<template lang="pug">
dt#search {{ $t('setting__search') }}
dd
  .gap-top
    base-checkbox(id="setting_search_showHot_enable" :model-value="appSetting['search.isShowHotSearch']" :label="$t('setting__search_hot')" @update:model-value="updateSetting({'search.isShowHotSearch': $event})")
  .gap-top
    base-checkbox(id="setting_search_showHistory_enable" :model-value="appSetting['search.isShowHistorySearch']" :label="$t('setting__search_history')" @update:model-value="updateSetting({'search.isShowHistorySearch': $event})")
  .gap-top
    base-checkbox(id="setting_search_focusSearchBox_enable" :model-value="appSetting['search.isFocusSearchBox']" :label="$t('setting__search_focus_search_box')" @update:model-value="updateSetting({'search.isFocusSearchBox': $event})")

</template>


