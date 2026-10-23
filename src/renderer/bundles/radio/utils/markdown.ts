/** Small, deliberately HTML-free Markdown renderer for streamed model text. */
const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export const safeLink = (raw: string): string | null => {
  try {
    const url = new URL(raw)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

const inline = (text: string): string => {
  const tokens: string[] = []
  const hold = (html: string) => { tokens.push(html); return `\uE000${tokens.length - 1}\uE000` }
  // Escape before interpolation; protect code and links from later formatting.
  let value = text.replace(/\uE000/g, '')
  value = value.replace(/`([^`]+)`/g, (_, code: string) => hold(`<code>${escapeHtml(code)}</code>`))
  value = value.replace(/\[([^\]\n]+)\]\(([^\s)]+)\)/g, (_, label: string, raw: string) => {
    const url = safeLink(raw)
    return hold(url ? `<a href="${escapeHtml(url)}" rel="noopener noreferrer">${escapeHtml(label)}</a>` : escapeHtml(label))
  })
  value = escapeHtml(value).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  return value.replace(/\uE000(\d+)\uE000/g, (_, index: string) => tokens[Number(index)] ?? '')
}

export function renderMarkdown(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const output: string[] = []
  let code: string[] | null = null
  let list: 'ul' | 'ol' | null = null
  const closeList = () => { if (list) output.push(`</${list}>`); list = null }
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      closeList()
      if (code) { output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = null } else code = []
      continue
    }
    if (code) { code.push(line); continue }
    const item = line.match(/^\s*(?:([-*])|\d+[.)])\s+(.*)$/)
    if (item) {
      const tag = item[1] ? 'ul' : 'ol'
      if (list !== tag) { closeList(); list = tag; output.push(`<${tag}>`) }
      output.push(`<li>${inline(item[2])}</li>`)
      continue
    }
    closeList()
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) { const level = heading[1].length + 2; output.push(`<h${level}>${inline(heading[2])}</h${level}>`); continue }
    if (/^>\s?/.test(line)) { output.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); continue }
    if (line.trim()) output.push(`<p>${inline(line)}</p>`)
    else output.push('<br>')
  }
  closeList()
  if (code) output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  return output.join('')
}
