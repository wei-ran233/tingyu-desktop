import { ref, computed, onMounted, onBeforeUnmount } from '@common/utils/vueTools'
import { getSystemFonts } from '@renderer/utils/ipc'
import { isLinux } from '@common/utils'
import { appSetting, updateSetting } from '@renderer/store/setting'
import { useI18n } from '@renderer/plugins/i18n'
import { pickrTools } from '@renderer/utils/pickrTools'

const defaultUnplayColors = [
  'rgba(255, 255, 255, 1)',
  'rgba(255, 236, 144, 1)',
  'rgba(144, 255, 206, 1)',
  'rgba(32, 255, 132, 1)',
  'rgba(255, 226, 32, 1)',
  'rgba(57, 203, 255, 1)',
  'rgba(217, 57, 255, 1)',
  'rgba(255, 57, 71, 1)',
]
const defaultPlayedColors = [
  'rgba(255, 236, 144, 1)',
  'rgba(144, 255, 206, 1)',
  'rgba(32, 255, 132, 1)',
  'rgba(255, 226, 32, 1)',
  'rgba(57, 203, 255, 1)',
  'rgba(7, 197, 86, 1)',
  'rgba(25, 181, 254, 1)',
  'rgba(217, 57, 255, 1)',
  'rgba(255, 57, 71, 1)',
]
const defaultShadowColors = [
  'rgba(0, 0, 0, 0.15)',
]

const useLyricUnplayColor = () => {
  const lyric_unplay_color_ref = ref(null)
  let tools

  const initLyricUnplayColor = (color, changed, reset) => {
    if (!lyric_unplay_color_ref.value) return
    tools = pickrTools.create(lyric_unplay_color_ref.value, color, defaultUnplayColors, changed, reset)
  }
  const destroyLyricUnplayColor = () => {
    if (!tools) return
    tools.destroy()
    tools = null
  }
  const setLyricUnplayColor = (color) => {
    tools?.setColor(color)
  }

  return {
    lyric_unplay_color_ref,
    initLyricUnplayColor,
    destroyLyricUnplayColor,
    setLyricUnplayColor,
  }
}

const useLyricPlayedColor = () => {
  const lyric_played_color_ref = ref(null)
  let tools

  const initLyricPlayedColor = (color, changed, reset) => {
    if (!lyric_played_color_ref.value) return
    tools = pickrTools.create(lyric_played_color_ref.value, color, defaultPlayedColors, changed, reset)
  }
  const destroyLyricPlayedColor = () => {
    if (!tools) return
    tools.destroy()
    tools = null
  }
  const setLyricPlayedColor = (color) => {
    tools?.setColor(color)
  }

  return {
    lyric_played_color_ref,
    initLyricPlayedColor,
    destroyLyricPlayedColor,
    setLyricPlayedColor,
  }
}

const useLyricShadowColor = () => {
  const lyric_shadow_color_ref = ref(null)
  let tools

  const initLyricShadowColor = (color, changed, reset) => {
    if (!lyric_shadow_color_ref.value) return
    tools = pickrTools.create(lyric_shadow_color_ref.value, color, defaultShadowColors, changed, reset)
  }
  const destroyLyricShadowColor = () => {
    if (!tools) return
    tools.destroy()
    tools = null
  }
  const setLyricShadowColor = (color) => {
    tools?.setColor(color)
  }

  return {
    lyric_shadow_color_ref,
    initLyricShadowColor,
    destroyLyricShadowColor,
    setLyricShadowColor,
  }
}

const useLyricColor = () => {
  const { lyric_unplay_color_ref, initLyricUnplayColor, destroyLyricUnplayColor, setLyricUnplayColor } = useLyricUnplayColor()
  const { lyric_played_color_ref, initLyricPlayedColor, destroyLyricPlayedColor, setLyricPlayedColor } = useLyricPlayedColor()
  const { lyric_shadow_color_ref, initLyricShadowColor, destroyLyricShadowColor, setLyricShadowColor } = useLyricShadowColor()

  const initColors = () => {
    initLyricUnplayColor(appSetting['desktopLyric.style.lyricUnplayColor'], (color) => {
      updateSetting({ 'desktopLyric.style.lyricUnplayColor': color })
    })
    initLyricPlayedColor(appSetting['desktopLyric.style.lyricPlayedColor'], (color) => {
      updateSetting({ 'desktopLyric.style.lyricPlayedColor': color })
    })
    initLyricShadowColor(appSetting['desktopLyric.style.lyricShadowColor'], (color) => {
      updateSetting({ 'desktopLyric.style.lyricShadowColor': color })
    })
  }

  const destroyColors = () => {
    destroyLyricUnplayColor()
    destroyLyricPlayedColor()
    destroyLyricShadowColor()
  }

  const resetColor = () => {
    const defaultSetting = {
      'desktopLyric.style.lyricUnplayColor': 'rgba(255, 255, 255, 1)',
      'desktopLyric.style.lyricPlayedColor': 'rgba(7, 197, 86, 1)',
      'desktopLyric.style.lyricShadowColor': 'rgba(0, 0, 0, 0.18)',
    }
    updateSetting(defaultSetting)
    setLyricUnplayColor(defaultSetting['desktopLyric.style.lyricUnplayColor'])
    setLyricPlayedColor(defaultSetting['desktopLyric.style.lyricPlayedColor'])
    setLyricShadowColor(defaultSetting['desktopLyric.style.lyricShadowColor'])
  }

  onMounted(() => {
    initColors()
  })
  onBeforeUnmount(() => {
    destroyColors()
  })

  return {
    lyric_unplay_color_ref,
    lyric_played_color_ref,
    lyric_shadow_color_ref,
    resetColor,
  }
}

export default {
  name: 'SettingDesktopLyric',
  setup() {
    const t = useI18n()

    const changeLineGap = (step) => {
      let gap = appSetting['desktopLyric.style.lineGap'] + step
      updateSetting({ 'desktopLyric.style.lineGap': Math.min(Math.max(gap, 0), 25) })
    }

    const {
      lyric_unplay_color_ref,
      lyric_played_color_ref,
      lyric_shadow_color_ref,
      resetColor,
    } = useLyricColor()

    const systemFontList = ref([])
    const fontList = computed(() => {
      return [{ id: '', label: t('setting__desktop_lyric_font_default') }, ...systemFontList.value]
    })
    void getSystemFonts().then(fonts => {
      systemFontList.value = fonts.map(f => ({ id: f, label: f.replace(/(^"|"$)/g, '') }))
    })

    const resetWindowSetting = () => {
      updateSetting({
        'desktopLyric.width': 450,
        'desktopLyric.height': 300,
        'desktopLyric.x': null,
        'desktopLyric.y': null,
      })
    }

    return {
      appSetting,
      updateSetting,
      changeLineGap,
      lyric_unplay_color_ref,
      lyric_played_color_ref,
      lyric_shadow_color_ref,
      resetColor,
      resetWindowSetting,

      fontList,
      isLinux,
    }
  },
}
