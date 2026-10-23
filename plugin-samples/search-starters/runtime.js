let page = 0
let configuration = ''
const group = (context, advance) => {
  const words = [...new Set(String(context.settings.queries ?? '').split(/[;；\n]/).map(text => text.trim().slice(0, 100)).filter(Boolean))].slice(0, 64)
  const size = Math.max(1, Math.min(12, Math.trunc(Number(context.settings.pageSize) || 4)))
  const signature = JSON.stringify([words, size])
  if (signature !== configuration) { configuration = signature; page = 0 }
  const pages = Math.max(1, Math.ceil(words.length / size))
  if (advance) page = (page + 1) % pages
  return { suggestions: words.slice(page * size, (page + 1) * size) }
}
window.lxRuntime.start({
  handlers: {
    suggest: (_input, context) => group(context, false),
    next: (_input, context) => {
      const result = group(context, true)
      // Notifications do not hold up the action or roll back its state.
      context.publishEvent('lx.search-starters/suggestions.changed', result).then(receipt => {
        document.body.dataset.lastEvent = JSON.stringify(receipt)
      }, () => { document.body.dataset.lastEvent = 'cancelled-or-busy' })
      return result
    },
  },
})
