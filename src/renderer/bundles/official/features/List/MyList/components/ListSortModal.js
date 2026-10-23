import { ref, computed } from '@common/utils/vueTools'
// import { dialog } from '@renderer/plugins/Dialog'
import { getListMusics, updateListMusicsPosition } from '@renderer/store/list/action'
import { useI18n } from '@root/lang'
import { LIST_IDS } from '@common/constants'


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
  setup(props, { emit }) {
    const t = useI18n()
    const sortField = ref('')
    const sortType = ref('')
    const closeModal = () => {
      emit('update:visible', false)
    }
    const handleAfterLeave = () => {
      sortField.value = ''
      sortType.value = ''
    }
    const verify = () => {
      return !!sortType.value && (!!sortField.value || sortType.value == 'random')
    }
    const handleSort = async() => {
      if (!verify()) return
      // if (!await dialog.confirm({
      //   message: t('list_sort_modal_tip_confirm'),
      //   cancelButtonText: t('cancel_button_text'),
      //   confirmButtonText: t('confirm_button_text'),
      // })) return

      let list = [...(await getListMusics(props.listInfo.id))]
      list = await window.lx.worker.main.sortListMusicInfo(list, sortType.value, sortField.value, window.i18n.locale)
      console.log(sortType.value, sortField.value)

      closeModal()
      void updateListMusicsPosition({ listId: props.listInfo.id, position: 0, ids: list.map(m => m.id) })
    }

    const listName = computed(() => {
      switch (props.listInfo.id) {
        case LIST_IDS.DEFAULT:
          return t(props.listInfo.name)
        case LIST_IDS.LOVE:
          return t(props.listInfo.name)
        default:
          return props.listInfo.name
      }
    })

    const disabledSortFislds = computed(() => {
      return sortType.value == 'random'
    })

    return {
      sortField,
      sortType,
      disabledSortFislds,
      closeModal,
      handleSort,
      handleAfterLeave,
      listName,
    }
  },
}
