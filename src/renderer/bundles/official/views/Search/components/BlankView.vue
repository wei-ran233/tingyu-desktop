<template>
  <transition enter-active-class="animated-fast fadeIn" leave-active-class="animated-fast fadeOut">
    <div v-show="props.visible" :class="$style.noitem">
      <div class="scroll" :class="$style.noitemListContainer">
        <p v-if="actionError" :class="$style.actionError" role="status">{{ actionError }}</p>
        <PluginUiSurface kind="toolbar" :input="uiInput" :busy="actionBusy" :visible="props.visible" @search="handleSearch" @action="uiAction" />
        <PluginUiSurface kind="renderer" :input="uiInput" :busy="actionBusy" :visible="props.visible" @search="handleSearch" @action="uiAction">
          <dl v-if="pluginSuggestions.length || pluginActions.length || actionError" :class="$style.noitemList" data-plugin-search-suggestions>
            <dt :class="[$style.noitemListTitle, $style.suggestionHeading]"><span>{{ $t('search__plugin_suggestions') }}</span><span :class="$style.suggestionActions"><button v-for="action in pluginActions" :key="action.id" type="button" :class="$style.suggestionAction" :data-search-action="action.id" :disabled="actionBusy" :aria-busy="actionBusy" :title="action.pluginName" @click="handleAction(action)">{{ action.title }}</button></span></dt>
            <dd v-for="item in pluginSuggestions" :key="item" :class="$style.suggestionItem"><button type="button" :class="$style.noitemListItem" data-search-suggestion @click="handleSearch(item)">{{ item }}</button></dd>
          </dl>
        </PluginUiSurface>
        <PluginUiSurface kind="slot" :input="uiInput" :busy="actionBusy" :visible="props.visible" @search="handleSearch" @action="uiAction" />
        <dl v-if="appSetting['search.isShowHotSearch']" :class="[$style.noitemList, $style.noitemHotSearchList]">
          <dt :class="$style.noitemListTitle">{{ $t('search__hot_search') }}</dt>
          <dd v-for="(item, index) in hotSearchList" :key="index" :class="$style.noitemListItem" role="button" tabindex="0" @keydown.enter="handleSearch(item)" @keydown.space.prevent="handleSearch(item)" @click="handleSearch(item)">{{ item }}</dd>
        </dl>
        <dl v-if="appSetting['search.isShowHistorySearch'] && historyList.length" :class="$style.noitemList">
          <dt :class="$style.noitemListTitle">
            <span>{{ $t('history_search') }}</span><button type="button" :class="$style.historyClearBtn" :aria-label="$t('history_clear')" @click="clearHistoryList">
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 512 512" space="preserve">
                <use :xlink:href="$themeIconRef('#icon-eraser')" />
              </svg></button>
          </dt>
          <dd v-for="(item, index) in historyList" :key="index + item" :class="$style.noitemListItem" :aria-label="item" role="button" tabindex="0" @keydown.enter="handleSearch(item)" @keydown.space.prevent="handleSearch(item)" @contextmenu="removeHistoryWord(index)" @click="handleSearch(item)">{{ item }}</dd>
        </dl>
        <div v-if="!pluginSuggestions.length && !pluginActions.length && !actionError && !appSetting['search.isShowHotSearch'] && !(appSetting['search.isShowHistorySearch'] && historyList.length)" :class="$style.noitem_label">
          <p>{{ $t('search__welcome') }}</p>
        </div>
      </div>
    </div>
  </transition>
</template>

<script lang="js" src="@renderer/bundles/official/features/Search/components/BlankView.js"></script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.noitem {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
  display: flex;
  flex-flow: column nowrap;
  // justify-content: center;
}
.noitemListContainer {
  padding: 24px;
  box-sizing: border-box;
  min-height: 0;
  // margin-top: -20px;
  height: 100%;
}
.noitemList {
  +.noitemList {
    margin-top: 24px;
  }
}
.suggestionHeading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.suggestionActions { display: flex; flex-wrap: wrap; gap: 8px; }
.suggestionAction { border: 1px solid var(--lx-border); border-radius: 6px; padding: 5px 10px; color: var(--color-font); background: var(--color-button-background); font: inherit; cursor: pointer; &:disabled { opacity: .5; cursor: default; } &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; } }
.actionError { color: var(--color-font-label); padding: 4px 5px 8px; font-size: 12px; }
.suggestionItem { display: inline; button { border: 0; box-shadow: none; font-family: inherit; line-height: 1.4; } }
.noitemHotSearchList {
  min-height: 82px;
}
.noitemListTitle {
  color: var(--color-font);
  padding: 5px 5px 8px;
  font-size: 14px;
}
.noitemListItem {
  display: inline-block;
  margin: 3px 5px;
  background-color: var(--color-button-background);
  padding: 7px 10px;
  border-radius: 6px;
  &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
  transition: background-color @transition-normal;
  cursor: pointer;
  color: var(--color-font);
  .mixin-ellipsis-1();
  max-width: 150px;
  font-size: 13px;
  &:hover {
    background-color: var(--color-button-background-hover);
  }
  &:active {
    background-color: var(--color-button-background-active);
  }
}
.historyClearBtn {
  padding: 4px 6px;
  border: none;
  background: transparent;
  border-radius: 4px;
  &:focus-visible { outline: 2px solid var(--color-primary); }
  margin-left: 5px;
  color: var(--color-font-label);
  cursor: pointer;
  transition: @transition-normal;
  transition-property: color, opacity;
  opacity: .7;
  &:hover {
    color: var(--color-primary-font-hover);
    opacity: .8;
  }
  &:active {
    color: var(--color-primary-font-active);
    opacity: 1;
  }
  svg {
    vertical-align: middle;
    width: 15px;
  }
}

.noitem_label {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  p {
    font-size: 16px;
    color: var(--color-font-label);
    text-align: center;
  }
}
</style>
