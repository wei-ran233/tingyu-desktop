<template>
  <main class="theme-studio" :class="{ 'theme-studio-embedded': embedded }">
    <header class="theme-studio-header">
      <div><h1 id="theme-studio-title">{{ embedded ? '主题与外观' : '让音乐有自己的空间。' }}</h1><p>选择主题后，颜色、图标与页面布局会一同切换。</p></div>
      <router-link to="/setting?name=FeatureManagement&amp;section=packages">管理插件</router-link>
    </header>
    <section class="theme-gallery" aria-labelledby="theme-studio-title">
      <button v-for="theme in immersiveThemes" :key="theme.key" type="button" class="theme-choice" :disabled="!!themeLoadingKey" :data-theme-choice="theme.id" :aria-pressed="selectedPluginTheme === theme.key" :style="previewStyle(theme)" @click="choose(theme.key)">
        <div class="theme-miniature" :data-preview="theme.appearance?.background || 'tide'">
          <theme-brand v-if="theme.appearance?.identity" :identity="theme.appearance.identity" compact class="theme-mini-brand" />
          <span class="mini-nav"><i /><i /><i /></span><span class="mini-record"><i /></span><span class="mini-tracks"><i /><i /><i /></span><span class="mini-player" />
        </div>
        <div class="theme-choice-copy"><h2>{{ theme.name }}</h2><span>{{ themeLoadingKey === theme.key ? '正在应用' : selectedPluginTheme === theme.key ? '正在使用' : (theme.isDark ? '暗色' : '亮色') }}</span><p>{{ theme.description || theme.pluginName }}</p></div>
      </button>
    </section>
    <details v-if="colorThemes.length" class="theme-other-colors"><summary>其他配色主题</summary><button v-for="theme in colorThemes" :key="theme.key" type="button" :aria-pressed="selectedPluginTheme === theme.key" @click="choose(theme.key)">{{ theme.name }}</button></details>
    <p v-if="!pluginThemeCatalog.length" class="theme-empty">还没有可用的主题。请在插件管理中启用「听觉空间 · 动态主题包」，或安装带主题的 .lxplugin 文件。</p>
    <footer class="theme-studio-controls">
      <label><input type="checkbox" :checked="themeMotionEnabled" @change="setThemeMotionEnabled(($event.target as HTMLInputElement).checked)"> 动态背景</label>
      <span>减少动态效果的系统偏好会优先生效。</span>
      <button type="button" :disabled="!selectedPluginTheme && !themeLoadingKey" @click="resetPluginTheme">恢复默认外观</button>
    </footer>
    <p v-if="error" role="alert">{{ error }}</p>
  </main>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { PluginThemeContribution } from '@common/plugin/types'
import { pluginThemeCatalog, selectedPluginTheme, themeLoadingKey, themeMotionEnabled, selectPluginTheme, resetPluginTheme, setThemeMotionEnabled, loadPluginThemes } from '@renderer/core/theme'
withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const error = ref('')
const immersiveThemes = computed(() => pluginThemeCatalog.value.filter(theme => theme.appearance))
const colorThemes = computed(() => pluginThemeCatalog.value.filter(theme => !theme.appearance))
const choose = async(key: string) => { try { await selectPluginTheme(key); error.value = '' } catch (reason: any) { error.value = String(reason.message) } }
const previewStyle = (theme: PluginThemeContribution) => Object.fromEntries(Object.entries(theme.tokens).filter(([key]) => ['--lx-background', '--lx-surface', '--lx-accent', '--lx-text', '--lx-border'].includes(key)))
onMounted(() => { void loadPluginThemes().catch(() => { error.value = '主题列表加载失败，请重新打开主题工作室。' }) })
defineExpose({ selectPluginTheme, resetPluginTheme, setThemeMotionEnabled, loadPluginThemes })
</script>
<style lang="less">
.theme-studio { height: 100%; overflow: auto; box-sizing: border-box; padding: 28px 38px; color: var(--color-font); }
.theme-studio.theme-studio-embedded { height: auto; overflow: visible; padding: 0; .theme-studio-header h1 { font-size: 20px; } .theme-studio-header p { font-size: 12px; } .theme-gallery { gap: 12px; } .theme-miniature { height: 130px; } .theme-choice-copy { padding: 12px; } .theme-choice-copy h2 { font-size: 18px; } }
.theme-studio-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
.theme-studio h1 { font-size: clamp(25px, 3vw, 38px); line-height: 1.35; font-weight: 500; letter-spacing: -.04em; margin: 0 0 10px; }
.theme-studio-header p { color: var(--color-font-label); font-size: 14px; margin: 0; line-height: 1.7; }
.theme-studio-header a { flex: none; color: var(--color-font); padding: 8px 0; text-decoration: underline; text-underline-offset: 5px; font-size: 13px; }
.theme-gallery { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
.theme-choice { padding: 0; text-align: left; color: var(--lx-text); background: var(--lx-surface); border: 1px solid var(--lx-border); border-radius: 14px; overflow: hidden; cursor: pointer; }
.theme-choice[aria-pressed=true] { outline: 2px solid var(--color-primary); outline-offset: 4px; }
.theme-choice:focus-visible, .theme-studio button:focus-visible, .theme-studio a:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 5px; }
.theme-miniature { height: 150px; position: relative; background: var(--lx-background); overflow: hidden; }
.theme-mini-brand { position: absolute; left: 13px; top: 10px; width: 23px; height: 23px; color: var(--lx-accent); }
.theme-miniature .mini-nav { top: 39px; padding-top: 6px; }
[data-preview=petals] .theme-mini-brand { top: 9px; left: 12px; width: 18px; height: 18px; }
[data-preview=petals] .mini-nav { left: 25%; top: 9px; }
.mini-nav { position: absolute; left: 13px; top: 22px; bottom: 25px; width: 18%; border-right: 1px solid var(--lx-border); display: flex; flex-direction: column; gap: 13px; padding-top: 10px; }
.mini-nav i { width: 50%; height: 5px; background: var(--lx-accent); border-radius: 4px; opacity: .65; }
.mini-record { position: absolute; width: 82px; height: 82px; left: 30%; top: 26px; background: repeating-radial-gradient(circle, var(--lx-background) 0 2px, var(--lx-border) 3px 4px); border-radius: 50%; display: grid; place-items: center; box-shadow: 10px 10px 25px #0002; }
.mini-record i { width: 25px; height: 25px; background: var(--lx-accent); border-radius: 50%; }
.mini-tracks { position: absolute; top: 43px; right: 9%; width: 21%; display: grid; gap: 15px; }
.mini-tracks i { height: 5px; background: var(--lx-text); border-radius: 2px; opacity: .4; }
.mini-tracks i:last-child { width: 70%; }
.mini-player { position: absolute; bottom: 14px; left: 29%; right: 7%; height: 22px; background: var(--lx-surface); border: 1px solid var(--lx-border); border-radius: 16px; }
[data-preview=tide] { background: radial-gradient(ellipse at 80% 100%, #296c7966, transparent 70%), var(--lx-background); }
[data-preview=signal] { background-image: linear-gradient(#f7bb4710 1px, transparent 1px), linear-gradient(90deg, #f7bb4710 1px, transparent 1px); background-size: 16px 16px; }
[data-preview=signal] .mini-nav { width: 8%; }
[data-preview=signal] .mini-record { border-radius: 8px; width: 90px; left: 21%; background: var(--lx-surface); border: 1px solid var(--lx-border); }
[data-preview=signal] .mini-record i { width: 65px; height: 32px; border-radius: 0; background: repeating-linear-gradient(90deg, var(--lx-accent) 0 3px, transparent 3px 8px); clip-path: polygon(0 40%, 15% 10%, 30% 50%, 45% 0, 60% 65%, 80% 25%, 100% 40%, 100% 70%, 0 70%); }
[data-preview=signal] .mini-player { left: 20%; right: 9%; border-radius: 2px; }
[data-preview=petals] { background: radial-gradient(ellipse at 85% 10%, #e8becb99, transparent 65%), var(--lx-background); }
[data-preview=petals] .mini-nav { top: 12px; left: 10%; right: 10%; width: auto; height: 10px; flex-direction: row; border: 0; }
[data-preview=petals] .mini-nav i { width: 22px; }
[data-preview=petals] .mini-record { top: 45px; left: 17%; border-radius: 40% 60% 45% 55%; background: #e6b9cd; }
[data-preview=petals] .mini-tracks { top: 70px; right: 16%; }
[data-preview=petals] .mini-player { left: 12%; right: 12%; height: 14px; }
.theme-choice-copy { padding: 18px; display: grid; grid-template-columns: 1fr auto; gap: 10px; }
.theme-choice-copy h2 { margin: 0; font-weight: 500; font-size: 21px; }
.theme-choice-copy span { font-size: 11px; align-self: center; opacity: .7; }
.theme-choice-copy p { grid-column: 1 / -1; font-size: 12px; line-height: 1.8; margin: 0; opacity: .75; }
.theme-other-colors { margin-top: 22px; color: var(--color-font-label); font-size: 12px; }
.theme-other-colors summary { cursor: pointer; }
.theme-other-colors button { margin: 12px 8px 0 0; background: var(--lx-surface); color: var(--color-font); border: 1px solid var(--lx-border); padding: 8px 12px; border-radius: 6px; cursor: pointer; }
.theme-studio-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 15px; margin-top: 28px; font-size: 13px; }
.theme-studio-controls label { display: flex; gap: 8px; align-items: center; }
.theme-studio-controls input { accent-color: var(--color-primary); }
.theme-studio-controls span { font-size: 11px; color: var(--color-font-label); flex: 1; }
.theme-studio-controls button { border: 1px solid var(--lx-border); color: inherit; background: var(--lx-surface); padding: 8px 12px; border-radius: 6px; cursor: pointer; }
.theme-studio-controls button:disabled { opacity: .45; cursor: default; }
.theme-empty { font-size: 12px; line-height: 1.9; color: var(--color-font-label); }
@media (max-width: 900px) { .theme-studio { padding: 22px; } .theme-gallery { gap: 12px; } .theme-miniature { height: 135px; } .theme-choice-copy { padding: 12px; } .mini-record { width: 64px; height: 64px; } }
@media (max-width: 640px) { .theme-gallery { grid-template-columns: 1fr; } .theme-studio-header { flex-direction: column; gap: 5px; } .theme-miniature { height: 150px; } }
</style>
