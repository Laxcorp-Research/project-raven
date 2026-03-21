import { useState, useEffect, useRef } from 'react'
import { useAppMode } from '../../../hooks/useAppMode'

const themeIcons: Record<string, JSX.Element> = {
  system: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" /></svg>,
  light: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>,
  dark: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>,
}

export function GeneralTab() {
  const { isPro } = useAppMode()
  const [stealth, setStealth] = useState(false)
  const [openOnLogin, setOpenOnLogin] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')
  const [themeOpen, setThemeOpen] = useState(false)
  const [appVersion, setAppVersion] = useState('...')
  const [updateState, setUpdateState] = useState<string | null>(null)
  const themeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const settings = await window.raven.storeGetAll()
      setStealth(settings.stealthEnabled as boolean)
      setOpenOnLogin(settings.openOnLogin as boolean)
      setTheme((settings.theme as 'light' | 'dark' | 'system') || 'system')
      const v = await window.raven.getAppVersion()
      setAppVersion(v)
    }
    load()
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setThemeOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleStealth = async (enabled: boolean) => {
    setStealth(enabled)
    await window.raven.windowSetStealth(enabled)
  }

  const handleOpenOnLogin = async (enabled: boolean) => {
    setOpenOnLogin(enabled)
    await window.raven.storeSet('openOnLogin', enabled)
  }

  const handleTheme = async (t: 'light' | 'dark' | 'system') => {
    setTheme(t)
    setThemeOpen(false)
    await window.raven.storeSet('theme', t)
    await window.raven.windowSetTheme(t)
  }

  const handleCheckUpdate = async () => {
    setUpdateState('checking')
    try {
      await window.raven.updateCheck()
      setUpdateState('up-to-date')
      setTimeout(() => setUpdateState(null), 3000)
    } catch {
      setUpdateState('error')
      setTimeout(() => setUpdateState(null), 3000)
    }
  }

  return (
    <div className="space-y-5">
      {/* Detectability banner */}
      <div className={`flex items-center justify-between rounded-xl border p-4 ${
        stealth
          ? 'bg-purple-50 border-purple-200'
          : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="flex items-center gap-3">
          {stealth ? (
            <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
          ) : (
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          )}
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {stealth ? 'Undetectable' : 'Detectable'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {stealth
                ? 'Raven is hidden from screen sharing'
                : 'Raven is visible during screen sharing'}
            </p>
          </div>
        </div>
        <button
          onClick={() => handleStealth(!stealth)}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            stealth ? 'bg-purple-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              stealth ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Section label */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900">General settings</h3>
        <p className="text-xs text-gray-400 mt-0.5">Customize how Raven works for you</p>
      </div>

      {/* Settings rows */}
      <div className="space-y-0">
        {/* Launch on login */}
        <div className="flex items-center justify-between py-4 border-b border-gray-100">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Open Raven when you log in</p>
              <p className="text-xs text-gray-400 mt-0.5">Raven will open automatically when you log in to your computer</p>
            </div>
          </div>
          <button
            onClick={() => handleOpenOnLogin(!openOnLogin)}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ml-4 ${
              openOnLogin ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                openOnLogin ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Theme */}
        <div className="flex items-center justify-between py-4 border-b border-gray-100">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-gray-500 dark:text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Theme</p>
              <p className="text-xs text-gray-400 mt-0.5">Customize how Raven looks on your device</p>
            </div>
          </div>
          <div className="relative ml-4" ref={themeRef}>
            <button
              onClick={() => setThemeOpen(!themeOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {themeIcons[theme]}
              <span>{theme === 'system' ? 'System' : theme.charAt(0).toUpperCase() + theme.slice(1)}</span>
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {themeOpen && (
              <div className="absolute right-0 mt-1 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50 py-1">
                {(['system', 'light', 'dark'] as const).map((option) => (
                  <button
                    key={option}
                    onClick={() => handleTheme(option)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 ${
                      theme === option ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {theme === option && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                    {theme !== option && <span className="w-3.5" />}
                    {themeIcons[option]}
                    <span>{option === 'system' ? 'System' : option.charAt(0).toUpperCase() + option.slice(1)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Version — only shown in pro mode (open-source users run from source) */}
        {isPro && <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Version</p>
              <p className="text-xs text-gray-400 mt-0.5">You are currently using Raven version {appVersion}</p>
            </div>
          </div>
          <button
            onClick={handleCheckUpdate}
            disabled={updateState === 'checking'}
            className="px-3.5 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors shrink-0 ml-4"
          >
            {updateState === 'checking'
              ? 'Checking...'
              : updateState === 'up-to-date'
                ? 'Up to date ✓'
                : updateState === 'error'
                  ? 'Check failed'
                  : 'Check for updates'}
          </button>
        </div>}
      </div>
    </div>
  )
}
