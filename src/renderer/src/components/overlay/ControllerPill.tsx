import {
  useLayoutEffect,
  useState,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent
} from 'react'
import ravenLogo from '../../../../../logo/raven.svg'

interface ControllerPillProps {
  stealthEnabled: boolean
  isRecording: boolean
  isStarting: boolean
  onToggleRecording: () => void
  onToggleStealth: () => void
  onHide: () => void
  onLogoClick: () => void
  onLogoMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => void
}

export function ControllerPill({
  stealthEnabled,
  isRecording,
  isStarting,
  onToggleRecording,
  onToggleStealth,
  onHide,
  onLogoClick,
  onLogoMouseDown
}: ControllerPillProps) {
  const [tooltip, setTooltip] = useState<{ text: string; left: number } | null>(null)
  const [_tooltipLeft, setTooltipLeft] = useState<number | null>(null)
  const pillRef = useRef<HTMLDivElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const tooltipHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTooltipHideTimer = () => {
    if (tooltipHideTimerRef.current) {
      clearTimeout(tooltipHideTimerRef.current)
      tooltipHideTimerRef.current = null
    }
  }

  const showTooltip = (text: string, element: HTMLButtonElement) => {
    clearTooltipHideTimer()
    const pill = pillRef.current
    if (!pill) return
    const buttonRect = element.getBoundingClientRect()
    const pillRect = pill.getBoundingClientRect()
    setTooltip({
      text,
      left: buttonRect.left - pillRect.left + buttonRect.width / 2
    })
  }

  const scheduleHideTooltip = () => {
    clearTooltipHideTimer()
    tooltipHideTimerRef.current = setTimeout(() => {
      setTooltip(null)
    }, 120)
  }

  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current || !pillRef.current) {
      setTooltipLeft(null)
      return
    }

    const tooltipWidth = tooltipRef.current.offsetWidth
    const pillWidth = pillRef.current.clientWidth
    const margin = 8
    const half = tooltipWidth / 2
    const minCenter = half + margin
    const maxCenter = Math.max(minCenter, pillWidth - half - margin)
    const clampedCenter = Math.min(Math.max(tooltip.left, minCenter), maxCenter)
    setTooltipLeft(clampedCenter)
  }, [tooltip])

  return (
    <div
      ref={pillRef}
      className="relative inline-flex items-center rounded-full px-2.5 py-2 gap-2 transition-colors backdrop-blur-3xl border-[1.5px] border-white/20"
      style={{
        WebkitAppRegion: 'drag',
        backgroundColor: 'rgba(20, 24, 34, 0.70)'
      } as CSSProperties}
      onMouseEnter={clearTooltipHideTimer}
      onMouseLeave={scheduleHideTooltip}
      onMouseDown={() => setTooltip(null)}
    >
      {/* Logo */}
      <button
        onClick={onLogoClick}
        onMouseDown={onLogoMouseDown}
        onMouseEnter={() => setTooltip(null)}
        className="w-8 h-8 flex items-center justify-center cursor-default"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <img
          src={ravenLogo}
          alt="Raven"
          className="w-8 h-8 object-contain opacity-100"
          draggable={false}
        />
      </button>

      {/* Hide Button */}
      <button
        onClick={onHide}
        onMouseEnter={() => setTooltip(null)}
        className="h-8 flex items-center gap-1 px-3 rounded-full border border-white/15 bg-gradient-to-b from-[#353c4e] to-[#202633] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.35)] hover:from-[#3f465a] hover:to-[#2a3142] transform-gpu transition-all duration-150 hover:scale-[1.04] active:scale-95"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        {/* Chevron - smaller, Cluely-style */}
        <svg 
          width="8"
          height="8"
          viewBox="0 0 12 12"
          fill="none" 
          className="opacity-80"
        >
          <path
            d="M2 8L6 4L10 8"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-[13px] font-medium text-white/90">Hide</span>
      </button>

      {/* Mic / Stop Button */}
      <button
        onClick={onToggleRecording}
        disabled={isStarting}
        onMouseEnter={(e) => showTooltip(isRecording ? 'Stop Session' : 'Start Session', e.currentTarget)}
        onMouseLeave={clearTooltipHideTimer}
        className="w-8 h-8 flex items-center justify-center rounded-full border border-white/15 bg-gradient-to-b from-[#353c4e] to-[#202633] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.35)] hover:from-[#3f465a] hover:to-[#2a3142] transform-gpu transition-all duration-150 hover:scale-[1.04] active:scale-95 disabled:opacity-70 disabled:hover:scale-100"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        aria-label={isRecording ? 'Stop Session' : 'Start Session'}
      >
        {isStarting ? (
          <svg className="w-4 h-4 text-white animate-spin" viewBox="0 0 24 24" fill="none">
            <circle 
              cx="12" 
              cy="12" 
              r="10" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeDasharray="31.4" 
              strokeDashoffset="10"
              strokeLinecap="round"
            />
          </svg>
        ) : isRecording ? (
          <div className="w-2.5 h-2.5 bg-white rounded-[2px]" />
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" className="text-white/95">
            <path
              fill="currentColor"
              d="M12 3a4 4 0 0 0-4 4v4.5a4 4 0 1 0 8 0V7a4 4 0 0 0-4-4Z"
            />
            <path
              fill="currentColor"
              d="M6.25 11.5a.75.75 0 0 1 .75.75 5 5 0 0 0 10 0 .75.75 0 0 1 1.5 0 6.5 6.5 0 0 1-5.75 6.46V21a.75.75 0 0 1-1.5 0v-2.29A6.5 6.5 0 0 1 5.5 12.25a.75.75 0 0 1 .75-.75Z"
            />
          </svg>
        )}
      </button>

      <span className="text-white/35 text-sm leading-none select-none">|</span>

      <button
        onClick={onToggleStealth}
        onMouseEnter={(e) =>
          showTooltip(stealthEnabled ? 'Raven is Undetectable' : 'Raven is Detectable', e.currentTarget)
        }
        onMouseLeave={clearTooltipHideTimer}
        className={`w-8 h-8 flex items-center justify-center rounded-full border shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.35)] transform-gpu transition-all duration-150 hover:scale-[1.04] active:scale-95 outline-none focus:outline-none ${
          stealthEnabled
            ? 'border-blue-300/30 bg-gradient-to-b from-blue-500 to-blue-700'
            : 'border-white/15 bg-gradient-to-b from-[#353c4e] to-[#202633] hover:from-[#3f465a] hover:to-[#2a3142]'
        }`}
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        aria-label={stealthEnabled ? 'Turn undetectability off' : 'Turn undetectability on'}
      >
        {stealthEnabled ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-white">
            <path
              d="M3 3l18 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M10.6 10.6a2 2 0 0 0 2.8 2.8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M9.9 4.2A10.9 10.9 0 0 1 12 4c5.6 0 9.4 4.1 10.6 7.9a.8.8 0 0 1 0 .2 15 15 0 0 1-3 4.9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M6 6.2a15.2 15.2 0 0 0-4.6 5.7.8.8 0 0 0 0 .2C2.6 15.9 6.4 20 12 20c1.4 0 2.7-.2 3.9-.7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-white/90">
            <path
              d="M1.5 12s3.7-8 10.5-8 10.5 8 10.5 8-3.7 8-10.5 8S1.5 12 1.5 12Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <circle
              cx="12"
              cy="12"
              r="3"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        )}
      </button>

      {tooltip && (
        <div
          ref={tooltipRef}
          className="absolute bottom-full mb-2 px-3 py-1.5 text-white text-xs font-medium rounded-full whitespace-nowrap z-[100] pointer-events-none border border-white/15 bg-gradient-to-b from-[#353c4e] to-[#202633] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.35)]"
          style={{
            left: tooltip.left,
            transform: 'translateX(-50%)'
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}
