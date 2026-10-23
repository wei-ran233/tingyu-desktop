import { cloneVNode, isVNode, shallowRef, type Component } from 'vue'
import { getFeature, getFeatureViews, resolveNativeView, type NativeView, type NativeFeatureView } from './registry'

const cache = new Map<string, Promise<Component>>()
const viewPreparers = new Map<string, (view: NativeFeatureView) => Promise<void>>()
/** One presenter instance; changing rendering does not re-run its setup. */
export const loadFeatureComponent = async(featureId: string): Promise<Component> => {
  const cached = cache.get(featureId)
  if (cached) return cached
  const pending = (async() => {
    const feature = getFeature(featureId)
    const fallback = getFeatureViews(featureId).find(view => view.id === feature.defaultView)
    if (!fallback) throw new Error(`Missing default renderer for ${featureId}`)
    const [options, defaultTemplate] = await Promise.all([
      feature.load(),
      fallback.load(),
    ])
    const renderers = new Map<string, NativeView>()
    const activeViews = new WeakMap<object, string>()
    const validate = (id: string, template: object) => {
      const view = template as NativeView
      if (typeof view.render !== 'function') throw new Error(`Invalid renderer: ${featureId}/${id}`)
      return view
    }
    renderers.set(fallback.id, validate(fallback.id, defaultTemplate))
    const version = shallowRef(0)
    const loading = new Map<string, Promise<void>>()
    const loadView = async(view: NativeFeatureView) => {
      if (renderers.has(view.id)) return Promise.resolve()
      const existing = loading.get(view.id)
      if (existing) return existing
      const pending = view.load().then(template => {
        renderers.set(view.id, validate(view.id, template))
        version.value++
      }).finally(() => { loading.delete(view.id) })
      loading.set(view.id, pending)
      return pending
    }
    viewPreparers.set(featureId, loadView)
    const component: Component = {
      ...options,
      name: `Feature_${featureId.replace(/\W/g, '_')}`,
      render(...args: any[]) {
        void version.value
        let selected = resolveNativeView(featureId)
        if (!renderers.has(selected.id)) {
          const requested = selected
          void loadView(requested).catch(error => { console.warn(`[feature renderer] ${featureId}/${requested.id}`, error) })
          selected = fallback
        }
        const view = renderers.get(selected.id)!
        // Compiled templates use overlapping cache indices. Keep each presenter's
        // state, but discard cached VNodes/handlers when its renderer changes.
        if (activeViews.get(this) !== selected.id) {
          if (Array.isArray(args[1])) args[1].length = 0
          activeViews.set(this, selected.id)
        }
        const type = component as unknown as NativeView
        type.__cssModules = view.__cssModules
        const rendered = view.render.apply(this, args)
        // Preserve each view's layout and root attributes (especially toolbar,
        // player and modal roots); an extra full-height wrapper changes layout.
        if (!isVNode(rendered)) return rendered
        return cloneVNode(rendered, {
          // Vue's optimized block diff assumes one compiled template. Replace
          // the view subtree when switching templates, retaining its presenter.
          key: selected.id,
          class: [`lx-render-${selected.mode}`],
          'data-feature': featureId,
          'data-plugin': feature.pluginId,
          'data-renderer': selected.id,
        })
      },
    }
    // CSS module getters consult the owning component type.
    const initial = renderers.get(feature.defaultView)!
    Object.assign(component, { __cssModules: initial.__cssModules, __scopeId: initial.__scopeId })
    return component
  })()
  cache.set(featureId, pending)
  void pending.catch(() => cache.delete(featureId))
  return pending
}

/** Prepare theme templates before exposing the new layout to interactive pages. */
export const preloadFeatureViews = async(views: Record<string, string>) => {
  await Promise.all(Object.entries(views).map(async([featureId, viewId]) => {
    const view = getFeatureViews(featureId).find(view => view.id === viewId)
    if (!view) return
    await loadFeatureComponent(featureId)
    await viewPreparers.get(featureId)?.(view)
  }))
}
