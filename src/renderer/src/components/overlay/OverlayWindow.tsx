import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
} from 'react'
import Markdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark-dimmed.css'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Wand2, MessageSquareText, RotateCcw, ChevronRight } from 'lucide-react'
import { ControllerPill } from './ControllerPill'
import { TranscriptTab } from './TranscriptTab'
import { OverlayNotification, type NotificationData } from './OverlayNotification'
import { useAppMode } from '../../hooks/useAppMode'
import { useOverlayResize } from './useOverlayResize'
import { useOverlayDrag } from './useOverlayDrag'
import { useMousePassthrough } from './useMousePassthrough'
import { createLogger } from '../../lib/logger'

const log = createLogger('OverlayWindow')

interface ResponseCard {
  id: string
  content: string
  action: string
  badgeVariant: 'quick' | 'custom' | 'system'
  hasScreenshot: boolean
  screenshotPreviewData?: string
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  const codeRef = useRef<HTMLPreElement>(null)

  const handleCopy = async () => {
    const text = codeRef.current?.textContent ?? ''
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard not available */ }
  }

  return (
    <div className="relative group/code">
      <pre ref={codeRef}>{children}</pre>
      <button
        type="button"
        onClick={() => { void handleCopy() }}
        className="absolute top-2 right-2 w-7 h-7 rounded-md flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/50 hover:text-white transition-all opacity-0 group-hover/code:opacity-100"
        title={copied ? 'Copied!' : 'Copy code'}
      >
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M20 7L10 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </div>
  )
}

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
    case 'fact-check':
      return 'Fact Check'
    case 'tell-me-more':
      return 'Tell me more'
    case 'custom':
      return 'Question'
    default:
      return 'Assist'
  }
}

export function OverlayWindow() {
  const { isPro } = useAppMode()

  // --- Extracted hooks ---
  const resize = useOverlayResize()
  const {
    panelWidth, panelRight, panelBottom, panelHeight,
    setPanelRight, setPanelBottom, setPanelHeight,
    hoveredResizeEdge, setHoveredResizeEdge,
    activeResizeEdge,
    handleResizeStart,
    handleResizeDoubleClick,
    cleanupResize,
    OVERLAY_DEFAULT_COMPACT_HEIGHT,
    OVERLAY_DEFAULT_EXPANDED_HEIGHT,
  } = resize

  // Hit-test refs (shared between passthrough and resize rail rendering)
  const pillWrapperRef = useRef<HTMLDivElement | null>(null)
  const panelWrapperRef = useRef<HTMLDivElement | null>(null)
  const leftRailRef = useRef<HTMLDivElement | null>(null)
  const rightRailRef = useRef<HTMLDivElement | null>(null)
  const bottomRailRef = useRef<HTMLDivElement | null>(null)

  const { setOverlayMouseIgnore } = useMousePassthrough({
    pillWrapperRef, panelWrapperRef, leftRailRef, rightRailRef, bottomRailRef,
  })

  // State
  const [isRecording, setIsRecording] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [stealthEnabled, setStealthEnabled] = useState(true)
  const [smartMode, setSmartMode] = useState(false)
  const [incognitoMode, setIncognitoMode] = useState(false)
  const [isHoveringPanel, setIsHoveringPanel] = useState(false)
  const [isHoveringX, setIsHoveringX] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [responses, setResponses] = useState<ResponseCard[]>([])
  const [isLoadingResponse, setIsLoadingResponse] = useState(false)
  const [activeResponseId, setActiveResponseId] = useState<string | null>(null)
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [previewMessageId, setPreviewMessageId] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hoveredResponseId, setHoveredResponseId] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<NotificationData[]>([])
  const [limitInfo, setLimitInfo] = useState<{ type: 'ai' | 'session'; used: number; limit: number; resetAt: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'responses' | 'transcript'>('transcript')
  const scrollHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refs
  const inputRef = useRef<HTMLInputElement>(null)
  const hideXTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeResponseIdRef = useRef<string | null>(null)
  const requestInFlightRef = useRef(false)
  const responseAreaRef = useRef<HTMLDivElement | null>(null)
  const copiedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notificationTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const hasResponse = responses.length > 0 || isLoadingResponse
  const isPanelExpanded = hasResponse || isRecording

  const { handleLogoClick, handleLogoMouseDown, cleanupDrag } = useOverlayDrag({
    panelRight, panelBottom, panelWidth, panelHeight,
    defaultCompactHeight: OVERLAY_DEFAULT_COMPACT_HEIGHT,
    setPanelRight, setPanelBottom, setOverlayMouseIgnore,
  })

  const clearHideXTimer = () => {
    if (hideXTimerRef.current) {
      clearTimeout(hideXTimerRef.current)
      hideXTimerRef.current = null
    }
  }

  // Initialize
  useEffect(() => {
    window.raven.storeGet('stealthEnabled').then((enabled) => {
      if (typeof enabled === 'boolean') setStealthEnabled(enabled)
    }).catch(() => {})

    window.raven.storeGet('smartMode').then((enabled) => {
      if (typeof enabled === 'boolean') setSmartMode(enabled)
    }).catch(() => {})

    window.raven.storeGet('incognitoMode').then((enabled) => {
      if (typeof enabled === 'boolean') setIncognitoMode(enabled)
    }).catch(() => {})

    window.raven.audioGetState().then((state) => {
      setIsRecording(state.isRecording)
    }).catch((err) => log.error('Failed to get audio state:', err))

    const unsubStealth = window.raven.onStealthChanged((enabled: boolean) => {
      setStealthEnabled(enabled)
    })

    const unsubRecording = window.raven.onRecordingStateChanged((state) => {
      setIsRecording(state.isRecording)
      if (!state.isRecording) {
        setIsStarting(false)
      }
    })

    const unsubNotification = window.raven.on('overlay:notification', (data: unknown) => {
      const n = data as NotificationData
      if (n?.id) {
        setNotifications(prev => [...prev, n])
        if (n.autoDismissMs) {
          const timerId = setTimeout(() => {
            setNotifications(prev => prev.filter(x => x.id !== n.id))
            notificationTimersRef.current.delete(n.id)
          }, n.autoDismissMs)
          notificationTimersRef.current.set(n.id, timerId)
        }
      }
    })

    const unsubClaude = window.raven.onClaudeResponse((data) => {
      if (data.type === 'start') {
        requestInFlightRef.current = true
        setIsLoadingResponse(true)
        setLimitInfo(null)
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

        if (data.error === 'LIMIT_REACHED' && data.limitInfo) {
          setLimitInfo({ type: 'ai', ...data.limitInfo })
        } else {
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
        }
        setActiveResponseId(null)
        activeResponseIdRef.current = null
      } else if (data.type === 'cleared') {
        requestInFlightRef.current = false
        setResponses([])
        setLimitInfo(null)
        setActiveResponseId(null)
        activeResponseIdRef.current = null
        setHoveredMessageId(null)
        setPreviewMessageId(null)
      }
    })

    const unsubAi = window.raven.onHotkeyAiSuggestion(async () => {
      await handleAssist()
    })

    const unsubSessionLimit = window.raven.onSessionLimit(() => {
      setLimitInfo({
        type: 'session',
        used: 1,
        limit: 1,
        resetAt: '',
      })
    })

    const unsubAuthExpired = window.raven.onAuthSessionExpired?.(() => {
      requestInFlightRef.current = false
      setIsLoadingResponse(false)
      setActiveResponseId(null)
      activeResponseIdRef.current = null
      setResponses((prev) => [
        ...prev,
        {
          id: `auth-expired-${Date.now()}`,
          content: 'Your session has expired. Please sign in again from the dashboard to continue using AI features.',
          action: 'Session Expired',
          badgeVariant: 'system' as const,
          hasScreenshot: false,
        },
      ])
    }) ?? (() => {})

    return () => {
      unsubStealth()
      unsubRecording()
      unsubNotification()
      unsubClaude()
      unsubAi()
      unsubSessionLimit()
      unsubAuthExpired()
      clearHideXTimer()
      cleanupResize()
      if (copiedResetTimerRef.current) {
        clearTimeout(copiedResetTimerRef.current)
        copiedResetTimerRef.current = null
      }
      notificationTimersRef.current.forEach(t => clearTimeout(t))
      notificationTimersRef.current.clear()
      if (scrollHideTimerRef.current) {
        clearTimeout(scrollHideTimerRef.current)
        scrollHideTimerRef.current = null
      }
      cleanupDrag()
      setOverlayMouseIgnore(false)
    }
  }, [setOverlayMouseIgnore])

  useEffect(() => {
    const MOVE_STEP = 50
    const unsub = window.raven.onHotkeyMove((direction: 'up' | 'down' | 'left' | 'right') => {
      const vw = window.innerWidth
      const vh = window.innerHeight

      switch (direction) {
        case 'up':
          setPanelBottom(prev => Math.min(prev + MOVE_STEP, vh - (panelHeight ?? OVERLAY_DEFAULT_COMPACT_HEIGHT)))
          break
        case 'down':
          setPanelBottom(prev => Math.max(prev - MOVE_STEP, 0))
          break
        case 'left':
          setPanelRight(prev => Math.min(prev + MOVE_STEP, vw - panelWidth))
          break
        case 'right':
          setPanelRight(prev => Math.max(prev - MOVE_STEP, 0))
          break
      }
    })
    return () => unsub()
  }, [panelWidth, panelHeight])

  useEffect(() => {
    if (!responseAreaRef.current) return
    if (isAtBottom) {
      responseAreaRef.current.scrollTop = responseAreaRef.current.scrollHeight
    }
  }, [responses, isLoadingResponse, isAtBottom])

  const handleResponseScroll = useCallback(() => {
    const el = responseAreaRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30
    setIsAtBottom(atBottom)

    el.classList.add('is-scrolling')
    if (scrollHideTimerRef.current) clearTimeout(scrollHideTimerRef.current)
    scrollHideTimerRef.current = setTimeout(() => {
      el.classList.remove('is-scrolling')
    }, 1200)
  }, [])

  const scrollToBottom = useCallback(() => {
    if (!responseAreaRef.current) return
    responseAreaRef.current.scrollTo({ top: responseAreaRef.current.scrollHeight, behavior: 'smooth' })
    setIsAtBottom(true)
  }, [])

  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      await window.raven.audioStopRecording()
    } else {
      setIsStarting(true)
      setResponses([])
      setActiveResponseId(null)
      activeResponseIdRef.current = null
      await window.raven.claudeClearHistory?.()

      try {
        const result = await window.raven.audioStartRecording() as { success: boolean; code?: string; error?: string }
        if (result && !result.success) {
          if (result.code === 'SESSION_LIMIT') {
            setLimitInfo({ type: 'session', used: 1, limit: 1, resetAt: '' })
          }
          setIsStarting(false)
          return
        }
        await new Promise(resolve => setTimeout(resolve, 3000))
        setIsStarting(false)
      } catch (err) {
        log.error('Failed to start recording:', err)
        await window.raven.audioStopRecording()
        setIsStarting(false)
      }
    }
  }, [isRecording])

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

  const handleToggleStealth = useCallback(async () => {
    const next = !stealthEnabled
    setStealthEnabled(next)
    try {
      await window.raven.windowSetStealth(next)
    } catch {
      setStealthEnabled(!next)
    }
  }, [stealthEnabled])

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const handleToggleSmartMode = useCallback(async () => {
    const next = !smartMode
    setSmartMode(next)
    await window.raven.storeSet('smartMode', next)
  }, [smartMode])

  const handleToggleIncognito = useCallback(async () => {
    const next = !incognitoMode
    setIncognitoMode(next)
    await window.raven.storeSet('incognitoMode', next)
  }, [incognitoMode])

  const handleAssist = async () => {
    if (requestInFlightRef.current) return
    requestInFlightRef.current = true
    setIsAtBottom(true)

    const transcript = await window.raven.getTranscript()
    const activeMode = await window.raven.modes.getActive()

    void window.raven.claudeGetResponse({
      transcript,
      action: 'assist',
      modePrompt: activeMode?.systemPrompt,
      modeId: activeMode?.id,
      includeScreenshot: true
    }).catch(() => {
      requestInFlightRef.current = false
    })
  }

  const handleQuickAction = async (action: string) => {
    if (requestInFlightRef.current) return
    requestInFlightRef.current = true
    setIsAtBottom(true)

    const transcript = await window.raven.getTranscript()
    const activeMode = await window.raven.modes.getActive()

    void window.raven.claudeGetResponse({
      transcript,
      action,
      modePrompt: activeMode?.systemPrompt,
      modeId: activeMode?.id,
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
    setIsAtBottom(true)

    setInputValue('')

    const transcript = await window.raven.getTranscript()
    const activeMode = await window.raven.modes.getActive()

    void window.raven.claudeGetResponse({
      transcript,
      action: 'custom',
      customPrompt: trimmed,
      modePrompt: activeMode?.systemPrompt,
      modeId: activeMode?.id,
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
    setIsHoveringPanel(true)
  }

  const handlePanelMouseLeave = () => {
    clearHideXTimer()
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
      log.error('Failed to copy message:', error)
    }
  }, [])

  const showBottomResizeRail = hasResponse || isRecording
  const showX = isHoveringPanel || isHoveringX

  useEffect(() => {
    if (hasResponse && activeTab !== 'responses') {
      setActiveTab('responses')
    }
  }, [hasResponse])

  useEffect(() => {
    if (isRecording && !hasResponse) {
      setActiveTab('transcript')
    }
  }, [isRecording])

  useEffect(() => {
    if (isPanelExpanded && !panelHeight) {
      setPanelHeight(OVERLAY_DEFAULT_EXPANDED_HEIGHT)
    } else if (!isPanelExpanded) {
      setPanelHeight(undefined)
    }
  }, [isPanelExpanded])

  return (
    <div
      className="fixed inset-0 bg-transparent pointer-events-none"
      style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
    >
    {/* Notification area — top right */}
    <div className="absolute top-4 right-4 flex flex-col gap-2 z-[80] pointer-events-none">
      <AnimatePresence>
        {notifications.map(n => (
          <OverlayNotification key={n.id} notification={n} onDismiss={dismissNotification} />
        ))}
      </AnimatePresence>
    </div>

    {/* Main panel — bottom right, draggable */}
    <div
      className="absolute flex flex-col p-4 pb-6 bg-transparent pointer-events-none"
      style={{
        WebkitAppRegion: 'no-drag',
        rowGap: '10px',
        paddingTop: stealthEnabled ? '3.4rem' : '2.75rem',
        bottom: `${panelBottom}px`,
        right: `${panelRight}px`,
        width: `${panelWidth}px`,
        ...(panelHeight ? { height: `${panelHeight}px` } : {}),
        maxHeight: 'calc(100vh - 40px)',
      } as CSSProperties}
    >
      {/* Controller Pill - Centered */}
      <div
        ref={pillWrapperRef}
        className="relative z-[70] w-fit self-center pointer-events-auto"
        style={{
          WebkitAppRegion: 'drag',
          transform: stealthEnabled ? 'translateY(-10px)' : 'translateY(0)'
        } as CSSProperties}
      >
        <ControllerPill
          stealthEnabled={stealthEnabled}
          isRecording={isRecording}
          isStarting={isStarting}
          incognitoMode={incognitoMode}
          onToggleRecording={handleToggleRecording}
          onToggleStealth={handleToggleStealth}
          onToggleIncognito={handleToggleIncognito}
          {...(isPro ? { smartMode, onToggleSmartMode: handleToggleSmartMode } : {})}
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
        {stealthEnabled && (
          <div
            className="absolute -inset-[10px] pointer-events-none z-[2] p-[0.6px]"
            aria-hidden="true"
          >
            <svg className="w-full h-full overflow-visible">
              <rect
                x="0"
                y="0"
                width="100%"
                height="100%"
                rx="16"
                ry="16"
                fill="none"
                stroke="rgba(118, 126, 142, 0.92)"
                strokeWidth="1.4"
                strokeDasharray="14 9"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        )}

        {/* Resize handles (side handles always available; bottom shown only with content) */}
        <div
          ref={leftRailRef}
          className="absolute inset-y-0 -left-3 w-3 flex items-center justify-center cursor-ew-resize z-20"
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
          onMouseEnter={() => setHoveredResizeEdge('left')}
          onMouseLeave={() => setHoveredResizeEdge((prev) => (prev === 'left' ? null : prev))}
          onMouseDown={(e) => {
            void handleResizeStart('left', e, isPanelExpanded)
          }}
          onDoubleClick={() => { void handleResizeDoubleClick(isPanelExpanded) }}
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
            void handleResizeStart('right', e, isPanelExpanded)
          }}
          onDoubleClick={() => { void handleResizeDoubleClick(isPanelExpanded) }}
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
              void handleResizeStart('bottom', e, isPanelExpanded)
            }}
            onDoubleClick={() => { void handleResizeDoubleClick(isPanelExpanded) }}
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

        {/* Panel Container */}
        <div
          className={`relative z-[1] rounded-2xl overflow-hidden flex flex-col ${isPanelExpanded ? 'h-full' : ''}`}
          style={{
            background: stealthEnabled ? '#18171c80' : '#18171ccc',
            boxShadow: '0 0 0 1px rgba(207,226,255,0.24), 0 -0.5px 0 0 rgba(255,255,255,0.8)',
          }}
        >

          {/* Tab Bar — visible when panel is expanded (recording or has responses) */}
          {isPanelExpanded && (
            <div className="flex px-4 border-b border-white/10 shrink-0">
              {(hasResponse || !isRecording) && (
                <button
                  onClick={() => setActiveTab('responses')}
                  className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                    activeTab === 'responses'
                      ? 'text-white border-[#4169E1]'
                      : 'text-white/50 border-transparent hover:text-white/70'
                  }`}
                  style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
                >
                  Responses
                </button>
              )}
              <button
                onClick={() => setActiveTab('transcript')}
                className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                  activeTab === 'transcript'
                    ? 'text-white border-[#4169E1]'
                    : 'text-white/50 border-transparent hover:text-white/70'
                }`}
                style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
              >
                Transcript
              </button>
            </div>
          )}

          {/* Transcript Tab */}
          {isPanelExpanded && activeTab === 'transcript' && (
            <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
              <TranscriptTab />
            </div>
          )}

          {/* Response Area */}
          {hasResponse && activeTab === 'responses' && (
            <div className="relative flex-1 min-h-0">
            <div ref={responseAreaRef} onScroll={handleResponseScroll} className="overlay-scroll h-full overflow-y-auto px-4 pt-4 pb-4 space-y-4" style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 12px, black calc(100% - 12px), transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 12px, black calc(100% - 12px), transparent 100%)' }}>
              <AnimatePresence initial={false}>
              {responses.map((entry, index) => {
                const isLatest = index === responses.length - 1
                const isStreaming = isLoadingResponse && isLatest && activeResponseId === entry.id

                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  >
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
                          className={`p-2 flex items-center justify-center transition-all duration-200 ${
                            hoveredMessageId === entry.id
                              ? 'opacity-60 text-white/55'
                              : 'opacity-0 pointer-events-none text-white/40'
                          } hover:opacity-100 hover:text-white hover:scale-125 active:scale-90`}
                          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
                          title={copiedMessageId === entry.id ? 'Copied' : 'Copy'}
                        >
                          {copiedMessageId === entry.id ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                              <path
                                d="M20 7L10 17l-5-5"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
                              <path d="M408 480H184a72 72 0 0 1-72-72V184a72 72 0 0 1 72-72h224a72 72 0 0 1 72 72v224a72 72 0 0 1-72 72z" />
                              <path d="M160 80h235.88A72.12 72.12 0 0 0 328 32H104a72 72 0 0 0-72 72v224a72.12 72.12 0 0 0 48 67.88V160a80 80 0 0 1 80-80z" />
                            </svg>
                          )}
                        </button>
                        <span
                          className={`px-2.5 py-1.5 text-xs font-medium text-white rounded-xl rounded-br-sm ${
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
                          className="text-[11px] font-medium text-white/40 inline-flex items-center gap-1"
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

                    <div
                      className="max-w-[90%]"
                      onMouseEnter={() => setHoveredResponseId(entry.id)}
                      onMouseLeave={() => setHoveredResponseId((c) => (c === entry.id ? null : c))}
                    >
                    {isStreaming && !entry.content ? (
                      <div className="flex items-center gap-1.5 text-white/40 py-2">
                        <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" />
                        <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                      </div>
                    ) : (
                      <div className="prose prose-sm prose-light max-w-none tracking-[-0.01em] pr-[18px]">
                        <Markdown
                          remarkPlugins={[remarkMath]}
                          rehypePlugins={[rehypeKatex, rehypeHighlight]}
                          components={{
                            pre({ children }) {
                              return <CodeBlock>{children}</CodeBlock>
                            }
                          }}
                        >{entry.content}</Markdown>
                      </div>
                    )}
                    {entry.content && !isStreaming && (
                      <div className="mt-1 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            void handleCopyAction(`resp-${entry.id}`, entry.content)
                          }}
                          className={`p-2 flex items-center justify-center transition-all duration-200 ${
                            hoveredResponseId === entry.id
                              ? 'opacity-60 text-white/55'
                              : 'opacity-0 pointer-events-none text-white/40'
                          } hover:opacity-100 hover:text-white hover:scale-125 active:scale-90`}
                          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
                          title={copiedMessageId === `resp-${entry.id}` ? 'Copied' : 'Copy'}
                        >
                          {copiedMessageId === `resp-${entry.id}` ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                              <path d="M20 7L10 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
                              <path d="M408 480H184a72 72 0 0 1-72-72V184a72 72 0 0 1 72-72h224a72 72 0 0 1 72 72v224a72 72 0 0 1-72 72z" />
                              <path d="M160 80h235.88A72.12 72.12 0 0 0 328 32H104a72 72 0 0 0-72 72v224a72.12 72.12 0 0 0 48 67.88V160a80 80 0 0 1 80-80z" />
                            </svg>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAction('tell-me-more')}
                          className={`h-7 px-2 rounded-md flex items-center gap-1 text-xs transition-all duration-150 ${
                            hoveredResponseId === entry.id
                              ? 'opacity-60 text-white/55'
                              : 'opacity-0 pointer-events-none text-white/40'
                          } hover:opacity-100 hover:text-white`}
                          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
                        >
                          <ChevronRight size={12} />
                          Tell me more
                        </button>
                      </div>
                    )}
                    </div>
                  </motion.div>
                )
              })}
              </AnimatePresence>

              {isLoadingResponse && responses.length === 0 && (
                <div className="flex items-center gap-1.5 text-white/40 py-2">
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" />
                  <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                </div>
              )}

              {limitInfo && (
                <div className="rounded-xl bg-gradient-to-r from-purple-600/90 to-blue-600/90 p-4 text-white shadow-lg mt-2">
                  <p className="text-sm font-medium mb-1">
                    {limitInfo.type === 'session'
                      ? 'Free sessions are limited to 2 minutes.'
                      : `You\u2019ve used all ${limitInfo.limit} free AI responses for today.`}
                  </p>
                  <p className="text-xs text-white/70 mb-3">
                    {limitInfo.type === 'session'
                      ? 'Upgrade to Raven Pro for unlimited meeting length.'
                      : 'Upgrade to Raven Pro for unlimited AI responses.'}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => window.raven.authOpenCheckout('PRO')}
                      className="px-4 py-1.5 bg-white text-purple-700 text-sm font-semibold rounded-lg hover:bg-white/90 transition-colors"
                      style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
                    >
                      Upgrade Now
                    </button>
                    {limitInfo.type === 'ai' && (
                      <span className="text-xs text-white/50">Resets tomorrow</span>
                    )}
                  </div>
                </div>
              )}
            </div>


            {/* Scroll to bottom arrow */}
            {!isAtBottom && (
              <button
                type="button"
                onClick={scrollToBottom}
                className="absolute bottom-4 right-3 w-6 h-6 rounded-full border border-white/15 bg-gradient-to-b from-[#353c4e] to-[#202633] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.35)] hover:from-[#3f465a] hover:to-[#2a3142] flex items-center justify-center text-white/80 hover:text-white transition-all z-[4]"
                style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            )}
            </div>
          )}

          {/* Quick Actions - Only when recording */}
          {isRecording && (
            <div className="px-4 py-2.5 flex items-center gap-2 text-xs tracking-tight text-white/75 border-t border-white/15 flex-nowrap overflow-x-auto whitespace-nowrap">
              <button
                onClick={() => handleQuickAction('assist')}
                className="hover:text-white transition-colors flex items-center gap-1.5 shrink-0"
              >
                <Sparkles size={14} className="text-white/70" />
                Assist
              </button>
              <div className="w-[3px] h-[3px] rounded-full bg-white/20 shrink-0" />
              <button
                onClick={() => handleQuickAction('what-should-i-say')}
                className="hover:text-white transition-colors flex items-center gap-1.5 shrink-0"
              >
                <Wand2 size={14} className="text-white/70" />
                What should I say?
              </button>
              <div className="w-[3px] h-[3px] rounded-full bg-white/20 shrink-0" />
              <button
                onClick={() => handleQuickAction('follow-up')}
                className="hover:text-white transition-colors flex items-center gap-1.5 shrink-0"
              >
                <MessageSquareText size={14} className="text-white/70" />
                Follow-up questions
              </button>
              <div className="w-[3px] h-[3px] rounded-full bg-white/20 shrink-0" />
              <button
                onClick={() => handleQuickAction('recap')}
                className="hover:text-white transition-colors flex items-center gap-1.5 shrink-0"
              >
                <RotateCcw size={14} className="text-white/70" />
                Recap
              </button>
              
            </div>
          )}

          {/* Input Area */}
          <div className={`mt-auto px-4 py-1 ${isRecording || hasResponse ? 'border-t border-white/15' : ''}`}>
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
                  className="w-full bg-transparent text-white text-[13px] py-2.5 focus:outline-none"
                />
                {/* Custom placeholder with key caps */}
                {!inputValue && (
                  <span className="absolute top-0 left-0 right-0 h-full text-[13px] pointer-events-none text-white/60 flex items-center gap-1">
                    Ask about your screen or conversation, or
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-flex justify-center items-center shrink-0 text-white/50 rounded-md"
                        style={{ width: 18, height: 20, fontSize: 11, border: '1px solid rgba(255,255,255,0.25)', background: 'linear-gradient(to bottom, rgba(0,0,0,0.12), rgba(0,0,0,0.18))' }}
                      >
                        ⌘
                      </span>
                      <span
                        className="inline-flex justify-center items-center shrink-0 text-white/50 rounded-md"
                        style={{ width: 18, height: 20, fontSize: 11, border: '1px solid rgba(255,255,255,0.25)', background: 'linear-gradient(to bottom, rgba(0,0,0,0.12), rgba(0,0,0,0.18))' }}
                      >
                        ↵
                      </span>
                    </span>
                    for Assist
                  </span>
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
    </div>
  )
}
