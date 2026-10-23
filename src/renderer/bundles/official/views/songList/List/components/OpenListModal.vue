<template>
  <material-modal :show="props.modelValue" teleport="#view" width="60%" @close="emit('update:model-value', $event)" @after-enter="$refs.input.focus()">
    <main class="scroll" :class="$style.main">
      <h2>{{ $t('songlist__import_input_title') }}</h2>
      <div :class="$style.inputContent">
        <base-selection v-model="source" :class="$style.select" :list="props.sourceList" item-key="id" item-name="name" />
        <base-input
          ref="input"
          v-model.trim="text"
          :class="$style.input"
          :placeholder="$t('songlist__import_input_tip')"
          @submit="handleSubmit"
        />
      </div>
      <div :class="$style.footer">
        <div :class="$style.tips">
          <ul>
            <li>{{ $t('songlist__import_input_tip_1') }}</li>
            <li>{{ $t('songlist__import_input_tip_2') }}</li>
            <li>{{ $t('songlist__import_input_tip_3') }}</li>
            <li>
              {{ $t('songlist__import_input_tip_4') }}
              <span
                class="hover underline"
                aria-label="https://github.com/wei-ran233/tingyu-desktop/tree/main/doc"
                @click="openUrl('https://github.com/wei-ran233/tingyu-desktop/tree/main/doc')"
              >文档</span>
            </li>
          </ul>
        </div>
        <base-btn :class="$style.btn" @click="handleSubmit">{{ $t('songlist__import_input_btn_confirm') }}</base-btn>
      </div>
    </main>
  </material-modal>
</template>

<script lang="js" src="@renderer/bundles/official/features/songList/List/components/OpenListModal.js"></script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.main {
  padding: 0 15px;
  // max-width: 530px;
  // min-width: 300px;
  display: flex;
  flex-flow: column nowrap;
  min-height: 0;
  // max-height: 100%;
  // overflow: hidden;
  h2 {
    font-size: 14px;
    color: var(--color-font);
    line-height: 1.3;
    word-break: break-all;
    // text-align: center;
    padding: 15px 0 8px;
  }
}
.inputContent {
  display: flex;
  flex-flow: row nowrap;
}
.select {
  width: auto;
  :global {
    .label-content {
      height: 100%;
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }

    .selection-list {
      li {
        // background-color: var(--color-main-background);
        text-align: center;
        line-height: 32px;
        font-size: 13px;
        &:hover {
          background-color: var(--color-button-background-hover);
        }
        &:active {
          background-color: var(--color-button-background-active);
        }
      }
    }
  }
}
.input {
  flex: auto;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  // width: 100%;
  // height: 26px;
  padding: 8px 8px;
  color: var(--color-font);
}
.footer {
  margin: 50px 0 15px;
  display: flex;
  flex-flow: row nowrap;
  align-items: flex-end;
}

.tips {
  flex: auto;
  font-size: 12px;
  color: var(--color-font);
  line-height: 1.5;
  ul {
    list-style: decimal;
    padding-left: 15px;
  }
}

.btn {
  // box-sizing: border-box;
  // margin-left: 15px;
  // margin-bottom: 15px;
  // height: 36px;
  // line-height: 36px;
  // padding: 0 10px !important;
  min-width: 80px;
  // .mixin-ellipsis-1();
}


</style>
