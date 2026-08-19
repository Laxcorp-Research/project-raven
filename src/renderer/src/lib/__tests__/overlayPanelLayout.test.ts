import { describe, expect, it } from 'vitest'
import {
  EMPTY_OVERLAY_INSETS,
  overlayPanelTop,
  placeOverlayPanel,
} from '../overlayPanelLayout'

describe('placeOverlayPanel', () => {
  it('grows downward so a centered compact card does not slide under the menu bar', () => {
    const vh = 1080
    const compactHeight = 216
    const bottom = Math.round((vh - compactHeight) / 2)
    const placed = placeOverlayPanel({
      viewportWidth: 1280,
      viewportHeight: vh,
      insets: { top: 38, right: 0, bottom: 0, left: 0 },
      width: 480,
      height: 500,
      right: 400,
      bottom,
      previousHeight: compactHeight,
    })

    expect(overlayPanelTop(vh, placed.bottom, placed.height)).toBe(
      overlayPanelTop(vh, bottom, compactHeight),
    )
    expect(overlayPanelTop(vh, placed.bottom, placed.height)).toBeGreaterThanOrEqual(58)
  })

  it('shifts the card down when it was already at the top of the screen', () => {
    const vh = 982
    const compactHeight = 216
    const placed = placeOverlayPanel({
      viewportWidth: 1512,
      viewportHeight: vh,
      insets: { top: 38, right: 0, bottom: 0, left: 0 },
      width: 480,
      height: 500,
      right: 20,
      bottom: vh - compactHeight,
      previousHeight: compactHeight,
    })

    const top = overlayPanelTop(vh, placed.bottom, placed.height)
    expect(top).toBeGreaterThanOrEqual(58)
    expect(placed.bottom).toBeGreaterThanOrEqual(20)
  })

  it('does not grow past the work area on a short display', () => {
    const placed = placeOverlayPanel({
      viewportWidth: 1280,
      viewportHeight: 500,
      insets: { top: 38, right: 0, bottom: 0, left: 0 },
      width: 480,
      height: 500,
      right: 20,
      bottom: 20,
      previousHeight: 216,
    })

    expect(placed.height).toBe(500 - 38 - 20 - 20)
    expect(overlayPanelTop(500, placed.bottom, placed.height)).toBeGreaterThanOrEqual(58)
  })

  it('keeps an 800px Mac display from expanding under the menu bar', () => {
    const vh = 800
    const compactHeight = 216
    const bottom = Math.round((vh - compactHeight) / 2)
    const placed = placeOverlayPanel({
      viewportWidth: 1280,
      viewportHeight: vh,
      insets: { top: 38, right: 0, bottom: 0, left: 0 },
      width: 480,
      height: 500,
      right: 400,
      bottom,
      previousHeight: compactHeight,
    })
    expect(overlayPanelTop(vh, placed.bottom, placed.height)).toBeGreaterThanOrEqual(58)
  })

  it('grows upward when the card is already at the bottom of the screen', () => {
    const vh = 982
    const compactHeight = 216
    const bottom = 20
    const placed = placeOverlayPanel({
      viewportWidth: 1512,
      viewportHeight: vh,
      insets: { top: 38, right: 0, bottom: 0, left: 0 },
      width: 480,
      height: 500,
      right: 20,
      bottom,
      previousHeight: compactHeight,
    })

    expect(placed.bottom).toBe(bottom)
    expect(overlayPanelTop(vh, placed.bottom, placed.height)).toBeLessThan(
      overlayPanelTop(vh, bottom, compactHeight),
    )
    expect(overlayPanelTop(vh, placed.bottom, placed.height)).toBeGreaterThanOrEqual(58)
  })

  it('leaves a card that already fits unmoved', () => {
    const placed = placeOverlayPanel({
      viewportWidth: 1920,
      viewportHeight: 1080,
      insets: EMPTY_OVERLAY_INSETS,
      width: 480,
      height: 216,
      right: 100,
      bottom: 100,
      previousHeight: 216,
    })
    expect(placed).toEqual({ right: 100, bottom: 100, height: 216, width: 480 })
  })
})
