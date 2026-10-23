import { createRouter, createWebHashHistory } from 'vue-router'
import { watch } from '@common/utils/vueTools'
import { NATIVE_PAGES } from '@common/bundles'
import { registerRadioBundle } from '@renderer/bundles/radio'
import { registerOfficialBundle } from '@renderer/bundles/official'
import { loadFeatureComponent } from '@renderer/core/features/component'
import { bundleReady, featureEnabled } from '@renderer/core/features/state'

registerOfficialBundle()
registerRadioBundle()
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    ...NATIVE_PAGES.map(page => ({
      path: page.path,
      name: page.routeName,
      component: async() => loadFeatureComponent(page.component!),
      meta: { name: page.id === 'songlist-detail' ? 'SongList' : page.routeName, pageId: page.id, featureId: page.component, pluginId: page.pluginId },
    })),
    { path: '/extensions', name: 'Extensions', component: async() => import('./components/feature/RecoveryPage.vue'), meta: { name: 'Extensions' } },
    { path: '/themes', redirect: '/setting?name=ThemeSettings' },
    { path: '/preferences', name: 'SettingsRecovery', component: async() => import('./components/settings/SettingsRecovery.vue'), meta: { name: 'Setting' } },
    { path: '/plugins/:pluginId/:pageId', name: 'PluginPage', component: async() => import('./views/Plugin/index.vue'), meta: { name: 'PluginPage' } },
    { path: '/:pathMatch(.*)*', redirect: '/search' },
  ],
  linkActiveClass: 'active-link',
  linkExactActiveClass: 'exact-active-link',
})
router.beforeEach(to => {
  const featureId = to.meta.featureId as string | undefined
  if (bundleReady.value && featureId && !featureEnabled(featureId)) return featureId === 'settings' ? { path: '/preferences', query: to.query } : '/extensions'
})
watch(() => {
  const id = router.currentRoute.value.meta.featureId as string | undefined
  return !id || !bundleReady.value || featureEnabled(id)
}, enabled => { if (!enabled) void router.replace(router.currentRoute.value.meta.featureId === 'settings' ? { path: '/preferences', query: router.currentRoute.value.query } : '/extensions') })
export default router
