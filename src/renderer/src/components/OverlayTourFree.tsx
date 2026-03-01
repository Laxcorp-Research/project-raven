import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import ravenLogo from '../../../../logo/raven.svg'
import incognitoIcon from '../assets/incognito.svg'

interface TourStep {
  id: string
  highlightId: string
  label: string
  description: JSX.Element | string
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1 text-[10px] font-medium text-blue-800 bg-white border border-blue-200 rounded shadow-sm mx-0.5 align-middle">
      {children}
    </kbd>
  )
}

const isMac =
  typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
const cmdKey = isMac ? '⌘' : 'Ctrl'

const TOUR_STEPS: TourStep[] = [
  {
    id: 'pill',
    highlightId: 'pill',
    label: 'Your Control Center',
    description: 'This pill floats above everything and is invisible to screen sharing. Drag it anywhere on your screen.',
  },
  {
    id: 'hide',
    highlightId: 'hide',
    label: 'Hide',
    description: (
      <>Collapse the overlay. Bring it back anytime with <Kbd>{cmdKey}</Kbd><Kbd>\</Kbd></>
    ),
  },
  {
    id: 'mic-start',
    highlightId: 'mic',
    label: 'Start Session',
    description: 'Tap to begin recording your microphone and system audio in real-time.',
  },
  {
    id: 'mic-stop',
    highlightId: 'mic',
    label: 'Stop Session',
    description: 'Tap again to end the session and stop all recording.',
  },
  {
    id: 'stealth-off',
    highlightId: 'stealth',
    label: 'Detectable',
    description: 'Raven is visible to screen capture and recording software.',
  },
  {
    id: 'stealth-on',
    highlightId: 'stealth',
    label: 'Undetectable',
    description: 'Raven becomes invisible and is hidden from screen sharing.',
  },
  {
    id: 'incognito-off',
    highlightId: 'incognito',
    label: 'Incognito Off',
    description: 'Normal mode. Your sessions are recorded and saved.',
  },
  {
    id: 'incognito-on',
    highlightId: 'incognito',
    label: 'Incognito On',
    description: 'All recording is paused. Nothing is captured or saved until you turn it off.',
  },
]

interface OverlayTourFreeProps {
  onBack: () => void
  onNext: () => void
}

export function OverlayTourFree({ onBack, onNext }: OverlayTourFreeProps) {
  const [tourIndex, setTourIndex] = useState(0)
  const currentStep = TOUR_STEPS[tourIndex]
  const buttonRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const isFirst = tourIndex === 0
  const isLast = tourIndex === TOUR_STEPS.length - 1

  const handleTourBack = () => {
    if (isFirst) {
      onBack()
    } else {
      setTourIndex((i) => i - 1)
    }
  }

  const handleTourNext = () => {
    if (isLast) {
      onNext()
    } else {
      setTourIndex((i) => i + 1)
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') handleTourNext()
      if (e.key === 'ArrowLeft') handleTourBack()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const stepId = currentStep.id
  const highlightId = currentStep.highlightId
  const isPillHighlight = highlightId === 'pill'

  const isHighlighted = (id: string) => highlightId === id

  const btnBase =
    'h-8 flex items-center justify-center rounded-full border border-white/15 bg-gradient-to-b from-[#2e3039] to-[#272a31] shadow-[0_-1px_0_0_rgba(255,255,255,0.3),0_17px_5px_0_transparent,0_11px_4px_0_rgba(0,0,0,0.01),0_6px_4px_0_rgba(0,0,0,0.05),0_3px_3px_0_rgba(0,0,0,0.09),0_1px_1px_0_rgba(0,0,0,0.1)]'

  const ringClass = (id: string) =>
    isHighlighted(id) ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-[#18171c]' : ''

  const dimClass = (id: string) =>
    !isPillHighlight && !isHighlighted(id) ? 'opacity-30' : ''

  const showMicStop = stepId === 'mic-stop'
  const showStealthOn = stepId === 'stealth-on'
  const showIncognitoOn = stepId === 'incognito-on'

  return (
    <div className="space-y-5">
      <div className="text-center mb-1">
        <h2 className="text-lg font-semibold text-gray-900 mb-0.5">Meet Your Overlay</h2>
        <p className="text-xs text-gray-500">
          {currentStep.label}
        </p>
      </div>

      <div className="rounded-2xl bg-gradient-to-b from-gray-800 to-gray-900 p-8 flex flex-col items-center gap-5 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }} />

        <div
          ref={(el) => { buttonRefs.current['pill'] = el }}
          className={`relative inline-flex items-center rounded-full px-[11px] py-[9px] gap-[7px] transition-all duration-300 ${
            isPillHighlight ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-900' : ''
          }`}
          style={{
            background: '#18171ccc',
            boxShadow: '0 0 0 1px rgba(207,226,255,0.24), 0 -0.5px 0 0 rgba(255,255,255,0.8)',
          }}
        >
          {/* Logo */}
          <div className={`transition-opacity duration-300 ${dimClass('logo')}`}>
            <div className="w-8 h-8 flex items-center justify-center">
              <img src={ravenLogo} alt="Raven" className="w-8 h-8 object-contain" draggable={false} />
            </div>
          </div>

          {/* Hide */}
          <div
            ref={(el) => { buttonRefs.current['hide'] = el }}
            className={`transition-all duration-300 ${dimClass('hide')} ${ringClass('hide')} rounded-full`}
          >
            <div className={`${btnBase} gap-1 px-3`}>
              <svg width="8" height="8" viewBox="0 0 12 12" fill="none" className="opacity-80">
                <path d="M2 8L6 4L10 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-xs font-medium text-white/90">Hide</span>
            </div>
          </div>

          {/* Mic / Stop */}
          <div
            ref={(el) => { buttonRefs.current['mic'] = el }}
            className={`transition-all duration-300 ${dimClass('mic')} ${ringClass('mic')} rounded-full`}
          >
            <div className={`${btnBase} w-8`}>
              {showMicStop ? (
                <div className="w-2.5 h-2.5 bg-white rounded-[2px]" />
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" className="text-white/95">
                  <path fill="currentColor" d="M12 3a4 4 0 0 0-4 4v4.5a4 4 0 1 0 8 0V7a4 4 0 0 0-4-4Z" />
                  <path fill="currentColor" d="M6.25 11.5a.75.75 0 0 1 .75.75 5 5 0 0 0 10 0 .75.75 0 0 1 1.5 0 6.5 6.5 0 0 1-5.75 6.46V21a.75.75 0 0 1-1.5 0v-2.29A6.5 6.5 0 0 1 5.5 12.25a.75.75 0 0 1 .75-.75Z" />
                </svg>
              )}
            </div>
          </div>

          <span className="text-white/35 text-sm leading-none select-none">|</span>

          {/* Stealth */}
          <div
            ref={(el) => { buttonRefs.current['stealth'] = el }}
            className={`transition-all duration-300 ${dimClass('stealth')} ${ringClass('stealth')} rounded-full`}
          >
            <div className={`w-8 h-8 flex items-center justify-center rounded-full border transition-all duration-300 shadow-[0_-1px_0_0_rgba(255,255,255,0.3),0_17px_5px_0_transparent,0_11px_4px_0_rgba(0,0,0,0.01),0_6px_4px_0_rgba(0,0,0,0.05),0_3px_3px_0_rgba(0,0,0,0.09),0_1px_1px_0_rgba(0,0,0,0.1)] ${
              showStealthOn
                ? 'border-blue-300/30 bg-gradient-to-b from-blue-500 to-blue-700'
                : 'border-white/15 bg-gradient-to-b from-[#2e3039] to-[#272a31]'
            }`}>
              {showStealthOn ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-white">
                  <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c5.6 0 9.4 4.1 10.6 7.9a.8.8 0 0 1 0 .2 15 15 0 0 1-3 4.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M6 6.2a15.2 15.2 0 0 0-4.6 5.7.8.8 0 0 0 0 .2C2.6 15.9 6.4 20 12 20c1.4 0 2.7-.2 3.9-.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-white/90">
                  <path d="M1.5 12s3.7-8 10.5-8 10.5 8 10.5 8-3.7 8-10.5 8S1.5 12 1.5 12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                </svg>
              )}
            </div>
          </div>

          {/* Incognito */}
          <div
            ref={(el) => { buttonRefs.current['incognito'] = el }}
            className={`transition-all duration-300 ${dimClass('incognito')} ${ringClass('incognito')} rounded-full`}
          >
            <div className={`w-8 h-8 flex items-center justify-center rounded-full border transition-all duration-300 shadow-[0_-1px_0_0_rgba(255,255,255,0.3),0_17px_5px_0_transparent,0_11px_4px_0_rgba(0,0,0,0.01),0_6px_4px_0_rgba(0,0,0,0.05),0_3px_3px_0_rgba(0,0,0,0.09),0_1px_1px_0_rgba(0,0,0,0.1)] ${
              showIncognitoOn
                ? 'border-purple-400/30 bg-gradient-to-b from-purple-500/80 to-purple-700/80'
                : 'border-white/15 bg-gradient-to-b from-[#2e3039] to-[#272a31]'
            }`}>
              <img src={incognitoIcon} alt="Incognito" width={15} height={15} className={showIncognitoOn ? 'opacity-100' : 'opacity-80'} />
            </div>
          </div>
        </div>

        {/* Tour step counter dots */}
        <div className="flex items-center gap-1.5 relative z-10">
          {TOUR_STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setTourIndex(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                i === tourIndex ? 'bg-blue-400 w-4' : 'bg-white/30 hover:bg-white/50'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Description card */}
      <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 text-center transition-all duration-300">
        <p className="text-sm font-medium text-blue-900 mb-1">{currentStep.label}</p>
        <p className="text-xs text-blue-700/80 leading-relaxed">{currentStep.description}</p>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-1">
        <button
          onClick={handleTourBack}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <button
          onClick={handleTourNext}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-b from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 text-white rounded-xl text-sm font-medium shadow-sm transition-all"
        >
          {isLast ? 'Continue' : 'Next'} <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}
