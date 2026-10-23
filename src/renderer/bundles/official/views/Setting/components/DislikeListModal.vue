<template lang="pug">
material-modal(:show="modelValue" teleport="#view" height="80%" width="80%" @close="$emit('update:modelValue', false)")
  main(:class="$style.main")
    h2 {{ $t('setting__dislike_list_title') }}
    div(:class="$style.content")
      textarea.scroll(v-model="rules" :class="$style.textarea" :placeholder="$t('setting__dislike_list_input_tip')")
  div(:class="$style.footer")
    div(:class="$style.tips") {{ $t('setting__dislike_list_tips') }}
    base-btn(:class="$style.btn" @click="handleSave") {{ $t('setting__dislike_list_save_btn') }}
</template>

<script lang="js" src="@renderer/bundles/official/features/Setting/components/DislikeListModal.js"></script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.main {
  // padding: 15px;
  // max-width: 400px;
  // min-width: 460px;
  // min-height: 200px;
  // width: ;
  flex: auto;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  // min-height: 0;
  // max-height: 100%;
  // overflow: hidden;
  h2 {
    margin: 20px;
    font-size: 16px;
    color: var(--color-font);
    line-height: 1.3;
    text-align: center;
  }
}

.content {
  flex: auto;
  // min-height: 100px;
  max-height: 100%;
  display: flex;
  padding: 0 15px;
}
.textarea {
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  border-radius: 4px;
  padding: 5px;
  background-color: var(--color-primary-light-200-alpha-900);
  box-sizing: border-box;
  font-family: inherit;
  resize: none;
}

.footer {
  box-sizing: border-box;
  flex: none;
  // width: @width;
  padding: 15px 15px;
  // padding: 2px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.tips {
  // padding: 10px 15px;
  font-size: 12px;
  line-height: 1.25;
  color: var(--color-550);
  white-space: pre-wrap;
}
.btn {
  min-width: 80px;
}

</style>
