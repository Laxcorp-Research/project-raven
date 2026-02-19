import {
  useLayoutEffect,
  useState,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent
} from 'react'
import ravenLogo from '../../../../../logo/raven.svg'
import incognitoIcon from '../../assets/incognito.svg'

interface ControllerPillProps {
  stealthEnabled: boolean
  isRecording: boolean
  isStarting: boolean
  incognitoMode: boolean
  smartMode?: boolean
  onToggleRecording: () => void
  onToggleStealth: () => void
  onToggleIncognito: () => void
  onToggleSmartMode?: () => void
  onHide: () => void
  onLogoClick: () => void
  onLogoMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => void
}

export function ControllerPill({
  stealthEnabled,
  isRecording,
  isStarting,
  incognitoMode,
  smartMode,
  onToggleRecording,
  onToggleStealth,
  onToggleIncognito,
  onToggleSmartMode,
  onHide,
  onLogoClick,
  onLogoMouseDown
}: ControllerPillProps) {
  const [tooltip, setTooltip] = useState<{ text: string; left: number } | null>(null)
  const [clampedLeft, setClampedLeft] = useState<number | null>(null)
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
      setClampedLeft(null)
      return
    }

    const tooltipWidth = tooltipRef.current.offsetWidth
    const pillWidth = pillRef.current.clientWidth
    const margin = 8
    const half = tooltipWidth / 2
    const minCenter = half + margin
    const maxCenter = Math.max(minCenter, pillWidth - half - margin)
    setClampedLeft(Math.min(Math.max(tooltip.left, minCenter), maxCenter))
  }, [tooltip])

  return (
    <div
      ref={pillRef}
      className="relative inline-flex items-center rounded-full px-2.5 py-2 gap-2 transition-colors"
      style={{
        WebkitAppRegion: 'drag',
        background: stealthEnabled ? '#18171c80' : '#18171ccc',
        boxShadow: '0 0 0 1px rgba(207,226,255,0.24), 0 -0.5px 0 0 rgba(255,255,255,0.8)',
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
        <span className="text-xs font-medium text-white/90">Hide</span>
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

      {/* Fast/Deep Toggle (Pro only) */}
      {onToggleSmartMode && (
        <button
          onClick={onToggleSmartMode}
          onMouseEnter={(e) =>
            showTooltip(smartMode ? 'Deep Mode ON' : 'Fast Mode', e.currentTarget)
          }
          onMouseLeave={clearTooltipHideTimer}
          className={`h-6 px-2 flex items-center gap-1 rounded-full text-[11px] font-semibold transition-all duration-150 ${
            smartMode
              ? 'bg-yellow-400/20 text-yellow-200/90 border border-yellow-400/30'
              : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/70'
          }`}
          style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        >
          {smartMode ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          )}
          {smartMode ? 'Deep' : 'Fast'}
        </button>
      )}

      {/* Incognito Toggle */}
      <button
        onClick={onToggleIncognito}
        onMouseEnter={(e) =>
          showTooltip(incognitoMode ? 'Incognito ON — Session not saved' : 'Incognito OFF', e.currentTarget)
        }
        onMouseLeave={clearTooltipHideTimer}
        className={`w-8 h-8 flex items-center justify-center rounded-full border transform-gpu transition-all duration-150 hover:scale-[1.04] active:scale-95 ${
          incognitoMode
            ? 'border-purple-400/30 bg-gradient-to-b from-purple-500/80 to-purple-700/80'
            : 'border-white/15 bg-gradient-to-b from-[#353c4e] to-[#202633] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.35)] hover:from-[#3f465a] hover:to-[#2a3142]'
        }`}
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <img src={incognitoIcon} alt="Incognito" width={15} height={15} className={incognitoMode ? 'opacity-100' : 'opacity-80'} />
      </button>

      {tooltip && (
        <div
          ref={tooltipRef}
          className="absolute bottom-full mb-2 px-3 py-1.5 text-white text-xs font-medium rounded-full whitespace-nowrap z-[100] pointer-events-none border border-white/15 bg-gradient-to-b from-[#353c4e] to-[#202633] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.35)]"
          style={{
            left: clampedLeft ?? tooltip.left,
            transform: 'translateX(-50%)'
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}
