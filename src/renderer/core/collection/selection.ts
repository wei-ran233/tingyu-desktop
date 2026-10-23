import type { CollectionSelection } from '@common/collection/types'

export const selectionCount = (mode: CollectionSelection['mode'], explicit: number, total: number): number => {
  if (mode === 'all') return total
  if (mode === 'some') return explicit
  return 0
}
