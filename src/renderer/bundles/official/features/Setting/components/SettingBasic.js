import { computed, ref, watch, reactive, shallowReactive } from '@common/utils/vueTools'
import { windowSizeList, userApi, isFullscreen, themeId } from '@renderer/store'
import { langList, useI18n } from '@root/lang'
import { getSystemFonts } from '@renderer/utils/ipc'
import apiSourceInfo from '@renderer/utils/musicSdk/api-source-info'
import { useTimeout } from '@renderer/core/player/timeoutStop'
import { dialog } from '@renderer/plugins/Dialog'

import ThemeSelectorModal from '@renderer/bundles/official/views/Setting/components/ThemeSelectorModal.vue'
import ThemeEditModal from '@renderer/bundles/official/views/Setting/components/ThemeEditModal/index.vue'
import PlayTimeoutModal from '@renderer/bundles/official/views/Setting/components/PlayTimeoutModal.vue'
import UserApiModal from '@renderer/bundles/official/views/Setting/components/UserApiModal.vue'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { getThemes, applyTheme, findTheme, buildBgUrl } from '@renderer/store/utils'
import { resetPluginTheme } from '@renderer/core/theme'

export default {
  name: 'SettingBasic',
  components: {
    ThemeSelectorModal,
    ThemeEditModal,
    PlayTimeoutModal,
    UserApiModal,
  },
  setup() {
    const t = useI18n()

    const showAllTheme = ref(false)
    const defaultThemesRaw = shallowReactive([])
    const defaultThemes = computed(() => {
      return defaultThemesRaw.map(theme => ({ ...theme, isDefault: true, name: t('theme_' + theme.id) }))
    })
    const userThemes = shallowReactive([])
    const allThemes = computed(() => {
      return [...defaultThemes.value, ...userThemes]
    })
    const themeList = computed(() => {
      if (!allThemes.value.length) return []
      return showAllTheme.value
        ? allThemes.value
        : themeId.value == 'auto'
          ? []
          : [allThemes.value.find(t => t.id == themeId.value) ?? allThemes.value[0]]
    })
    const autoTheme = reactive({})
    const updateAutoTheme = (info) => {
      let light = findTheme(info, appSetting['theme.lightId'])
      light ??= info.themes.find(theme => theme.id == 'green')
      let dark = findTheme(info, appSetting['theme.darkId'])
      dark ??= info.themes.find(theme => theme.id == 'black')
      autoTheme['--color-primary-theme-light'] = light.config.themeColors['--color-theme']
      autoTheme['--background-image-theme-light'] = light.isCustom
        ? light.config.extInfo['--background-image'] == 'none'
          ? 'none'
          : buildBgUrl(light.config.extInfo['--background-image'], info.dataPath)
        : light.config.extInfo['--background-image']
      autoTheme['--color-primary-theme-dark'] = dark.config.themeColors['--color-theme']
      autoTheme['--background-image-theme-dark'] = dark.isCustom
        ? dark.config.extInfo['--background-image'] == 'none'
          ? 'none'
          : buildBgUrl(dark.config.extInfo['--background-image'], info.dataPath)
        : dark.config.extInfo['--background-image']
    }

    let dataPath = ''
    const init = () => {
      getThemes((info) => {
        // console.log(info)
        dataPath = info.dataPath
        defaultThemesRaw.splice(0, defaultThemesRaw.length, ...info.themes.map(t => {
          return {
            id: t.id,
            styles: {
              '--color-primary-theme': t.config.themeColors['--color-theme'],
              '--background-image-theme': t.config.extInfo['--background-image'],
            },
          }
        }))
        userThemes.splice(0, userThemes.length, ...info.userThemes.map(t => {
          return {
            id: t.id,
            name: t.name,
            styles: {
              '--color-primary-theme': t.config.themeColors['--color-theme'],
              '--background-image-theme': t.config.extInfo['--background-image'] == 'none'
                ? 'none'
                : buildBgUrl(t.config.extInfo['--background-image'], info.dataPath),
            },
          }
        }))
        updateAutoTheme(info)
      })
    }
    const editThemeId = ref('')
    const handleEditTheme = (theme) => {
      // console.log(theme)
      if (theme?.isDefault) return
      if (!theme && userThemes.length >= 10) {
        void dialog({
          message: t('theme_max_tip'),
          confirmButtonText: t('alert_button_text'),
        })
        return
      }
      editThemeId.value = theme ? theme.id : ''
      isShowThemeEditModal.value = true
    }
    const handleRefreshTheme = () => {
      init()
    }
    init()
    const toggleTheme = (theme) => {
      resetPluginTheme()
      if (themeId.value == theme.id) return
      themeId.value = theme.id
      applyTheme(theme.id, appSetting['theme.lightId'], appSetting['theme.darkId'], dataPath)
      updateSetting({ 'theme.id': theme.id })
    }

    watch(() => [appSetting['theme.lightId'], appSetting['theme.darkId']], () => {
      getThemes(updateAutoTheme)
    })
    const isShowThemeSelectorModal = ref(false)
    const handleSetThemeAuto = () => {
      if (themeId.value == 'auto') return
      if (window.localStorage.getItem('theme-auto-tip') != 'true') {
        window.localStorage.setItem('theme-auto-tip', 'true')
        void dialog({
          message: t('setting__basic_theme_auto_tip'),
          confirmButtonText: t('ok'),
        })
      }
      toggleTheme({ id: 'auto' })
    }
    const isShowThemeEditModal = ref(false)

    const isShowPlayTimeoutModal = ref(false)
    const { timeLabel } = useTimeout()

    const isShowUserApiModal = ref(false)
    const getApiStatus = () => {
      let status
      if (userApi.status) status = t('setting__basic_source_status_success')
      else if (userApi.message == 'initing') status = t('setting__basic_source_status_initing')
      else status = `${t('setting__basic_source_status_failed')}`

      return status
    }
    const apiSources = computed(() => {
      return [
        ...apiSourceInfo.map(api => ({
          id: api.id,
          name: api.name,
          label: api.name,
          disabled: api.disabled,
        })),
        ...userApi.list.map(api => ({
          id: api.id,
          name: api.name,
          label: `${api.name}${api.id == appSetting['common.apiSource'] ? `[${getApiStatus()}]` : ''}`,
          desc: [/^\d/.test(api.version) ? `v${api.version}` : api.version].filter(Boolean).join(', '),
          statusLabel: api.id == appSetting['common.apiSource'] ? `[${getApiStatus()}]` : '',
          status: api.status,
          message: api.message,
          disabled: false,
        })),
      ]
    })

    const sourceNameTypes = computed(() => {
      return [
        { id: 'real', label: t('setting__basic_sourcename_real') },
        { id: 'alias', label: t('setting__basic_sourcename_alias') },
      ]
    })


    const controlBtnPositionList = computed(() => {
      return [
        { id: 'left', name: t('setting__basic_control_btn_position_left') },
        { id: 'right', name: t('setting__basic_control_btn_position_right') },
      ]
    })

    const systemFontList = ref([])
    const fontList = computed(() => {
      return [{ id: '', label: t('setting__desktop_lyric_font_default') }, ...systemFontList.value]
    })
    void getSystemFonts().then(fonts => {
      systemFontList.value = fonts.map(f => ({ id: f, label: f.replace(/(^"|"$)/g, '') }))
    })

    const fonts = computed(() => {
      if (!appSetting['common.font']) return ['', '']
      let [f1 = '', f2 = ''] = appSetting['common.font'].split(',')
      return [f1.trim(), f2.trim()]
    })
    const updateFonts = (font1, font2) => {
      let font = []
      if (font1) font.push(font1)
      if (font2) font.push(font2)
      updateSetting({ 'common.font': font.join(', ') })
    }
    const fontSizeList = computed(() => {
      return [
        { id: 14, label: t('setting__basic_font_size_14px') },
        { id: 15, label: t('setting__basic_font_size_15px') },
        { id: 16, label: t('setting__basic_font_size_16px') },
        { id: 17, label: t('setting__basic_font_size_17px') },
        { id: 18, label: t('setting__basic_font_size_18px') },
        { id: 19, label: t('setting__basic_font_size_19px') },
      ]
    })
    return {
      appSetting,
      updateSetting,
      userThemes,
      autoTheme,
      showAllTheme,
      themeList,
      fonts,
      updateFonts,
      // currentStting,
      // themes,
      // themeClassName,
      isShowThemeSelectorModal,
      isShowThemeEditModal,
      handleSetThemeAuto,
      isShowPlayTimeoutModal,
      timeLabel,
      apiSources,
      isShowUserApiModal,
      windowSizeList,
      langList,
      sourceNameTypes,
      controlBtnPositionList,
      fontList,
      isFullscreen,
      toggleTheme,
      themeId,
      handleRefreshTheme,
      editThemeId,
      handleEditTheme,
      fontSizeList,
    }
  },
}
