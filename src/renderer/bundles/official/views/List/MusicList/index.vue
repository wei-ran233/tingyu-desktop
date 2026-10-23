<template>
  <div data-library-tracks :class="$style.list">
    <!-- Header Banner Area -->
    <div data-library-banner :class="$style.headerBanner">
      <div
        :class="$style.bannerCover"
        :style="headerCover ? { backgroundImage: `url(${headerCover})` } : {}"
      >
        <div v-if="!headerCover" :class="$style.bannerDefaultCover">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 247.498 247.498" space="preserve" style="width: 44px; height: 44px; fill: currentColor;">
            <use :xlink:href="$themeIconRef('#icon-musicFolder')" />
          </svg>
        </div>
        <span v-if="list.length" :class="$style.playCountBadge">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 14v-3a8 8 0 0 1 16 0v3M4 13h3v8H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Zm16 0h-3v8h3a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z" /></svg> {{ list.length }}
        </span>
      </div>

      <div :class="$style.bannerMain">
        <div :class="$style.bannerTitleRow">
          <h1 :class="$style.bannerTitle" :title="currentListName">{{ currentListName }}</h1>
        </div>

        <div data-library-meta :class="$style.bannerMetaRow">
          <span :class="$style.bannerAuthor">
            {{ $themeName || 'Tingyu' }}
          </span>
          <span v-if="currentListMeta?.subtitle" :class="$style.bannerSubTitle">
            {{ currentListMeta.subtitle }}
          </span>
        </div>

        <div v-if="currentListMeta?.tags && currentListMeta.tags.length" data-library-tags :class="$style.bannerTagsRow">
          <span
            v-for="(tag, idx) in currentListMeta.tags"
            :key="idx"
            :class="$style.tagBadge"
          >
            {{ tag }}
          </span>
        </div>

        <div :class="$style.bannerActionsRow">
          <button
            v-if="displayList.length"
            :class="$style.primaryRedBtn"
            @click="handlePlayAll"
          >
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" space="preserve" style="width: 13px; height: 13px; margin-right: 4px; fill: currentColor; vertical-align: -1px;">
              <use :xlink:href="$themeIconRef('#icon-play-outline')" />
            </svg>
            {{ $t('list__play') }}全部
          </button>

          <base-btn
            v-if="listId !== LIST_IDS.LOCAL"
            :class="$style.secondaryBtn"
            @click="handleBatchDownload"
          >
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 13px; height: 13px; margin-right: 4px; fill: currentColor; vertical-align: -1px;">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
            </svg>
            下载
          </base-btn>

          <base-btn
            :class="[$style.secondaryBtn, { [$style.toolActive]: isBatchMode }]"
            title="批量操作"
            @click="isBatchMode ? exitBatchMode() : enterBatchMode()"
          >
            ··· 批量操作
          </base-btn>

          <base-btn
            :class="$style.secondaryBtn"
            @click="isShowMetaModal = true"
          >
            {{ $t('list_edit_meta_title') }}
          </base-btn>
        </div>
      </div>
    </div>

    <!-- Batch Action Mode Bar (Shown in Batch Mode) -->
    <div v-if="isBatchMode" :class="$style.batchActionBar">
      <div :class="$style.batchActionLeft">
        <button :class="$style.batchPlayBtn" title="播放选中" @click="handlePlaySelected">
          ▶
        </button>
        <button
          :class="$style.batchBtn"
          :disabled="!selectedList.length"
          @click="handleBatchAddToPlaylist"
        >
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor; margin-right: 4px;">
            <path d="M14 10H3v2h11v-2zm0-4H3v2h11V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM3 16h7v-2H3v2z" />
          </svg>
          添加到播放列表
        </button>
        <button
          v-if="listId !== LIST_IDS.LOCAL"
          :class="$style.batchBtn"
          :disabled="!selectedList.length"
          @click="handleBatchDownload"
        >
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor; margin-right: 4px;">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
          </svg>
          下载
        </button>
        <button
          :class="$style.batchBtn"
          :disabled="!selectedList.length"
          @click="handleBatchCollect"
        >
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor; margin-right: 4px;">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
          收藏
        </button>
        <button
          :class="$style.batchBtn"
          :disabled="!selectedList.length"
          @click="handleBatchDelete"
        >
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor; margin-right: 4px;">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
          </svg>
          删除
        </button>
      </div>

      <div :class="$style.batchActionRight">
        <button :class="$style.finishBatchBtn" @click="exitBatchMode">
          完成
        </button>
      </div>
    </div>

    <!-- Standard Sub-header Toolbar (Shown when NOT in Batch Mode) -->
    <div v-else :class="$style.listSubHeader">
      <div :class="$style.subHeaderTabs">
        <span :class="[$style.tabItem, $style.tabActive]">
          歌曲 <sup :class="$style.tabBadge">{{ displayList.length }}</sup>
        </span>
      </div>

      <div :class="$style.subHeaderTools">
        <!-- Applied Filter Badge Bar (Picture 2 & 3) -->
        <div v-if="activeFilterTags.length" :class="$style.filterBadgeBox">
          <span :class="$style.filterBadgeLabel">
            已筛选 {{ activeFilterTags.join(' · ') }}
          </span>
          <span :class="$style.clearFilterBtn" title="清除筛选" @click="activeFilterTags = []">✕</span>
          <button :class="$style.createListFromFilterBtn" @click="handleCreateListFromFilter">创建歌单</button>
        </div>

        <button
          :class="[$style.iconToolBtn, { [$style.toolActive]: activeFilterTags.length || isShowSongFilterModal }]"
          title="歌曲筛选"
          @click="isShowSongFilterModal = true"
        >
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;">
            <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
          </svg>
        </button>

        <div :class="$style.searchBox">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" :class="$style.searchIcon">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
          <input
            v-model="searchKeyword"
            type="text"
            placeholder="搜索"
            :class="$style.searchInput"
          />
          <span v-if="searchKeyword" :class="$style.clearSearchBtn" @click="searchKeyword = ''">✕</span>
        </div>
      </div>
    </div>

    <!-- Table Header (Normal Mode or Batch Mode Checkbox Header) -->
    <div class="thead">
      <table>
        <thead>
          <tr v-if="isBatchMode">
            <th style="width: 42%; text-align: left; padding-left: 12px;">
              <label :class="$style.checkboxLabel">
                <input
                  type="checkbox"
                  :checked="isAllSelected"
                  :class="$style.batchCheckbox"
                  @change="toggleSelectAll"
                />
                <span>全选 (共{{ displayList.length }}首)</span>
              </label>
            </th>
            <th class="nobreak" style="width: 28%;">{{ $t('music_album') }}</th>
            <th class="nobreak" style="width: 15%;">喜欢</th>
            <th class="nobreak" style="width: 15%;">{{ $t('music_time') }}</th>
          </tr>
          <tr v-else-if="actionButtonsVisible">
            <th class="num" style="width: 5%;">#</th>
            <th class="nobreak" :class="$style.sortableHeader" @click="handleColumnSort('name')">
              {{ $t('music_name') }}
              <span :class="[$style.sortIcon, { [$style.sortActive]: sortType === 'name' }]">
                {{ sortType === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}
              </span>
            </th>
            <th class="nobreak" style="width: 22%;" :class="$style.sortableHeader" @click="handleColumnSort('singer')">
              {{ $t('music_singer') }}
              <span :class="[$style.sortIcon, { [$style.sortActive]: sortType === 'singer' }]">
                {{ sortType === 'singer' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}
              </span>
            </th>
            <th class="nobreak" style="width: 22%;" :class="$style.sortableHeader" @click="handleColumnSort('album')">
              {{ $t('music_album') }}
              <span :class="[$style.sortIcon, { [$style.sortActive]: sortType === 'album' }]">
                {{ sortType === 'album' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}
              </span>
            </th>
            <th class="nobreak" style="width: 9%;" :class="$style.sortableHeader" @click="handleColumnSort('interval')">
              {{ $t('music_time') }}
              <span :class="[$style.sortIcon, { [$style.sortActive]: sortType === 'interval' }]">
                {{ sortType === 'interval' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}
              </span>
            </th>
            <th class="nobreak" style="width: 16%;">{{ $t('action') }}</th>
          </tr>
          <tr v-else>
            <th class="num" style="width: 5%;">#</th>
            <th class="nobreak" :class="$style.sortableHeader" @click="handleColumnSort('name')">
              {{ $t('music_name') }}
              <span :class="[$style.sortIcon, { [$style.sortActive]: sortType === 'name' }]">
                {{ sortType === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}
              </span>
            </th>
            <th class="nobreak" style="width: 25%;" :class="$style.sortableHeader" @click="handleColumnSort('singer')">
              {{ $t('music_singer') }}
              <span :class="[$style.sortIcon, { [$style.sortActive]: sortType === 'singer' }]">
                {{ sortType === 'singer' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}
              </span>
            </th>
            <th class="nobreak" style="width: 28%;" :class="$style.sortableHeader" @click="handleColumnSort('album')">
              {{ $t('music_album') }}
              <span :class="[$style.sortIcon, { [$style.sortActive]: sortType === 'album' }]">
                {{ sortType === 'album' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}
              </span>
            </th>
            <th class="nobreak" style="width: 10%;" :class="$style.sortableHeader" @click="handleColumnSort('interval')">
              {{ $t('music_time') }}
              <span :class="[$style.sortIcon, { [$style.sortActive]: sortType === 'interval' }]">
                {{ sortType === 'interval' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}
              </span>
            </th>
          </tr>
        </thead>
      </table>
    </div>

    <!-- Content List -->
    <div v-show="displayList.length" ref="dom_listContent" :class="$style.content">
      <!-- Batch Selection Mode List View -->
      <base-virtualized-list
        v-if="isBatchMode"
        ref="listRef"
        v-slot="{ item }"
        :list="displayList"
        key-name="id"
        :item-height="listItemHeight"
        container-class="scroll"
        content-class="list"
      >
        <div
          class="list-item"
          :class="[{ selected: isSelected(item) }, { active: isSelected(item) }]"
          @click="toggleSelectItem(item)"
        >
          <div class="list-item-cell" style="flex: 0 0 42%; display: flex; align-items: center; padding-left: 12px;">
            <input
              type="checkbox"
              :checked="isSelected(item)"
              :class="$style.batchCheckbox"
              @click.stop
              @change="toggleSelectItem(item)"
            />
            <div
              v-if="item.pic || item.img || item.meta?.picUrl"
              :class="$style.songThumb"
              :style="{ backgroundImage: `url(${item.meta?.picUrl || item.pic || item.img})` }"
            />
            <div style="display: flex; flex-direction: column; overflow: hidden; min-width: 0;">
              <span class="select name" :title="item.name">{{ item.name }}</span>
              <span class="no-select" style="font-size: 11px; opacity: 0.65;">{{ item.singer }}</span>
            </div>
          </div>
          <div class="list-item-cell" style="flex: 0 0 28%;"><span class="select" :aria-label="item.meta.albumName">{{ item.meta.albumName }}</span></div>
          <div class="list-item-cell" style="flex: 0 0 15%; text-align: center;">
            <button
              type="button"
              :class="$style.loveSongBtn"
              :style="{ color: isLovedSong(item) ? 'var(--color-primary)' : 'var(--color-font-label)' }"
              :title="isLovedSong(item) ? '已在我的喜爱中' : '添加到我的喜爱'"
              :aria-label="isLovedSong(item) ? `${item.name}已在我的喜爱中` : `添加${item.name}到我的喜爱`"
              :disabled="isLovedSong(item)"
              @click.stop="toggleLoveSong(item)"
            >{{ isLovedSong(item) ? '♥' : '♡' }}</button>
          </div>
          <div class="list-item-cell" style="flex: 0 0 15%;"><span class="no-select">{{ item.interval || '--/--' }}</span></div>
        </div>
      </base-virtualized-list>

      <!-- Standard Mode Virtualized List -->
      <base-virtualized-list
        v-else-if="actionButtonsVisible"
        ref="listRef"
        v-slot="{ item, index }"
        :list="displayList"
        key-name="id"
        :item-height="listItemHeight"
        container-class="scroll"
        content-class="list"
        @scroll="saveListPosition"
        @contextmenu.capture="handleListRightClick"
      >
        <div
          class="list-item"
          :class="[{ [$style.active]: playerInfo.isPlayList && (playerInfo.playIndex === index || playerInfo.playMusicId === item.id) }, { selected: selectedIndex == index || rightClickSelectedIndex == index }, { active: selectedList.includes(item) }, { disabled: !assertApiSupport(item.source) }]"
          @click="handleListItemClick($event, index)"
          @dblclick="handlePlayMusic(index)"
          @contextmenu="handleListItemRightClick($event, index)"
        >
          <div class="list-item-cell no-select" :class="$style.num" style="flex: 0 0 5%;">
            <transition name="play-active">
              <div v-if="playerInfo.isPlayList && (playerInfo.playIndex === index || playerInfo.playMusicId === item.id)" :class="$style.playIcon">
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="50%" viewBox="0 0 512 512" space="preserve">
                  <use :xlink:href="$themeIconRef('#icon-play-outline')" />
                </svg>
              </div>
              <div v-else class="num">{{ index + 1 }}</div>
            </transition>
          </div>
          <span v-if="$themeIdentity && $themeIdentity !== 'signal'" class="theme-track-art" aria-hidden="true"><img v-if="item.meta?.picUrl" :src="item.meta.picUrl" alt="" loading="lazy"><theme-brand v-else compact /></span>
                <div class="list-item-cell auto name" :aria-label="item.name" style="display: flex; align-items: center;">
            <div
              v-if="item.pic || item.img || item.meta?.picUrl"
              :class="$style.songThumb"
              :style="{ backgroundImage: `url(${item.meta?.picUrl || item.pic || item.img})` }"
            />
            <span class="select name">{{ item.name }}</span>
            <span v-if="isShowSource" class="no-select label-source">{{ item.source }}</span>
          </div>
          <div class="list-item-cell" style="flex: 0 0 22%;"><span class="select" :aria-label="item.singer">{{ item.singer }}</span></div>
          <div class="list-item-cell" style="flex: 0 0 22%;"><span class="select" :aria-label="item.meta.albumName">{{ item.meta.albumName }}</span></div>
          <div class="list-item-cell" style="flex: 0 0 9%;"><span class="no-select">{{ item.interval || '--/--' }}</span></div>
          <div class="list-item-cell" style="flex: 0 0 16%; padding-left: 0; padding-right: 0;" @dblclick.stop>
            <material-list-buttons :index="index" :download-btn="assertApiSupport(item.source) && item.source != 'local' && listId !== LIST_IDS.LOCAL" @btn-click="handleListBtnClick" />
          </div>
        </div>
      </base-virtualized-list>

      <base-virtualized-list
        v-else
        ref="listRef"
        v-slot="{ item, index }"
        :list="displayList"
        key-name="id"
        :item-height="listItemHeight"
        container-class="scroll"
        content-class="list"
        @scroll="saveListPosition"
        @contextmenu.capture="handleListRightClick"
      >
        <div
          class="list-item"
          :class="[{ [$style.active]: playerInfo.isPlayList && (playerInfo.playIndex === index || playerInfo.playMusicId === item.id) }, { selected: selectedIndex == index || rightClickSelectedIndex == index }, { active: selectedList.includes(item) }, { disabled: !assertApiSupport(item.source) }]"
          @click="handleListItemClick($event, index)"
          @dblclick="handlePlayMusic(index)"
          @contextmenu="handleListItemRightClick($event, index)"
        >
          <div class="list-item-cell no-select" :class="$style.num" style="flex: 0 0 5%;">
            <transition name="play-active">
              <div v-if="playerInfo.isPlayList && (playerInfo.playIndex === index || playerInfo.playMusicId === item.id)" :class="$style.playIcon">
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="50%" viewBox="0 0 512 512" space="preserve">
                  <use :xlink:href="$themeIconRef('#icon-play-outline')" />
                </svg>
              </div>
              <div v-else class="num">{{ index + 1 }}</div>
            </transition>
          </div>
          <span v-if="$themeIdentity && $themeIdentity !== 'signal'" class="theme-track-art" aria-hidden="true"><img v-if="item.meta?.picUrl" :src="item.meta.picUrl" alt="" loading="lazy"><theme-brand v-else compact /></span>
                <div class="list-item-cell auto name" style="display: flex; align-items: center;">
            <div
              v-if="item.pic || item.img || item.meta?.picUrl"
              :class="$style.songThumb"
              :style="{ backgroundImage: `url(${item.meta?.picUrl || item.pic || item.img})` }"
            />
            <span class="select name" :aria-label="item.name">{{ item.name }}</span>
            <span v-if="isShowSource" class="no-select label-source">{{ item.source }}</span>
          </div>
          <div class="list-item-cell" style="flex: 0 0 25%;"><span class="select" :aria-label="item.singer">{{ item.singer }}</span></div>
          <div class="list-item-cell" style="flex: 0 0 28%;"><span class="select" :aria-label="item.meta.albumName">{{ item.meta.albumName }}</span></div>
          <div class="list-item-cell" style="flex: 0 0 10%;"><span class="no-select">{{ item.interval || '--/--' }}</span></div>
        </div>
      </base-virtualized-list>
    </div>
    <div v-show="!displayList.length" :class="$style.noItem">
      <p v-text="$t('no_item')" />
    </div>

    <!-- Modals & Menus -->
    <common-list-add-modal
      v-model:show="isShowListAdd" :is-move="isMove" :from-list-id="listId"
      :music-info="selectedAddMusicInfo" :exclude-list-id="excludeListIds" teleport="#view"
    />
    <common-list-add-multiple-modal
      v-model:show="isShowListAddMultiple" :from-list-id="listId"
      :is-move="isMoveMultiple" :music-list="selectedList" :exclude-list-id="excludeListIds" teleport="#view" @confirm="removeAllSelect"
    />
    <common-download-modal v-model:show="isShowDownload" :music-info="selectedDownloadMusicInfo" teleport="#view" :list-id="listId" />
    <common-download-multiple-modal v-model:show="isShowDownloadMultiple" :list="selectedList" teleport="#view" :list-id="listId" @confirm="removeAllSelect" />
    <search-list :list="list" :visible="isShowSearchBar" @action="handleMusicSearchAction" />
    <music-sort-modal v-model:show="isShowMusicSortModal" :music-info="selectedSortMusicInfo" :selected-num="selectedNum" @confirm="sortMusic" />
    <music-toggle-modal v-model:show="isShowMusicToggleModal" :music-info="selectedToggleMusicInfo" @toggle="toggleSource" />
    <list-meta-edit-modal v-model:visible="isShowMetaModal" :list-id="listId" />
    <song-filter-modal v-model:show="isShowSongFilterModal" v-model="activeFilterTags" :list="list" @confirm="handleFilterConfirm" />

    <!-- Context Menus -->
    <base-menu v-model="isShowItemMenu" :menus="menus" :xy="menuLocation" item-name="name" @menu-click="handleMenuClick" />
    <base-menu v-model="isShowSortMenu" :menus="sortMenus" :xy="sortMenuLocation" item-name="name" @menu-click="handleSortMenuClick" />
  </div>
</template>

<script lang="js" src="@renderer/bundles/official/features/List/MusicList/index.js"></script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.list {
  overflow: hidden;
  height: 100%;
  flex: auto;
  min-width: 0;
  display: flex;
  flex-flow: column nowrap;

  :global(.list-item) {
    &.active {
      color: var(--color-button-font);
    }
  }
  :global {
    .label-source {
      color: var(--color-primary);
      padding: 5px;
      font-size: .8em;
      line-height: 1.2;
      opacity: .75;
      display: inline-block;
    }
  }
}
.num {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.playIcon {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;

  color: var(--color-button-font);
  opacity: .7;
}
.content {
  min-height: 0;
  font-size: 14px;
  display: flex;
  flex-flow: column nowrap;
  flex: auto;
}

.noItem {
  position: relative;
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  align-items: center;

  p {
    font-size: 24px;
    color: var(--color-font-label);
  }
}

.headerBanner {
  flex: none;
  display: flex;
  align-items: flex-start;
  padding: var(--space-content-y) var(--space-content-x);
  background: var(--color-content-background);
  border-bottom: 1px solid var(--lx-border);
}

.bannerCover {
  flex: none;
  width: clamp(72px, 8vw, 110px);
  height: clamp(72px, 8vw, 110px);
  border-radius: 8px;
  background-position: center;
  background-size: cover;
  background-color: var(--color-primary-light-900-alpha-100);
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  margin-right: var(--space-content-x);
  display: flex;
  align-items: center;
  justify-content: center;
}

.bannerDefaultCover {
  color: var(--color-primary);
  opacity: 0.8;
}

.playCountBadge {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 2px 6px;
  background-color: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 10px;
  border-radius: 10px;
  backdrop-filter: blur(4px);
}

.bannerMain {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: clamp(72px, 8vw, 110px);
}

.bannerTitleRow {
  margin-bottom: 4px;
}

.bannerTitle {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-font);
  margin: 0;
  .mixin-ellipsis-1();
}

.bannerMetaRow {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--color-font-label);
  margin-bottom: 6px;
}

.bannerAuthor {
  font-weight: 500;
}

.bannerSubTitle {
  opacity: 0.85;
  .mixin-ellipsis-1();
}

.bannerTagsRow {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.tagBadge {
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 4px;
  background-color: var(--color-primary-light-900-alpha-200);
  color: var(--color-primary);
  font-weight: 500;
}

.bannerActionsRow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.primaryRedBtn {
  font-size: 12px;
  padding: 6px 18px;
  border-radius: 18px;
  background-color: var(--color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.9;
  }
}

.secondaryBtn {
  font-size: 12px;
  padding: 5px 14px;
  border-radius: 16px;
  display: flex;
  align-items: center;
}

.songThumb {
  width: 26px;
  height: 26px;
  border-radius: 4px;
  background-position: center;
  background-size: cover;
  background-color: var(--color-primary-light-900-alpha-100);
  margin-right: 8px;
  flex: none;
}

/* Sub-header Bar (Songs count tab on left, Filter & Search input on right) */
.listSubHeader {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--space-content-y) * .67) var(--space-content-x);
  background: var(--color-content-background);
  border-bottom: 1px solid var(--lx-border);
  gap: 10px;
}

.subHeaderTabs {
  display: flex;
  align-items: center;
  gap: 20px;
}

.tabItem {
  font-size: 14px;
  color: var(--color-font-label);
  cursor: pointer;
  padding-bottom: 4px;
  position: relative;
  transition: color 0.2s ease;
  user-select: none;

  &:hover {
    color: var(--color-font);
  }
}

.tabActive {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-font) !important;
  border-bottom: 3px solid var(--color-primary);
}

.tabBadge {
  font-size: 10px;
  font-weight: 400;
  margin-left: 2px;
  opacity: 0.7;
}

.subHeaderTools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  min-width: 0;
  justify-content: flex-end;
  gap: 10px;
}

.iconToolBtn {
  background: none;
  border: 1px solid var(--color-primary-light-900-alpha-200);
  border-radius: 14px;
  padding: 4px 8px;
  color: var(--color-font);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;

  &:hover {
    background: var(--color-primary-light-900-alpha-100);
  }
}

.toolActive {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.filterBadgeBox {
  display: flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  gap: 8px;
  background-color: var(--color-primary-light-900-alpha-100);
  border: 1px solid var(--color-primary-light-900-alpha-200);
  border-radius: 14px;
  padding: 2px 10px;
  font-size: 12px;
}

.filterBadgeLabel {
  color: var(--color-font);
  font-weight: 500;
  .mixin-ellipsis-1();
}

.createListFromFilterBtn {
  background-color: var(--color-primary-light-900-alpha-150);
  border: none;
  border-radius: 12px;
  padding: 2px 10px;
  font-size: 11px;
  color: var(--color-font);
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: var(--color-primary-light-900-alpha-250);
    color: var(--color-primary);
  }
}

.searchBox {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--color-primary-light-900-alpha-100);
  border-radius: 16px;
  padding: 2px 10px;
  width: clamp(128px, 18vw, 190px);
}

.searchIcon {
  width: 14px;
  height: 14px;
  fill: var(--color-font-label);
  margin-right: 4px;
  flex: none;
}

.searchInput {
  background: transparent;
  border: none;
  outline: none;
  font-size: 12px;
  color: var(--color-font);
  width: 100%;
}

.clearSearchBtn {
  font-size: 11px;
  color: var(--color-font-label);
  cursor: pointer;
  padding: 0 2px;

  &:hover {
    color: var(--color-font);
  }
}

/* Batch Operations Mode Toolbar (Matching Screenshot Layout) */
.batchActionBar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--space-content-y) * .84) var(--space-content-x);
  background: var(--color-content-background);
  border-bottom: 1px solid var(--lx-border);
  gap: 10px;
}

.batchActionLeft {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.batchPlayBtn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background-color: var(--color-primary-light-800-alpha-400);
  color: var(--color-primary);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.85;
  }
}

.batchBtn {
  background-color: var(--color-primary-light-900-alpha-100);
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 13px;
  color: var(--color-font);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  transition: background-color 0.2s ease;

  &:hover:not(:disabled) {
    background-color: var(--color-primary-light-900-alpha-200);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

@media (max-width: 920px) {
  .headerBanner {
    align-items: center;
    padding: 8px 12px;
  }

  .bannerCover {
    width: 64px;
    height: 64px;
    margin-right: 12px;
  }

  .bannerMain {
    min-height: 64px;
  }

  .bannerMetaRow,
  .bannerTagsRow {
    display: none;
  }

  .bannerTitle {
    font-size: 15px;
  }

  .bannerActionsRow {
    gap: 6px;
  }

  .primaryRedBtn,
  .secondaryBtn,
  .batchBtn {
    padding: 4px 8px;
  }

  .listSubHeader {
    align-items: flex-start;
    flex-flow: column nowrap;
    padding: 6px 12px;
  }

  .subHeaderTools {
    width: 100%;
    justify-content: flex-start;
  }

  .batchActionBar {
    align-items: flex-start;
    flex-flow: column nowrap;
    padding: 8px 12px;
  }
}

.batchActionRight {
  display: flex;
  align-items: center;
}

.finishBatchBtn {
  border: 1px solid var(--color-primary-light-900-alpha-200);
  border-radius: 16px;
  padding: 4px 18px;
  font-size: 13px;
  color: var(--color-font);
  background: transparent;
  cursor: pointer;
  transition: border-color 0.2s ease;

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
}

.checkboxLabel {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-weight: 500;
  user-select: none;
}

.batchCheckbox {
  width: 16px;
  height: 16px;
  accent-color: var(--color-primary);
  cursor: pointer;
  margin-right: 8px;
}

/* Hover Column Sort Indicators */
.sortableHeader {
  cursor: pointer;
  user-select: none;
  transition: color 0.2s ease;

  .sortIcon {
    opacity: 0;
    margin-left: 4px;
    font-size: 11px;
    transition: opacity 0.2s ease;
    color: var(--color-primary);
  }

  &:hover {
    color: var(--color-primary);
    .sortIcon {
      opacity: 0.7;
    }
  }

  .sortActive {
    opacity: 1 !important;
    font-weight: bold;
  }
}

.loveSongBtn {
  border: 0;
  background: transparent;
  padding: 6px 10px;
  font-size: 16px;
  cursor: pointer;
  &:disabled { cursor: default; }
  &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
}
</style>
