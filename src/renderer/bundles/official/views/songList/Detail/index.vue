<template>
  <div :class="$style.container">
    <div v-if="!pluginActive" :class="$style.songListHeader">
      <div :class="$style.songListHeaderLeft" :style="{ backgroundImage: 'url('+(picUrl || listDetailInfo.info.img)+')' }">
        <!-- <span v-if="listDetailInfo.info.play_count" :class="$style.playNum">{{ listDetailInfo.info.play_count }}</span> -->
      </div>
      <div :class="$style.songListHeaderMiddle">
        <h3 :title="listDetailInfo.info.name">{{ listDetailInfo.info.name }}</h3>
        <p :title="listDetailInfo.info.desc">{{ listDetailInfo.info.desc }}</p>
      </div>
      <div :class="$style.songListHeaderRight">
        <base-btn
          :class="$style.headerRightBtn"
          :disabled="!!listDetailInfo.noItemLabel"
          @click="playSongListDetail(listDetailInfo.id, listDetailInfo.source, listDetailInfo.list)"
        >
          {{ $t('list__play') }}
        </base-btn>
        <base-btn
          :class="$style.headerRightBtn"
          :disabled="!!listDetailInfo.noItemLabel"
          @click="addSongListDetail(listDetailInfo.id, listDetailInfo.source, listDetailInfo.info.name, listDetailInfo.info.desc, picUrl || listDetailInfo.info.img)"
        >
          {{ $t('list__collect') }}
        </base-btn>
        <base-btn :class="$style.headerRightBtn" @click="handleBack">{{ $t('back') }}</base-btn>
      </div>
    </div>
    <div :class="$style.list">
      <collection-surface
        surface-id="songlist-detail-music"
        :params="{ source: String(source || 'kw'), id: String(id || ''), page: String(page || 1) }"
        @active-change="pluginActive = $event"
      >
        <material-online-list
          ref="listRef"
          :page="listDetailInfo.page"
          :limit="listDetailInfo.limit"
          :total="listDetailInfo.total"
          :list="listDetailInfo.list"
          :no-item="listDetailInfo.noItemLabel"
          @play-list="handlePlayList"
          @toggle-page="togglePage"
        />
      </collection-surface>
    </div>
  </div>
</template>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.container {
  // position: absolute;
  // left: 0;
  // top: 0;
  // width: 100%;
  // height: 100%;
  display: flex;
  flex-flow: column nowrap;
  min-width: 0;
}

.songListHeader {
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  min-height: 80px;
  padding: 16px 24px;
  gap: 12px;
  border-bottom: 1px solid var(--lx-border);
  box-sizing: border-box;
}
.songListHeaderLeft {
  flex: none;
  height: 80px;
  aspect-ratio: 1 / 1;
  position: relative;
  overflow: hidden;
  border-radius: 4px;
  background-position: center;
  background-size: cover;
  opacity: .9;
  box-shadow: 0 0 2px 0 rgba(0,0,0,.2);
}
.playNum {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 4px;
  background-color: rgba(0, 0, 0, 0.4);
  color: #fff;
  font-size: 12px;
  text-align: right;
  .mixin-ellipsis-1();
}

.songListHeaderMiddle {
  flex: auto;
  padding: 2px 7px;
  min-width: 0;
  h3 {
    .mixin-ellipsis-1();
    line-height: 1.2;
    padding-bottom: 5px;
    color: var(--color-font);
  }
  p {
    .mixin-ellipsis(3);
    font-size: 12px;
    line-height: 1.2;
    color: var(--color-font-label);
  }
}
.songListHeaderRight {
  flex: none;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;

  .headerRightBtn { border-radius: 6px; min-height: 32px; }
}

.list {
  position: relative;
  width: 100%;
  min-height: 0;
  flex: auto;
  height: 100%;
  min-width: 0;
}

@media (max-width: 920px) {
  .songListHeader {
    min-height: 72px;
    padding: 12px 16px;
    flex-wrap: wrap;
    align-items: center;
  }

  .songListHeaderLeft {
    height: 64px;
  }

  .songListHeaderMiddle {
    min-width: 120px;
    p {
      -webkit-line-clamp: 2;
    }
  }

  .songListHeaderRight {
    .headerRightBtn {
      padding: 5px 8px;
    }
  }
}
</style>

