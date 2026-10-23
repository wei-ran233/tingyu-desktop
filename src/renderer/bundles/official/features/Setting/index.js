import { computed, ref, onMounted, onBeforeUnmount, watch } from '@common/utils/vueTools'
import { defineAsyncComponent } from 'vue'
import { NATIVE_SETTINGS } from '@common/bundles'
import settingGroups from '@common/bundles/settings-groups.json'
import { useRoute, useRouter } from '@common/utils/vueRouter'
import { useI18n } from '@renderer/plugins/i18n'
import { featureEnabled } from '@renderer/core/features/state'
import { loadFeatureComponent } from '@renderer/core/features/component'
import FeatureManagement from '@renderer/components/feature/FeatureManagement.vue'
import SettingsWorkspace from '@renderer/components/settings/SettingsWorkspace.vue'
import SettingsForm from '@renderer/components/settings/SettingsForm.vue'
import ThemeSettings from '@renderer/components/settings/ThemeSettings.vue'
import PluginSettings from '@renderer/components/settings/PluginSettings.vue'
import { settingsPlugins, loadSettingsPlugins } from '@renderer/core/pluginCatalog'

const sections = NATIVE_SETTINGS
export default {
  name: 'OfficialSettingsFeature',
  components: {
    FeatureManagement,
    SettingsWorkspace,
    SettingsForm,
    ThemeSettings,
    PluginSettings,
    ...Object.fromEntries(sections.map(section => [section.id, defineAsyncComponent(async() => loadFeatureComponent(section.featureId))])),
  },
  setup() {
    const route = useRoute()
    const router = useRouter()
    const t = useI18n()
    const tocList = computed(() => [
      ...sections.filter(section => featureEnabled(section.featureId)).map(section => ({ ...section, title: t(section.titleKey) })),
      { id: 'ThemeSettings', title: '主题与外观', group: 'general' },
      { id: 'PluginSettings', title: '插件设置', group: 'maintenance', children: settingsPlugins.value.map(plugin => ({ id: plugin.id, title: plugin.name })) },
      { id: 'FeatureManagement', title: '插件与视图', group: 'maintenance', children: [{ id: 'packages', title: '插件管理' }, { id: 'functions', title: '功能与渲染' }, { id: 'collections', title: '集合视图' }] },
    ])
    const avtiveComponentName = ref(typeof route.query.name === 'string' && tocList.value.some(section => section.id === route.query.name) ? route.query.name : tocList.value[0].id)
    const radioSection = ref(typeof route.query.section === 'string' ? route.query.section : 'llm')
    const activeComponent = computed(() => tocList.value.some(section => section.id === avtiveComponentName.value) ? avtiveComponentName.value : 'FeatureManagement')
    const activeSection = computed(() => tocList.value.find(section => section.id === activeComponent.value))
    const menuGroups = computed(() => settingGroups.map(group => ({
      id: group.id,
      title: t(group.titleKey),
      children: tocList.value.filter(section => (section.group ?? 'maintenance') === group.id).flatMap(section => section.children?.length
        ? section.children.map(child => ({ id: `${section.id}:${child.id}`, title: child.title }))
        : [{ id: section.id, title: section.title }]),
    })).filter(group => group.children.length))
    const selectedChild = computed(() => activeSection.value?.children?.find(child => child.id === radioSection.value) ?? activeSection.value?.children?.[0])
    const activeNavId = computed(() => selectedChild.value ? `${activeComponent.value}:${selectedChild.value.id}` : activeComponent.value)
    const activeTitle = computed(() => selectedChild.value?.title ?? activeSection.value?.title)
    const activeGroupTitle = computed(() => menuGroups.value.find(group => group.children.some(child => child.id === activeNavId.value))?.title ?? '')
    const toggleTab = id => {
      const [component, child] = id.split(':')
      if (!tocList.value.some(section => section.id === component)) return
      avtiveComponentName.value = component
      const children = activeSection.value?.children
      if (children?.length) radioSection.value = children.some(item => item.id === child) ? child : children[0].id
      void router.replace({ query: { ...route.query, name: component, section: children?.length ? radioSection.value : undefined } })
    }
    watch(() => [route.query.name, route.query.section], ([name, section]) => {
      if (typeof name === 'string' && tocList.value.some(item => item.id === name)) avtiveComponentName.value = name
      if (typeof section === 'string') radioSection.value = section
    })
    const reload = () => { void loadSettingsPlugins().catch(error => { console.warn('[settings] plugin catalog unavailable', error) }) }
    onMounted(() => { reload(); window.addEventListener('lx:collection-catalog-changed', reload) })
    onBeforeUnmount(() => { window.removeEventListener('lx:collection-catalog-changed', reload) })
    return { tocList, avtiveComponentName, activeComponent, menuGroups, activeNavId, activeTitle, activeGroupTitle, radioSection, selectedChild, toggleTab }
  },
}
