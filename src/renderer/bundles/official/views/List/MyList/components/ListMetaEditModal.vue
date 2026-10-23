<template>
  <material-modal :show="visible" bg-close teleport="#view" width="450px" @close="handleClose">
    <div :class="$style.header">
      <h2>{{ $t('list_edit_meta_title') }}</h2>
    </div>
    <div :class="$style.content">
      <div :class="$style.formItem">
        <label :class="$style.label">{{ $t('list_edit_subtitle') }}</label>
        <base-input
          v-model="subtitle"
          :class="$style.input"
          type="text"
          :placeholder="$t('list_edit_subtitle_tip')"
        />
      </div>
      <div :class="$style.formItem">
        <label :class="$style.label">{{ $t('list_edit_tags') }}</label>
        <base-input
          v-model="tagsStr"
          :class="$style.input"
          type="text"
          :placeholder="$t('list_edit_tags_tip')"
        />
      </div>
      <div :class="$style.formItem">
        <label :class="$style.label">{{ $t('list_edit_custom_pic') }}</label>
        <base-input
          v-model="customPic"
          :class="$style.input"
          type="text"
          :placeholder="$t('list_edit_custom_pic_tip')"
        />
      </div>
    </div>
    <div :class="$style.footer">
      <base-btn :class="$style.btn" @click="handleClose">{{ $t('cancel') }}</base-btn>
      <base-btn :class="[$style.btn, $style.primary]" @click="handleSave">{{ $t('save') }}</base-btn>
    </div>
  </material-modal>
</template>

<script lang="ts" src="@renderer/bundles/official/features/List/MyList/components/ListMetaEditModal.ts"></script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.header {
  padding: 15px 20px 10px;
  h2 {
    font-size: 16px;
    color: var(--color-font);
  }
}

.content {
  padding: 10px 20px;
}

.formItem {
  margin-bottom: 12px;
}

.label {
  display: block;
  font-size: 12px;
  color: var(--color-font-label);
  margin-bottom: 5px;
}

.input {
  width: 100%;
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 10px 20px 15px;
}

.btn {
  font-size: 12px;
  padding: 6px 16px;
  &.primary {
    background-color: var(--color-primary);
    color: #fff;
  }
}
</style>
