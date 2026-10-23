const render = (layout, input, context) => ({
  layout,
  heading: String(context.settings.title ?? '发现下一首').slice(0, 100),
  items: input.suggestions.map(value => ({ label: value, command: 'search', value })),
})
window.lxRuntime.start({
  handlers: {
    list: (input, context) => render('list', input, context),
    grid: (input, context) => render('grid', input, context),
    hint: input => ({ layout: 'row', heading: '', items: [{ label: `共 ${input.suggestions.length} 个灵感，切换外观会保留当前分组`, command: 'text', value: '' }] }),
    tools: input => ({ layout: 'row', heading: '', items: input.actions.map(action => ({ label: action.title, command: 'action', value: action.id })) }),
  },
})
