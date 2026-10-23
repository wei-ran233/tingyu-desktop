import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { normalizeFeaturePreferences, resolveFeatureView } from '@common/features'
import { OFFICIAL_BUNDLE, RADIO_BUNDLE, NATIVE_PAGES, NATIVE_SETTINGS, resolveNativeBundles } from '@common/bundles'
import inventory from '@common/bundles/feature-inventory.json'
import radioInventory from '@common/bundles/radio-inventory.json'
import { PluginService } from '@main/modules/plugin/service'

export const featureBundleTests = async(test: (name: string, run: () => void | Promise<void>) => Promise<void>, root: string) => {
  await test('feature preferences preserve setting IDs, reject unsafe IDs and bound input', () => {
    const preferences = normalizeFeaturePreferences({ disabled: ['settings.play_detail', 'settings.play_detail', '../bad'], views: { 'settings.desktop_lyric': 'compact', '../escape': 'classic' } })
    assert.deepEqual(preferences.disabled, ['settings.play_detail'])
    assert.equal(preferences.views['settings.desktop_lyric'], 'compact')
    assert.equal(Object.keys(preferences.views).length, 1)
    assert.equal(normalizeFeaturePreferences({ disabled: Array.from({ length: 200 }, (_, i) => `f${i}`) }).disabled.length, 128)
  })
  await test('render selection is scoped to a function and falls back without changing preferences', () => {
    const feature = { id: 'search', pluginId: 'lx.official-suite', displayName: 'Search', defaultView: 'classic' }
    const views = [
      { id: 'classic', featureId: 'search', pluginId: feature.pluginId, displayName: 'Classic', mode: 'classic' as const },
      { id: 'cards', featureId: 'list', pluginId: 'other.plugin', displayName: 'Cards', mode: 'compact' as const },
    ]
    const preferences = normalizeFeaturePreferences({ views: { search: 'cards' } })
    assert.equal(resolveFeatureView(feature, views, preferences).id, 'classic')
    assert.equal(preferences.views.search, 'cards')
    assert.throws(() => resolveFeatureView({ ...feature, defaultView: 'missing' }, views, preferences), /No rendering/)
  })
  await test('default bundles preserve historical routes with independently owned radio and settings', () => {
    assert.equal(OFFICIAL_BUNDLE.defaultEnabled, true)
    assert.equal(NATIVE_PAGES.length, 8)
    assert.equal(NATIVE_PAGES.find(page => page.path === '/dj')?.pluginId, RADIO_BUNDLE.id)
    assert.equal(NATIVE_SETTINGS.length, 17)
    assert.ok(!inventory.some(feature => feature.id === 'dj'))
    assert.ok(OFFICIAL_BUNDLE.includes.includes(RADIO_BUNDLE.id))
    assert.deepEqual(resolveNativeBundles([RADIO_BUNDLE.id]), [])
    assert.equal(OFFICIAL_BUNDLE.settings.length, 16)
    assert.equal(new Set(inventory.map(feature => feature.id)).size, inventory.length)
    for (const contribution of [...OFFICIAL_BUNDLE.pages, ...OFFICIAL_BUNDLE.settings, ...OFFICIAL_BUNDLE.slots]) {
      assert.ok(inventory.some(feature => feature.id === contribution.featureId), contribution.featureId)
    }
  })
  await test('official function modules and default templates exist separately', async() => {
    for (const feature of [...inventory, ...radioInventory]) {
      const base = path.join(root, 'src/renderer/bundles', radioInventory.includes(feature as typeof radioInventory[0]) ? 'radio' : 'official')
      const logic = await fs.readFile(path.join(base, feature.feature), 'utf8')
      const view = await fs.readFile(path.join(base, feature.renderer), 'utf8')
      assert.ok(!logic.includes('<template>'), feature.id)
      assert.ok(!/<script\b/.test(view), feature.id)
    }
  })
  await test('native suite requires current signed package and follows enable state across restarts', async() => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lx-native-suite-'))
    try {
      const service = new PluginService(dir, true)
      await service.init(path.join(root, 'src/static/plugins'))
      assert.deepEqual(service.getNativeBundles(), [OFFICIAL_BUNDLE.id, RADIO_BUNDLE.id])
      const availability: string[][] = []
      const unsubscribe = service.subscribeNativeBundles(bundles => { availability.push(bundles) })
      await service.setEnabled(RADIO_BUNDLE.id, false)
      assert.deepEqual(service.getNativeBundles(), [OFFICIAL_BUNDLE.id])
      assert.deepEqual(availability.at(-1), [OFFICIAL_BUNDLE.id])
      await service.setEnabled(RADIO_BUNDLE.id, true)
      assert.deepEqual(service.getNativeBundles(), [OFFICIAL_BUNDLE.id, RADIO_BUNDLE.id])
      unsubscribe()
      await service.setEnabled(OFFICIAL_BUNDLE.id, false)
      assert.deepEqual(service.getNativeBundles(), [])
      const reloaded = new PluginService(dir, true)
      await reloaded.init(path.join(root, 'src/static/plugins'))
      assert.deepEqual(reloaded.getNativeBundles(), [])
      await reloaded.setEnabled(OFFICIAL_BUNDLE.id, true)
      assert.deepEqual(reloaded.getNativeBundles(), [OFFICIAL_BUNDLE.id, RADIO_BUNDLE.id])
      await reloaded.uninstall(OFFICIAL_BUNDLE.id)
      const removed = new PluginService(dir, true)
      await removed.init(path.join(root, 'src/static/plugins'))
      assert.deepEqual(removed.getNativeBundles(), [])
      await removed.restoreBundled(OFFICIAL_BUNDLE.id)
      assert.deepEqual(removed.getNativeBundles(), [OFFICIAL_BUNDLE.id, RADIO_BUNDLE.id])
      await removed.uninstall(RADIO_BUNDLE.id)
      const removedRadio = new PluginService(dir, true)
      await removedRadio.init(path.join(root, 'src/static/plugins'))
      assert.deepEqual(removedRadio.getNativeBundles(), [OFFICIAL_BUNDLE.id])
      await removedRadio.restoreBundled(RADIO_BUNDLE.id)
      assert.deepEqual(removedRadio.getNativeBundles(), [OFFICIAL_BUNDLE.id, RADIO_BUNDLE.id])
      const entry = removed.store.get(OFFICIAL_BUNDLE.id)!
      entry.manifest.nativeBundle!.buildHash = '0'.repeat(64)
      assert.deepEqual(removed.getNativeBundles(), [])
      assert.equal(removed.getPublicInfo(OFFICIAL_BUNDLE.id)?.compatible, false)
    } finally { await fs.rm(dir, { recursive: true, force: true }) }
  })
}
