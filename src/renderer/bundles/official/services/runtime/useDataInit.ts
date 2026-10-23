import { getPlayInfo } from '@renderer/utils/ipc'
import music from '@renderer/utils/musicSdk'
import { log } from '@common/utils'
import { getListMusics, getUserLists, registerAction } from '@renderer/store/list/action'


import useInitUserApi from '@renderer/bundles/official/services/runtime/useInitUserApi'
import { play, playList } from '@renderer/core/player'
import { onBeforeUnmount } from '@common/utils/vueTools'
import { appSetting } from '@renderer/store/setting'
import { playMusicInfo } from '@renderer/store/player/state'
import { initDislikeInfo, registerRemoteDislikeAction } from '@renderer/core/dislikeList'

import { LIST_IDS } from '@common/constants'

const initPrevPlayInfo = async(isActive: () => boolean) => {
  const info = await getPlayInfo()
  if (!isActive()) return
  window.lx.restorePlayInfo = null
  if (!info?.listId || info.index < 0) return
  const list = await getListMusics(info.listId)
  if (!isActive()) return
  if (!list[info.index]) return
  window.lx.restorePlayInfo = info
  playList(info.listId, info.index)

  if (appSetting['player.startupAutoPlay']) {
    const musicInfo = playMusicInfo.musicInfo
    if (!musicInfo) return
    setTimeout(() => {
      if (isActive() && musicInfo.id == playMusicInfo.musicInfo?.id) play()
    })
  }
}

export default () => {
  let active = true
  const initUserApi = useInitUserApi()

  let unregister: null | (() => void) = null
  let unregisterDislikeEvent: null | (() => void) = null

  onBeforeUnmount(() => {
    active = false
    if (unregister) unregister()
    if (unregisterDislikeEvent) unregisterDislikeEvent()
  })

  return async() => {
    await Promise.all([
      initUserApi(), // 自定义API
    ]).catch(err => {
      log.error(err)
    })
    if (!active) return
    void music.init() // 初始化音乐sdk
    unregister = registerAction((ids) => {
      window.app_event.myListUpdate(ids)
    })
    window.lxData.userLists = await getUserLists() // 获取用户列表
    if (!active) return
    await getListMusics(LIST_IDS.DEFAULT).catch(err => { log.error(err) }) // 首次启动预加载默认列表
    if (!active) return
    unregisterDislikeEvent = registerRemoteDislikeAction()
    await initDislikeInfo() // 获取不喜欢列表
    if (!active) return
    await initPrevPlayInfo(() => active).catch(err => {
      log.error(err)
    }) // 初始化上次的歌曲播放信息
  }
}
