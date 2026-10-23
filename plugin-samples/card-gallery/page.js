
      const api = window.lxPlugin
      const applyTheme = theme => {
        if (!theme || !theme.tokens) return
        for (const [key, value] of Object.entries(theme.tokens)) {
          if (/^--lx-[a-z0-9-]+$/.test(key)) document.documentElement.style.setProperty(key, String(value))
        }
      }
      api.getTheme().then(applyTheme)
      api.onThemeChange(applyTheme)
      api.getIdentity().then(identity => {
        document.getElementById('identity').textContent = `Plugin: ${identity.pluginId} · page: ${identity.pageId}`
      })
      document.getElementById('go-search').addEventListener('click', () => {
        void api.navigate('/search')
      })

const applySettings = settings => { document.querySelector("h1").textContent = settings.guideTitle || "Card gallery" }
api.settings.get().then(applySettings)
api.settings.subscribe(applySettings)
