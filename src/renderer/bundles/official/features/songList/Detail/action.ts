import { userLists } from '@renderer/store/list/state'
import { dialog } from '@renderer/plugins/Dialog'
import syncSourceList from '@renderer/store/list/syncSourceList'
import { getListDetail, getListDetailAll } from '@renderer/store/songList/action'
import { createUserList, addListMusics, setListMusics } from '@renderer/store/list/action'
import { handlePlay } from '@renderer/core/player/action'
import { clearPlayedList, clearTempPlayeList, setPlayListId, setPlayMusicInfo } from '@renderer/store/player/action'
import { playInfo } from '@renderer/store/player/state'
import { toRaw } from '@common/utils/vueTools'
import { LIST_IDS } from '@common/constants'
import { toMD5 } from '@renderer/utils'

import { updateListMeta } from '@renderer/store/list/listMeta'
import { listDetailInfo } from '@renderer/store/songList/state'

import { appSetting } from '@renderer/store/setting'

const getListId = (id: string, source: LX.OnlineSource) => `${source}__${id}`

export const addSongListDetail = async(
  id: string,
  source: LX.OnlineSource,
  name?: string,
  desc?: string | null,
  img?: string,
) => {
  // console.log(this.listDetail.info)
  // if (!this.listDetail.info.name) return
  const listId = getListId(id, source)
  const targetList = userLists.find((l: any) => (l.sourceListId == listId || l.sourceListId == id) && l.source == source)
  if (targetList) {
    const confirm = await dialog.confirm({
      message: window.i18n.t('duplicate_list_tip', { name: targetList.name }),
      cancelButtonText: window.i18n.t('lists__import_part_button_cancel'),
      confirmButtonText: window.i18n.t('confirm_button_text'),
    })
    if (!confirm) return
    void syncSourceList(targetList)
    return
  }

  const list = await getListDetailAll(id, source)
  const userListId = `${source}_${toMD5(listId)}`
  await createUserList({
    name: name ?? (listDetailInfo.id == id ? listDetailInfo.info.name : undefined),
    id: userListId,
    list,
    source,
    sourceListId: id,
  })

  const sourceNameMap: Record<string, string> = {
    kw: '酷我',
    kg: '酷狗',
    tx: 'QQ',
    wy: '网易',
    mg: '咪咕',
  }
  const sourceLabel = sourceNameMap[source] ?? source.toUpperCase()

  const listSubtitle = desc ?? (listDetailInfo.id == id ? listDetailInfo.info.desc : '') ?? ''
  const listCover = img ?? (listDetailInfo.id == id ? listDetailInfo.info.img : '') ?? (list.length ? list[0].meta?.picUrl ?? '' : '')

  updateListMeta(userListId, {
    subtitle: listSubtitle,
    tags: [sourceLabel, '歌单'],
    customPic: listCover,
  })
}

export const playSongListDetail = async(id: string, source: LX.OnlineSource, list?: LX.Music.MusicInfoOnline[], index: number = 0) => {
  if (!list?.length) list = (await getListDetail(id, source, 1)).list
  if (!list?.length) return

  const isAddAll = appSetting['player.isAddAllToPlayDirectoryOnPlay']
  const targetSong = list[index] || list[0]

  // Play immediately to prevent reaction delay
  const prevListId = playInfo.playerListId
  setPlayListId(LIST_IDS.DEFAULT)
  setPlayMusicInfo(LIST_IDS.DEFAULT, targetSong)
  if (appSetting['player.isAutoCleanPlayedList'] || prevListId != LIST_IDS.DEFAULT) clearPlayedList()
  clearTempPlayeList()
  handlePlay()

  if (isAddAll) {
    await setListMusics(LIST_IDS.DEFAULT, list.map(toRaw))
  } else {
    await addListMusics(LIST_IDS.DEFAULT, [toRaw(targetSong)])
  }

  if (isAddAll) {
    const fullList = await getListDetailAll(id, source)
    if (fullList.length) {
      await setListMusics(LIST_IDS.DEFAULT, fullList.map(toRaw))
    }
  }
}
