<template>
<theme-page identity="tide" kind="download" title="把声音留在身边。">

  <section class="suite-download-cards">
    <header class="music-page-heading"><h2>{{ $t('download') }}</h2><span class="music-page-count">{{ list.length }}</span></header>
    <div class="music-page-toolbar"><base-tab v-model="activeTab" :list="tabs" /></div>
    <div v-if="list.length" class="suite-task-grid scroll">
      <article v-for="(item, index) in list" :key="item.id">
        <h3 :title="getName(item)">{{ getName(item) }}</h3>
        <p>{{ item.metadata.musicInfo.singer }} · {{ getTypeName(item.metadata.quality) }}</p>
        <progress :value="item.progress" max="100" :aria-label="$t('download__progress')" />
        <div class="suite-task-status"><span>{{ item.statusText }}</span><span>{{ item.progress }}%</span></div>
        <div class="suite-task-actions">
          <button v-if="!item.isComplate && item.status !== downloadStatus.WAITING && item.status !== downloadStatus.RUN" type="button" @click="handleListBtnClick({ action: 'start', index })">{{ $t('download_status_start') }}</button>
          <button v-if="!item.isComplate && (item.status === downloadStatus.RUN || item.status === downloadStatus.WAITING)" type="button" @click="handleListBtnClick({ action: 'pause', index })">{{ $t('list__pause') }}</button>
          <button v-if="item.status === downloadStatus.COMPLETED" type="button" @click="handleListBtnClick({ action: 'play', index })">{{ $t('list__play') }}</button>
          <button type="button" @click="handleListBtnClick({ action: 'remove', index })">{{ $t('list__remove') }}</button>
        </div>
      </article>
    </div>
    <div v-else class="music-page-empty">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" /></svg>
      <p>{{ $t('no_item') }}</p><small>{{ $t('page_download_empty_hint') }}</small>
      <router-link to="/search">{{ $t('search') }}</router-link>
    </div>
  </section>

</theme-page>
</template>
<style>
.suite-download-cards { display: flex; flex-direction: column; min-width: 0; height: 100%; box-sizing: border-box; }
.suite-task-grid { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; overflow: auto; align-content: start; padding: 20px 24px; }
.suite-task-grid article { min-width: 0; border: 1px solid var(--lx-border); border-radius: 8px; padding: 16px; }
.suite-task-grid h3 { margin: 0; font-size: 14px; line-height: 1.5; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.suite-task-grid p { font-size: 12px; line-height: 1.6; margin: 6px 0 14px; opacity: .7; }
.suite-task-grid progress { display: block; width: 100%; height: 5px; accent-color: var(--color-primary); }
.suite-task-grid progress::-webkit-progress-bar { background: var(--color-primary-light-900); border-radius: 3px; }
.suite-task-grid progress::-webkit-progress-value { background: var(--color-primary); border-radius: 3px; }
.suite-task-status { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; line-height: 1.5; padding: 8px 0 16px; }
.suite-task-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.suite-task-grid button { min-height: 30px; padding: 5px 10px; border-radius: 6px; font-size: 12px; color: var(--color-font); background: var(--color-button-background); border: 1px solid var(--lx-border); cursor: pointer; }
.suite-task-grid button:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
@media (max-width: 920px) { .suite-task-grid { padding: 16px; } }
</style>
