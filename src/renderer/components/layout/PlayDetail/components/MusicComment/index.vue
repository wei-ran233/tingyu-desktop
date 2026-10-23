<template lang="pug">
div.comment(ref="dom_container" :inert="!show" :aria-hidden="!show" :class="$style.comment" @keydown.esc.stop="$emit('close')")
  div(:class="$style.commentHeader")
    h3 {{ $t('comment__title', { name: currentMusicInfo.name }) }}
    div(:class="$style.commentHeaderBtns")
      button(type="button" :class="$style.commentHeaderBtn" :aria-label="$t('comment__refresh')" @click="handleShowComment")
        svg(version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" style="transform: rotate(45deg);" viewBox="0 0 24 24" space="preserve")
          use(:xlink:href="$themeIconRef('#icon-refresh')")
      button(type="button" :class="$style.commentHeaderBtn" :aria-label="$t('close')" @click="$emit('close')")
        svg(version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" space="preserve")
          use(:xlink:href="$themeIconRef('#icon-close')")

  div(:class="$style.commentMain")
    template(v-if="available")
      header(:class="$style.tab_header")
        button(type="button" :class="[$style.commentType, { [$style.active]: tabActiveId == 'hot' }]" @click="handleToggleTab('hot')") {{ $t('comment__hot_title') }} ({{ hotComment.total }})
        button(type="button" :class="[$style.commentType, { [$style.active]: tabActiveId == 'new' }]" @click="handleToggleTab('new')") {{ $t('comment__new_title') }} ({{ newComment.total }})
      main(ref="dom_tabMain" :class="$style.tab_main")
        div(:class="$style.tab_content")
          div.scroll(ref="dom_commentHot" :class="$style.tab_content_scroll")
            p(v-if="hotComment.isLoadError" :class="$style.commentLabel" style="cursor: pointer;" @click="handleGetHotComment(currentMusicInfo, hotComment.nextPage, hotComment.limit)") {{ $t('comment__hot_load_error') }}
            p(v-else-if="hotComment.isLoading && !hotComment.list.length" :class="$style.commentLabel") {{ $t('comment__hot_loading') }}
            comment-floor(v-if="!hotComment.isLoadError && hotComment.list.length" :class="[$style.commentFloor, hotComment.isLoading ? $style.loading : null]" :comments="hotComment.list")
            p(v-else-if="!hotComment.isLoadError && !hotComment.isLoading" :class="$style.commentLabel") {{ $t('comment__no_content') }}
            div(:class="$style.pagination")
              material-pagination(:count="hotComment.total" :btn-length="5" :limit="hotComment.limit" :page="hotComment.page" @btn-click="handleToggleHotCommentPage")
        div(:class="$style.tab_content")
          div.scroll(ref="dom_commentNew" :class="$style.tab_content_scroll")
            p(v-if="newComment.isLoadError" :class="$style.commentLabel" style="cursor: pointer;" @click="handleGetNewComment(currentMusicInfo, newComment.nextPage, newComment.limit)") {{ $t('comment__new_load_error') }}
            p(v-else-if="newComment.isLoading && !newComment.list.length" :class="$style.commentLabel") {{ $t('comment__new_loading') }}
            comment-floor(v-if="!newComment.isLoadError && newComment.list.length" :class="[$style.commentFloor, newComment.isLoading ? $style.loading : null]" :comments="newComment.list")
            p(v-else-if="!newComment.isLoadError && !newComment.isLoading" :class="$style.commentLabel") {{ $t('comment__no_content') }}
            div(:class="$style.pagination")
              material-pagination(:count="newComment.total" :btn-length="5" :limit="newComment.limit" :page="newComment.page" @btn-click="handleToggleCommentPage")
    div(v-else :class="$style.unavailable")
      p {{ $t('comment__unavailable') }}
</template>

<script src="@renderer/bundles/official/features/shell/PlayDetail/MusicComment.js"></script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.comment {
  display: flex;
  flex-flow: column nowrap;
  transition: @transition-normal;
  transition-property: transform,opacity;
  transform-origin: 100%;
  overflow: hidden;
}
.commentHeader {
  flex: none;
  padding-bottom: 5px;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  // border-bottom: 1px solid #eee;
  h3 {
    font-size: 14px;
    .mixin-ellipsis-1();
    line-height: 1.2;
  }
}
.commentHeaderBtns {
  flex: 1 0 auto;
  display: flex;
  flex-flow: row nowrap;
  justify-content: flex-end;
  color: var(--color-primary);
}
.commentHeaderBtn {
  border: 0;
  padding: 2px;
  background: transparent;
  color: inherit;
  border-radius: 4px;
  &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
  height: 22px;
  width: 22px;
  cursor: pointer;
  transition: opacity @transition-normal;

  +.commentHeaderBtn {
    margin-left: 5px;
  }

  &:hover {
    opacity: .7;
  }
}
.commentMain {
  flex: auto;
  min-height: 0;
  background-color: var(--color-primary-light-400-alpha-700);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
}
.tab_header {
  display: flex;
  flex-flow: row nowrap;
  gap: 15px;
  padding-left: 15px;
  padding-right: 10px;
}
.tab_main {
  flex: auto;
  display: flex;
  flex-flow: row nowrap;
  overflow: hidden;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
}
.tab_content {
  flex-shrink: 0;
  width: 100%;
  position: relative;
}
.tab_content_scroll {
  box-sizing: border-box;
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  padding-left: 15px;
  padding-right: 10px;
  scroll-behavior: smooth;
}
.commentLabel {
  padding: 15px;
  color: var(--color-font-label);
  font-size: 14px;
}
.commentType {
  padding: 5px;
  margin: 5px 0;
  font-size: 13px;
  background: none;
  border: none;
  cursor: pointer;
  transition: @transition-normal;
  transition-property: opacity, color;
  &:hover {
    opacity: .7;
  }
  &.active {
    color: var(--color-primary);
  }
}
.commentFloor {
  opacity: 1;
  transition: opacity @transition-normal;

  &.loading {
    opacity: .4;
  }
}
.pagination {
  padding: 10px 0;
}

.unavailable {
  flex: auto;
  padding-top: 10%;
  text-align: center;
  font-size: 14px;
  color: var(--color-font-label);
}

</style>
