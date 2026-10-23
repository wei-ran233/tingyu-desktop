<template>
  <div :class="$style.container">
    <div v-show="!props.listInfo.noItemLabel" ref="dom_list_ref" :class="$style.listContent" class="scroll">
      <ul>
        <li v-for="item in props.listInfo.list" :key="item.id" :class="$style.item" role="button" tabindex="0" @keydown.enter="toDetail(item)" @keydown.space.prevent="toDetail(item)" @click="toDetail(item)">
          <div :class="$style.image">
            <img :class="$style.img" loading="lazy" decoding="async" :src="item.img" alt="">
          </div>
          <div :class="$style.desc">
            <h4>{{ item.name }}</h4>
            <div>
              <p :class="$style.author">{{ item.author }}</p>
              <p v-if="item.time" :class="$style.time">{{ item.time }}</p>
              <div :class="$style.songlist_info">
                <span v-if="item.total != null"><svg-icon name="music" />{{ item.total }}</span>
                <span v-if="item.play_count != null"><svg-icon name="headphones" />{{ item.play_count }}</span>
                <span v-if="visibleSource">{{ item.source }}</span>
              </div>
            </div>
          </div>
        </li>
        <li v-for="(i, index) in 6" :key="index" :class="$style.item" style="margin-bottom: 0;height: 0;" />
      </ul>
      <div :class="$style.pagination">
        <material-pagination :count="props.listInfo.total" :limit="props.listInfo.limit" :page="props.listInfo.page" @btn-click="togglePage" />
      </div>
    </div>
    <transition enter-active-class="animated fadeIn" leave-active-class="animated fadeOut">
      <div v-show="props.listInfo.noItemLabel" :class="$style.noitem">
        <p v-text="props.listInfo.noItemLabel" />
      </div>
    </transition>
  </div>
</template>

<script lang="ts" src="@renderer/bundles/official/features/songList/List/components/SongList.ts"></script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';
.container {
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
  position: relative;
}

.listContent {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
  font-size: 14px;
  box-sizing: border-box;
  padding: var(--space-content-y) var(--space-content-x) 0;

  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 18px;
  }
}
.item {
  max-width: none;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  // flex-flow: column nowrap;
  // padding: 10px;
  margin-bottom: 0;
  cursor: pointer;
  transition: background-color @transition-fast;
  padding: 8px;
  border: 1px solid var(--lx-border);
  border-radius: 8px;
  &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
  &:hover {
    opacity: 1;
    background: var(--color-primary-light-900-alpha-500);
  }

  &:empty {
    display: none;
  }
}
.image {
  flex: none;
  width: 38%;
  max-width: 112px;
  display: flex;
  background-position: center;
  background-size: cover;
  border-radius: var(--radius-sm);
  overflow: hidden;
  opacity: .9;
  aspect-ratio: 1 / 1;

  box-shadow: var(--shadow-sm);
}
.img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.desc {
  flex: auto;
  padding: 4px 4px 4px 12px;
  overflow: hidden;
  min-width: 0;
  h4 {
    font-size: 14px;
    // height: 2.6em;
    text-align: left;
    line-height: 1.5;
    .mixin-ellipsis-2();
  }
}
.songlist_info {
  display: flex;
  flex-flow: row nowrap;
  gap: 15px;
  margin-top: 8px;
  font-size: 12px;
  .mixin-ellipsis-1();
  text-align: left;
  line-height: 1.2;
  // text-indent: 24px;
  color: var(--color-font-label);
  svg {
    margin-right: 2px;
  }
}
.author {
  margin-top: 6px;
  font-size: 12px;
  .mixin-ellipsis-1();
  text-align: left;
  line-height: 1.5;
  // text-indent: 24px;
  color: var(--color-font-label);
}
.time {
  margin-top: 3px;
  font-size: 12px;
  .mixin-ellipsis-1();
  text-align: left;
  line-height: 1.5;
  // text-indent: 24px;
  color: var(--color-font-label);
}
.pagination {
  text-align: center;
  padding: 15px 0;
  // left: 50%;
  // transform: translateX(-50%);
}
.noitem {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  align-items: center;
  // background-color: var(--color-000);

  p {
    font-size: 14px;
    color: var(--color-font-label);
  }
}

@media (max-width: 920px) {
  .listContent {
    ul {
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 14px;
    }
  }

  .songlist_info {
    gap: 8px;
  }
}

</style>
