<template>
  <div :class="$style.container">
    <material-online-list
      ref="listRef"
      :page="listInfo.page"
      :limit="listInfo.limit"
      :total="listInfo.total"
      :list="listInfo.list"
      :no-item="listInfo.noItemLabel"
      :source-tag="sourceId == 'all'"
      check-api-source
      @toggle-page="handleTogglePage"
      @play-list="handlePlayList"
    />
  </div>
</template>

<script lang="ts" src="@renderer/bundles/official/features/Search/MusicList/index.ts"></script>


<style lang="less" module>
.container {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
}

.list {
  overflow: hidden;
  height: 100%;
  flex: auto;
}

</style>
