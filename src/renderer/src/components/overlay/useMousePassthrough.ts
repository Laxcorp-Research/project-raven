import { useCallback, useEffect, useRef, type RefObject } from 'react'

interface HitTestRefs {
  pillWrapperRef: RefObject<HTMLDivElement | null>
  panelWrapperRef: RefObject<HTMLDivElement | null>
  leftRailRef: RefObject<HTMLDivElement | null>
  rightRailRef: RefObject<HTMLDivElement | null>
  bottomRailRef: RefObject<HTMLDivElement | null>
}

export function useMousePassthrough(refs: HitTestRefs) {
  const mouseIgnoreRef = useRef(false)

  const setOverlayMouseIgnore = useCallback((ignore: boolean) => {
    if (mouseIgnoreRef.current === ignore) return
    mouseIgnoreRef.current = ignore
    void window.raven.windowSetIgnoreMouseEvents(ignore)
  }, [])

  const isInside = useCallback((rect: DOMRect, x: number, y: number): boolean => {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  }, [])

  const isOverInteractiveUi = useCallback((x: number, y: number): boolean => {
    const check = (ref: RefObject<HTMLDivElement | null>) => {
      const rect = ref.current?.getBoundingClientRect()
      return rect ? isInside(rect, x, y) : false
    }
    return (
      check(refs.pillWrapperRef) ||
      check(refs.panelWrapperRef) ||
      check(refs.leftRailRef) ||
      check(refs.rightRailRef) ||
      check(refs.bottomRailRef)
    )
  }, [isInside, refs.pillWrapperRef, refs.panelWrapperRef, refs.leftRailRef, refs.rightRailRef, refs.bottomRailRef])

  useEffect(() => {
    setOverlayMouseIgnore(true)

    const handleMouseMove = (event: MouseEvent) => {
      const shouldCapture = isOverInteractiveUi(event.clientX, event.clientY)
      setOverlayMouseIgnore(!shouldCapture)
    }

    const handleWindowBlur = () => {
      setOverlayMouseIgnore(true)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [isOverInteractiveUi, setOverlayMouseIgnore])

  return { setOverlayMouseIgnore }
}
