import { search as searchMusic, listInfos } from '@renderer/store/search/music'
import { COLLECTION_SURFACE_COMMANDS } from '@common/collection/types'
import { PagedCollectionAdapter } from './paged'

const queues = new Map<string, Promise<unknown>>()

export class SearchCollectionAdapter extends PagedCollectionAdapter {
  constructor(params: Record<string, string>) {
    const source = (params.source as LX.OnlineSource | 'all') || 'kw'
    const text = params.text ?? ''
    let current = { list: [] as LX.Music.MusicInfo[], total: 0, maxPage: 1, limit: 30 }
    super('search-music', COLLECTION_SURFACE_COMMANDS['search-music'].filter(command => command !== 'setSort' && command !== 'setFilters'), {
      get pageSize() { return current.limit },
      supportsSort: false,
      supportsFilters: false,
      title: window.i18n.t('search'),
      subtitle: text,
      page: () => Math.max(1, Number(params.page) || 1),
      total: () => current.total,
      pageItems: () => current.list,
      load: async(page: number) => {
        const run = (queues.get(source) ?? Promise.resolve()).then(async() => {
          if (!text) return { items: [], total: 0, pageCount: 1 }
          const list = await searchMusic(text, page, source)
          const info = listInfos[source]!
          if (info.key !== `${page}__${text}`) throw new Error('Search context changed during loading')
          current = { list: [...list], total: info.total, maxPage: info.maxPage, limit: info.limit || 30 }
          return { items: current.list, total: current.total, pageCount: Math.max(1, current.maxPage) }
        })
        queues.set(source, run.catch(() => {}))
        return run
      },
    })
  }
}
