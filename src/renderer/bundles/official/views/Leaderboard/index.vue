<template>
  <div :class="$style.leaderboard">
    <div :class="$style.lists">
      <div :class="$style.listsSelect">
        <base-selection :model-value="source" :class="$style.select" :list="sourceList" item-key="id" item-name="name" @update:model-value="handleToggleSource" />
      </div>
      <BoardList ref="boardListRef" :board-id="boardId" :source="source" @show-menu="$refs.musicListRef?.hideMenu()" />
    </div>
    <div :class="$style.list">
      <header class="music-page-heading"><h2>{{ $t('leaderboard') }}</h2><span class="music-page-count">{{ sourceList.find(item => item.id === source)?.name }}</span></header>
      <collection-surface
        surface-id="leaderboard-music"
        :params="{ source: String(source || ''), boardId: String(boardId || '') }"
      >
        <MusicList ref="musicListRef" :source="source" :board-id="boardId" @show-menu="$refs.boardListRef?.hideMenu()" />
      </collection-surface>
    </div>
  </div>
</template>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.leaderboard {
  height: 100%;
  display: flex;
  position: relative;
  min-width: 0;
}
.header {
  flex: none;
  width: 100%;
  display: flex;
  flex-flow: row nowrap;

}
.tab {
  flex: auto;
}
.select {
  flex: none;
  width: 80px;
}
.content {
  flex: auto;
  display: flex;
  overflow: hidden;
  flex-flow: column nowrap;
}

.lists {
  flex: none;
  width: var(--layout-board-pane-width);
  border-right: 1px solid var(--lx-border);
  background: var(--color-primary-light-900-alpha-500);
  min-width: 0;
  display: flex;
  flex-flow: column nowrap;
}
.listsHeader {
  position: relative;
}

.listsSelect {
  font-size: 12px;

  &:hover {
    :global(.icon) {
      opacity: 1;
    }
  }

  >:global(.content) {
    display: block;
    width: 100%;
  }
  :global(.label-content) {
    background-color: transparent !important;
    line-height: 54px;
    height: 54px;
    border-radius: 0;
    &:hover {
      background: none !important;
    }
  }
  :global(.label) {
    color: var(--color-font) !important;
  }
  :global(.icon) {
    opacity: .6;
    transition: opacity .3s ease;
  }

  :global(.selection-list) {
    max-height: 500px;
    box-shadow: 0 1px 8px 0 rgba(0,0,0,.2);
    li {
      // background-color: var(--color-main-background);
      line-height: 38px;
      font-size: 13px;
      &:hover {
        background-color: var(--color-button-background-hover);
      }
      &:active {
        background-color: var(--color-button-background-active);
      }
    }
  }
  // line-height: 38px;
  // padding: 0 10px;
  border-bottom: var(--color-list-header-border-bottom);
  flex: none;
}

.list {
  position: relative;
  overflow: hidden;
  height: 100%;
  min-width: 0;
  flex: auto;
  display: flex;
  flex-flow: column nowrap;
  // .noItem {

  // }
}

</style>
