import { COLLECTION_SURFACE_COMMANDS } from '@common/collection/types'
import { getListDetail } from '@renderer/store/songList/action'
import { PagedCollectionAdapter } from './paged'

export class SonglistCollectionAdapter extends PagedCollectionAdapter {
  constructor(params: Record<string, string>) {
    const source = (params.source as LX.OnlineSource) || 'kw'
    const id = params.id || ''
    let current: Awaited<ReturnType<typeof getListDetail>> | undefined
    super('songlist-detail-music', COLLECTION_SURFACE_COMMANDS['songlist-detail-music'].filter(command => !['setSort', 'setFilters', 'replaceSource'].includes(command)), {
      get pageSize() { return current?.limit ?? 30 },
      supportsSort: false,
      supportsFilters: false,
      get title() { return current?.info.name ?? '' },
      get subtitle() { return current?.info.desc ?? current?.info.author },
      get coverUrl() { return current?.info.img },
      page: () => Math.max(1, Number(params.page) || 1),
      total: () => current?.total ?? 0,
      pageItems: () => current?.list ?? [],
      load: async(page: number) => {
        current = await getListDetail(id, source, page)
        return { items: [...current.list], total: current.total, pageCount: Math.max(1, Math.ceil(current.total / current.limit)) }
      },
    })
  }
}
