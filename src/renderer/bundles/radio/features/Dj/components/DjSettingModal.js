import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { RADIO_BUNDLE } from '@common/bundles'
import { loadFeatureComponent } from '@renderer/core/features/component'
import SettingsWorkspace from '@renderer/components/settings/SettingsWorkspace.vue'
import DjIcon from '@renderer/components/common/SvgIcon.vue'

export default {
  name: 'DjSettingModal',
  components: {
    SettingsWorkspace,
    DjIcon,
    RadioSettings: defineAsyncComponent(async() => loadFeatureComponent('settings.radio')),
  },
  props: { visible: { type: Boolean, default: false } },
  emits: ['update:visible', 'save'],
  setup(props, { emit }) {
    const activeCategory = ref('llm')
    const categories = RADIO_BUNDLE.settings[0].children
    const menuGroups = computed(() => categories.map(category => ({ id: category.id, title: category.title })))
    watch(() => props.visible, visible => { if (visible) activeCategory.value = 'llm' })
    const close = () => { emit('update:visible', false) }
    const save = data => { emit('save', data); close() }
    return { activeCategory, menuGroups, close, save }
  },
}
