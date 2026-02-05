import { useState, useEffect, useRef } from 'react'

interface HeaderProps {
  stealth: boolean
  onToggleStealth: () => void
  onStartRaven: () => void
  isRecording: boolean
}

export function Header({ stealth, onToggleStealth, onStartRaven, isRecording }: HeaderProps) {
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false)
  const [activeMode, setActiveMode] = useState('Default')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setModeDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const modes = ['Default', 'Sales', 'Recruiting', 'Team Meet', 'Looking for Work', 'Lecture']

  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white">
      {/* Left section */}
      <div className="flex items-center gap-4">
        {/* Logo + Title */}
        <div className="flex items-center gap-2">
          <span className="text-xl">🐦‍⬛</span>
          <span className="font-semibold text-gray-900 text-lg">My Raven</span>
        </div>

        {/* Mode dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setModeDropdownOpen(!modeDropdownOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <span>{activeMode}</span>
            <svg
              className={`w-4 h-4 transition-transform ${modeDropdownOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {modeDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
              {modes.map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setActiveMode(mode)
                    setModeDropdownOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${
                    activeMode === mode ? 'text-cyan-600 font-medium' : 'text-gray-700'
                  }`}
                >
                  <span>{mode}</span>
                  {activeMode === mode && (
                    <svg className="w-4 h-4 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
              <div className="border-t border-gray-100 mt-1 pt-1">
                <button className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-50">
                  + Manage Modes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3">
        {/* Detectable / Undetectable toggle */}
        <button
          onClick={onToggleStealth}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            stealth
              ? 'bg-purple-50 text-purple-700 hover:bg-purple-100'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {stealth ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            )}
          </svg>
          <span>{stealth ? 'Undetectable' : 'Detectable'}</span>
        </button>

        {isRecording && (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="font-medium">Recording</span>
          </div>
        )}

        {/* Start/Stop Raven button */}
        <button
          onClick={onStartRaven}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
            isRecording
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-cyan-600 hover:bg-cyan-500 text-white'
          }`}
        >
          {isRecording ? '■ Stop Raven' : '▶ Start Raven'}
        </button>
      </div>
    </header>
  )
}
