import { useState, useEffect, useRef, type ReactNode } from 'react'
import { createLogger } from '../../lib/logger'
import type { Mode } from '../../types/global'
import { ModeEditorModal } from './ModeEditorModal'

const log = createLogger('Header')
import { Eye, EyeOff, Settings, HelpCircle, Layers, Search, FileText } from 'lucide-react'
import ravenFullLogo from '../../../../../logo/raven_full.svg'
import ravenLogo from '../../../../../logo/raven.svg'

interface SearchResult {
  id: string
  title: string
  summary: string | null
  startedAt: number
}

interface HeaderProps {
  stealth: boolean
  onToggleStealth: () => void
  onStartRaven: () => void
  isRecording: boolean
  onOpenSettings: () => void
  searchQuery: string
  onSearchChange: (query: string) => void
  onSearchSubmit: (query: string) => void
  onSessionSelect: (session: { id: string }) => void
}

function highlightMatch(text: string, query: string): ReactNode {
  if (!query.trim()) return text
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200/60 text-inherit rounded-sm px-0.5">{part}</mark>
    ) : (
      part
    )
  )
}

function getInitials(name: string): string {
  if (!name.trim()) return ''
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return parts[0][0].toUpperCase()
}

export function Header({ stealth, onToggleStealth, onStartRaven, isRecording, onOpenSettings, searchQuery, onSearchChange, onSearchSubmit, onSessionSelect }: HeaderProps) {
  const [_modeDropdownOpen, setModeDropdownOpen] = useState(false)
  const [modeEditorOpen, setModeEditorOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [_modes, setModes] = useState<Mode[]>([])
  const [_activeMode, setActiveMode] = useState<Mode | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [profilePicData, setProfilePicData] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadModes()
    loadProfile()
  }, [])

  async function loadProfile() {
    const name = (await window.raven.storeGet('displayName')) as string
    const picPath = (await window.raven.storeGet('profilePicturePath')) as string
    setDisplayName(name || '')
    if (picPath) {
      const data = await window.raven.profileGetPictureData(picPath)
      setProfilePicData(data)
    } else {
      setProfilePicData(null)
    }
  }

  useEffect(() => {
    const interval = setInterval(loadProfile, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setModeDropdownOpen(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!modeEditorOpen) {
      loadModes()
    }
  }, [modeEditorOpen])

  useEffect(() => {
    if (!searchOpen || !searchQuery.trim()) {
      setSearchResults([])
      return
    }

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await window.raven.sessions.search(searchQuery.trim())
        setSearchResults(results.slice(0, 5).map((s: { id: string; title: string; summary: string | null; startedAt: number }) => ({
          id: s.id,
          title: s.title,
          summary: s.summary,
          startedAt: s.startedAt
        })))
      } catch {
        setSearchResults([])
      }
    }, 200)

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [searchQuery, searchOpen])

  async function loadModes() {
    try {
      const [allModes, active] = await Promise.all([
        window.raven.modes.getAll(),
        window.raven.modes.getActive(),
      ])
      setModes(allModes)
      setActiveMode(active)
    } catch (error) {
      log.error('Failed to load modes:', error)
    }
  }

  async function handleSelectMode(mode: Mode) {
    try {
      await window.raven.modes.setActive(mode.id)
      setActiveMode(mode)
      setModeDropdownOpen(false)
    } catch (error) {
      log.error('Failed to set active mode:', error)
    }
  }
  void handleSelectMode

  return (
    <>
      <header className="relative z-50 flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white backdrop-blur-md">
        {/* Left section - Logo */}
        <div className="flex items-center">
          <img
            src={ravenFullLogo}
            alt="Raven"
            className="h-7 object-contain"
            draggable={false}
          />
        </div>

        {/* Center section - Search trigger (absolutely centered) */}
        <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-md px-4">
          <button
            onClick={() => {
              setSearchOpen(true)
              setTimeout(() => searchInputRef.current?.focus(), 50)
            }}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-sm rounded-full cursor-pointer transition-colors bg-gray-100/60 border border-gray-200 text-gray-400 hover:bg-gray-200/80 hover:text-gray-600"
          >
            <Search size={14} />
            <span>Search sessions...</span>
          </button>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2">
          {/* Detectability icon toggle with tooltip */}
          <div className="relative group">
            <button
              onClick={onToggleStealth}
              className={`p-2.5 rounded-full transition-colors ${
                stealth
                  ? 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {stealth ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              {stealth ? 'Raven is Undetectable' : 'Raven is Detectable'}
            </div>
          </div>

          {/* Start/Stop button */}
          {isRecording ? (
            <div className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium bg-green-50 text-green-700">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>Session in Progress</span>
            </div>
          ) : (
            <button
              onClick={onStartRaven}
              className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium bg-gradient-to-b from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 text-white shadow-sm transition-all"
            >
              <img src={ravenLogo} alt="" className="w-4 h-4 brightness-0 invert" draggable={false} />
              <span>Start Raven</span>
            </button>
          )}

          {/* User avatar + dropdown */}
          <div className="relative flex items-center" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-8 h-8 rounded-lg overflow-hidden cursor-pointer transition-all duration-200 ring-1 ring-gray-200 hover:ring-2 hover:ring-blue-300 hover:shadow-md hover:scale-105 active:scale-95"
            >
              {profilePicData ? (
                <img src={profilePicData} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-semibold">
                  {getInitials(displayName) || (
                    <svg className="w-4 h-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  )}
                </div>
              )}
            </button>

            {userMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-60 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-50">
                <div className="px-4 py-3 bg-gray-50/80 border-b border-gray-200 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 ring-1 ring-gray-200">
                    {profilePicData ? (
                      <img src={profilePicData} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-semibold">
                        {getInitials(displayName) || (
                          <svg className="w-4 h-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {displayName || 'Raven User'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Local account</p>
                  </div>
                </div>

                <div className="py-1.5">
                  <button
                    onClick={() => {
                      setUserMenuOpen(false)
                      setModeEditorOpen(true)
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3 transition-colors"
                  >
                    <Layers size={16} className="text-gray-400 shrink-0" />
                    <span>Manage Modes</span>
                  </button>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false)
                      onOpenSettings()
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3 transition-colors"
                  >
                    <Settings size={16} className="text-gray-400 shrink-0" />
                    <span>Settings</span>
                  </button>
                  <button
                    onClick={() => window.raven.openExternal('https://github.com/Laxcorp-Research/project-raven')}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3 transition-colors"
                  >
                    <HelpCircle size={16} className="text-gray-400 shrink-0" />
                    <span>Get Help</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <ModeEditorModal 
        isOpen={modeEditorOpen} 
        onClose={() => setModeEditorOpen(false)} 
      />

      {/* Search modal overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-1">
          {/* Blurred backdrop */}
          <div
            className="absolute inset-0 bg-black/10 backdrop-blur-sm"
            onClick={() => {
              setSearchOpen(false)
              onSearchChange('')
              setSearchResults([])
            }}
          />

          {/* Search box */}
          <div className="relative z-10 w-full max-w-lg mx-4">
            <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
              {/* Input row */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                <Search size={16} className="text-gray-400 shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSearchOpen(false)
                      onSearchChange('')
                      setSearchResults([])
                    }
                    if (e.key === 'Enter' && searchQuery.trim()) {
                      setSearchOpen(false)
                      onSearchSubmit(searchQuery.trim())
                      setSearchResults([])
                    }
                  }}
                  placeholder="Search sessions..."
                  className="flex-1 text-sm text-gray-900 placeholder-gray-400 bg-transparent outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      onSearchChange('')
                      setSearchResults([])
                      searchInputRef.current?.focus()
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Dropdown results */}
              {searchQuery.trim() && (
                <div className="max-h-[360px] overflow-y-auto">
                  {/* Explore section */}
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Explore</p>
                    <button
                      onClick={() => {
                        setSearchOpen(false)
                        onSearchSubmit(searchQuery.trim())
                        setSearchResults([])
                      }}
                      className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                    >
                      <Search size={14} className="text-gray-400 shrink-0" />
                      <span className="text-sm text-gray-700 truncate">
                        Search for {searchQuery.trim()}
                      </span>
                    </button>
                  </div>

                  {/* Sessions section */}
                  {searchResults.length > 0 && (
                    <div className="px-4 pt-2 pb-3">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Sessions</p>
                      {searchResults.map((session) => (
                        <button
                          key={session.id}
                          onClick={() => {
                            setSearchOpen(false)
                            onSearchChange('')
                            setSearchResults([])
                            onSessionSelect(session)
                          }}
                          className="w-full flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                        >
                          <FileText size={14} className="text-gray-400 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {highlightMatch(session.title || 'Untitled session', searchQuery)}
                            </p>
                            {session.summary && (
                              <p className="text-xs text-gray-500 truncate mt-0.5">
                                {highlightMatch(session.summary, searchQuery)}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
