<template>
  <div :class="$style.container">
    <header class="music-page-heading"><h2>{{ $t('search__type_songlist') }}</h2></header>
    <div class="music-page-toolbar" :class="$style.header">
      <div :class="$style.left">
        <tag-list :source="source" :tag-id="tagId" :sort-id="sortId" />
        <sort-tab :source="source" :tag-id="tagId" :sort-id="sortId" />
      </div>
      <base-btn :class="$style.btn" outline min @click="visibleOpenSongListModal = true">{{ $t('songlist__import_input_show_btn') }}</base-btn>
      <base-selection :model-value="source" :class="$style.select" :list="sourceList" item-key="id" item-name="name" @update:model-value="handleToggleSource" />
    </div>
    <list-view :source="source" :tag-id="tagId" :sort-id="sortId" :page="page" />
    <open-list-modal v-model="visibleOpenSongListModal" :source-list="sourceList" />
  </div>
</template>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
  position: relative;
  min-width: 0;
}
.header {
  flex: none;
  width: 100%;
  display: flex;
  flex-flow: row wrap;
  align-items: center;
  gap: 6px;
  // padding-right: 5px;
  // box-sizing: border-box;
  padding-bottom: 4px;
}
.left {
  flex: auto;
  display: flex;
  flex-flow: row wrap;
  min-width: 0;
}

.btn {
  color: var(--color-font);
  transition: color @transition-fast;
  background: none !important;
  &:hover {
    color: var(--color-primary-font-hover);
  }
}


.select {
  font-size: 12px;
  width: auto;
  flex: none;
  padding: 0 5px;

  &:hover {
    :global(.icon) {
      opacity: 1;
    }
  }


  :global {
    .label-content {
      background-color: transparent !important;
      transition: color @transition-fast;
      color: var(--color-font);
      // line-height: 38px;
      // height: 38px;
      border-radius: 0;
      &:hover {
        // background: none !important;
        color: var(--color-primary-font-hover);
        .icon {
          opacity: 1;
          // color: var(--color-primary-font-hover);
        }
      }
    }
    // .label {
    //   color: var(--color-font) !important;
    // }
    .icon {
      svg {
        width: .8em;
      }
      // opacity: .6;
      // transition: color @transition-fast;
      // color: var(--color-font-label);
    }

    .selection-list {
      max-height: 500px;
      box-shadow: 0 1px 4px 0 rgba(0,0,0,.2);
      li {
        // background-color: var(--color-main-background);
        text-align: center;
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
  }
}

@media (max-width: 920px) {
  .header {
    padding: 4px 8px 6px;
  }

  .left {
    width: 100%;
  }
}

</style>
