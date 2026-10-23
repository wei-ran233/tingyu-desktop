// Sandboxed runtime: handlers operate on the declared data contract only.
void window.lxRuntime.start({
  async activate(context) {
    if (context.isCancelled()) throw new Error('Activation cancelled')
  },
  async deactivate() {},
  handlers: {
    async normalize(input, context) {
      if (context.isCancelled()) throw new Error('Search cancelled')
      const text = input.text.trim()
      return { text: context.settings.collapseSpaces ? text.replace(/\s+/g, ' ') : text }
    },
  },
})
