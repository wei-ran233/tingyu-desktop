<template>
<theme-page identity="petals" kind="settings" title="听歌的习惯。">

  <div class="settings-page">
    <settings-workspace :groups="menuGroups" :active-id="activeNavId" :title="activeTitle" :breadcrumb="activeGroupTitle" @select="toggleTab">
      <component :is="activeComponent" v-if="activeComponent === 'SettingRadio'" :section="selectedChild.id" />
      <settings-form v-else :key="activeComponent">
        <theme-settings v-if="activeComponent === 'ThemeSettings'" />
        <plugin-settings v-else-if="activeComponent === 'PluginSettings'" :plugin-id="selectedChild?.id || ''" />
        <component :is="activeComponent" v-else-if="activeComponent === 'FeatureManagement'" :section="selectedChild.id" />
        <dl v-else><component :is="activeComponent" /></dl>
      </settings-form>
    </settings-workspace>
  </div>

</theme-page>
</template>
