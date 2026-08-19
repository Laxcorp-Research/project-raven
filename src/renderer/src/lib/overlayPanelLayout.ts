export interface OverlayInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export const OVERLAY_PANEL_MARGIN = 20

export const EMPTY_OVERLAY_INSETS: OverlayInsets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
}

/**
 * Place the overlay card inside the visible work area.
 *
 * The overlay BrowserWindow is fullscreen (including under the macOS menu
 * bar). The card is CSS-positioned with `bottom` / `right`.
 *
 * On grow (`previousHeight` < `height`): expand into free space.
 * - Room below → grow down (pill / top edge stays put).
 * - Parked on the bottom → grow up (input / bottom edge stays put).
 * Then clamp so the card never sits under the menu bar or in the dock.
 */
export function placeOverlayPanel(opts: {
  viewportWidth: number
  viewportHeight: number
  insets: OverlayInsets
  margin?: number
  width: number
  height: number
  right: number
  bottom: number
  previousHeight?: number
}): { right: number; bottom: number; height: number; width: number } {
  const margin = opts.margin ?? OVERLAY_PANEL_MARGIN
  const vw = opts.viewportWidth
  const vh = opts.viewportHeight
  const minTop = opts.insets.top + margin
  const minBottom = opts.insets.bottom + margin
  const minLeft = opts.insets.left + margin
  const minRight = opts.insets.right + margin

  let height = opts.height
  let width = opts.width
  let bottom = opts.bottom
  let right = opts.right

  const maxHeight = Math.max(1, vh - minTop - minBottom)
  const maxWidth = Math.max(1, vw - minLeft - minRight)
  height = Math.min(height, maxHeight)
  width = Math.min(width, maxWidth)

  if (opts.previousHeight != null && height > opts.previousHeight) {
    const delta = height - opts.previousHeight
    const roomBelow = bottom - minBottom
    const currentTop = vh - bottom - opts.previousHeight
    const roomAbove = currentTop - minTop
    if (roomBelow >= delta) {
      bottom -= delta
    } else if (roomAbove < delta) {
      bottom -= Math.min(delta, Math.max(0, roomBelow))
    }
    // else: enough room above and not enough below — keep `bottom` (grow up).
  }

  const maxBottom = vh - height - minTop
  const maxRight = vw - width - minLeft
  bottom = clamp(bottom, minBottom, Math.max(minBottom, maxBottom))
  right = clamp(right, minRight, Math.max(minRight, maxRight))

  return { right, bottom, height, width }
}

export function overlayPanelTop(viewportHeight: number, bottom: number, height: number): number {
  return viewportHeight - bottom - height
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
