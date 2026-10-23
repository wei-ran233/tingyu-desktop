import { COLLECTION_SURFACE_COMMANDS } from '@common/collection/types'
import { getListDetail } from '@renderer/store/leaderboard/action'
import { boards } from '@renderer/store/leaderboard/state'
import { PagedCollectionAdapter } from './paged'

export class LeaderboardCollectionAdapter extends PagedCollectionAdapter {
  constructor(params: Record<string, string>) {
    const source = (params.source as LX.OnlineSource) || 'kw'
    const boardId = params.boardId || ''
    let current: Awaited<ReturnType<typeof getListDetail>> | undefined
    super('leaderboard-music', COLLECTION_SURFACE_COMMANDS['leaderboard-music'].filter(command => !['setSort', 'setFilters', 'replaceSource'].includes(command)), {
      get pageSize() { return current?.limit ?? 30 },
      supportsSort: false,
      supportsFilters: false,
      get title() { return boards[source]?.list.find(board => board.id === boardId)?.name ?? '' },
      page: () => Math.max(1, Number(params.page) || 1),
      total: () => current?.total ?? 0,
      pageItems: () => current?.list ?? [],
      load: async(page: number) => {
        current = await getListDetail(boardId, page)
        return { items: [...current.list], total: current.total, pageCount: Math.max(1, Math.ceil(current.total / current.limit)) }
      },
    })
  }
}
