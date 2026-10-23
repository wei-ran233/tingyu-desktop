<template>
<theme-page identity="signal" kind="library" title="音乐资料库">
  <template #navigation><MyList ref="myList" :list-id="listId" @show-menu="$refs.musicList?.handleMenuClick()" /></template>
  <collection-surface surface-id="list-music" :params="{ listId: String(listId || '') }"><MusicList ref="musicList" :list-id="listId" @show-menu="$refs.myList.handleMenuClick()" /></collection-surface>
</theme-page>
</template>
