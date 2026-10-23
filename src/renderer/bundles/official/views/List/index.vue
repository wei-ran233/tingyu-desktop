<template>
  <div id="my-list" :class="$style.container" @click="handleContainerClick">
    <MyList ref="myList" :list-id="listId" @show-menu="$refs.musicList?.handleMenuClick()" />
    <collection-surface surface-id="list-music" :params="{ listId: String(listId || '') }">
      <MusicList ref="musicList" :list-id="listId" @show-menu="$refs.myList.handleMenuClick()" />
    </collection-surface>
  </div>
</template>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  overflow: hidden;
  height: 100%;
  display: flex;
  position: relative;
  min-width: 0;
}

</style>
