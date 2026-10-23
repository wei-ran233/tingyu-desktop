<template>
  <section :class="$style.picker" aria-label="选择模型">
    <div :class="$style.heading">
      <label for="dj-model-search">模型</label>
      <button type="button" :disabled="loading" @click="refresh"><DjIcon name="refresh" /> {{ loading ? '读取中…' : '刷新模型' }}</button>
    </div>
    <div :class="$style.search"><DjIcon name="search" /><input id="dj-model-search" v-model="query" data-inset-field placeholder="搜索模型名称，如 GLM、Kimi、MiniMax" /></div>
    <p :class="$style.source" role="status">{{ statusText }}</p>
    <div :class="$style.options" role="listbox" aria-label="可选模型">
      <button v-for="model in filteredModels" :key="model.id" type="button" role="option" :aria-selected="model.id === normalizedValue" :disabled="!model.supported" :class="[$style.option, { [$style.selected]: model.id === normalizedValue }]" @click="$emit('update:modelValue', model.id)">
        <span :class="$style.modelName">{{ model.name }}<small v-if="model.name !== model.id">{{ model.id }}</small></span>
        <span :class="$style.badges"><span v-if="model.reasoning">推理</span><span>{{ model.supported ? protocolLabel(model.api) : '协议待确认' }}</span><DjIcon v-if="model.id === normalizedValue" name="check" /></span>
      </button>
      <p v-if="!filteredModels.length" :class="$style.empty">{{ query ? '没有匹配的模型，试试其他关键词' : '暂无模型，请刷新列表或手动输入' }}</p>
    </div>
    <div :class="$style.current">当前选择：<strong>{{ modelValue || '尚未选择' }}</strong></div>
    <details :class="$style.manual"><summary>手动输入模型名称</summary><input :value="modelValue" aria-label="模型名称" placeholder="输入模型 ID" @input="$emit('update:modelValue', $event.target.value)" /></details>
  </section>
</template>

<script lang="js" src="@renderer/bundles/radio/features/Dj/components/ModelPicker.js"></script>

<style lang="less" module>
.picker { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.heading { display: flex; align-items: center; justify-content: space-between; label { font-size: 14px; font-weight: 600; } button { color: var(--color-primary); background: transparent; border: 1px solid var(--color-primary-alpha-300); padding: 6px 10px; border-radius: 6px; cursor: pointer; &:disabled { opacity: .5; } } }
.search { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border: 1px solid var(--color-primary-alpha-300); border-radius: 8px; color: var(--color-primary); input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; color: var(--color-font); font: inherit; } &:focus-within { outline: 2px solid var(--color-primary-alpha-300); } }
.source { margin: 0; font-size: 12px; line-height: 1.5; color: var(--color-font-label); }
.options { max-height: 212px; overflow-y: auto; border: 1px solid var(--color-primary-alpha-200); border-radius: 8px; }
.option { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; background: transparent; color: var(--color-font); border: none; border-bottom: 1px solid var(--color-primary-alpha-100); padding: 10px 12px; text-align: left; cursor: pointer; &:hover, &.selected { background: var(--color-primary-alpha-100); } &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; } &:disabled { opacity: .5; cursor: not-allowed; } }
.modelName { min-width: 0; overflow-wrap: anywhere; font-size: 13px; small { display: block; color: var(--color-font-label); font-size: 11px; margin-top: 3px; } }
.badges { display: flex; align-items: center; gap: 5px; color: var(--color-primary); font-size: 10px; white-space: nowrap; span { padding: 2px 5px; border: 1px solid var(--color-primary-alpha-200); border-radius: 4px; } }
.current { font-size: 12px; line-height: 1.5; color: var(--color-font-label); overflow-wrap: anywhere; strong { color: var(--color-primary); font-weight: 500; } }
.manual { font-size: 12px; color: var(--color-font-label); summary { cursor: pointer; padding: 4px 0; } input { margin-top: 6px; padding: 9px 10px; width: 100%; box-sizing: border-box; border: 1px solid var(--color-primary-alpha-300); border-radius: 6px; background: transparent; color: var(--color-font); } }
.empty { padding: 14px; font-size: 12px; color: var(--color-font-label); }
</style>
