/**
 * Session recap serializers (Markdown + HTML).
 *
 * Pure/string-only so they can run in the main process for export and be unit
 * tested without Electron. The HTML variant is what gets rendered to PDF.
 */

import { parseActionItems } from './actionItems'
import { computeTalkRatio } from './talkRatio'

export interface SessionExportEntry {
  source: 'mic' | 'system'
  text: string
  isFinal?: boolean
  speakerName?: string | null
}

export interface SessionExportData {
  title: string
  startedAt: number
  durationSeconds: number
  summary: string | null
  actionItemsJson: string | null
  transcript: SessionExportEntry[]
  displayName?: string
  includeTranscript?: boolean
}

export function formatExportDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

function metaLine(data: SessionExportData): string {
  const date = new Date(data.startedAt).toLocaleString()
  const duration = formatExportDuration(data.durationSeconds)
  const ratio = computeTalkRatio(data.transcript)
  const parts = [date, duration]
  if (ratio.totalWords > 0) {
    parts.push(`Talk ratio: You ${ratio.youPct}% / Them ${ratio.themPct}%`)
  }
  return parts.join(' · ')
}

function formatTranscript(data: SessionExportData): string[] {
  const you = data.displayName || 'You'
  return data.transcript
    .filter((entry) => entry.isFinal !== false && entry.text?.trim())
    .map((entry) => {
      const speaker = entry.source === 'mic' ? you : entry.speakerName || 'Them'
      return `**${speaker}:** ${entry.text}`
    })
}

export function buildSessionMarkdown(data: SessionExportData): string {
  const lines: string[] = []
  lines.push(`# ${data.title || 'Untitled Session'}`)
  lines.push('')
  lines.push(`_${metaLine(data)}_`)
  lines.push('')

  const items = parseActionItems(data.actionItemsJson)
  if (items.length > 0) {
    lines.push('## Action items')
    lines.push('')
    for (const item of items) {
      const suffix = [item.assignee, item.deadline].filter(Boolean).join(' · ')
      lines.push(`- [ ] ${item.task}${suffix ? ` — ${suffix}` : ''}`)
    }
    lines.push('')
  }

  if (data.summary?.trim()) {
    lines.push('## Summary')
    lines.push('')
    lines.push(data.summary.trim())
    lines.push('')
  }

  if (data.includeTranscript) {
    const transcript = formatTranscript(data)
    if (transcript.length > 0) {
      lines.push('## Transcript')
      lines.push('')
      lines.push(...transcript)
      lines.push('')
    }
  }

  lines.push('---')
  lines.push('_Exported from Raven_')

  return lines.join('\n')
}

// ── HTML (for PDF) ───────────────────────────────────────────────────

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderInline(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

/** Minimal Markdown→HTML for the summary block: headings, bullets, bold, paragraphs. */
export function markdownToHtml(markdown: string): string {
  const out: string[] = []
  let inList = false
  const closeList = () => {
    if (inList) {
      out.push('</ul>')
      inList = false
    }
  }

  for (const raw of markdown.split('\n')) {
    const line = raw.trim()
    if (!line) {
      closeList()
      continue
    }
    const h2 = line.match(/^##\s+(.*)$/)
    const h1 = line.match(/^#\s+(.*)$/)
    const bullet = line.match(/^[-*]\s+(.*)$/)
    if (h2) {
      closeList()
      out.push(`<h2>${renderInline(h2[1])}</h2>`)
    } else if (h1) {
      closeList()
      out.push(`<h1>${renderInline(h1[1])}</h1>`)
    } else if (bullet) {
      if (!inList) {
        out.push('<ul>')
        inList = true
      }
      out.push(`<li>${renderInline(bullet[1])}</li>`)
    } else {
      closeList()
      out.push(`<p>${renderInline(line)}</p>`)
    }
  }
  closeList()
  return out.join('\n')
}

export function buildSessionHtml(data: SessionExportData): string {
  const items = parseActionItems(data.actionItemsJson)
  const actionItemsHtml = items.length
    ? `<h2>Action items</h2><ul class="checklist">${items
        .map((item) => {
          const suffix = [item.assignee, item.deadline].filter(Boolean).join(' · ')
          return `<li>${renderInline(item.task)}${suffix ? ` <span class="muted">— ${escapeHtml(suffix)}</span>` : ''}</li>`
        })
        .join('')}</ul>`
    : ''

  const summaryHtml = data.summary?.trim()
    ? `<h2>Summary</h2>${markdownToHtml(data.summary.trim())}`
    : ''

  let transcriptHtml = ''
  if (data.includeTranscript) {
    const you = data.displayName || 'You'
    const rows = data.transcript
      .filter((entry) => entry.isFinal !== false && entry.text?.trim())
      .map((entry) => {
        const speaker = entry.source === 'mic' ? you : entry.speakerName || 'Them'
        return `<p><strong>${escapeHtml(speaker)}:</strong> ${escapeHtml(entry.text)}</p>`
      })
    if (rows.length) transcriptHtml = `<h2>Transcript</h2>${rows.join('')}`
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1f2937; line-height: 1.5; padding: 40px; max-width: 720px; margin: 0 auto; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 24px 0 8px; color: #111827; }
  .meta { color: #6b7280; font-size: 13px; margin-bottom: 8px; }
  ul { margin: 4px 0; padding-left: 20px; }
  li { margin: 4px 0; }
  .checklist { list-style: none; padding-left: 0; }
  .checklist li::before { content: "\\2610"; margin-right: 8px; color: #9ca3af; }
  .muted { color: #9ca3af; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; }
</style>
</head>
<body>
  <h1>${escapeHtml(data.title || 'Untitled Session')}</h1>
  <div class="meta">${escapeHtml(metaLine(data))}</div>
  ${actionItemsHtml}
  ${summaryHtml}
  ${transcriptHtml}
  <div class="footer">Exported from Raven</div>
</body>
</html>`
}
