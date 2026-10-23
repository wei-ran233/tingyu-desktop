import type { CollectionSurfaceId } from '@common/collection/types'
import type { CollectionAdapter } from '../types'
import { SearchCollectionAdapter } from './search'
import { ListCollectionAdapter } from './list'
import { SonglistCollectionAdapter } from './songlist'
import { LeaderboardCollectionAdapter } from './leaderboard'

export const createAdapter = (
  surfaceId: CollectionSurfaceId,
  params: Record<string, string>,
): CollectionAdapter => {
  switch (surfaceId) {
    case 'search-music':
      return new SearchCollectionAdapter(params)
    case 'list-music':
      return new ListCollectionAdapter(params)
    case 'songlist-detail-music':
      return new SonglistCollectionAdapter(params)
    case 'leaderboard-music':
      return new LeaderboardCollectionAdapter(params)
    default:
      throw new Error(`Unknown collection surface: ${String(surfaceId)}`)
  }
}
