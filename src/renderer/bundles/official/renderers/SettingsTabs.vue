<template>
  <div class="settings-page suite-settings-tabs">
    <settings-workspace :groups="menuGroups" :active-id="activeNavId" :title="activeTitle" :breadcrumb="activeGroupTitle" compact @select="toggleTab">
      <component :is="activeComponent" v-if="activeComponent === 'SettingRadio'" :section="selectedChild.id" />
      <settings-form v-else :key="activeComponent">
        <theme-settings v-if="activeComponent === 'ThemeSettings'" />
        <plugin-settings v-else-if="activeComponent === 'PluginSettings'" :plugin-id="selectedChild?.id || ''" />
        <component :is="activeComponent" v-else-if="activeComponent === 'FeatureManagement'" :section="selectedChild.id" />
        <dl v-else><component :is="activeComponent" /></dl>
      </settings-form>
    </settings-workspace>
  </div>
</template>
<style>
.settings-page { height: 100%; min-width: 0; min-height: 0; border-top: var(--color-list-header-border-bottom); }
</style>
