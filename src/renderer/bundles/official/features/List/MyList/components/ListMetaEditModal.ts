import { ref, watch } from '@common/utils/vueTools'
import { getListMeta, updateListMeta } from '@renderer/store/list/listMeta'

interface Props {
  visible: boolean
  listId: string
}

export default {
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
    listId: {
      type: String,
      required: true,
    },
  },
  emits: ['update:visible'],
  setup(props: Props, { emit }: { emit: (event: 'update:visible', val: boolean) => void }) {
    const subtitle = ref('')
    const tagsStr = ref('')
    const customPic = ref('')

    watch(() => props.visible, (val) => {
      if (val && props.listId) {
        const meta = getListMeta(props.listId)
        subtitle.value = meta.subtitle ?? ''
        tagsStr.value = (meta.tags ?? []).join(' ')
        customPic.value = meta.customPic ?? ''
      }
    }, { immediate: true })

    const handleClose = () => {
      emit('update:visible', false)
    }

    const handleSave = () => {
      const tags = tagsStr.value
        .split(/[,，\s]+/)
        .map(t => t.trim())
        .filter(Boolean)

      updateListMeta(props.listId, {
        subtitle: subtitle.value.trim(),
        tags,
        customPic: customPic.value.trim(),
      })
      handleClose()
    }

    return {
      subtitle,
      tagsStr,
      customPic,
      handleClose,
      handleSave,
    }
  },
}
