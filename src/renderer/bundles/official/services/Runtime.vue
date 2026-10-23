<template><span v-if="false" /></template>
<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import useRuntime from './runtime'
import { setStop } from '@renderer/plugins/player'
import { sendOpenAPIAction, sendSyncAction } from '@renderer/utils/ipc'
import { pauseDownloadTasks } from '@renderer/store/download/action'
import { downloadList } from '@renderer/store/download/state'

useRuntime()
onBeforeUnmount(() => {
  setStop()
  void pauseDownloadTasks([...downloadList]).catch(console.warn)
  void sendOpenAPIAction({ action: 'enable', data: { enable: false, port: '', bindLan: false } }).catch(console.warn)
  void sendSyncAction({ action: 'enable_server', data: { enable: false, port: '' } }).catch(console.warn)
  void sendSyncAction({ action: 'enable_client', data: { enable: false, host: '' } }).catch(console.warn)
})
</script>
