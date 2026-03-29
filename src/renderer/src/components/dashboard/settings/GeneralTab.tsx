import { useState, useEffect, useCallback } from 'react'
import { useAppMode } from '../../../hooks/useAppMode'

interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  error?: string
  progress?: number
}

export function GeneralTab() {
  const { isPro } = useAppMode()
  const [stealth, setStealth] = useState(false)
  const [openOnLogin, setOpenOnLogin] = useState(false)
  const [appVersion, setAppVersion] = useState('...')
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' })

  useEffect(() => {
    async function load() {
      const settings = await window.raven.storeGetAll()
      setStealth(settings.stealthEnabled as boolean)
      setOpenOnLogin(settings.openOnLogin as boolean)
      const v = await window.raven.getAppVersion()
      setAppVersion(v)
      const state = await window.raven.updateGetState()
      setUpdateState(state as UpdateState)
    }
    load()
  }, [])

  useEffect(() => {
    const unsubscribe = window.raven.onUpdateStateChanged((state) => {
      setUpdateState(state as UpdateState)
    })
    return unsubscribe
  }, [])

  const handleStealth = async (enabled: boolean) => {
    setStealth(enabled)
    await window.raven.windowSetStealth(enabled)
  }

  const handleOpenOnLogin = async (enabled: boolean) => {
    setOpenOnLogin(enabled)
    await window.raven.storeSet('openOnLogin', enabled)
  }

  const handleCheckUpdate = useCallback(async () => {
    setUpdateState({ status: 'checking' })
    const result = await window.raven.updateCheck()
    if (!result.success) {
      setUpdateState({ status: 'error', error: result.error })
    }
  }, [])

  const handleDownloadUpdate = useCallback(async () => {
    await window.raven.updateDownload()
  }, [])

  const handleInstallUpdate = useCallback(async () => {
    await window.raven.updateInstall()
  }, [])

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
              <p className="text-xs text-gray-400 mt-0.5">
                {updateState.status === 'available' || updateState.status === 'downloading'
                  ? `Version ${updateState.version} is available`
                  : updateState.status === 'downloaded'
                    ? `Version ${updateState.version} is ready to install`
                    : `You are currently using Raven version ${appVersion}`}
              </p>
            </div>
          </div>
          {updateState.status === 'downloaded' ? (
            <button
              onClick={handleInstallUpdate}
              className="px-3.5 py-1.5 text-sm font-medium text-white bg-emerald-600 border border-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shrink-0 ml-4"
            >
              Restart & update
            </button>
          ) : updateState.status === 'available' ? (
            <button
              onClick={handleDownloadUpdate}
              className="px-3.5 py-1.5 text-sm font-medium text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 transition-colors shrink-0 ml-4"
            >
              Update now
            </button>
          ) : (
            <button
              onClick={handleCheckUpdate}
              disabled={updateState.status === 'checking' || updateState.status === 'downloading'}
              className="px-3.5 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors shrink-0 ml-4"
            >
              {updateState.status === 'checking'
                ? 'Checking...'
                : updateState.status === 'downloading'
                  ? `Downloading... ${updateState.progress ?? 0}%`
                  : updateState.status === 'error'
                    ? 'Check failed — retry'
                    : 'Check for updates'}
            </button>
          )}
        </div>}
      </div>
    </div>
  )
}
