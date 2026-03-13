/**
 * Lightweight markdown → HTML renderer for plan files.
 * Handles: headings, bold/italic, inline code, fenced code blocks,
 * unordered/ordered lists, tables, blockquotes, horizontal rules, links.
 */
export function renderMarkdown(raw: string): string {
  function esc(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function inline(s: string): string {
    s = esc(s)
    // Inline code first (to protect contents from further processing)
    const codeParts: string[] = []
    s = s.replace(/`([^`]+)`/g, (_, c) => {
      codeParts.push(c)
      return `\x00code${codeParts.length - 1}\x00`
    })
    // Bold + italic
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    s = s.replace(/__(.+?)__/g, '<strong>$1</strong>')
    s = s.replace(/\*([^\s*][^*]*?)\*/g, '<em>$1</em>')
    s = s.replace(/_([^\s_][^_]*?)_/g, '<em>$1</em>')
    // Strikethrough
    s = s.replace(/~~(.+?)~~/g, '<del>$1</del>')
    // Links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
      const safe = /^(https?:|mailto:|\/|#)/.test(url) ? url : '#'
      return `<a href="${esc(safe)}" target="_blank" rel="noopener">${text}</a>`
    })
    // Restore inline code
    s = s.replace(/\x00code(\d+)\x00/g, (_, i) => `<code>${esc(codeParts[Number(i)])}</code>`)
    return s
  }

  const lines = raw.split('\n')
  const out: string[] = []
  let inCode = false
  let codeLang = ''
  let codeLines: string[] = []
  let listMode: 'ul' | 'ol' | null = null
  let listItems: string[] = []
  let tableLines: string[] = []

  function flushList() {
    if (!listMode) return
    const tag = listMode
    out.push(`<${tag}>${listItems.map(item => `<li>${inline(item)}</li>`).join('')}</${tag}>`)
    listMode = null
    listItems = []
  }

  function flushTable() {
    if (!tableLines.length) return
    const rows = tableLines
    tableLines = []
    if (rows.length < 2 || !/^[\s|:-]+$/.test(rows[1])) {
      rows.forEach(l => out.push(`<p>${inline(l)}</p>`))
      return
    }
    const parseRow = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
    const headers = parseRow(rows[0])
    out.push('<table>')
    out.push('<thead><tr>' + headers.map(h => `<th>${inline(h)}</th>`).join('') + '</tr></thead>')
    out.push('<tbody>')
    for (const row of rows.slice(2)) {
      out.push('<tr>' + parseRow(row).map(c => `<td>${inline(c)}</td>`).join('') + '</tr>')
    }
    out.push('</tbody></table>')
  }

  for (const line of lines) {
    // Code fence
    if (line.startsWith('```')) {
      if (!inCode) {
        flushList(); flushTable()
        inCode = true
        codeLang = line.slice(3).trim()
        codeLines = []
      } else {
        const body = codeLines.map(esc).join('\n')
        const attr = codeLang ? ` data-lang="${esc(codeLang)}"` : ''
        out.push(`<pre${attr}><code>${body}</code></pre>`)
        inCode = false; codeLines = []; codeLang = ''
      }
      continue
    }
    if (inCode) { codeLines.push(line); continue }

    // Heading
    const hm = line.match(/^(#{1,6})\s+(.+)$/)
    if (hm) {
      flushList(); flushTable()
      const lvl = hm[1].length
      out.push(`<h${lvl}>${inline(hm[2])}</h${lvl}>`)
      continue
    }

    // Horizontal rule
    if (/^([-*_])\1{2,}$/.test(line.trim())) {
      flushList(); flushTable()
      out.push('<hr>')
      continue
    }

    // Blockquote
    const bq = line.match(/^>\s?(.*)$/)
    if (bq) {
      flushList(); flushTable()
      out.push(`<blockquote>${inline(bq[1])}</blockquote>`)
      continue
    }

    // Unordered list
    const ulm = line.match(/^[ \t]*[-*+]\s+(.+)$/)
    if (ulm) {
      flushTable()
      if (listMode !== 'ul') { flushList(); listMode = 'ul' }
      listItems.push(ulm[1])
      continue
    }

    // Ordered list
    const olm = line.match(/^[ \t]*\d+[.)]\s+(.+)$/)
    if (olm) {
      flushTable()
      if (listMode !== 'ol') { flushList(); listMode = 'ol' }
      listItems.push(olm[1])
      continue
    }

    // Table row (contains |)
    if (line.includes('|')) {
      flushList()
      tableLines.push(line)
      continue
    }

    // Non-table line flushes any pending table
    if (tableLines.length) flushTable()

    // Blank line
    if (!line.trim()) {
      flushList()
      continue
    }

    // Regular paragraph
    flushList()
    out.push(`<p>${inline(line)}</p>`)
  }

  flushList()
  flushTable()
  if (inCode && codeLines.length) {
    out.push(`<pre><code>${codeLines.map(esc).join('\n')}</code></pre>`)
  }

  return out.join('\n')
}
