/* LX Music collection view SDK demo. Runs inside a sandboxed WebContentsView. */
(function () {
  'use strict'
  const api = window.lxPlugin
  const layout = window.__LX_LAYOUT__ === 'cards' ? 'cards' : 'list'
  const ROW_HEIGHT = 48
  const CARD_MIN_WIDTH = 168
  const state = {
    snapshot: null,
    items: [],
    loading: false,
    error: '',
    anchor: 0,
    menu: null,
    optionMenu: null,
    theme: null,
    identity: null,
    anchorOffset: 0,
    rangeStart: 0,
  }

  const root = document.getElementById('app')
  const cache = new Map()

  const t = (key, fallback) => {
    const map = {
      play: 'Play',
      playAll: 'Play all',
      playNext: 'Play next',
      playLater: 'Play later',
      toggleLove: 'Love',
      addToPlaylist: 'Add to playlist',
      moveToPlaylist: 'Move to playlist',
      download: 'Download',
      dislike: 'Dislike',
      searchItem: 'Search',
      openSourceDetail: 'Open source page',
      removeFromCurrentList: 'Remove',
      replaceSource: 'Replace source',
      selectAll: 'Select all',
      clearSelection: 'Clear',
      refresh: 'Refresh',
      empty: 'No music here yet',
      error: 'Could not load this collection',
      retry: 'Retry',
      selected: 'selected',
      loading: 'Loading…',
      previous: 'Previous',
      next: 'Next',
      page: 'Page',
      cardView: 'Cards',
      listView: 'List',
    }
    return map[key] || fallback || key
  }

  const el = (tag, className, text) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text != null) node.textContent = text
    return node
  }

  const applyTheme = theme => {
    if (!theme || !theme.tokens) return
    state.theme = theme
    for (const [key, value] of Object.entries(theme.tokens)) {
      if (/^--lx-[a-z0-9-]+$/.test(key)) document.documentElement.style.setProperty(key, String(value))
    }
    document.documentElement.dataset.theme = theme.isDark ? 'dark' : 'light'
  }

  const itemKey = item => item.key

  const dispatch = async(command, options) => {
    const snapshot = state.snapshot
    if (!snapshot) return null
    try {
      const result = await api.dispatch(Object.assign({
        revision: snapshot.revision,
        command,
      }, options || {}))
      if (result && result.changed) await reload(true)
      return result
    } catch (error) {
      if (String(error.message || error).includes('STALE_SNAPSHOT')) await reload()
      showToast(String(error && error.message ? error.message : error))
      return null
    }
  }

  const showToast = message => {
    let toast = document.getElementById('toast')
    if (!toast) {
      toast = el('div', 'toast')
      toast.id = 'toast'
      root.appendChild(toast)
    }
    toast.textContent = message
    toast.classList.add('visible')
    clearTimeout(showToast.timer)
    showToast.timer = setTimeout(() => toast.classList.remove('visible'), 2600)
  }

  const targetForSelection = () => {
    if (state.snapshot && state.snapshot.selection.count > 0) return { kind: 'selection' }
    return { kind: 'collection' }
  }

  const loadRange = async(offset, limit) => {
    const snapshot = state.snapshot
    if (!snapshot) return []
    const key = `${snapshot.revision}:${offset}:${limit}`
    if (cache.has(key)) return cache.get(key)
    const result = await api.getItems({ revision: snapshot.revision, offset, limit })
    const items = (result && result.items) || []
    if (!state.snapshot || state.snapshot.revision !== snapshot.revision) return []
    cache.set(key, items)
    while (cache.size > 12) cache.delete(cache.keys().next().value)
    return items
  }

  const reload = async(incremental) => {
    if (state.loading) {
      state.pendingReload = true
      return
    }
    state.loading = true
    state.error = ''
    render()
    try {
      const snapshot = await api.getSnapshot()
      const previous = state.snapshot
      state.snapshot = snapshot
      if (!previous || previous.revision !== snapshot.revision) cache.clear()
      if (snapshot.status === 'error') {
        state.error = snapshot.error ? snapshot.error.message : t('error')
        state.items = []
      } else {
        state.rangeStart = snapshot.pageCount > 1 ? ((snapshot.page || 1) - 1) * snapshot.pageSize : 0
        state.items = []
        const anchor = snapshot.scrollAnchor ? snapshot.scrollAnchor.offset : state.rangeStart
        state.anchorOffset = Math.max(state.rangeStart, anchor)
        const offset = Math.floor(state.anchorOffset / 100) * 100
        const items = await loadRange(offset, 100)
        items.forEach((item, i) => { state.items[offset + i] = item })
      }
    } catch (error) {
      state.error = String(error && error.message ? error.message : error)
    } finally {
      state.loading = false
      render()
      if (state.pendingReload) {
        state.pendingReload = false
        void reload()
      }
    }
  }

  const pendingRanges = new Set()
  const ensureRange = async(start, end) => {
    const snapshot = state.snapshot
    if (!snapshot) return
    for (let offset = Math.floor(start / 100) * 100; offset < Math.ceil(end / 100) * 100 && offset < snapshot.total; offset += 100) {
      const key = `${snapshot.revision}:${offset}:100`
      if (pendingRanges.has(key)) continue
      if (cache.has(key) && state.items[offset]) continue
      pendingRanges.add(key)
      try {
        const chunk = await loadRange(offset, 100)
        if (state.snapshot.revision !== snapshot.revision) continue
        chunk.forEach((item, i) => { state.items[offset + i] = item })
        if (root.__paint) root.__paint()
      } catch (error) { showToast(String(error.message || error)) }
      finally { pendingRanges.delete(key) }
    }
  }

  const buildToolbar = snapshot => {
    const bar = el('div', 'toolbar')
    const heading = el('div', 'heading')
    if (snapshot.coverUrl) {
      const img = el('img', 'cover')
      img.src = snapshot.coverUrl
      img.alt = ''
      heading.appendChild(img)
    }
    const titles = el('div', 'titles')
    titles.appendChild(el('div', 'title', snapshot.title || ''))
    if (snapshot.subtitle) titles.appendChild(el('div', 'subtitle', snapshot.subtitle))
    heading.appendChild(titles)
    bar.appendChild(heading)

    const actions = el('div', 'actions')
    const count = el('span', 'count', `${snapshot.total}`)
    actions.appendChild(count)
    if (snapshot.selection.mode !== 'none') {
      actions.appendChild(el('span', 'count', `${snapshot.selection.count} ${t('selected')}`))
    }
    const addButton = (label, onclick, primary) => {
      const button = el('button', `btn${primary ? ' primary' : ''}`, label)
      button.type = 'button'
      button.addEventListener('click', onclick)
      actions.appendChild(button)
    }
    addButton(t('playAll'), () => dispatch('playCollection', { target: { kind: 'collection' } }), true)
    addButton(snapshot.selection.mode === 'all' ? t('clearSelection') : t('selectAll'), () => dispatch(snapshot.selection.mode === 'all' ? 'clearSelection' : 'selectAll'))
    addButton(t('refresh'), () => dispatch('refresh'))
    if (snapshot.selection.count) {
      for (const command of ['playNext', 'playLater', 'toggleLove', 'addToPlaylist', 'moveToPlaylist', 'download', 'removeFromCurrentList']) {
        if (snapshot.commands.some(item => item.id === command && item.enabled)) addButton(t(command), () => runCommand(command, targetForSelection()))
      }
      addButton(t('clearSelection'), () => dispatch('clearSelection'))
    }
    bar.appendChild(actions)

    const sorts = (snapshot.facets || []).filter(facet => facet.options && facet.options.length)
    if (sorts.length) {
      const facets = el('div', 'facets')
      for (const facet of sorts) {
        const select = el('select', 'facet')
        for (const option of facet.options) {
          const opt = el('option', '', option.label)
          opt.value = option.id
          if (String(option.id) === String(facet.value)) opt.selected = true
          select.appendChild(opt)
        }
        select.addEventListener('change', () => {
          dispatch(facet.id === 'sort' ? 'setSort' : 'setFilters', { value: facet.id === 'sort' ? select.value : { localOnly: select.value === 'local' } })
        })
        facets.appendChild(select)
      }
      bar.appendChild(facets)
    }
    return bar
  }

  const buildMenu = item => {
    const commands = state.snapshot.commands.filter(command => command.enabled).map(command => command.id)
    const menu = el('div', 'menu')
    const entries = [
      ['playItem', t('play')],
      ['playNext', t('playNext')],
      ['playLater', t('playLater')],
      ['toggleLove', 'Love'],
      ['addToPlaylist', t('addToPlaylist')],
      ['moveToPlaylist', t('moveToPlaylist')],
      ['download', t('download')],
      ['replaceSource', t('replaceSource')],
      ['dislike', t('dislike')],
      ['searchItem', t('searchItem')],
      ['openSourceDetail', t('openSourceDetail')],
      ['removeFromCurrentList', t('removeFromCurrentList')],
    ]
    for (const [command, label] of entries) {
      if (!commands.includes(command)) continue
      const button = el('button', 'menu-item', label)
      button.type = 'button'
      button.addEventListener('click', async event => {
        event.stopPropagation()
        await runItemCommand(command, item)
      })
      menu.appendChild(button)
    }
    return menu
  }

  const optionCommands = new Set(['addToPlaylist', 'moveToPlaylist', 'download', 'replaceSource'])

  const runItemCommand = async(command, item) => runCommand(command, { kind: 'item', keys: [item.key] })

  const runCommand = async(command, target) => {
    state.menu = null
    render()
    try {
    if (optionCommands.has(command)) {
      const options = await api.getCommandOptions({
        revision: state.snapshot.revision,
        command,
        target,
      })
      if (options && options.options.length) {
        state.optionMenu = { command, target, options, revision: state.snapshot.revision }
        render()
        return
      }
    }
    await dispatch(command, { target })
    } catch (error) { showToast(String(error.message || error)) }
  }

  const buildRow = (item, index, snapshot) => {
    const row = el('div', 'row')
    if (snapshot.playingKey === item.key) row.classList.add('playing')
    const check = el('input', 'check')
    check.type = 'checkbox'
    check.checked = item.selected === true
    check.addEventListener('click', event => {
      event.stopPropagation()
      void selectItem(item, check.checked)
    })
    row.appendChild(check)
    row.appendChild(el('span', 'index', String(index + 1)))
    const name = el('div', 'name')
    name.appendChild(el('span', 'name-text', item.name))
    for (const tag of item.qualityTags || []) {
      name.appendChild(el('span', 'tag', tag === 'flac24bit' ? '24bit' : tag === 'flac' ? 'FLAC' : tag))
    }
    row.appendChild(name)
    row.appendChild(el('span', 'singer', item.singer || ''))
    row.appendChild(el('span', 'album', item.album || ''))
    row.appendChild(el('span', 'interval', item.interval || '--/--'))
    row.appendChild(el('span', 'source', item.source || ''))
    const more = el('button', 'more', '⋯')
    more.type = 'button'
    more.addEventListener('click', event => {
      event.stopPropagation()
      state.menu = { item, index }
      render()
    })
    row.appendChild(more)
    row.addEventListener('dblclick', () => dispatch('playItem', { target: { kind: 'item', keys: [item.key] } }))
    row.addEventListener('contextmenu', event => {
      event.preventDefault()
      state.menu = { item, index }
      render()
    })
    return row
  }

  const selectItem = async(item, selected) => {
    await dispatch('select', {
      target: { kind: 'item', keys: [item.key] },
      value: selected ? 'add' : 'remove',
    })
    render()
  }

  const buildCard = (item, index, snapshot) => {
    const card = el('div', 'card')
    if (snapshot.playingKey === item.key) card.classList.add('playing')
    if (item.coverUrl) {
      const img = el('img', 'card-cover')
      img.src = item.coverUrl; img.loading = 'lazy'; img.alt = ''
      card.appendChild(img)
    } else card.appendChild(el('div', 'card-cover placeholder'))
    card.appendChild(el('div', 'card-title', item.name))
    card.appendChild(el('div', 'card-sub', item.singer || ''))
    const actions = el('div', 'card-actions')
    const check = el('input', 'check')
    check.type = 'checkbox'; check.checked = item.selected === true
    check.setAttribute('aria-label', `Select ${item.name}`)
    check.addEventListener('change', () => selectItem(item, check.checked))
    const play = el('button', 'btn primary', t('play'))
    play.addEventListener('click', () => dispatch('playItem', { target: { kind: 'item', keys: [item.key] } }))
    const more = el('button', 'btn', '⋯')
    more.addEventListener('click', event => { event.stopPropagation(); state.menu = { item, index }; render() })
    actions.append(check, play, more); card.appendChild(actions)
    return card
  }

  const buildVirtual = snapshot => {
    const cards = layout === 'cards'
    const scroller = el('div', cards ? 'scroller cards' : 'scroller')
    const spacer = el('div', 'spacer')
    const viewport = el('div', cards ? 'viewport grid' : 'viewport')
    const startOffset = state.rangeStart
    const count = snapshot.pageCount > 1 ? Math.min(snapshot.pageSize, snapshot.total - startOffset) : snapshot.total
    const columns = cards ? Math.max(1, Math.floor((window.innerWidth - 28) / (CARD_MIN_WIDTH + 14))) : 1
    const rowHeight = cards ? 294 : ROW_HEIGHT
    if (cards) viewport.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`
    spacer.style.height = `${Math.ceil(Math.max(1, count) / columns) * rowHeight}px`
    spacer.appendChild(viewport); scroller.appendChild(spacer)
    const paint = () => {
      const startRow = Math.max(0, Math.floor(scroller.scrollTop / rowHeight) - 2)
      const endRow = startRow + Math.ceil(scroller.clientHeight / rowHeight) + 5
      const start = startOffset + startRow * columns
      const end = Math.min(startOffset + count, startOffset + endRow * columns)
      viewport.style.transform = `translateY(${startRow * rowHeight}px)`
      viewport.replaceChildren()
      for (let index = start; index < end; index++) {
        const item = state.items[index]
        viewport.appendChild(item ? (cards ? buildCard(item, index, snapshot) : buildRow(item, index, snapshot)) : el('div', cards ? 'card placeholder' : 'row placeholder', t('loading')))
      }
      void ensureRange(start, end)
    }
    scroller.addEventListener('scroll', () => {
      const offset = startOffset + Math.floor(scroller.scrollTop / rowHeight) * columns
      state.anchorOffset = offset
      if (api.setScrollAnchor) void api.setScrollAnchor({ offset }).catch(() => {})
      requestAnimationFrame(paint)
    })
    root.__paint = () => {
      scroller.scrollTop = Math.floor(Math.max(0, state.anchorOffset - startOffset) / columns) * rowHeight
      paint()
    }
    return scroller
  }

  const buildPager = snapshot => {
    if (!snapshot.pageCount || snapshot.pageCount < 2) return null
    const pager = el('div', 'pager')
    const previous = el('button', 'btn', t('previous'))
    previous.type = 'button'
    previous.disabled = (snapshot.page || 1) <= 1
    previous.addEventListener('click', () => dispatch('setPage', { value: (snapshot.page || 1) - 1 }))
    const next = el('button', 'btn', t('next'))
    next.type = 'button'
    next.disabled = (snapshot.page || 1) >= snapshot.pageCount
    next.addEventListener('click', () => dispatch('setPage', { value: (snapshot.page || 1) + 1 }))
    pager.appendChild(previous)
    pager.appendChild(el('span', 'count', `${t('page')} ${snapshot.page} / ${snapshot.pageCount}`))
    pager.appendChild(next)
    return pager
  }

  const render = () => {
    if (!root) return
    const snapshot = state.snapshot
    root.innerHTML = ''
    root.__paint = null
    if (!snapshot) {
      root.appendChild(el('div', 'status', state.error || t('loading')))
      return
    }
    root.appendChild(buildToolbar(snapshot))
    const body = el('div', 'body')
    if (state.error) {
      body.appendChild(el('div', 'status', state.error))
      const retry = el('button', 'btn primary', t('retry'))
      retry.type = 'button'
      retry.addEventListener('click', () => reload())
      body.appendChild(retry)
    } else if (snapshot.status === 'empty' || snapshot.total === 0) {
      body.appendChild(el('div', 'status', t('empty')))
    } else {
      body.appendChild(buildVirtual(snapshot))
    }
    root.appendChild(body)
    const pager = buildPager(snapshot)
    if (pager) root.appendChild(pager)

    if (state.menu) {
      const menu = buildMenu(state.menu.item)
      menu.style.left = `${Math.min(window.innerWidth - 200, 120)}px`
      menu.style.top = `${Math.min(window.innerHeight - 260, 90 + state.menu.index * 4)}px`
      root.appendChild(menu)
    }
    if (state.optionMenu) {
      const overlay = el('div', 'overlay')
      const dialog = el('div', 'dialog')
      dialog.appendChild(el('h3', '', state.optionMenu.options.title || state.optionMenu.command))
      for (const option of state.optionMenu.options.options) {
        const button = el('button', `menu-item${option.disabled ? ' disabled' : ''}`, option.label)
        button.type = 'button'
        if (option.disabled) button.disabled = true
        button.addEventListener('click', async() => {
          const current = state.optionMenu
          state.optionMenu = null
          render()
          if (current.revision !== state.snapshot.revision) { await reload(); showToast('STALE_SNAPSHOT'); return }
          await dispatch(current.command, { target: current.target, optionId: option.id })
        })
        dialog.appendChild(button)
      }
      const cancel = el('button', 'btn', 'Cancel')
      cancel.type = 'button'
      cancel.addEventListener('click', () => {
        state.optionMenu = null
        render()
      })
      dialog.appendChild(cancel)
      overlay.appendChild(dialog)
      root.appendChild(overlay)
    }
    if (root.__paint) requestAnimationFrame(root.__paint)
  }

  const boot = async() => {
    applyTheme(await api.getTheme())
    api.onThemeChange(applyTheme)
    api.subscribe('snapshot', snapshot => {
      const previous = state.snapshot
      state.snapshot = snapshot

      if (!previous || previous.revision !== snapshot.revision) {
        cache.clear()
        void reload()
      } else {
        render()
      }
    })
    api.subscribe('availability', state => { if (state.available && state.visible) void reload() })
    state.identity = await api.getIdentity()
    await api.ready()
    await reload()
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      state.menu = null
      state.optionMenu = null
      render()
    }
  })
  document.addEventListener('click', event => {
    if (state.menu && !event.target.closest('.menu')) {
      state.menu = null
      render()
    }
  })

  void boot().catch(error => {
    state.error = String(error && error.message ? error.message : error)
    render()
  })
})()
