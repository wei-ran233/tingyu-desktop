<template>
  <svg class="svg-icon" aria-hidden="true">
    <use :xlink:href="id" />
  </svg>
</template>

<script>
import { themeIconRef } from '@renderer/core/theme/identity'

export default {
  name: 'SvgIcon',
  props: {
    name: {
      type: String,
      required: true,
    },
  },
  computed: {
    id() {
      return themeIconRef(`#icon-${this.name}`)
    },
  },
}
</script>

<style>
.svg-icon {
  width: 1.2em;
  height: 1.2em;
  vertical-align: -0.25em;
  fill: currentColor;
  overflow: hidden;
}
</style>
