<template>
  <material-popup-btn :class="$style.btnContent">
    <button :class="$style.btn" :aria-label="$t('play_directory')" :title="$t('play_directory')">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="100%" viewBox="0 0 247.498 247.498" space="preserve">
        <use :xlink:href="$themeIconRef('#icon-musicFolder')" />
      </svg>
    </button>
    <template #content>
      <div :class="$style.container">
        <div :class="$style.header">
          <div :class="$style.headerTitle">
            <h3>{{ listName }}</h3>
            <span :class="$style.subTitle">({{ list.length }})</span>
          </div>

          <div :class="$style.headerActions">
            <base-btn min :class="$style.actionBtn" @click="handleLocateCurrent">
              {{ $t('play_directory_locate') }}
            </base-btn>
            <base-btn v-if="list.length" min :class="$style.actionBtn" @click="handleClear">
              {{ $t('play_directory_clear') }}
            </base-btn>
          </div>
        </div>

        <div ref="listContainerRef" :class="$style.listBody">
          <div v-if="!list.length" :class="$style.empty">
            {{ $t('play_directory_empty') }}
          </div>
          <div
            v-for="(item, index) in list"
            :key="item.id || index"
            :class="[$style.listItem, { [$style.active]: getItemMusicId(item) == currentMusicId }]"
            @click="handlePlaySong(index)"
          >
            <div :class="$style.indexCol">
              <svg v-if="getItemMusicId(item) == currentMusicId" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 291.063 291.064" :class="$style.playingIcon">
                <use :xlink:href="$themeIconRef('#icon-sound')" />
              </svg>
              <span v-else>{{ index + 1 }}</span>
            </div>

            <div :class="$style.infoCol">
              <span :class="$style.songName" :title="getMusicName(item)">{{ getMusicName(item) }}</span>
              <span :class="$style.singer" :title="getSingerName(item)">{{ getSingerName(item) }}</span>
            </div>

            <div :class="$style.timeCol">
              {{ getDurationStr(item) }}
            </div>

            <button :class="$style.removeBtn" :aria-label="$t('list__remove')" :title="$t('list__remove')" @click.stop="handleRemoveSong(item)">
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" viewBox="0 0 212.982 212.982" space="preserve">
                <use :xlink:href="$themeIconRef('#icon-delete')" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </template>
  </material-popup-btn>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick, useCssModule } from '@common/utils/vueTools'
import { playInfo, playMusicInfo } from '@renderer/store/player/state'
import { getList } from '@renderer/store/player/action'
import { playList } from '@renderer/core/player/action'
import { defaultList, loveList, localList, tempList, userLists } from '@renderer/store/list/state'
import { removeListMusics, clearListMusics, getListMusics } from '@renderer/store/list/action'
import { removeDownloadTasks } from '@renderer/store/download/action'
import { downloadList } from '@renderer/store/download/state'
import { LIST_IDS } from '@common/constants'
import { formatPlayTime } from '@renderer/utils'

const $style = useCssModule()
const listContainerRef = ref<HTMLElement | null>(null)

const currentListId = computed(() => {
  if (playMusicInfo.isTempPlay) return LIST_IDS.TEMP
  return playInfo.playerListId ?? playMusicInfo.listId ?? LIST_IDS.DEFAULT
})

const list = ref<Array<LX.Music.MusicInfo | LX.Download.ListItem>>([])

const updateList = async() => {
  if (currentListId.value === LIST_IDS.DOWNLOAD) {
    list.value = [...downloadList]
    return
  }
  let res = getList(currentListId.value)
  if (!res.length && currentListId.value) {
    res = await getListMusics(currentListId.value)
  }
  list.value = [...res]
}

watch(currentListId, () => {
  void updateList()
}, { immediate: true })

onMounted(() => {
  void updateList()
  const handleListUpdate = (ids: string[]) => {
    if (ids.includes(currentListId.value) || currentListId.value === LIST_IDS.DOWNLOAD) {
      void updateList()
    }
  }
  window.app_event.on('myListUpdate', handleListUpdate)
  onBeforeUnmount(() => {
    window.app_event.off('myListUpdate', handleListUpdate)
  })
})

const currentMusicId = computed(() => {
  return playMusicInfo.musicInfo?.id
})

const getItemMusicId = (item: any) => {
  if (!item) return ''
  if ('progress' in item) return item.metadata.musicInfo.id
  return item.id
}

const listName = computed(() => {
  const id = currentListId.value
  if (!id || id === LIST_IDS.DEFAULT) return defaultList.name ? window.i18n.t(defaultList.name as any) : window.i18n.t('default_list')
  if (id === LIST_IDS.LOVE) return loveList.name ? window.i18n.t(loveList.name as any) : window.i18n.t('love_list')
  if (id === LIST_IDS.LOCAL) return localList.name.startsWith('list__') ? window.i18n.t(localList.name as any) : localList.name
  if (id === LIST_IDS.DOWNLOAD) return window.i18n.t('download' as any)
  if (id === LIST_IDS.TEMP) return tempList.name || window.i18n.t('default_list')
  const targetUserList = userLists.find(l => l.id === id)
  if (targetUserList) return targetUserList.name
  return window.i18n.t('default_list')
})

const getMusicName = (item: any) => {
  if ('progress' in item) return item.metadata.musicInfo.name
  return item.name || ''
}

const getSingerName = (item: any) => {
  if ('progress' in item) return item.metadata.musicInfo.singer
  return item.singer || ''
}

const getDurationStr = (item: any) => {
  const interval = 'progress' in item ? item.metadata.musicInfo.interval : item.interval
  if (!interval) return '--/--'
  return typeof interval === 'number' ? formatPlayTime(interval) : interval
}

const handlePlaySong = (index: number) => {
  if (currentListId.value) {
    playList(currentListId.value, index)
  }
}

const handleRemoveSong = (item: any) => {
  const musicId = getItemMusicId(item)
  if (currentListId.value === LIST_IDS.DOWNLOAD) {
    void removeDownloadTasks([item.id])
  } else {
    void removeListMusics({ listId: currentListId.value, ids: [musicId] })
  }
  const idx = list.value.findIndex(i => getItemMusicId(i) === musicId)
  if (idx > -1) {
    list.value.splice(idx, 1)
  }
}

const handleClear = () => {
  if (currentListId.value === LIST_IDS.DOWNLOAD) {
    void removeDownloadTasks(downloadList.map(i => i.id))
  } else {
    void clearListMusics([currentListId.value])
  }
  list.value = []
}

const handleLocateCurrent = () => {
  void nextTick(() => {
    if (!listContainerRef.value || !currentMusicId.value) return
    const activeEl = listContainerRef.value.querySelector(`.${$style.active}`)
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  })
}

</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.btnContent {
  flex: none;
  height: 100%;
}

.btn {
  position: relative;
  justify-content: center;
  align-items: center;
  transition: color @transition-normal;
  cursor: pointer;
  background-color: transparent;
  border: none;
  width: 24px;
  display: flex;
  flex-flow: column nowrap;
  padding: 0;

  svg {
    transition: opacity @transition-fast;
    opacity: .6;
    filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.2));
  }
  &:hover {
    svg {
      opacity: .9;
    }
  }
  &:active {
    svg {
      opacity: 1;
    }
  }
}

.container {
  display: flex;
  flex-direction: column;
  width: 360px;
  max-height: 420px;
  padding: 8px;
  background-color: var(--color-content-background);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-primary-light-900-alpha-200);
  margin-bottom: 6px;
}

.headerTitle {
  display: flex;
  align-items: center;
  gap: 6px;

  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-font);
  }
}

.subTitle {
  font-size: 12px;
  color: var(--color-font-label);
}

.headerActions {
  display: flex;
  gap: 6px;
}

.actionBtn {
  font-size: 11px;
  padding: 2px 8px;
}

.listBody {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 360px;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 30px 0;
  color: var(--color-font-label);
  font-size: 13px;
}

.listItem {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color @transition-fast;
  position: relative;

  &:hover {
    background-color: var(--color-primary-light-900-alpha-200);
    .removeBtn {
      opacity: 0.7;
    }
  }

  &.active {
    background-color: var(--color-primary-light-800-alpha-300);
    .songName {
      color: var(--color-primary);
      font-weight: 600;
    }
  }
}

.indexCol {
  width: 24px;
  display: flex;
  align-items: center;
  font-size: 12px;
  color: var(--color-font-label);
}

.playingIcon {
  width: 14px;
  height: 14px;
  fill: var(--color-primary);
}

.infoCol {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding-right: 6px;
}

.songName {
  font-size: 12px;
  color: var(--color-font);
  .mixin-ellipsis-1();
  max-width: 55%;
}

.singer {
  font-size: 11px;
  color: var(--color-font-label);
  .mixin-ellipsis-1();
  flex: 1;
}

.timeCol {
  font-size: 11px;
  color: var(--color-font-label);
  width: 40px;
  text-align: right;
  margin-right: 4px;
}

.removeBtn {
  border: none;
  background: transparent;
  color: var(--color-font-label);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity @transition-fast, color @transition-fast;

  svg {
    width: 12px;
    height: 12px;
    fill: currentColor;
  }

  &:hover {
    opacity: 1 !important;
    color: var(--color-primary-dark-300);
  }
}
</style>
