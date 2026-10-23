<template>
  <!-- The renderer escapes all raw HTML and allows only http(s) link targets. -->
  <!-- eslint-disable-next-line vue/no-v-html -- HTML is generated exclusively by the escaping renderer. -->
  <div :class="$style.content" @click="openLink" v-html="html"></div>
</template>
<script lang="ts" src="@renderer/bundles/radio/features/Dj/components/MessageContent.ts"></script>
<style lang="less" module>
.content { font-size: 14px; line-height: 1.75; overflow-wrap: anywhere; user-select: text; p { margin: 0; min-height: 1em; } h3,h4,h5,h6 { font-size: 1.08em; line-height: 1.5; margin: 12px 0 6px; font-weight: 600; } a { color: var(--color-primary); text-decoration: underline; cursor: pointer; } code { font-family: monospace; font-size: .9em; background: rgba(127,127,127,.12); padding: 2px 5px; border-radius: 4px; } pre { overflow-x: auto; background: rgba(127,127,127,.09); border-radius: 8px; padding: 12px; margin: 8px 0; code { padding: 0; background: transparent; white-space: pre; } } ul,ol { margin: 6px 0; padding-left: 24px; } blockquote { border-left: 3px solid var(--color-primary-alpha-300); margin: 8px 0; padding-left: 12px; color: var(--color-font-label); } > :first-child { margin-top: 0; } }
</style>
