import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const DOCS = 'https://docs.useraven.ai'
const FEEDBACK = 'https://laxcorphq.wixforms.com/f/7497329197333873820'

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('About and menu help links', () => {
  it('Send Feedback in the user menu opens the Wix form, not GitHub or docs', () => {
    const header = src('src/renderer/src/components/dashboard/Header.tsx')
    const label = '<span>Send Feedback</span>'
    const helpBlock = header.slice(header.indexOf(label) - 400, header.indexOf(label))
    expect(header).toContain(label)
    expect(header).not.toContain('Get Help')
    expect(helpBlock).toContain(FEEDBACK)
    expect(helpBlock).not.toContain(DOCS)
    expect(helpBlock).not.toContain('github.com/Laxcorp-Research/project-raven')
  })

  it('About Docs stays on docs.useraven.ai; Send Feedback replaces Report a Bug and GitHub issues/new', () => {
    const about = src('src/renderer/src/components/dashboard/settings/AboutTab.tsx')
    expect(about).toContain(`handleOpenLink('${DOCS}')`)
    expect(about).toContain('>Docs</div>')
    expect(about).toContain(`label: 'Send Feedback'`)
    expect(about).toContain(FEEDBACK)
    expect(about).not.toContain('Discussions')
    expect(about).not.toContain('project-raven/discussions')
    expect(about).not.toContain('useraven.ai/changelog')
    expect(about).not.toMatch(/label: 'Changelog'/)
    expect(about).not.toMatch(/label: 'Report a Bug'/)
    expect(about).not.toContain('project-raven/issues/new')
  })
})
