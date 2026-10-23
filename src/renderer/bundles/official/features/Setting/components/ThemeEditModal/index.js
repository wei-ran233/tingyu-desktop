import { joinPath, extname, copyFile, checkPath, createDir, removeFile, moveFile, basename } from '@common/utils/nodejs'
import { nextTick, ref, watch } from '@common/utils/vueTools'
import { applyTheme, buildThemeColors, getThemes, copyTheme, previewThemeColors } from '@renderer/store/utils'
import { isUrl, encodePath } from '@common/utils/common'
// import { appSetting, updateSetting } from '@renderer/store/setting'
// import { applyTheme, getThemes } from '@renderer/store/utils'
import { createThemeColors } from '@common/theme/utils'
import useMainColor from '@renderer/bundles/official/features/Setting/components/ThemeEditModal/useMainColor'
import useFontColor from '@renderer/bundles/official/features/Setting/components/ThemeEditModal/useFontColor'
import useAppBgColor from '@renderer/bundles/official/features/Setting/components/ThemeEditModal/useAppBgColor'
import useMainBgColor from '@renderer/bundles/official/features/Setting/components/ThemeEditModal/useMainBgColor'
import useAsideFontColor from '@renderer/bundles/official/features/Setting/components/ThemeEditModal/useAsideFontColor'
import useBadgePrimaryColor from '@renderer/bundles/official/features/Setting/components/ThemeEditModal/useBadgePrimaryColor'
import useBadgeSecondaryColor from '@renderer/bundles/official/features/Setting/components/ThemeEditModal/useBadgeSecondaryColor'
import useBadgeTertiaryColor from '@renderer/bundles/official/features/Setting/components/ThemeEditModal/useBadgeTertiaryColor'
import useCloseBtnColor from '@renderer/bundles/official/features/Setting/components/ThemeEditModal/useCloseBtnColor'
import useMinBtnColor from '@renderer/bundles/official/features/Setting/components/ThemeEditModal/useMinBtnColor'
import useHideBtnColor from '@renderer/bundles/official/features/Setting/components/ThemeEditModal/useHideBtnColor'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { removeTheme, saveTheme, showSelectDialog } from '@renderer/utils/ipc'
import { dialog } from '@renderer/plugins/Dialog'
import { themeInfo } from '@renderer/store'


export default {
  name: 'ThemeSelectorModal',
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
    themeId: {
      type: String,
      default: '',
    },
  },
  emits: ['update:modelValue', 'submit'],
  setup(props, { emit }) {
    const themeName = ref('')
    const isDark = ref(false)
    const isDarkFont = ref(false)
    const preview = ref(false)
    const bgImg = ref('')
    let bgImgRaw = ''
    let originBgName = ''
    let currentBgPath = ''

    let theme

    const getColor = (color, theme) => {
      return color.startsWith('var')
        ? theme.config.themeColors[color.replace(/var\((.+)\)/, '$1')]
        : color
    }

    const createPreview = () => {
      if (!preview.value) return
      previewThemeColors(buildThemeColors(theme, themeInfo.dataPath), theme?.config?.isDark ?? themeShouldUseDarkColors.value)
    }

    // '--color-app-background': string
    // '--color-main-background': string
    // '--color-nav-font': string
    // '--background-image': string
    // '--background-image-position': string
    // '--background-image-size': string

    // // 关闭按钮颜色
    // '--color-btn-hide': string
    // '--color-btn-min': string
    // '--color-btn-close': string

    // // 徽章颜色
    // '--color-badge-primary': string
    // '--color-badge-secondary': string
    // '--color-badge-tertiary': string
    const { primary_color_ref, initMainColor, destroyMainColor } = useMainColor()
    const { font_color_ref, initFontColor, destroyFontColor } = useFontColor()
    const { app_bg_color_ref, initAppBgColor, destroyAppBgColor, setAppBgColor } = useAppBgColor()
    const { aside_font_color_ref, initAsideFontColor, destroyAsideFontColor, setAsideFontColor } = useAsideFontColor()
    const { main_bg_color_ref, initMainBgColor, destroyMainBgColor, setMainBgColor } = useMainBgColor()
    const { badge_primary_color_ref, initBadgePrimaryColor, destroyBadgePrimaryColor, setBadgePrimaryColor } = useBadgePrimaryColor()
    const { badge_secondary_color_ref, initBadgeSecondaryColor, destroyBadgeSecondaryColor, setBadgeSecondaryColor } = useBadgeSecondaryColor()
    const { badge_tertiary_color_ref, initBadgeTertiaryColor, destroyBadgeTertiaryColor, setBadgeTertiaryColor } = useBadgeTertiaryColor()
    const { close_btn_color_ref, initCloseBtnColor, destroyCloseBtnColor, setCloseBtnColor } = useCloseBtnColor()
    const { min_btn_color_ref, initMinBtnColor, destroyMinBtnColor, setMinBtnColor } = useMinBtnColor()
    const { hide_btn_color_ref, initHideBtnColor, destroyHideBtnColor, setHideBtnColor } = useHideBtnColor()

    let appBgColorOrigin
    let appBgColor
    let asideFontColorOrigin
    let asideFontColor
    let mainBgColorOrigin
    let mainBgColor
    let badgePrimaryColorOrigin
    let badgePrimaryColor
    let badgeSecondaryColorOrigin
    let badgeSecondaryColor
    let badgeTertiaryColorOrigin
    let badgeTertiaryColor
    let closeBtnColorOrigin
    let closeBtnColor
    let minBtnColorOrigin
    let minBtnColor
    let hideBtnColorOrigin
    let hideBtnColor

    const applyPrimaryColor = (color, fontColor, isDark, isDarkFont) => {
      theme.config.themeColors = createThemeColors(color, fontColor, isDark, isDarkFont)
      if (theme.config.extInfo['--color-app-background'].startsWith('var')) setAppBgColor(getColor(appBgColorOrigin, theme))
      if (theme.config.extInfo['--color-nav-font'].startsWith('var')) setAsideFontColor(getColor(asideFontColorOrigin, theme))
      if (theme.config.extInfo['--color-main-background'].startsWith('var')) setMainBgColor(getColor(mainBgColorOrigin, theme))
      if (theme.config.extInfo['--color-badge-primary'].startsWith('var')) setBadgePrimaryColor(getColor(badgePrimaryColorOrigin, theme))
      if (theme.config.extInfo['--color-badge-secondary'].startsWith('var')) setBadgeSecondaryColor(getColor(badgeSecondaryColorOrigin, theme))
      if (theme.config.extInfo['--color-badge-tertiary'].startsWith('var')) setBadgeTertiaryColor(getColor(badgeTertiaryColorOrigin, theme))
      if (theme.config.extInfo['--color-btn-close'].startsWith('var')) setCloseBtnColor(getColor(closeBtnColorOrigin, theme))
      if (theme.config.extInfo['--color-btn-min'].startsWith('var')) setMinBtnColor(getColor(minBtnColorOrigin, theme))
      if (theme.config.extInfo['--color-btn-hide'].startsWith('var')) setHideBtnColor(getColor(hideBtnColorOrigin, theme))

      createPreview()
    }

    const initColors = (_theme) => {
      theme = _theme
      // console.log(theme)
      themeName.value = theme.name
      isDark.value = theme.isDark
      isDarkFont.value = theme.isDarkFont ?? false
      currentBgPath = ''
      if (theme.config.extInfo['--background-image'] == 'none') {
        bgImg.value = ''
        bgImgRaw = ''
        originBgName = ''
      } else {
        bgImgRaw = isUrl(theme.config.extInfo['--background-image'])
          ? theme.config.extInfo['--background-image']
          : joinPath(themeInfo.dataPath, theme.config.extInfo['--background-image'])
        bgImg.value = encodePath(bgImgRaw)
        originBgName = theme.config.extInfo['--background-image']
      }
      appBgColorOrigin = theme.config.extInfo['--color-app-background']
      appBgColor = getColor(appBgColorOrigin, theme)
      asideFontColorOrigin = theme.config.extInfo['--color-nav-font']
      asideFontColor = getColor(asideFontColorOrigin, theme)
      mainBgColorOrigin = theme.config.extInfo['--color-main-background']
      mainBgColor = getColor(mainBgColorOrigin, theme)
      badgePrimaryColorOrigin = theme.config.extInfo['--color-badge-primary']
      badgePrimaryColor = getColor(badgePrimaryColorOrigin, theme)
      badgeSecondaryColorOrigin = theme.config.extInfo['--color-badge-secondary']
      badgeSecondaryColor = getColor(badgeSecondaryColorOrigin, theme)
      badgeTertiaryColorOrigin = theme.config.extInfo['--color-badge-tertiary']
      badgeTertiaryColor = getColor(badgeTertiaryColorOrigin, theme)
      closeBtnColorOrigin = theme.config.extInfo['--color-btn-close']
      closeBtnColor = getColor(closeBtnColorOrigin, theme)
      minBtnColorOrigin = theme.config.extInfo['--color-btn-min']
      minBtnColor = getColor(minBtnColorOrigin, theme)
      hideBtnColorOrigin = theme.config.extInfo['--color-btn-hide']
      hideBtnColor = getColor(hideBtnColorOrigin, theme)

      initMainColor(theme.config.themeColors['--color-primary'], (color) => {
        applyPrimaryColor(color, theme.config.themeColors['--color-1000'], theme.isDark, theme.isDarkFont)
      })
      initFontColor(theme.config.themeColors['--color-1000'] ?? (isDark ? 'rgb(229, 229, 229)' : 'rgb(33, 33, 33)'), (color) => {
        applyPrimaryColor(theme.config.themeColors['--color-primary'], color, theme.isDark, theme.isDarkFont)
      })
      initAppBgColor(appBgColor, (color) => {
        // console.log('appBgColor', color)
        theme.config.extInfo['--color-app-background'] = color == appBgColor ? appBgColorOrigin : color
        createPreview()
      }, () => { setAppBgColor(getColor(appBgColorOrigin, theme)) })
      initAsideFontColor(asideFontColor, (color) => {
        theme.config.extInfo['--color-nav-font'] = color == asideFontColor ? asideFontColorOrigin : color
        createPreview()
      }, () => { setAsideFontColor(getColor(asideFontColorOrigin, theme)) })
      initMainBgColor(mainBgColor, (color) => {
        theme.config.extInfo['--color-main-background'] = color == mainBgColor ? mainBgColorOrigin : color
        createPreview()
      }, () => { setMainBgColor(getColor(mainBgColorOrigin, theme)) })
      initBadgePrimaryColor(badgePrimaryColor, (color) => {
        theme.config.extInfo['--color-badge-primary'] = color == badgePrimaryColor ? badgePrimaryColorOrigin : color
        createPreview()
      }, () => { setBadgePrimaryColor(getColor(badgePrimaryColorOrigin, theme)) })
      initBadgeSecondaryColor(badgeSecondaryColor, (color) => {
        theme.config.extInfo['--color-badge-secondary'] = color == badgeSecondaryColor ? badgeSecondaryColorOrigin : color
        createPreview()
      }, () => { setBadgeSecondaryColor(getColor(badgeSecondaryColorOrigin, theme)) })
      initBadgeTertiaryColor(badgeTertiaryColor, (color) => {
        theme.config.extInfo['--color-badge-tertiary'] = color == badgeTertiaryColor ? badgeTertiaryColorOrigin : color
        createPreview()
      }, () => { setBadgeTertiaryColor(getColor(badgeTertiaryColorOrigin, theme)) })
      initCloseBtnColor(closeBtnColor, (color) => {
        theme.config.extInfo['--color-btn-close'] = color == closeBtnColor ? closeBtnColorOrigin : color
        createPreview()
      }, () => { setCloseBtnColor(getColor(closeBtnColorOrigin, theme)) })
      initMinBtnColor(minBtnColor, (color) => {
        theme.config.extInfo['--color-btn-min'] = color == minBtnColor ? minBtnColorOrigin : color
        createPreview()
      }, () => { setMinBtnColor(getColor(minBtnColorOrigin, theme)) })
      initHideBtnColor(hideBtnColor, (color) => {
        theme.config.extInfo['--color-btn-hide'] = color == hideBtnColor ? hideBtnColorOrigin : color
        createPreview()
      }, () => { setHideBtnColor(getColor(hideBtnColorOrigin, theme)) })

      createPreview()
    }
    const destroyColors = () => {
      destroyMainColor()
      destroyFontColor()
      destroyAppBgColor()
      destroyAsideFontColor()
      destroyMainBgColor()
      destroyBadgePrimaryColor()
      destroyBadgeSecondaryColor()
      destroyBadgeTertiaryColor()
      destroyCloseBtnColor()
      destroyMinBtnColor()
      destroyHideBtnColor()
    }

    watch(() => props.modelValue, (visible) => {
      void nextTick(() => {
        getThemes(({ themes, userThemes }) => {
          if (visible) {
            if (props.themeId) {
              const theme = userThemes.find(t => t.id == props.themeId)
              if (theme) {
                initColors(copyTheme(theme))
                return
              }
            }
            const theme = copyTheme(themes[0])
            theme.id = 'user_theme_' + Date.now()
            theme.name = ''
            theme.isCustom = true
            initColors(theme)
          } else {
            destroyColors()
            // 移除临时保存的背景
            if (currentBgPath) removeFile(currentBgPath).catch(_ => _)
          }
        })
      })
    })

    const selectBgImg = async() => {
      const result = await showSelectDialog({
        title: window.i18n.t('theme_edit_modal__select_bg_file'),
        properties: ['openFile'],
        filters: [
          {
            name: 'Image File',
            extensions: [
              'jpg', 'jpeg', 'jfif', 'pjpeg',
              'pjp', 'png', 'apng', 'avif', 'gif', 'svg',
              'webp', 'bmp'],
          },
        ],
      })
      if (result.canceled) return
      const path = result.filePaths[0]
      const fileName = `${theme.id}_${Date.now()}${extname(path)}`
      const tempDir = joinPath(themeInfo.dataPath, 'temp')
      const bgPath = joinPath(tempDir, fileName)
      if (!await checkPath(tempDir)) await createDir(tempDir)
      await copyFile(path, bgPath)
      currentBgPath = bgImgRaw = bgPath
      bgImg.value = encodePath(bgImgRaw)
      theme.config.extInfo['--background-image'] = 'temp/' + fileName

      createPreview()
    }
    const removeBgImg = async() => {
      if (currentBgPath) {
        void removeFile(currentBgPath)
        currentBgPath = ''
      }
      bgImg.value = ''
      bgImgRaw = ''
      theme.config.extInfo['--background-image'] = 'none'
      createPreview()
    }
    const handleDark = (val) => {
      theme.isDark = val
      applyPrimaryColor(theme.config.themeColors['--color-primary'], theme.config.themeColors['--color-1000'], theme.isDark, theme.isDarkFont)
    }
    const handleDarkFont = (val) => {
      theme.isDarkFont = val
      applyPrimaryColor(theme.config.themeColors['--color-primary'], theme.config.themeColors['--color-1000'], theme.isDark, theme.isDarkFont)
    }
    /**
     * 预览主题
     * @param {*} val 是否预览当前编辑的主题
     */
    const handlePreview = (val) => {
      if (val) {
        createPreview()
      } else {
        applyTheme(appSetting['theme.id'], appSetting['theme.lightId'], appSetting['theme.darkId'], themeInfo.dataPath)
      }
    }
    const handleCancel = () => {
      handlePreview(false)
      emit('update:modelValue', false)
    }
    // 保存
    const handleSubmit = async() => {
      if (!themeName.value) return
      theme.name = themeName.value.substring(0, 20)
      // 保存新背景
      if (currentBgPath && !isUrl(currentBgPath)) {
        const name = basename(currentBgPath)
        await moveFile(currentBgPath, joinPath(themeInfo.dataPath, name))
        theme.config.extInfo['--background-image'] = name
      }
      // 移除旧背景
      if (originBgName &&
        theme.config.extInfo['--background-image'] != originBgName &&
        !isUrl(theme.config.extInfo['--background-image'])) void removeFile(joinPath(themeInfo.dataPath, originBgName))
      if (props.themeId) {
        const index = themeInfo.userThemes.findIndex(t => t.id == theme.id)
        if (index > -1) themeInfo.userThemes.splice(index, 1, theme)
      } else themeInfo.userThemes.push(theme)
      handlePreview(false)
      await saveTheme(theme)
      emit('submit')
      emit('update:modelValue', false)
    }
    // 删除
    const handleRemove = async() => {
      const confirm = await dialog.confirm({
        message: window.i18n.t('theme_edit_modal__remove_tip'),
        cancelButtonText: window.i18n.t('cancel_button_text'),
        confirmButtonText: window.i18n.t('confirm_button_text'),
      })
      if (!confirm) return
      let isRequireUpdateSetting = false
      const newSetting = {}
      if (appSetting['theme.id'] == props.themeId) {
        newSetting['theme.id'] = 'green'
        isRequireUpdateSetting = true
      }
      if (theme.isDark) {
        if (appSetting['theme.darkId'] == props.themeId) {
          newSetting['theme.darkId'] = 'black'
          isRequireUpdateSetting = true
        }
      } else {
        if (appSetting['theme.lightId'] == props.themeId) {
          newSetting['theme.lightId'] = 'green'
          isRequireUpdateSetting = true
        }
      }
      if (isRequireUpdateSetting) updateSetting(newSetting)
      if (originBgName) void removeFile(joinPath(themeInfo.dataPath, originBgName))
      await removeTheme(props.themeId)
      const index = themeInfo.userThemes.findIndex(t => t.id == theme.id)
      console.log(index)
      if (index > -1) themeInfo.userThemes.splice(index, 1)
      handlePreview(false)
      emit('submit')
      emit('update:modelValue', false)
    }
    // 另存为
    const handleSaveNew = async() => {
      if (!themeName.value) return
      theme.name = themeName.value.substring(0, 20)
      theme.id = 'user_theme_' + Date.now()
      // 保存新背景
      if (!isUrl(currentBgPath)) {
        if (currentBgPath) {
          const name = basename(currentBgPath)
          await moveFile(currentBgPath, joinPath(themeInfo.dataPath, name))
          theme.config.extInfo['--background-image'] = name
        } else if (bgImgRaw) {
          const fileName = `${theme.id}_${Date.now()}${extname(bgImgRaw)}`
          await copyFile(bgImgRaw, joinPath(themeInfo.dataPath, fileName))
          theme.config.extInfo['--background-image'] = fileName
        }
      }
      themeInfo.userThemes.push(theme)
      handlePreview(false)
      await saveTheme(theme)
      emit('submit')
      emit('update:modelValue', false)
    }

    return {
      themeName,
      bgImg,
      isDark,
      handleDark,
      isDarkFont,
      handleDarkFont,
      preview,
      handlePreview,
      handleCancel,
      handleSubmit,
      handleRemove,
      handleSaveNew,
      selectBgImg,
      removeBgImg,

      primary_color_ref,
      font_color_ref,
      app_bg_color_ref,
      main_bg_color_ref,
      aside_font_color_ref,
      badge_primary_color_ref,
      badge_secondary_color_ref,
      badge_tertiary_color_ref,
      close_btn_color_ref,
      min_btn_color_ref,
      hide_btn_color_ref,
    }
  },
}
