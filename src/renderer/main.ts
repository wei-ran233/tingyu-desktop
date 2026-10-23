import '@common/error'
import { createApp } from 'vue'

import './core/globalData'

import '@renderer/event'

// Components
import mountComponents from './components'

// Plugins
import initPlugins from './plugins'
import { i18nPlugin } from './plugins/i18n'

import App from './App.vue'
import router from './router'
// import store from './store'


import { getSetting, updateSetting, getViewPrevState } from './utils/ipc'
import { langList } from '@root/lang'
import type { I18n } from '@root/lang/i18n'

import { initSetting } from './store/setting'
import { installCollectionGateway } from './core/collection/gateway'
import { refreshNativeBundles } from './core/features/state'
import { loadPluginPages } from './core/pages'
// import { bubbleCursor } from './utils/cursor-effects/bubbleCursor'

import './worker'
import ThemeBrand from './components/theme/ThemeBrand.vue'
import ThemePage from './components/theme/ThemePage.vue'
import ThemeBackdrop from './components/theme/ThemeBackdrop.vue'
import { themeIdentity, themeIconRef, themeDisplayName } from './core/theme/identity'
import { saveViewPrevState } from './utils/data'

// sync(store, router)

router.afterEach((to) => {
  if (to.path != '/songList/detail') {
    saveViewPrevState({
      url: to.path,
      query: { ...to.query },
    })
  }
})

installCollectionGateway()
void loadPluginPages()

void Promise.all([getSetting(), refreshNativeBundles(), getViewPrevState()]).then(async([setting, , previousState]) => {
  // window.lx.appSetting = setting
  // Set language automatically
  if (!setting['common.langId'] || !window.i18n.availableLocales.includes(setting['common.langId'])) {
    let langId: I18n['locale'] | null = null
    const locale = window.navigator.language.toLocaleLowerCase() as I18n['locale']
    if (window.i18n.availableLocales.includes(locale)) {
      langId = locale
    } else {
      for (const lang of langList) {
        if (lang.alternate == locale) {
          langId = lang.locale
          break
        }
      }
      langId ??= 'en-us'
    }
    setting['common.langId'] = langId
    void updateSetting({ 'common.langId': langId })
    console.log('Set lang', setting['common.langId'])
  }
  window.setLang(setting['common.langId'])
  window.i18n.setLanguage(setting['common.langId'])

  if (!setting['common.startInFullscreen'] && (document.body.clientHeight > window.screen.availHeight || document.body.clientWidth > window.screen.availWidth) && setting['common.windowSizeId'] > 1) {
    void updateSetting({ 'common.windowSizeId': 1 })
  }

  // store.commit('setSetting', setting)
  initSetting(setting)

  // Restore before mounting. An async restore after mount can overwrite a
  // user's first navigation or an extension recovery redirect.
  await router.replace({ path: previousState.url || '/search', query: previousState.query })

  const app = createApp(App)
  app.component('theme-brand', ThemeBrand)
  app.component('theme-page', ThemePage)
  app.component('theme-backdrop', ThemeBackdrop)
  app.config.globalProperties.$themeIconRef = themeIconRef
  Object.defineProperty(app.config.globalProperties, '$themeIdentity', { get: () => themeIdentity.value })
  Object.defineProperty(app.config.globalProperties, '$themeName', { get: () => themeDisplayName.value })
  app
    .use(router)
    // .use(store)
    .use(i18nPlugin)
  initPlugins(app)
  mountComponents(app)
  app.mount('#root')
})

// bubbleCursor()
