<template>
  <div class="settings-form">
    <div class="settings-parameters scroll"><slot /></div>
    <footer class="settings-actions"><slot name="actions"><span class="settings-save-hint">{{ $t('setting_auto_saved') }}</span></slot></footer>
  </div>
</template>
<style lang="less">
.settings-form { display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; }
.settings-parameters {
  flex: 1; min-height: 0; min-width: 0; overflow: auto; padding: 20px var(--settings-space, 24px); box-sizing: border-box;
  font-size: 13px; line-height: 1.6;
  > dl { margin: 0; }
  > dl > dt:first-child { display: none; }
  dt, h3, h4 { font-weight: 600; }
  dt, h3 { font-size: 14px; margin: 0 0 16px; padding: 0 0 8px; border-bottom: 1px solid var(--settings-line); color: var(--color-font); }
  dd { margin: 0; padding: 0 0 24px; }
  dd:last-child { padding-bottom: 0; }
  .gap-top { margin-top: 12px; }
  .gap-left { margin-right: 12px; margin-left: 0; }
  .p { padding: 5px 0; line-height: 1.6; }
  .p .btn + .btn { margin-left: 8px; }
  input:not([type=checkbox]):not([type=radio]):not([type=range]):not([data-inset-field]), select, textarea {
    font-size: 13px; font-family: inherit; color: var(--color-font); background-color: var(--color-content-background);
    border: 1px solid var(--lx-border); border-radius: 6px; min-height: 32px; box-sizing: border-box; padding: 6px 10px; max-width: 100%;
    &:focus-visible { outline: 2px solid var(--color-primary-alpha-700); outline-offset: 1px; }
  }
  input:disabled, select:disabled, textarea:disabled { opacity: .6; }
  .help-icon { margin: 0 6px; }
  .help-btn { padding: 0; margin: 0 6px; border: 0; background: none; color: var(--color-font-label); cursor: pointer; }
}
.settings-actions {
  flex: none; min-height: 58px; box-sizing: border-box; padding: 12px var(--settings-space, 24px);
  display: flex; justify-content: flex-end; align-items: center; gap: 10px; border-top: 1px solid var(--settings-line);
  background: var(--color-content-background); font-size: 12px;
  button { min-height: 32px; padding: 6px 16px; border-radius: 6px; font-size: 13px; }
}
.settings-save-hint { margin-right: auto; color: var(--color-font-label); font-size: 12px; }
</style>
