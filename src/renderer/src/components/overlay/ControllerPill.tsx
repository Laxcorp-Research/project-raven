import { type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import ravenLogo from '../../../../../logo/Raven.svg'

interface ControllerPillProps {
  stealthEnabled: boolean
  isRecording: boolean
  isStarting: boolean
  onToggleRecording: () => void
  onHide: () => void
  onLogoClick: () => void
  onLogoMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => void
}

export function ControllerPill({
  stealthEnabled,
  isRecording,
  isStarting,
  onToggleRecording,
  onHide,
  onLogoClick,
  onLogoMouseDown
}: ControllerPillProps) {
  return (
    <div 
      className="inline-flex items-center rounded-full px-2.5 py-2 gap-2 transition-colors"
      style={{
        WebkitAppRegion: 'drag',
        backgroundColor: '#444852'
      } as CSSProperties}
    >
      {/* Logo */}
      <button
        onClick={onLogoClick}
        onMouseDown={onLogoMouseDown}
        className="w-8 h-8 flex items-center justify-center"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        title="Open Dashboard"
      >
        <img
          src={ravenLogo}
          alt="Raven"
          className={`w-8 h-8 object-contain ${stealthEnabled ? 'opacity-95' : 'opacity-60'}`}
          draggable={false}
        />
      </button>

      {/* Hide Button */}
      <button
        onClick={onHide}
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
        className="w-8 h-8 flex items-center justify-center rounded-full border border-white/15 bg-gradient-to-b from-[#353c4e] to-[#202633] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.35)] hover:from-[#3f465a] hover:to-[#2a3142] transform-gpu transition-all duration-150 hover:scale-[1.04] active:scale-95 disabled:opacity-70 disabled:hover:scale-100"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
        title={isRecording ? 'Stop Session' : 'Start Session'}
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
    </div>
  )
}
