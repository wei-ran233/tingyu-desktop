import { ref, watch, computed, markRawList } from '@common/utils/vueTools'
import { playList } from '@renderer/core/player'
import { getListMusics, removeListMusics } from '@renderer/store/list/action'
import { isFullscreen } from '@renderer/store'
import { appSetting } from '@renderer/store/setting'
import { getEffectiveFontSize } from '@renderer/utils'
import { LIST_IDS } from '@common/constants'
import { useI18n } from '@root/lang'

export default {
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
    listInfo: { // { id: '', name: '' }
      type: Object,
      required: true,
    },
  },
  emits: ['update:visible'],
  setup(props) {
    const t = useI18n()
    const duplicateList = ref([])
    const listItemHeight = computed(() => {
      return Math.ceil(getEffectiveFontSize(appSetting['common.fontSize'], appSetting['common.pageScale'], isFullscreen.value) * 3.2)
    })

    const handlePlay = (index) => {
      const { index: musicInfoIndex } = duplicateList.value[index]
      playList(props.listInfo.id, musicInfoIndex)
    }
    const handleFilterList = async() => {
      // console.time('filter')
      duplicateList.value = markRawList(await window.lx.worker.main.filterDuplicateMusic(await getListMusics(props.listInfo.id)))
      // console.log(duplicateList.value)
      // console.timeEnd('filter')
    }
    const handleRemove = async(index) => {
      const { musicInfo: targetMusicInfo } = duplicateList.value.splice(index, 1)[0]
      duplicateList.value = [...duplicateList.value]
      await removeListMusics({ listId: props.listInfo.id, ids: [targetMusicInfo.id] })
      await handleFilterList()
    }

    watch(() => props.visible, (visible) => {
      if (visible) {
        if (duplicateList.value.length) duplicateList.value = []
        void handleFilterList()
      }
    })

    const listName = computed(() => {
      switch (props.listInfo.id) {
        case LIST_IDS.DEFAULT:
        case LIST_IDS.LOVE:
          return t(props.listInfo.name)

        default: return props.listInfo.name
      }
    })

    return {
      listItemHeight,
      duplicateList,
      handleFilterList,
      handleRemove,
      handlePlay,
      listName,
    }
  },
}
