<template>
<theme-page identity="tide" kind="search" title="去听，未曾听过的。" :subtitle="searchText ? '正在寻找：' + searchText : undefined">
  <template #controls><base-tab v-model="source" :list="sources" @change="handleSourceChange" /><base-tab v-model="searchType" :list="searchTypes" @change="handleTypeChange" /></template>
  <song-list-list v-if="searchType === 'songlist'" v-show="searchText" :page="page" :source-id="source" />
  <collection-surface v-else-if="searchText" surface-id="search-music" :params="{ source: String(source), text: String(searchText), page: String(page) }"><music-list :page="page" :source-id="source" /></collection-surface>
  <blank-view v-else :visible="!searchText" :source="source" />
</theme-page>
</template>
