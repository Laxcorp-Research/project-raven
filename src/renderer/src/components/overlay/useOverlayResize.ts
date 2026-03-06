import { useState, useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react'

export type ResizeEdge = 'left' | 'right' | 'bottom'

const OVERLAY_MIN_WIDTH = 480
const OVERLAY_DEFAULT_WIDTH = 480
const OVERLAY_COMPACT_MIN_HEIGHT = 210
const OVERLAY_DEFAULT_COMPACT_HEIGHT = 216
const OVERLAY_EXPANDED_MIN_HEIGHT = 350
const OVERLAY_DEFAULT_EXPANDED_HEIGHT = 500
const PANEL_EDGE_MARGIN = 20

export function useOverlayResize() {
  const [panelWidth, setPanelWidth] = useState(OVERLAY_DEFAULT_WIDTH)
  const [panelBottom, setPanelBottom] = useState(() =>
    Math.max(PANEL_EDGE_MARGIN, Math.round((window.innerHeight - OVERLAY_DEFAULT_COMPACT_HEIGHT) / 2))
  )
  const [panelRight, setPanelRight] = useState(() =>
    Math.max(PANEL_EDGE_MARGIN, Math.round((window.innerWidth - OVERLAY_DEFAULT_WIDTH) / 2))
  )
  const [panelHeight, setPanelHeight] = useState<number | undefined>(undefined)
  const [hoveredResizeEdge, setHoveredResizeEdge] = useState<ResizeEdge | null>(null)
  const [activeResizeEdge, setActiveResizeEdge] = useState<ResizeEdge | null>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  const handleResizeStart = useCallback((
    edge: ResizeEdge,
    e: ReactMouseEvent<HTMLDivElement>,
    isPanelExpanded: boolean,
  ) => {
    e.preventDefault()
    e.stopPropagation()

    resizeCleanupRef.current?.()

    const startWidth = panelWidth
    const startRight = panelRight
    const startBottom = panelBottom
    const startHeight = panelHeight ?? (isPanelExpanded ? OVERLAY_DEFAULT_EXPANDED_HEIGHT : OVERLAY_DEFAULT_COMPACT_HEIGHT)
    const startScreenX = e.screenX
    const startScreenY = e.screenY
    const originalCursor = document.body.style.cursor
    const originalUserSelect = document.body.style.userSelect
    document.body.style.cursor = edge === 'bottom' ? 'ns-resize' : 'ew-resize'
    document.body.style.userSelect = 'none'
    setActiveResizeEdge(edge)

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.screenX - startScreenX
      const dy = moveEvent.screenY - startScreenY
      const vw = window.innerWidth
      const vh = window.innerHeight

      if (edge === 'left') {
        const newWidth = Math.max(startWidth - dx, OVERLAY_MIN_WIDTH)
        const maxWidth = vw - startRight
        setPanelWidth(Math.min(newWidth, maxWidth))
      } else if (edge === 'right') {
        const newWidth = Math.max(startWidth + dx, OVERLAY_MIN_WIDTH)
        const widthDelta = newWidth - startWidth
        const newRight = Math.max(0, startRight - widthDelta)
        const maxWidth = vw - newRight
        setPanelWidth(Math.min(newWidth, maxWidth))
        setPanelRight(newRight)
      } else {
        const minH = isPanelExpanded ? OVERLAY_EXPANDED_MIN_HEIGHT : OVERLAY_COMPACT_MIN_HEIGHT
        const newHeight = Math.max(startHeight + dy, minH)
        const heightDelta = newHeight - startHeight
        const newBottom = Math.max(0, startBottom - heightDelta)
        const maxHeight = vh - newBottom
        setPanelHeight(Math.min(newHeight, maxHeight))
        setPanelBottom(newBottom)
      }
    }

    const cleanup = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = originalCursor
      document.body.style.userSelect = originalUserSelect
      setActiveResizeEdge(null)
      resizeCleanupRef.current = null
    }

    const onMouseUp = () => cleanup()

    resizeCleanupRef.current = cleanup
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp, { once: true })
  }, [panelWidth, panelRight, panelBottom, panelHeight])

  const handleResizeDoubleClick = useCallback((isPanelExpanded: boolean) => {
    const h = isPanelExpanded ? OVERLAY_DEFAULT_EXPANDED_HEIGHT : OVERLAY_DEFAULT_COMPACT_HEIGHT
    setPanelWidth(OVERLAY_DEFAULT_WIDTH)
    setPanelHeight(isPanelExpanded ? OVERLAY_DEFAULT_EXPANDED_HEIGHT : undefined)
    setPanelRight(Math.max(PANEL_EDGE_MARGIN, Math.round((window.innerWidth - OVERLAY_DEFAULT_WIDTH) / 2)))
    setPanelBottom(Math.max(PANEL_EDGE_MARGIN, Math.round((window.innerHeight - h) / 2)))
  }, [])

  const cleanupResize = useCallback(() => {
    resizeCleanupRef.current?.()
  }, [])

  return {
    panelWidth, panelRight, panelBottom, panelHeight,
    setPanelWidth, setPanelRight, setPanelBottom, setPanelHeight,
    hoveredResizeEdge, setHoveredResizeEdge,
    activeResizeEdge,
    handleResizeStart,
    handleResizeDoubleClick,
    cleanupResize,
    OVERLAY_DEFAULT_COMPACT_HEIGHT,
    OVERLAY_DEFAULT_EXPANDED_HEIGHT,
    OVERLAY_MIN_WIDTH,
    PANEL_EDGE_MARGIN,
  }
}
