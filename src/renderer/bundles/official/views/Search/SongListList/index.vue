<template>
  <div :class="$style.container">
    <SongList ref="listRef" :list-info="listInfo" :visible-source="sourceId == 'all'" @toggle-page="togglePage" />
  </div>
</template>

<script lang="ts" src="@renderer/bundles/official/features/Search/SongListList/index.ts"></script>


<style lang="less" module>
.container {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  padding-top: 5px;
}

// .list {
//   overflow: hidden;
//   height: 100%;
//   flex: auto;
// }

</style>
