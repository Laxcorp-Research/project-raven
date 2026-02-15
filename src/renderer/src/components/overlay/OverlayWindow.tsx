import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { ControllerPill } from './ControllerPill'
import { DualAudioCapture, type AudioSource } from '../../services/audioCapture'

interface ResponseCard {
  id: string
  content: string
  action: string
  badgeVariant: 'quick' | 'custom' | 'system'
  hasScreenshot: boolean
  screenshotPreviewData?: string
}

type ResizeEdge = 'left' | 'right' | 'bottom'

interface OverlayBounds {
  x: number
  y: number
  width: number
  height: number
}

const OVERLAY_MIN_WIDTH = 500
const OVERLAY_COMPACT_MIN_HEIGHT = 170
const OVERLAY_EXPANDED_MIN_HEIGHT = 500

const getActionLabel = (action?: string): string => {
  switch (action) {
    case 'assist':
      return 'Assist'
    case 'what-should-i-say':
      return 'What should I say?'
    case 'follow-up':
      return 'Follow-up questions'
    case 'recap':
      return 'Recap'
    case 'custom':
      return 'Question'
    default:
      return 'Assist'
  }
}

export function OverlayWindow() {
  // State
  const [isRecording, setIsRecording] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [stealthEnabled, setStealthEnabled] = useState(true)
  const [isHoveringPanel, setIsHoveringPanel] = useState(false)
  const [isHoveringX, setIsHoveringX] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [responses, setResponses] = useState<ResponseCard[]>([])
  const [isLoadingResponse, setIsLoadingResponse] = useState(false)
  const [activeResponseId, setActiveResponseId] = useState<string | null>(null)
  const [hoveredResizeEdge, setHoveredResizeEdge] = useState<ResizeEdge | null>(null)
  const [activeResizeEdge, setActiveResizeEdge] = useState<ResizeEdge | null>(null)
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [previewMessageId, setPreviewMessageId] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)

  // Refs
  const audioCaptureRef = useRef<DualAudioCapture | null>(null)
  const chunkCountRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const hideXTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeResponseIdRef = useRef<string | null>(null)
  const requestInFlightRef = useRef(false)
  const responseAreaRef = useRef<HTMLDivElement | null>(null)
  const pillWrapperRef = useRef<HTMLDivElement | null>(null)
  const panelWrapperRef = useRef<HTMLDivElement | null>(null)
  const leftRailRef = useRef<HTMLDivElement | null>(null)
  const rightRailRef = useRef<HTMLDivElement | null>(null)
  const bottomRailRef = useRef<HTMLDivElement | null>(null)
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  const resizeRafRef = useRef<number | null>(null)
  const pendingResizeBoundsRef = useRef<OverlayBounds | null>(null)
  const copiedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mouseIgnoreRef = useRef<boolean>(false)
  const logoDragMovedRef = useRef(false)
  const logoDragCleanupRef = useRef<(() => void) | null>(null)

  const clearHideXTimer = () => {
    if (hideXTimerRef.current) {
      clearTimeout(hideXTimerRef.current)
      hideXTimerRef.current = null
    }
  }

  const flushOverlayBounds = useCallback(() => {
    if (resizeRafRef.current !== null) return
    resizeRafRef.current = window.requestAnimationFrame(() => {
      resizeRafRef.current = null
      const bounds = pendingResizeBoundsRef.current
      if (!bounds) return
      void window.raven.windowSetOverlayBounds(bounds)
    })
  }, [])

  const queueOverlayBounds = useCallback((bounds: OverlayBounds) => {
    pendingResizeBoundsRef.current = bounds
    flushOverlayBounds()
  }, [flushOverlayBounds])

  const setOverlayMouseIgnore = useCallback((ignore: boolean) => {
    if (mouseIgnoreRef.current === ignore) return
    mouseIgnoreRef.current = ignore
    void window.raven.windowSetIgnoreMouseEvents(ignore)
  }, [])

  const isInside = useCallback((rect: DOMRect, x: number, y: number): boolean => {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  }, [])

  const isOverInteractiveUi = useCallback((x: number, y: number): boolean => {
    const pillRect = pillWrapperRef.current?.getBoundingClientRect()
    if (pillRect && isInside(pillRect, x, y)) return true

    const panelRect = panelWrapperRef.current?.getBoundingClientRect()
    if (panelRect && isInside(panelRect, x, y)) return true

    const leftRailRect = leftRailRef.current?.getBoundingClientRect()
    if (leftRailRect && isInside(leftRailRect, x, y)) return true

    const rightRailRect = rightRailRef.current?.getBoundingClientRect()
    if (rightRailRect && isInside(rightRailRect, x, y)) return true

    const bottomRailRect = bottomRailRef.current?.getBoundingClientRect()
    if (bottomRailRect && isInside(bottomRailRect, x, y)) return true

    return false
  }, [isInside])

  // Initialize
  useEffect(() => {
    audioCaptureRef.current = new DualAudioCapture()

    window.raven.storeGet('stealthEnabled').then((enabled) => {
      if (typeof enabled === 'boolean') setStealthEnabled(enabled)
    })

    window.raven.audioGetState().then((state) => {
      setIsRecording(state.isRecording)
    })

    const unsubStealth = window.raven.onStealthChanged((enabled: boolean) => {
      setStealthEnabled(enabled)
    })

    const unsubRecording = window.raven.onRecordingStateChanged((state) => {
      setIsRecording(state.isRecording)
      if (!state.isRecording) {
        setIsStarting(false)
      }
    })

    const unsubClaude = window.raven.onClaudeResponse((data) => {
      if (data.type === 'start') {
        requestInFlightRef.current = true
        setIsLoadingResponse(true)
        const entryId = data.messageId || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        setActiveResponseId(entryId)
        activeResponseIdRef.current = entryId

        setResponses((prev) => [
          ...prev,
          {
            id: entryId,
            content: '',
            action: data.userMessage?.content?.trim() || getActionLabel(data.userMessage?.action),
            badgeVariant:
              data.userMessage?.action === 'custom' && Boolean(data.userMessage?.content?.trim())
                ? 'custom'
                : 'quick',
            hasScreenshot: Boolean(data.requestMeta?.includeScreenshot),
            screenshotPreviewData: data.requestMeta?.screenshotPreviewData
          }
        ])
      } else if (data.type === 'delta') {
        setIsLoadingResponse(false)
        const targetId = data.messageId || activeResponseIdRef.current
        if (!targetId) return
        setResponses((prev) =>
          prev.map((entry) =>
            entry.id === targetId
              ? { ...entry, content: data.fullText || '' }
              : entry
          )
        )
      } else if (data.type === 'done') {
        requestInFlightRef.current = false
        setIsLoadingResponse(false)
        const targetId = data.messageId || activeResponseIdRef.current
        if (targetId) {
          setResponses((prev) =>
            prev.map((entry) =>
              entry.id === targetId
                ? { ...entry, content: data.fullText || entry.content }
                : entry
            )
          )
        }
        setActiveResponseId(null)
        activeResponseIdRef.current = null
      } else if (data.type === 'error') {
        requestInFlightRef.current = false
        setIsLoadingResponse(false)
        setResponses((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            content: data.error || 'Something went wrong',
            action: 'Error',
            badgeVariant: 'system',
            hasScreenshot: false
          }
        ])
        setActiveResponseId(null)
        activeResponseIdRef.current = null
      } else if (data.type === 'cleared') {
        requestInFlightRef.current = false
        setResponses([])
        setActiveResponseId(null)
        activeResponseIdRef.current = null
        setHoveredMessageId(null)
        setPreviewMessageId(null)
      }
    })

    const unsubAi = window.raven.onHotkeyAiSuggestion(async () => {
      await handleAssist()
    })

    return () => {
      unsubStealth()
      unsubRecording()
      unsubClaude()
      unsubAi()
      audioCaptureRef.current?.stop()
      clearHideXTimer()
      resizeCleanupRef.current?.()
      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current)
        resizeRafRef.current = null
      }
      if (copiedResetTimerRef.current) {
        clearTimeout(copiedResetTimerRef.current)
        copiedResetTimerRef.current = null
      }
      logoDragCleanupRef.current?.()
      setOverlayMouseIgnore(false)
    }
  }, [setOverlayMouseIgnore])

  useEffect(() => {
    // Default to pass-through so only visible UI captures input.
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

  useEffect(() => {
    let cancelled = false
    let inFlight = false

    const syncMouseCapture = async () => {
      if (cancelled || inFlight) return
      inFlight = true
      try {
        const [cursorPoint, overlayBounds] = await Promise.all([
          window.raven.windowGetCursorPoint(),
          window.raven.windowGetOverlayBounds()
        ])
        if (cancelled || !overlayBounds) return

        const clientX = cursorPoint.x - overlayBounds.x
        const clientY = cursorPoint.y - overlayBounds.y
        const shouldCapture = isOverInteractiveUi(clientX, clientY)
        setOverlayMouseIgnore(!shouldCapture)
      } catch {
        // Ignore transient IPC failures; next poll will recover.
      } finally {
        inFlight = false
      }
    }

    void syncMouseCapture()
    const intervalId = window.setInterval(() => {
      void syncMouseCapture()
    }, 40)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [isOverInteractiveUi, setOverlayMouseIgnore])

  useEffect(() => {
    if (!responseAreaRef.current) return
    responseAreaRef.current.scrollTop = responseAreaRef.current.scrollHeight
  }, [responses, isLoadingResponse])

  const hasResponse = responses.length > 0 || isLoadingResponse

  // Handle audio chunks
  const handleChunk = useCallback((chunk: Int16Array, source: AudioSource) => {
    chunkCountRef.current++
    const payload = new Int16Array(chunk).buffer
    window.raven.audioSendChunk(payload, source)
  }, [])

  // Toggle recording
  const handleToggleRecording = useCallback(async () => {
    if (!audioCaptureRef.current) return

    if (isRecording) {
      await audioCaptureRef.current.stop()
      await window.raven.audioStopRecording()
    } else {
      setIsStarting(true)
      setResponses([])
      setActiveResponseId(null)
      activeResponseIdRef.current = null
      await window.raven.claudeClearHistory?.()

      try {
        await window.raven.audioStartRecording()
        chunkCountRef.current = 0

        await new Promise(resolve => setTimeout(resolve, 500))
        const result = await audioCaptureRef.current.start(handleChunk)
        console.log('[OverlayWindow] Audio capture started:', result)

        await new Promise(resolve => setTimeout(resolve, 2500))
        setIsStarting(false)
      } catch (err) {
        console.error('Failed to start recording:', err)
        await window.raven.audioStopRecording()
        setIsStarting(false)
      }
    }
  }, [handleChunk, isRecording])

  useEffect(() => {
    const unsub = window.raven.onHotkeyToggleRecording(() => {
      handleToggleRecording()
    })
    return () => unsub()
  }, [handleToggleRecording])

  const handleHide = () => {
    setOverlayMouseIgnore(true)
    window.raven.windowHide()
  }

  const handleLogoClick = () => {
    if (logoDragMovedRef.current) {
      logoDragMovedRef.current = false
      return
    }
    window.raven.windowShowDashboard?.()
  }

  const handleLogoMouseDown = useCallback(async (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    setOverlayMouseIgnore(false)

    logoDragCleanupRef.current?.()
    logoDragMovedRef.current = false

    const startBounds = await window.raven.windowGetOverlayBounds()
    if (!startBounds) return

    const startX = event.screenX
    const startY = event.screenY
    const originalCursor = document.body.style.cursor
    const originalUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.screenX - startX
      const dy = moveEvent.screenY - startY

      if (!logoDragMovedRef.current && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
        logoDragMovedRef.current = true
      }

      queueOverlayBounds({
        x: startBounds.x + dx,
        y: startBounds.y + dy,
        width: startBounds.width,
        height: startBounds.height
      })
    }

    const cleanup = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = originalCursor
      document.body.style.userSelect = originalUserSelect
      logoDragCleanupRef.current = null
    }

    const onMouseUp = () => {
      cleanup()
    }

    logoDragCleanupRef.current = cleanup
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp, { once: true })
  }, [queueOverlayBounds, setOverlayMouseIgnore])

  const handleAssist = async () => {
    if (requestInFlightRef.current) return
    requestInFlightRef.current = true

    const transcript = await window.raven.getTranscript()
    const activeMode = await window.raven.modes.getActive()

    void window.raven.claudeGetResponse({
      transcript,
      action: 'assist',
      modePrompt: activeMode?.systemPrompt,
      includeScreenshot: true
    }).catch(() => {
      requestInFlightRef.current = false
    })
  }

  const handleQuickAction = async (action: string) => {
    if (requestInFlightRef.current) return
    requestInFlightRef.current = true

    const transcript = await window.raven.getTranscript()
    const activeMode = await window.raven.modes.getActive()

    void window.raven.claudeGetResponse({
      transcript,
      action,
      modePrompt: activeMode?.systemPrompt,
      includeScreenshot: false
    }).catch(() => {
      requestInFlightRef.current = false
    })
  }

  const handleSend = async () => {
    if (requestInFlightRef.current) return

    const trimmed = inputValue.trim()
    if (!trimmed) return
    requestInFlightRef.current = true

    setInputValue('')

    const transcript = await window.raven.getTranscript()
    const activeMode = await window.raven.modes.getActive()

    void window.raven.claudeGetResponse({
      transcript,
      action: 'custom',
      customPrompt: trimmed,
      modePrompt: activeMode?.systemPrompt,
      includeScreenshot: false
    }).catch(() => {
      requestInFlightRef.current = false
    })
  }

  const handleClear = () => {
    setOverlayMouseIgnore(true)
    window.raven.windowHide()
  }

  const handlePanelMouseEnter = () => {
    clearHideXTimer()
    setOverlayMouseIgnore(false)
    setIsHoveringPanel(true)
  }

  const handlePanelMouseLeave = () => {
    clearHideXTimer()
    setOverlayMouseIgnore(true)
    hideXTimerRef.current = setTimeout(() => {
      setIsHoveringPanel(false)
    }, 220)
  }

  const handleCopyAction = useCallback(async (entryId: string, text: string) => {
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedMessageId(entryId)
      if (copiedResetTimerRef.current) {
        clearTimeout(copiedResetTimerRef.current)
      }
      copiedResetTimerRef.current = setTimeout(() => {
        setCopiedMessageId((current) => (current === entryId ? null : current))
      }, 1200)
    } catch (error) {
      console.error('[OverlayWindow] Failed to copy message:', error)
    }
  }, [])

  const handleResizeStart = useCallback(async (edge: ResizeEdge, e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    resizeCleanupRef.current?.()

    const startBounds = await window.raven.windowGetOverlayBounds()
    if (!startBounds) return

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

      let nextX = startBounds.x
      let nextY = startBounds.y
      let nextWidth = startBounds.width
      let nextHeight = startBounds.height

      if (edge === 'left') {
        nextWidth = Math.max(startBounds.width - dx, OVERLAY_MIN_WIDTH)
        nextX = startBounds.x + (startBounds.width - nextWidth)
      } else if (edge === 'right') {
        nextWidth = Math.max(startBounds.width + dx, OVERLAY_MIN_WIDTH)
      } else {
        nextHeight = Math.max(startBounds.height + dy, hasResponse ? OVERLAY_EXPANDED_MIN_HEIGHT : OVERLAY_COMPACT_MIN_HEIGHT)
      }

      queueOverlayBounds({
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight
      })
    }

    const cleanup = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = originalCursor
      document.body.style.userSelect = originalUserSelect
      setActiveResizeEdge(null)
      resizeCleanupRef.current = null
    }

    const onMouseUp = () => {
      cleanup()
    }

    resizeCleanupRef.current = cleanup
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp, { once: true })
  }, [hasResponse, queueOverlayBounds])

  const isPanelExpanded = hasResponse
  const showBottomResizeRail = hasResponse
  const showX = isHoveringPanel || isHoveringX

  useEffect(() => {
    void window.raven.windowAutoSizeOverlay(hasResponse ? 'expanded' : 'compact')
  }, [hasResponse])

  return (
    <div
      className="h-full flex flex-col p-4 pb-6 gap-2 bg-transparent min-w-[500px] pointer-events-none"
      style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
    >
      {/* Controller Pill - Centered */}
      <div
        ref={pillWrapperRef}
        className="w-fit self-center pointer-events-auto"
        style={{ WebkitAppRegion: 'drag' } as CSSProperties}
        onMouseEnter={() => setOverlayMouseIgnore(false)}
        onMouseMove={() => setOverlayMouseIgnore(false)}
        onMouseLeave={() => setOverlayMouseIgnore(true)}
      >
        <ControllerPill
          stealthEnabled={stealthEnabled}
          isRecording={isRecording}
          isStarting={isStarting}
          onToggleRecording={handleToggleRecording}
          onHide={handleHide}
          onLogoClick={handleLogoClick}
          onLogoMouseDown={handleLogoMouseDown}
        />
      </div>

      {/* Main Panel Wrapper */}
      <div
        ref={panelWrapperRef}
        className={`relative pointer-events-auto ${isPanelExpanded ? 'flex-1 min-h-0' : ''}`}
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        onMouseEnter={handlePanelMouseEnter}
        onMouseLeave={handlePanelMouseLeave}
      >
        {/* Resize handles (side handles always available; bottom shown only with content) */}
        <div
          ref={leftRailRef}
          className="absolute inset-y-0 -left-3 w-3 flex items-center justify-center cursor-ew-resize z-20"
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          onMouseEnter={() => setHoveredResizeEdge('left')}
          onMouseLeave={() => setHoveredResizeEdge((prev) => (prev === 'left' ? null : prev))}
          onMouseDown={(e) => {
            void handleResizeStart('left', e)
          }}
        >
          <span
            className={`w-[5px] ${isPanelExpanded ? 'h-14' : 'h-8'} rounded-full bg-[#8f95a0] transition-opacity duration-150 ${
              hoveredResizeEdge === 'left' || activeResizeEdge === 'left' ? 'opacity-95' : 'opacity-0'
            }`}
          />
        </div>
        <div
          ref={rightRailRef}
          className="absolute inset-y-0 -right-3 w-3 flex items-center justify-center cursor-ew-resize z-20"
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          onMouseEnter={() => setHoveredResizeEdge('right')}
          onMouseLeave={() => setHoveredResizeEdge((prev) => (prev === 'right' ? null : prev))}
          onMouseDown={(e) => {
            void handleResizeStart('right', e)
          }}
        >
          <span
            className={`w-[5px] ${isPanelExpanded ? 'h-14' : 'h-8'} rounded-full bg-[#8f95a0] transition-opacity duration-150 ${
              hoveredResizeEdge === 'right' || activeResizeEdge === 'right' ? 'opacity-95' : 'opacity-0'
            }`}
          />
        </div>
        {showBottomResizeRail && (
          <div
            ref={bottomRailRef}
            className="absolute -bottom-5 left-1/2 -translate-x-1/2 h-5 w-36 flex items-start justify-center cursor-ns-resize z-20"
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            onMouseEnter={() => setHoveredResizeEdge('bottom')}
            onMouseLeave={() => setHoveredResizeEdge((prev) => (prev === 'bottom' ? null : prev))}
            onMouseDown={(e) => {
              void handleResizeStart('bottom', e)
            }}
          >
            <span
              className={`mt-1 h-[5px] w-14 rounded-full bg-[#8f95a0] transition-opacity duration-150 ${
                hoveredResizeEdge === 'bottom' || activeResizeEdge === 'bottom' ? 'opacity-95' : 'opacity-0'
              }`}
            />
          </div>
        )}

        {/* X Button - dedicated hit wrapper for stable hover/click */}
        {showX && (
          <div
            onMouseEnter={() => {
              clearHideXTimer()
              setIsHoveringX(true)
            }}
            onMouseLeave={() => setIsHoveringX(false)}
            className="absolute -top-3 -right-3 z-20 w-8 h-8 pointer-events-auto flex items-center justify-center"
            style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          >
            <button
              type="button"
              onClick={handleClear}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-[#3a3a3a] hover:bg-[#4a4a4a] text-white/70 hover:text-white transition-all"
              style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Panel Container - NO shadow-2xl */}
        <div className={`bg-[#2a2a2a] rounded-2xl overflow-hidden flex flex-col ${isPanelExpanded ? 'h-full' : ''}`}>

          {/* Response Area */}
          {hasResponse && (
            <div ref={responseAreaRef} className="flex-1 min-h-0 overflow-y-auto p-4 pb-2 space-y-4">
              {responses.map((entry, index) => {
                const isLatest = index === responses.length - 1
                const isStreaming = isLoadingResponse && isLatest && activeResponseId === entry.id

                return (
                  <div key={entry.id}>
                    <div
                      className={`flex justify-end ${entry.hasScreenshot ? 'mb-1' : 'mb-3'}`}
                      onMouseEnter={() => setHoveredMessageId(entry.id)}
                      onMouseLeave={() => {
                        setHoveredMessageId((current) => (current === entry.id ? null : current))
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            void handleCopyAction(entry.id, entry.action)
                          }}
                          className={`w-7 h-7 rounded-md flex items-center justify-center transition-all duration-150 ${
                            hoveredMessageId === entry.id
                              ? 'opacity-60 text-white/55'
                              : 'opacity-0 pointer-events-none text-white/40'
                          } hover:opacity-100 hover:text-white hover:scale-110`}
                          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
                          title={copiedMessageId === entry.id ? 'Copied' : 'Copy'}
                        >
                          {copiedMessageId === entry.id ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path
                                d="M20 7L10 17l-5-5"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <rect x="8.5" y="8.5" width="11" height="11" rx="2.2" fill="currentColor" />
                              <rect x="4.5" y="4.5" width="11" height="11" rx="2.2" fill="currentColor" opacity="0.55" />
                            </svg>
                          )}
                        </button>
                        <span
                          className={`px-3 py-1 text-sm font-medium text-white rounded-full ${
                            entry.badgeVariant === 'custom'
                              ? 'bg-gradient-to-b from-blue-500 to-blue-700'
                              : 'bg-gradient-to-r from-purple-500 to-blue-500'
                          }`}
                        >
                          {entry.action}
                        </span>
                      </div>
                    </div>
                    {entry.hasScreenshot && (
                      <div className="relative flex justify-end mb-3">
                        <span
                          className="text-xs text-white/40 inline-flex items-center gap-1"
                          onMouseEnter={() => setPreviewMessageId(entry.id)}
                          onMouseLeave={() => {
                            setPreviewMessageId((current) => (current === entry.id ? null : current))
                          }}
                        >
                          Sent with screenshot
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-white/35">
                            <path d="M20 5h-3.2l-1.1-1.4A2 2 0 0 0 14.1 3H9.9a2 2 0 0 0-1.6.8L7.2 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm-8 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" />
                          </svg>
                        </span>
                        {previewMessageId === entry.id && entry.screenshotPreviewData && (
                          <div
                            className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-white/15 bg-[#1f222b] p-1.5 shadow-2xl shadow-black/45 z-30"
                            onMouseEnter={() => setPreviewMessageId(entry.id)}
                            onMouseLeave={() => {
                              setPreviewMessageId((current) => (current === entry.id ? null : current))
                            }}
                          >
                            <img
                              src={entry.screenshotPreviewData}
                              alt="Screenshot preview"
                              className="w-full h-auto rounded-lg object-cover"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {isStreaming && !entry.content ? (
                      <div className="flex items-center gap-1.5 text-white/40 py-2">
                        <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" />
                        <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                      </div>
                    ) : (
                      <div className="text-white/90 text-[15px] leading-relaxed whitespace-pre-wrap">
                        {entry.content}
                      </div>
                    )}
                  </div>
                )
              })}

              {isLoadingResponse && responses.length === 0 && (
                <div className="flex items-center gap-1.5 text-white/40 py-2">
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" />
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                </div>
              )}
            </div>
          )}

          {/* Quick Actions - Only when recording */}
          {isRecording && (
            <div className="px-4 py-2.5 flex items-center gap-1.5 text-sm text-white/60 border-t border-white/5">
              <button
                onClick={() => handleQuickAction('assist')}
                className="hover:text-white transition-colors flex items-center gap-1"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="text-white/40">
                  <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" fill="currentColor" />
                </svg>
                Assist
              </button>
              <span className="text-white/20">·</span>
              <button
                onClick={() => handleQuickAction('what-should-i-say')}
                className="hover:text-white transition-colors flex items-center gap-1"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="text-white/40">
                  <path d="M4 20h4l10-10-4-4L4 16v4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                What should I say?
              </button>
              <span className="text-white/20">·</span>
              <button
                onClick={() => handleQuickAction('follow-up')}
                className="hover:text-white transition-colors flex items-center gap-1"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="text-white/40">
                  <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
                  <path d="M8 10h8M8 14h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Follow-up questions
              </button>
              <span className="text-white/20">·</span>
              <button
                onClick={() => handleQuickAction('recap')}
                className="hover:text-white transition-colors flex items-center gap-1"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="text-white/40">
                  <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Recap
              </button>
            </div>
          )}

          {/* Input Area */}
          <div className={`mt-auto px-4 py-3 ${isRecording || hasResponse ? 'border-t border-white/5' : ''}`}>
            {/* Input Row */}
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      void handleAssist()
                      return
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void handleSend()
                    }
                  }}
                  placeholder=""
                  className="w-full bg-transparent text-white text-[14px] leading-tight focus:outline-none"
                />
                {/* Custom placeholder with key caps */}
                {!inputValue && (
                  <div className="absolute inset-0 flex items-center text-white/40 text-sm pointer-events-none whitespace-nowrap pr-2">
                    <span>Ask about your screen or conversation, or</span>
                    <kbd className="mx-1 inline-flex h-5 min-w-[20px] items-center justify-center px-0.5 bg-white/15 rounded border border-white/20 text-[18px] leading-none font-medium text-white/70">
                      <span className="leading-none">⌘</span>
                    </kbd>
                    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center px-0.5 bg-white/15 rounded border border-white/20 text-[18px] leading-none font-medium text-white/70">
                      <span className="-translate-y-[0.5px] leading-none">↵</span>
                    </kbd>
                    <span className="ml-1.5">for Assist</span>
                  </div>
                )}
              </div>

              {/* Send Button */}
              <button
                type="button"
                onClick={() => {
                  void handleSend()
                }}
                className="w-7 h-7 flex items-center justify-center rounded-full border border-blue-300/30 bg-gradient-to-b from-blue-500 to-blue-700 shadow-md shadow-blue-900/30 transition-all duration-200 ease-out shrink-0 pointer-events-auto relative z-10"
                style={{
                  WebkitAppRegion: 'no-drag'
                } as CSSProperties}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="white"
                  className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]"
                >
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
