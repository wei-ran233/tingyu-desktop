import { computed, ref } from '@common/utils/vueTools'
import { userLists, fetchingListStatus, listUpdateTimes } from '@renderer/store/list/state'
import handleSyncSourceList from '@renderer/store/list/syncSourceList'
import musicSdk from '@renderer/utils/musicSdk'
// import { dateFormat } from '@common/utils/renderer'
import { getListUpdateInfo, setListAutoUpdate } from '@renderer/utils/data'

export default {
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:visible'],
  setup() {
    const lists = computed(() => userLists.filter(l => !!l.source && !!musicSdk[l.source]?.songList))
    const updateInfo = ref({})
    // const updateTimes = ref({})

    void getListUpdateInfo().then((listUpdateInfo) => {
      updateInfo.value = listUpdateInfo
      // if (listUpdateTimes._inited) {
      //   for (const [id, value] of Object.entries(info)) {
      //     autoUpdate[id] = value.isAutoUpdate == true
      //   }
      // } else {
      //   for (const [id, value] of Object.entries(info)) {
      //     autoUpdate[id] = value.isAutoUpdate == true
      //     listUpdateTimes[id] = value.updateTime ? dateFormat(value.updateTime) : ''
      //   }
      // }
      // listUpdateTimes._inited = true
    })

    const handleUpdate = (targetListInfo) => {
      void handleSyncSourceList(targetListInfo)
      // console.log(targetListInfo.list.length, list.length)
    }

    const handleChangeAutoUpdate = (list, enable) => {
      void setListAutoUpdate(list.id, enable)
    }

    return {
      lists,
      updateInfo,
      fetchingListStatus,
      handleUpdate,
      handleChangeAutoUpdate,
      listUpdateTimes,
    }
  },
}
