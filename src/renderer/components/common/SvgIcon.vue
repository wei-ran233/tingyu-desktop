<template>
  <svg :class="$style.icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <use v-if="$themeIdentity && $themeIconRef('#icon-' + name) !== '#icon-' + name" :xlink:href="$themeIconRef('#icon-' + name)" />
    <template v-else><path v-for="(path, index) in paths" :key="index" :d="path" /></template>
  </svg>
</template>

<script>
const icons = {
  edit: ['M4 16l11-11 4 4L8 20H4v-4Z M14 6l4 4'],
  check: ['M5 12l4 4L19 6'],
  queue: ['M3 5h14 M3 10h14 M3 15h8 M16 14l5 4-5 4Z'],
  radio: ['M4 8h16v12H4z M7 8l10-5 M7 12h10 M7 16h.01 M17 16h.01', 'M10 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0'],
  chat: ['M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0Z', 'M7 10h8 M7 14h5'],
  music: ['M9 18V5l11-2v13 M9 8l11-2', 'M9 18c0 3-6 4-6 1s6-4 6-1 M20 16c0 3-6 4-6 1s6-4 6-1'],
  headphones: ['M4 14v-3a8 8 0 0 1 16 0v3 M4 13h3v8H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z M20 13h-3v8h3a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z'],
  model: ['M7 5h10v14H7z M3 8h4 M3 12h4 M3 16h4 M17 8h4 M17 12h4 M17 16h4 M10 2v3 M14 2v3 M10 19v3 M14 19v3', 'M10 9h4v6h-4z'],
  settings: ['M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z', 'M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0'],
  weather: ['M4 16a4 4 0 0 1 4-4 5 5 0 0 1 10 1 3 3 0 0 1 0 6H7a3 3 0 0 1-3-3Z', 'M4 3v2 M1 8h2 M7 2l-1 2 M10 5l-2 1 M3 7a3 3 0 0 1 5-2'],
  search: ['M3 10a7 7 0 1 0 14 0 7 7 0 0 0-14 0 M15 15l6 6'],
  refresh: ['M20 8a8 8 0 0 0-14-3L3 8 M3 3v5h5 M4 16a8 8 0 0 0 14 3l3-3 M16 16h5v5'],
  trash: ['M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7'],
  user: ['M8 6a4 4 0 1 0 8 0 4 4 0 0 0-8 0 M4 21v-3a8 8 0 0 1 16 0v3'],
  thinking: ['M9 3a4 4 0 0 0-5 5 4 4 0 0 0-1 7 4 4 0 0 0 6 6l3-2V5L9 3Z M15 3a4 4 0 0 1 5 5 4 4 0 0 1 1 7 4 4 0 0 1-6 6l-3-2 M5 8l3 2 M4 15l4-1 M19 8l-3 2 M20 15l-4-1'],
  light: ['M8 15a6 6 0 1 1 8 0l-1 3H9l-1-3Z M9 21h6 M12 8v4'],
  play: ['M8 4l12 8-12 8Z'],
  close: ['M6 6l12 12 M18 6L6 18'],
  plus: ['M12 5v14 M5 12h14'],
  send: ['M12 20V4 M5 11l7-7 7 7'],
  stop: ['M6 6h12v12H6z'],
  menu: ['M3 4h18v16H3z M9 4v16 M5 8h1 M5 12h1'],
  voice: ['M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Z M6 11v1a6 6 0 0 0 12 0v-1 M12 18v4 M8 22h8'],
  chart: ['M4 3v18h17 M8 16v-4 M13 16V7 M18 16v-7'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z', 'M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0'],
  hidden: ['M3 3l18 18 M10 5a13 13 0 0 1 12 7l-3 4 M6 6a20 20 0 0 0-4 6s4 7 10 7l4-2'],
  server: ['M4 3h16v7H4z M4 14h16v7H4z M7 6h.01 M7 17h.01 M12 6h5 M12 17h5'],
  city: ['M3 21V9h7v12 M10 21V3h10v18 M1 21h22 M13 7h1 M17 7h1 M13 11h1 M17 11h1 M13 15h1 M17 15h1 M6 12h1 M6 16h1'],
  globe: ['M2 12a10 10 0 1 0 20 0 10 10 0 0 0-20 0 M2 12h20 M12 2c-5 5-5 15 0 20 5-5 5-15 0-20'],
  book: ['M12 5C8 2 4 3 2 4v16c3-2 7-2 10 0 3-2 7-2 10 0V4c-2-1-6-2-10 1Z M12 5v15'],
  upload: ['M12 16V3 M7 8l5-5 5 5 M3 15v6h18v-6'],
  download: ['M12 3v13 M7 11l5 5 5-5 M3 15v6h18v-6'],
  record: ['M2 12a10 10 0 1 0 20 0 10 10 0 0 0-20 0', 'M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0 M12 12h.01 M5 12a7 7 0 0 1 7-7 M19 12a7 7 0 0 1-7 7'],
  heart: ['M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z'],
  copy: ['M9 9h10v11H9z M5 15H4V4h11v1'],
  skip: ['M5 4l10 8-10 8V4Z M19 5v14'],
  volume: ['M11 5L6 9H2v6h4l5 4V5Z M15.54 8.46a5 5 0 0 1 0 7.07 M19.07 4.93a10 10 0 0 1 0 14.14'],
  mute: ['M11 5L6 9H2v6h4l5 4V5Z M23 9l-6 6 M17 9l6 6'],
}
export default {
  name: 'SvgIcon',
  props: { name: { type: String, default: 'music' } },
  computed: { paths() { return icons[this.name] || icons.music } },
}
</script>

<style lang="less" module>
.icon { width: 1.15em; height: 1.15em; display: inline-block; flex: none; vertical-align: -0.18em; }
</style>
