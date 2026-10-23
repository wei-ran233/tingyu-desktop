<template>
<theme-page identity="petals" kind="songlists" title="给心情选一张。">
  <template #controls><tag-list :source="source" :tag-id="tagId" :sort-id="sortId" /><sort-tab :source="source" :tag-id="tagId" :sort-id="sortId" /><base-btn outline min @click="visibleOpenSongListModal = true">{{ $t('songlist__import_input_show_btn') }}</base-btn><base-selection :model-value="source" :list="sourceList" item-key="id" item-name="name" @update:model-value="handleToggleSource" /></template>
  <list-view :source="source" :tag-id="tagId" :sort-id="sortId" :page="page" /><open-list-modal v-model="visibleOpenSongListModal" :source-list="sourceList" />
</theme-page>
</template>
