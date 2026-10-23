<template>
<transition enter-active-class="animated fadeIn" leave-active-class="animated fadeOut" @after-enter="handleAfterEnter" @after-leave="handleAfterLeave">
  <section v-if="isShowPlayerDetail" class="theme-detail" data-play-detail data-detail-theme="tide" :class="{ 'theme-comment-open': isShowPlayComment, fullscreen: isFullscreen }" role="dialog" aria-labelledby="play-detail-track" @contextmenu="handleContextMenu">
    <theme-backdrop /><ControlBtnsLeftHeader v-if="appSetting['common.controlBtnPosition'] === 'left'" /><ControlBtnsRightHeader v-else /><header class="theme-detail-masthead"><div class="theme-detail-track"><h1 id="play-detail-track">{{ musicInfo.name }}</h1><p>{{ musicInfo.singer }}</p><small v-if="musicInfo.album">{{ musicInfo.album }}</small></div></header><div class="theme-detail-stage"><div class="theme-detail-cover"><img v-if="musicInfo.pic" :src="musicInfo.pic" alt=""><theme-brand v-else compact /></div><LyricPlayer v-if="visibled" /><music-comment v-if="visibled" :show="isShowPlayComment" :music-info="playMusicInfo.musicInfo" @close="hideComment" /></div><play-bar v-if="visibled" />
  </section>
</transition>
</template>
