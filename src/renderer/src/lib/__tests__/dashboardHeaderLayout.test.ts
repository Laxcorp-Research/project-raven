import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Header } from '../../components/dashboard/Header'

const noop = (): void => {}

function headerMarkup(isRecording: boolean): string {
  return renderToStaticMarkup(
    createElement(Header, {
      stealth: false,
      isRecording,
      onToggleStealth: noop,
      onStartRaven: noop,
      onOpenSettings: noop,
      searchQuery: '',
      onSearchChange: noop,
      onSearchSubmit: noop,
      onSessionSelect: noop,
      onOpenAsk: noop,
    }),
  )
}

/** Classes of the element that wraps the search trigger button. */
function searchSectionClasses(html: string): string[] {
  const match = html.match(/<div class="([^"]*)"><button[^>]*>(?:(?!<\/button>).)*Search sessions/s)
  return match?.[1].split(/\s+/) ?? []
}

/** Classes of the right-hand group, which starts with the Ask button. */
function rightSectionClasses(html: string): string[] {
  const match = html.match(/<div class="([^"]*)"><div class="relative group"><button[^>]*><svg[^>]*lucide-sparkles/)
  return match?.[1].split(/\s+/) ?? []
}

// Node has no layout engine, so these lock the two properties the fix
// depends on rather than measuring pixels.
describe('dashboard header layout', () => {
  it.each([
    ['idle', false],
    ['session in progress', true],
  ])('keeps the search trigger in the row flow when %s (regression: Ask icon drawn over the search bar)', (_state, isRecording) => {
    const classes = searchSectionClasses(headerMarkup(isRecording))
    expect(classes).not.toEqual([])
    // An absolutely positioned search takes no space in the row, so a wider
    // right-hand group ("Session in Progress") slides over it.
    expect(classes).not.toContain('absolute')
    expect(classes).not.toContain('fixed')
  })

  it('does not let the right-hand group be squeezed below its content', () => {
    const html = headerMarkup(true)
    expect(html).toContain('Session in Progress')
    expect(rightSectionClasses(html)).toContain('min-w-max')
  })
})
