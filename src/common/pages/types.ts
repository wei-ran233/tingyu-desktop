import type { CollectionSurfaceId } from '@common/collection/types'

export type PagePlacement = 'primary' | 'tools' | 'hidden'
export type PageSource = 'builtin' | 'plugin'

export interface PageVisibilityContext {
  downloadEnabled: boolean
}

export interface PageDefinition {
  /** Stable identifier. Plugin pages use `plugin:<pluginId>:<pageId>`. */
  id: string
  /** Router path. Built-in pages keep their historical paths. */
  path: string
  /** `route.meta.name`, kept stable for existing layout code. */
  routeName: string
  /** i18n key resolved by the renderer. */
  titleKey: string
  icon: string
  iconViewBox: string
  placement: PagePlacement
  order: number
  source: PageSource
  pluginId?: string
  /** Set when the page hosts a music collection surface. */
  surfaceId?: CollectionSurfaceId
  /** Lazily loaded route component. */
  lazy?: boolean
  /** Built-in component module id, resolved by the renderer route factory. */
  component?: string
  visible?: (ctx: PageVisibilityContext) => boolean
}
