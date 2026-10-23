import type { PageDefinition } from './types'
import { NATIVE_PAGES } from '@common/bundles'

// Compatibility name for the host navigation allowlist; definitions belong to
// compiled plugin bundles. The host does not maintain a second page list.
export const BUILTIN_PAGES = NATIVE_PAGES
export const getVisiblePages = (pages: readonly PageDefinition[], ctx: { downloadEnabled: boolean }): PageDefinition[] => {
  return pages.filter(page => page.placement !== 'hidden' && (!page.visible || page.visible(ctx)))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}
