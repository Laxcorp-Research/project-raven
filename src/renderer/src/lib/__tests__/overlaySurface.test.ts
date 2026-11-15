import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ControllerPill } from '../../components/overlay/ControllerPill'

const DETECTABLE_FILL = '#18171ccc'
const noop = (): void => {}

function pillBackground(stealthEnabled: boolean): string | undefined {
  // Static render runs no effects; React logs that useLayoutEffect is a
  // no-op on the server, which is noise here.
  const silenced = vi.spyOn(console, 'error').mockImplementation(noop)
  try {
    const html = renderToStaticMarkup(
      createElement(ControllerPill, {
        stealthEnabled,
        isRecording: false,
        isStarting: false,
        incognitoMode: false,
        onToggleRecording: noop,
        onToggleStealth: noop,
        onToggleIncognito: noop,
        onHide: noop,
        onLogoClick: noop,
        onLogoMouseDown: noop,
      }),
    )
    return html.match(/background:(#[0-9a-f]+)/i)?.[1]
  } finally {
    silenced.mockRestore()
  }
}

function overlaySource(file: string): string {
  return readFileSync(new URL(`../../components/overlay/${file}`, import.meta.url), 'utf8')
}

describe('overlay surface in undetectable mode', () => {
  it('fills the controller pill exactly as opaque as detectable mode (regression: washed out on white pages)', () => {
    expect(pillBackground(false)).toBe(DETECTABLE_FILL)
    expect(pillBackground(true)).toBe(DETECTABLE_FILL)
  })

  it('fills the response panel with the detectable colour, not one picked by stealthEnabled', () => {
    const source = overlaySource('OverlayWindow.tsx')
    const panel = source.slice(source.indexOf('{/* Panel Container */}'))
    expect(panel.match(/background:\s*([^,\n]+)/)?.[1]).toBe(`'${DETECTABLE_FILL}'`)
  })

  it('keeps the 50%-alpha fill out of the overlay chrome', () => {
    for (const file of ['OverlayWindow.tsx', 'ControllerPill.tsx']) {
      // A boolean, so a failure names the file instead of printing all of it.
      expect(/#18171c80/i.test(overlaySource(file)), `${file} uses the 50%-alpha fill`).toBe(false)
    }
  })
})
