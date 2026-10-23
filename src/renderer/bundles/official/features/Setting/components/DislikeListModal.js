import { watch, ref } from '@common/utils/vueTools'
import { overwirteDislikeInfo } from '@renderer/core/dislikeList'
import { dislikeInfo } from '@renderer/store/dislikeList'

export default {
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const rules = ref('')

    const handleSave = async() => {
      if (rules.value.trim() != dislikeInfo.rules.trim()) {
        await overwirteDislikeInfo(rules.value)
      }
      emit('update:modelValue', false)
    }

    watch(() => props.modelValue, (visible) => {
      if (!visible) return
      rules.value = dislikeInfo.rules.length ? dislikeInfo.rules + '\n' : dislikeInfo.rules
    })

    return {
      rules,
      handleSave,
    }
  },
}
