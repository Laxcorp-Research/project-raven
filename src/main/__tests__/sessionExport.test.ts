import { describe, it, expect } from 'vitest'
import {
  buildSessionMarkdown,
  buildSessionHtml,
  markdownToHtml,
  formatExportDuration,
  escapeHtml,
  type SessionExportData,
} from '../../shared/sessionExport'

const BASE: SessionExportData = {
  title: 'Acme discovery call',
  startedAt: new Date('2026-08-20T10:00:00Z').getTime(),
  durationSeconds: 1830, // 30m 30s
  summary: '## Key points\n- Discussed **pricing**\n- Agreed on a pilot',
  actionItemsJson: JSON.stringify([
    { task: 'Send proposal', assignee: 'Sam', deadline: 'Friday' },
    { task: 'Book kickoff', assignee: null, deadline: null },
  ]),
  transcript: [
    { source: 'mic', text: 'Thanks for joining', isFinal: true },
    { source: 'system', text: 'Happy to be here', isFinal: true },
  ],
  displayName: 'Sam',
}

describe('formatExportDuration', () => {
  it('formats hours, minutes, seconds', () => {
    expect(formatExportDuration(45)).toBe('45s')
    expect(formatExportDuration(1830)).toBe('30m 30s')
    expect(formatExportDuration(3720)).toBe('1h 02m')
  })
})

describe('buildSessionMarkdown', () => {
  it('includes title, meta with talk ratio, action items, and summary', () => {
    const md = buildSessionMarkdown(BASE)
    expect(md).toContain('# Acme discovery call')
    // "Thanks for joining" = 3 words, "Happy to be here" = 4 words -> 43/57
    expect(md).toContain('Talk ratio: You 43% / Them 57%')
    expect(md).toContain('## Action items')
    expect(md).toContain('- [ ] Send proposal — Sam · Friday')
    expect(md).toContain('- [ ] Book kickoff')
    expect(md).toContain('## Summary')
    expect(md).toContain('Discussed **pricing**')
    expect(md).toContain('_Exported from Raven_')
  })

  it('omits the transcript unless includeTranscript is set', () => {
    expect(buildSessionMarkdown(BASE)).not.toContain('## Transcript')
    const withTranscript = buildSessionMarkdown({ ...BASE, includeTranscript: true })
    expect(withTranscript).toContain('## Transcript')
    expect(withTranscript).toContain('**Sam:** Thanks for joining')
    expect(withTranscript).toContain('**Them:** Happy to be here')
  })

  it('omits the action items section when there are none', () => {
    const md = buildSessionMarkdown({ ...BASE, actionItemsJson: null })
    expect(md).not.toContain('## Action items')
  })
})

describe('buildSessionHtml', () => {
  it('escapes HTML-unsafe characters in the title and transcript', () => {
    const html = buildSessionHtml({
      ...BASE,
      title: 'Plan <script> & "quotes"',
      includeTranscript: true,
      transcript: [{ source: 'system', text: '1 < 2 & 3 > 0', isFinal: true }],
    })
    expect(html).toContain('Plan &lt;script&gt; &amp; "quotes"')
    expect(html).toContain('1 &lt; 2 &amp; 3 &gt; 0')
    expect(html).not.toContain('<script>')
  })

  it('renders the summary markdown as HTML headings, bold, and lists', () => {
    const html = buildSessionHtml(BASE)
    expect(html).toContain('<h2>Key points</h2>')
    expect(html).toContain('<strong>pricing</strong>')
    expect(html).toContain('<li>')
  })
})

describe('markdownToHtml', () => {
  it('converts headings, bullets, and bold, and groups list items', () => {
    const html = markdownToHtml('## Heading\n- item one\n- item two\n\nA **bold** paragraph.')
    expect(html).toContain('<h2>Heading</h2>')
    expect(html).toBe(
      '<h2>Heading</h2>\n<ul>\n<li>item one</li>\n<li>item two</li>\n</ul>\n<p>A <strong>bold</strong> paragraph.</p>',
    )
  })
})

describe('escapeHtml', () => {
  it('escapes &, <, and >', () => {
    expect(escapeHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d')
  })
})
