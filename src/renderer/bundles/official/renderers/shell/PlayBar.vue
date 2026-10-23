<template>
  <FullWidthProgress v-if="appSetting['common.playBarProgressStyle'] == 'full'" />
  <MiddleWidthProgress v-else-if="appSetting['common.playBarProgressStyle'] == 'middle'" />
  <MiniWidthProgress v-else />
</template>


