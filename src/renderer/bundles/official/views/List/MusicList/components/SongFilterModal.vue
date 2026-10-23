<template>
  <material-modal :show="show" teleport="#view" @close="handleClose">
    <main :class="$style.main">
      <div :class="$style.header">
        <h2 :class="$style.title">歌曲筛选</h2>
        <span :class="$style.closeBtn" @click="handleClose">✕</span>
      </div>

      <div :class="$style.content">
        <div v-for="cat in categories" :key="cat.name" :class="$style.section">
          <h3 :class="$style.sectionName">{{ cat.name }}</h3>
          <div :class="$style.tagList">
            <span
              v-for="tag in cat.tags"
              :key="tag"
              :class="[$style.tagPill, { [$style.activePill]: selectedTags.includes(tag) }]"
              @click="toggleTag(tag)"
            >
              {{ tag }}
            </span>
          </div>
        </div>
        <div v-if="!categories.length" :class="$style.emptyTip">
          暂无可用分类字段
        </div>
      </div>

      <div :class="$style.footer">
        <button :class="$style.resetBtn" @click="handleReset">重置</button>
        <button :class="$style.confirmBtn" @click="handleConfirm">确定</button>
      </div>
    </main>
  </material-modal>
</template>

<script lang="js" src="@renderer/bundles/official/features/List/MusicList/components/SongFilterModal.js"></script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.main {
  padding: 18px 24px;
  width: 480px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  background-color: var(--color-content-background);
  border-radius: 12px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.title {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-font);
  margin: 0;
  text-align: center;
  flex: 1;
}

.closeBtn {
  font-size: 14px;
  color: var(--color-font-label);
  cursor: pointer;
  padding: 4px;
  line-height: 1;

  &:hover {
    color: var(--color-font);
  }
}

.content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 380px;
  overflow-y: auto;
  padding-right: 4px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sectionName {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-font);
  margin: 0;
}

.tagList {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tagPill {
  font-size: 12px;
  padding: 5px 14px;
  border-radius: 16px;
  background-color: var(--color-primary-light-900-alpha-100);
  color: var(--color-font);
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;

  &:hover {
    background-color: var(--color-primary-light-900-alpha-200);
  }
}

.activePill {
  background-color: var(--color-primary-light-800-alpha-400);
  color: var(--color-primary) !important;
  font-weight: 600;
}

.emptyTip {
  text-align: center;
  color: var(--color-font-label);
  padding: 20px;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 24px;
}

.resetBtn {
  padding: 8px 36px;
  border-radius: 20px;
  border: 1px solid var(--color-primary-light-900-alpha-200);
  background: transparent;
  color: var(--color-font);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
}

.confirmBtn {
  padding: 8px 40px;
  border-radius: 20px;
  border: none;
  background-color: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.9;
  }
}
</style>
