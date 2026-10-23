import descriptor from './official.json'
import radio from './radio.json'
import officialInventory from './feature-inventory.json'
import radioInventory from './radio-inventory.json'
import type { PageDefinition } from '@common/pages/types'

export const OFFICIAL_BUNDLE_ID = descriptor.id
export const RADIO_BUNDLE_ID = radio.id
export const OFFICIAL_BUNDLE = descriptor
export const RADIO_BUNDLE = radio
export const NATIVE_BUNDLES = [descriptor, radio]
export const NATIVE_FEATURE_OWNERS: Readonly<Record<string, string>> = Object.fromEntries([
  ...officialInventory.map(feature => [feature.id, OFFICIAL_BUNDLE_ID]),
  ...radioInventory.map(feature => [feature.id, RADIO_BUNDLE_ID]),
])
export const NATIVE_FEATURE_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = Object.assign({}, ...NATIVE_BUNDLES.map(bundle => (bundle as { featureDependencies?: Record<string, string[]> }).featureDependencies ?? {}))
/** Resolve dependencies from a verified set, including cycles and missing packages. */
export const resolveNativeBundles = (installed: readonly string[]): string[] => {
  const usable = new Set(installed.filter(id => NATIVE_BUNDLES.some(bundle => bundle.id === id)))
  const visit = (id: string, stack: Set<string>): boolean => {
    if (!usable.has(id) || stack.has(id)) return false
    const definition = NATIVE_BUNDLES.find(bundle => bundle.id === id)
    return ((definition as { dependencies?: string[] })?.dependencies ?? []).every(dependency => visit(dependency, new Set([...stack, id])))
  }
  return NATIVE_BUNDLES.map(bundle => bundle.id).filter(id => visit(id, new Set()))
}
const pagesOf = (bundle: typeof descriptor | typeof radio): PageDefinition[] => bundle.pages.map(page => ({
  ...page,
  placement: page.placement as PageDefinition['placement'],
  source: 'plugin' as const,
  pluginId: bundle.id,
  component: page.featureId,
  surfaceId: (page as { surfaceId?: string }).surfaceId as PageDefinition['surfaceId'],
  visible: (page as { requires?: string }).requires === 'download.enable' ? ctx => ctx.downloadEnabled : undefined,
}))
export const OFFICIAL_PAGES: readonly PageDefinition[] = pagesOf(descriptor)
export const NATIVE_PAGES: readonly PageDefinition[] = NATIVE_BUNDLES.flatMap(pagesOf)
export const NATIVE_SETTINGS = NATIVE_BUNDLES.flatMap(bundle => bundle.settings.map(section => ({ ...section, pluginId: bundle.id }))).sort((a, b) => a.order - b.order)
