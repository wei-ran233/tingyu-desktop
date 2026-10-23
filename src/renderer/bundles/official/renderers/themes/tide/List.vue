<template>
<theme-page identity="tide" kind="library" title="你的声音收藏。">
  <template #navigation><MyList ref="myList" :list-id="listId" @show-menu="$refs.musicList?.handleMenuClick()" /></template>
  <collection-surface surface-id="list-music" :params="{ listId: String(listId || '') }"><MusicList ref="musicList" :list-id="listId" @show-menu="$refs.myList.handleMenuClick()" /></collection-surface>
</theme-page>
</template>
