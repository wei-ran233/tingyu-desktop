<template>
  <div :class="$style.container">
    <header class="music-page-heading"><h2>{{ $t('search') }}</h2><span v-if="searchText" class="music-page-count">{{ searchText }}</span></header>
    <div class="music-page-toolbar" :class="$style.header">
      <base-tab v-model="source" :list="sources" @change="handleSourceChange" />
      <base-tab v-model="searchType" :list="searchTypes" @change="handleTypeChange" />
    </div>
    <div :class="$style.main">
      <song-list-list v-if="searchType == 'songlist'" v-show="searchText" :page="page" :source-id="source" />
      <collection-surface
        v-else-if="searchText"
        surface-id="search-music"
        :params="{ source: String(source), text: String(searchText), page: String(page) }"
      >
        <music-list :page="page" :source-id="source" />
      </collection-surface>
      <blank-view :visible="!searchText" :source="source" />
    </div>
  </div>
</template>


<style lang="less" module>
.container {
  display: flex;
  flex-flow: column nowrap;
  min-width: 0;
}

.header {
  // padding: 5px 0;
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  justify-content: space-between;
  min-width: 0;
  gap: 8px;
}

.main {
  position: relative;
  flex: auto;
  min-width: 0;
  min-height: 0;
}

@media (max-width: 920px) {
  .header {
    flex-flow: column nowrap;
    align-items: stretch;
    padding-top: 2px;
  }
}
</style>
