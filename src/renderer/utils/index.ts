import { dateFormat } from '@common/utils/common'

export * from '@common/utils/renderer'
export * from '@common/utils/nodejs'
export * from '@common/utils/common'
export * from '@common/utils/tools'

/**
 * 格式化播放数量
 * @param {*} num 数字
 */
export const formatPlayCount = (num: number): string => {
  if (num > 100000000) return `${Math.trunc(num / 10000000) / 10}亿`
  if (num > 10000) return `${Math.trunc(num / 1000) / 10}万`
  return String(num)
}


/**
 * 时间格式化
 */
export const dateFormat2 = (time: number): string => {
  let differ = Math.trunc((Date.now() - time) / 1000)
  if (differ < 60) {
    return window.i18n.t('date_format_second', { num: differ })
  } else if (differ < 3600) {
    return window.i18n.t('date_format_minute', { num: Math.trunc(differ / 60) })
  } else if (differ < 86400) {
    return window.i18n.t('date_format_hour', { num: Math.trunc(differ / 3600) })
  } else {
    return dateFormat(time)
  }
}


/**
 * 设置标题
 */
let dom_title = document.getElementsByTagName('title')[0]
export const setTitle = (title: string | null) => {
  title ||= 'Tingyu'
  dom_title.innerText = title
}


// export const getProxyInfo = () => {
//   return proxy.enable && proxy.host
//     ? `http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`
//     : proxy.envProxy
//       ? `http://${proxy.envProxy.host}:${proxy.envProxy.port}`
//       : undefined
// }


export const getFontSizeWithScreen = (screenWidth: number = window.innerWidth): number => {
  return screenWidth <= 1440
    ? 16
    : screenWidth <= 1920
      ? 18
      : screenWidth <= 2560
        ? 20
        : screenWidth <= 2560 ? 20 : 22
}

export const normalizePageScale = (scale: unknown): LX.AppSetting['common.pageScale'] => {
  return typeof scale === 'number' && Number.isFinite(scale) ? Math.round(Math.max(0.75, Math.min(1.5, scale)) * 100) / 100 : 1
}

export const getEffectiveFontSize = (
  fontSize: number,
  pageScale: unknown,
  isFullscreen: boolean,
  screenWidth: number = window.screen.width,
): number => {
  const baseFontSize = isFullscreen ? getFontSizeWithScreen(screenWidth) : fontSize
  return Math.round(baseFontSize * normalizePageScale(pageScale) * 100) / 100
}

export const applyAppScale = (
  fontSize: number,
  pageScale: unknown,
  isFullscreen: boolean,
) => {
  const scale = normalizePageScale(pageScale)
  const root = document.documentElement
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  root.style.fontSize = `${getEffectiveFontSize(fontSize, scale, isFullscreen)}px`
  root.style.setProperty('--app-scale', String(scale))
  root.style.setProperty('--layout-toolbar-height', `${Math.round(54 * scale)}px`)
  root.style.setProperty('--layout-search-height', `${Math.round(28 * scale)}px`)
  root.style.setProperty('--layout-player-height', `${Math.round(66 * scale)}px`)
  root.style.setProperty('--layout-sidebar-width', `clamp(${Math.round(56 * scale)}px, 6.6vw, ${Math.round(96 * scale)}px)`)
  root.style.setProperty('--layout-list-pane-width', `clamp(${Math.round(152 * scale)}px, 16vw, ${Math.round(240 * scale)}px)`)
  root.style.setProperty('--layout-board-pane-width', `clamp(${Math.round(140 * scale)}px, 15vw, ${Math.round(220 * scale)}px)`)
  root.style.setProperty('--layout-setting-nav-width', `clamp(${Math.round(148 * scale)}px, 16vw, ${Math.round(228 * scale)}px)`)
  root.style.setProperty('--layout-shadow-size', `${Math.round(8 * scale)}px`)
  root.style.setProperty('--space-content-x', `${Math.round(16 * scale)}px`)
  root.style.setProperty('--space-content-y', `${Math.round(12 * scale)}px`)
  root.style.setProperty('--modal-safe-offset', `${Math.round(32 * scale)}px`)

  root.classList.toggle('layout-compact', viewportWidth <= 920)
  root.classList.toggle('layout-wide', viewportWidth >= 1203)
  root.classList.toggle('layout-large', viewportWidth >= 1386)
  root.classList.toggle('layout-short', viewportHeight <= 600)
}


export const deduplicationList = <T extends LX.Music.MusicInfo>(list: T[]): T[] => {
  const ids = new Set<string>()
  return list.filter(s => {
    if (ids.has(s.id)) return false
    ids.add(s.id)
    return true
  })
}

export const langS2T = async(str: string) => {
  return window.lx.worker.main.langS2t(Buffer.from(str).toString('base64')).then(b64 => Buffer.from(b64, 'base64').toString())
}

export const decodeName = (str: string | null = '') => {
  if (!str) return ''
  return new window.DOMParser().parseFromString(str, 'text/html').body.textContent
}
