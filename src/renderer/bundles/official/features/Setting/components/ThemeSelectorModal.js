import { markRaw, reactive, watch } from '@common/utils/vueTools'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { applyTheme, getThemes, buildBgUrl } from '@renderer/store/utils'

export default {
  name: 'ThemeSelectorModal',
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:modelValue'],
  setup(props) {
    const themeInfo = reactive({
      themeLights: [],
      themeDarks: [],
    })
    let dataPath = ''

    watch(() => props.modelValue, (val) => {
      if (!val) return
      getThemes((info) => {
      // console.log(info)
        const themes = [...info.themes, ...info.userThemes]
        const lights = []
        const darks = themes.filter(t => {
          if (t.isDark) return true
          lights.push(t)
          return false
        })
        dataPath = info.dataPath
        themeInfo.themeLights = lights.map(t => {
          return {
            id: t.id,
            // @ts-expect-error
            name: t.isCustom ? t.name : window.i18n.t('theme_' + t.id),
            styles: {
              '--color-primary-theme': t.config.themeColors['--color-theme'],
              '--background-image-theme': t.isCustom
                ? t.config.extInfo['--background-image'] == 'none'
                  ? 'none'
                  : buildBgUrl(t.config.extInfo['--background-image'], info.dataPath)
                : t.config.extInfo['--background-image'],
            },
          }
        })
        themeInfo.themeDarks = markRaw(darks.map(t => {
          return {
            id: t.id,
            // @ts-expect-error
            name: t.isCustom ? t.name : window.i18n.t('theme_' + t.id),
            styles: {
              '--color-primary-theme': t.config.themeColors['--color-theme'],
              '--background-image-theme': t.isCustom
                ? t.config.extInfo['--background-image'] == 'none'
                  ? 'none'
                  : buildBgUrl(t.config.extInfo['--background-image'], info.dataPath)
                : t.config.extInfo['--background-image'],
            },
          }
        }))
      })
    })

    const setLightId = (id) => {
      if (appSetting['theme.lightId'] == id) return
      updateSetting({ 'theme.lightId': id })
      if (appSetting['theme.id'] == 'auto') applyTheme('auto', id, appSetting['theme.darkId'], dataPath)
    }
    const setDarkId = (id) => {
      if (appSetting['theme.darkId'] == id) return
      updateSetting({ 'theme.darkId': id })
      if (appSetting['theme.id'] == 'auto') applyTheme('auto', appSetting['theme.lightId'], id, dataPath)
    }
    return {
      appSetting,
      themeInfo,
      setLightId,
      setDarkId,
    }
  },
}
