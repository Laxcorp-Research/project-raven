import { useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react'

interface UseOverlayDragOptions {
  panelRight: number
  panelBottom: number
  panelWidth: number
  panelHeight: number | undefined
  defaultCompactHeight: number
  setPanelRight: (v: number) => void
  setPanelBottom: (v: number) => void
  setOverlayMouseIgnore: (ignore: boolean) => void
}

export function useOverlayDrag(options: UseOverlayDragOptions) {
  const logoDragMovedRef = useRef(false)
  const logoDragCleanupRef = useRef<(() => void) | null>(null)

  const handleLogoClick = useCallback(() => {
    if (logoDragMovedRef.current) {
      logoDragMovedRef.current = false
      return
    }
    window.raven.windowShowDashboard?.()
  }, [])

  const handleLogoMouseDown = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    options.setOverlayMouseIgnore(false)

    logoDragCleanupRef.current?.()
    logoDragMovedRef.current = false

    const startRight = options.panelRight
    const startBottom = options.panelBottom
    const currentW = options.panelWidth
    const currentH = options.panelHeight ?? options.defaultCompactHeight
    const startX = event.screenX
    const startY = event.screenY
    const originalCursor = document.body.style.cursor
    const originalUserSelect = document.body.style.userSelect
    document.body.style.setProperty('cursor', 'default', 'important')
    document.body.style.userSelect = 'none'

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.screenX - startX
      const dy = moveEvent.screenY - startY

      if (!logoDragMovedRef.current && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
        logoDragMovedRef.current = true
      }

      const vw = window.innerWidth
      const vh = window.innerHeight
      const newRight = Math.min(Math.max(0, startRight - dx), vw - currentW)
      const newBottom = Math.min(Math.max(0, startBottom - dy), vh - currentH)
      options.setPanelRight(newRight)
      options.setPanelBottom(newBottom)
    }

    const cleanup = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.removeProperty('cursor')
      if (originalCursor) document.body.style.cursor = originalCursor
      document.body.style.userSelect = originalUserSelect
      logoDragCleanupRef.current = null
    }

    const onMouseUp = () => cleanup()

    logoDragCleanupRef.current = cleanup
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp, { once: true })
  }, [options.panelRight, options.panelBottom, options.panelWidth, options.panelHeight, options.setOverlayMouseIgnore, options.defaultCompactHeight, options.setPanelRight, options.setPanelBottom])

  const cleanupDrag = useCallback(() => {
    logoDragCleanupRef.current?.()
  }, [])

  return {
    handleLogoClick,
    handleLogoMouseDown,
    cleanupDrag,
  }
}
