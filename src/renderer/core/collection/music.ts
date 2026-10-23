import { PLUGIN_EVENT_NAME } from '@common/ipcNames'
import { rendererInvoke } from '@common/rendererIpc'
import { LIST_IDS, QUALITYS } from '@common/constants'
import type { CollectionCommandOptions, MusicItemSummary } from '@common/collection/types'
import { addListMusics, getListMusics, getUserLists, moveListMusics, removeListMusics, setListMusics } from '@renderer/store/list/action'
import { userLists } from '@renderer/store/list/state'
import { addTempPlayList } from '@renderer/store/player/action'
import { playList } from '@renderer/core/player/action'
import { addDislikeInfo } from '@renderer/core/dislikeList'
import { createDownloadTasks } from '@renderer/store/download/action'
import { assertApiSupport } from '@renderer/store/utils'
import { appSetting } from '@renderer/store/setting'
import { dialog } from '@renderer/plugins/Dialog'
import { openUrl } from '@common/utils/electron'
import { toOldMusicInfo } from '@renderer/utils'
import musicSdk from '@renderer/utils/musicSdk'
import { toRaw } from '@common/utils/vueTools'

const QUALITY_LABELS: Record<string, string> = {
  flac24bit: 'tag__lossless_24bit',
  flac: 'tag__lossless',
  wav: 'WAV',
  ape: 'APE',
  '320k': 'tag__high_quality',
  '192k': '192k',
  '128k': '128k',
}

export const musicKey = (info: LX.Music.MusicInfo): string => `${info.source}:${info.id}`

export const toMusicSummary = (info: LX.Music.MusicInfo): MusicItemSummary => {
  const qualitys = 'qualitys' in info.meta ? info.meta.qualitys : []
  const tags: string[] = []
  if ('_qualitys' in info.meta) {
    const _qualitys = info.meta._qualitys
    if (_qualitys.flac24bit) tags.push('flac24bit')
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    else if (_qualitys.ape || _qualitys.flac || _qualitys.wav) tags.push('flac')
    else if (_qualitys['320k']) tags.push('320k')
  }
  return {
    key: musicKey(info),
    name: info.name,
    singer: info.singer || undefined,
    album: info.meta?.albumName || undefined,
    interval: info.interval ?? undefined,
    source: info.source,
    coverUrl: info.meta?.picUrl && /^(https?:|lxplugin:|data:image\/)/i.test(info.meta.picUrl) ? info.meta.picUrl : undefined,
    qualityTags: tags,
    available: assertApiSupport(info.source) && (qualitys.length > 0 || info.source === 'local'),
  }
}

export const playMusicInfo = async(list: LX.Music.MusicInfo[], index = 0) => {
  if (!list.length) return
  const target = list[Math.max(0, Math.min(index, list.length - 1))]
  if (!assertApiSupport(target.source)) return
  const before = await getListMusics(LIST_IDS.DEFAULT)
  const existed = before.findIndex(music => music.id === target.id && music.source === target.source)
  if (existed < 0) await addListMusics(LIST_IDS.DEFAULT, [toRaw(target)])
  const current = await getListMusics(LIST_IDS.DEFAULT)
  let targetIndex = current.findIndex(music => music.id === target.id && music.source === target.source)
  if (targetIndex < 0) targetIndex = current.length - 1
  playList(LIST_IDS.DEFAULT, Math.max(0, targetIndex))
}

export const playCollectionInfo = async(list: LX.Music.MusicInfo[], index = 0) => {
  const playable = list.filter(item => assertApiSupport(item.source))
  if (!playable.length) return
  if (appSetting['player.isAddAllToPlayDirectoryOnPlay']) {
    await setListMusics(LIST_IDS.DEFAULT, playable.map(toRaw))
    const target = list[Math.max(0, Math.min(index, list.length - 1))]
    const targetIndex = playable.findIndex(item => item.id === target.id)
    playList(LIST_IDS.DEFAULT, Math.max(0, targetIndex))
  } else {
    await playMusicInfo(list, index)
  }
}

export const addToLater = (list: LX.Music.MusicInfo[], listId: string = LIST_IDS.DEFAULT) => {
  if (!list.length) return
  addTempPlayList(list.map(musicInfo => ({ musicInfo, listId })))
}

export const addToNext = (list: LX.Music.MusicInfo[], listId: string = LIST_IDS.DEFAULT) => {
  if (!list.length) return
  addTempPlayList(list.map(musicInfo => ({ musicInfo, listId, isTop: true })))
}

export const toggleLoveInfo = async(list: LX.Music.MusicInfo[]) => {
  const loved = new Set((await getListMusics(LIST_IDS.LOVE)).map(item => musicKey(item)))
  const toRemove = list.filter(item => loved.has(musicKey(item)))
  const toAdd = list.filter(item => !loved.has(musicKey(item)))
  if (toRemove.length) await removeListMusics({ listId: LIST_IDS.LOVE, ids: toRemove.map(item => item.id) })
  if (toAdd.length) await addListMusics(LIST_IDS.LOVE, toAdd.map(toRaw))
}

export const playlistOptions = async(command: 'addToPlaylist' | 'moveToPlaylist'): Promise<CollectionCommandOptions> => {
  await getUserLists()
  return {
    title: command === 'moveToPlaylist' ? 'lists__move_to' : 'lists__add_to',
    multiple: false,
    options: userLists.map(list => ({ id: String(list.id), label: list.name })),
  }
}

export const addToPlaylist = async(list: LX.Music.MusicInfo[], listId: string) => {
  if (!list.length) return
  await addListMusics(listId, list.map(toRaw))
}

export const moveToPlaylist = async(list: LX.Music.MusicInfo[], fromId: string, listId: string) => {
  if (!list.length || fromId === listId) return
  await moveListMusics(fromId, listId, list.map(toRaw))
}

export const removeFromPlaylist = async(listId: string, list: LX.Music.MusicInfo[]) => {
  if (!list.length) return
  await removeListMusics({ listId, ids: list.map(item => item.id) })
}

export const confirmRemoveFromCurrentList = async(count: number): Promise<boolean> => {
  return rendererInvoke<{ message: string, confirmText: string, cancelText: string }, boolean>(PLUGIN_EVENT_NAME.confirm_command, {
    message: window.i18n.t('lists__remove_music_tip', { len: count }),
    confirmText: window.i18n.t('lists__remove_tip_button'),
    cancelText: window.i18n.t('cancel_button_text_2'),
  })
}

export const confirmReplaceSource = async(name: string): Promise<boolean> => {
  return rendererInvoke<{ message: string, confirmText: string, cancelText: string }, boolean>(PLUGIN_EVENT_NAME.confirm_command, {
    message: window.i18n.t('source_update_tip', { name }),
    confirmText: window.i18n.t('confirm_button_text'),
    cancelText: window.i18n.t('cancel_button_text_2'),
  })
}

export const downloadOptions = async(): Promise<CollectionCommandOptions> => {
  return {
    title: 'download_quality',
    multiple: false,
    options: [...QUALITYS].map(quality => ({
      id: quality,
      label: QUALITY_LABELS[quality] ? window.i18n.t(QUALITY_LABELS[quality] as any) : quality,
    })),
  }
}

export const downloadMusic = async(list: LX.Music.MusicInfo[], quality: string) => {
  if (!appSetting['download.enable']) throw new Error('Downloads are disabled')
  const online = list.filter((item): item is LX.Music.MusicInfoOnline => item.source !== 'local')
  if (!online.length) return
  await createDownloadTasks(online.map(toRaw), quality as LX.Quality)
}

export const dislikeMusic = async(list: LX.Music.MusicInfo[]) => {
  if (!list.length) return
  const sample = list.slice(0, 20)
  const confirm = await dialog.confirm({
    message: sample.length > 1
      ? window.i18n.t('lists__dislike_music_singer_tip', { name: sample[0].name, singer: sample[0].singer })
      : (sample[0].singer
          ? window.i18n.t('lists__dislike_music_singer_tip', { name: sample[0].name, singer: sample[0].singer })
          : window.i18n.t('lists__dislike_music_tip', { name: sample[0].name })),
    cancelButtonText: window.i18n.t('cancel_button_text_2'),
    confirmButtonText: window.i18n.t('confirm_button_text'),
  })
  if (!confirm) return
  await addDislikeInfo(list.map(item => ({ name: item.name, singer: item.singer })))
}

export const openMusicSource = (info: LX.Music.MusicInfo) => {
  const url = musicSdk[info.source as LX.OnlineSource]?.getMusicDetailPageUrl?.(toOldMusicInfo(info))
  if (url) void openUrl(url)
}

export const resolveOptionById = (options: CollectionCommandOptions | null, optionId: string | undefined): string | null => {
  if (!options) return null
  if (!optionId) {
    const first = options.options.find(item => !item.disabled)
    return first ? first.id : null
  }
  const match = options.options.find(item => item.id === optionId && !item.disabled)
  return match ? match.id : null
}

export interface SourceCandidate {
  musicInfo: LX.Music.MusicInfoOnline
  label: string
}

const sourceCandidates = new Map<string, SourceCandidate[]>()

export const buildReplaceOptions = async(
  requestKey: string,
  list: LX.Music.MusicInfo[],
): Promise<CollectionCommandOptions> => {
  const target = list[0]
  if (!target) return { options: [] }
  const { getOtherSource } = await import('@renderer/core/music/utils')
  const candidates = await getOtherSource(target)
  const options = candidates.map((musicInfo, index) => ({
    id: `source:${index}`,
    label: `${musicInfo.source.toUpperCase()} · ${musicInfo.meta?._qualitys?.flac24bit ? 'FLAC 24bit' : musicInfo.meta?._qualitys?.flac ? 'FLAC' : musicInfo.meta?._qualitys?.['320k'] ? '320k' : '128k'}`,
    description: musicInfo.name,
  }))
  while (sourceCandidates.size >= 32) sourceCandidates.delete(sourceCandidates.keys().next().value!)
  sourceCandidates.set(requestKey, candidates.map(musicInfo => ({
    musicInfo,
    label: String(musicInfo.source),
  })))
  return { title: 'source_toggle', multiple: false, options }
}

export const takeSourceCandidate = (requestKey: string, optionId: string | undefined): LX.Music.MusicInfoOnline | null => {
  if (!optionId || !optionId.startsWith('source:')) return null
  const index = Number(optionId.slice('source:'.length))
  const candidate = sourceCandidates.get(requestKey)?.[index]
  return candidate?.musicInfo ?? null
}

export const replaceMusicInList = async(listId: string, oldMusic: LX.Music.MusicInfo, nextMusic: LX.Music.MusicInfo) => {
  const current = await getListMusics(listId)
  const oldIndex = current.findIndex(item => item.id === oldMusic.id)
  if (oldIndex < 0) {
    await addListMusics(listId, [toRaw(nextMusic)])
    return
  }
  const duplicateIndex = current.findIndex(item => item.id === nextMusic.id)
  if (duplicateIndex > -1) {
    const confirm = await dialog.confirm({
      message: window.i18n.t('music_toggle_duplicate_tip'),
      cancelButtonText: window.i18n.t('cancel_button_text'),
      confirmButtonText: window.i18n.t('confirm_button_text'),
    })
    if (!confirm) return
    await removeListMusics({ listId, ids: [oldMusic.id, nextMusic.id] })
  } else {
    await removeListMusics({ listId, ids: [oldMusic.id] })
  }
  await addListMusics(listId, [toRaw(nextMusic)], 'bottom')
  const { updateListMusicsPosition } = await import('@renderer/store/list/action')
  await updateListMusicsPosition({ listId, ids: [nextMusic.id], position: Math.min(oldIndex, current.length - 1) })
}
