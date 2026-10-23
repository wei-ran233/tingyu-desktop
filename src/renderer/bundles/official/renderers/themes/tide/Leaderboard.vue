<template>
<theme-page identity="tide" kind="leaderboard" title="正在涌来的声音。">
  <template #controls><base-selection :model-value="source" :list="sourceList" item-key="id" item-name="name" @update:model-value="handleToggleSource" /></template>
  <template #navigation><BoardList ref="boardListRef" :board-id="boardId" :source="source" @show-menu="$refs.musicListRef?.hideMenu()" /></template>
  <collection-surface surface-id="leaderboard-music" :params="{ source: String(source || ''), boardId: String(boardId || '') }"><MusicList ref="musicListRef" :source="source" :board-id="boardId" @show-menu="$refs.boardListRef?.hideMenu()" /></collection-surface>
</theme-page>
</template>
