import { useState, useEffect, useCallback } from 'react'
import { Download, RefreshCw, Sparkles, X } from 'lucide-react'

interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  error?: string
  progress?: number
}

export function UpdateBanner() {
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    window.raven.updateGetState().then((state) => setUpdateState(state as UpdateState))
  }, [])

  useEffect(() => {
    const unsubscribe = window.raven.onUpdateStateChanged((state) => {
      const typed = state as UpdateState
      setUpdateState(typed)
      if (typed.status === 'available' || typed.status === 'downloading' || typed.status === 'downloaded') {
        setDismissed(false)
      }
    })
    return unsubscribe
  }, [])

  const handleDownload = useCallback(async () => {
    await window.raven.updateDownload()
  }, [])

  const handleInstall = useCallback(async () => {
    await window.raven.updateInstall()
  }, [])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
  }, [])

  const canDismiss = updateState.status === 'available' || updateState.status === 'error'
  if (dismissed && canDismiss) return null
  if (updateState.status === 'idle' || updateState.status === 'checking') return null

  if (updateState.status === 'available') {
    return (
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="flex items-center gap-2.5 min-w-0">
          <Sparkles size={16} className="shrink-0" />
          <span className="text-sm font-medium">Raven {updateState.version} is available</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <button
            onClick={handleDownload}
            className="px-3.5 py-1 bg-white text-blue-700 text-xs font-semibold rounded-md hover:bg-white/90 transition-colors"
          >
            Update now
          </button>
          <button
            onClick={handleDismiss}
            className="p-1 text-white/70 hover:text-white transition-colors rounded"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    )
  }

  if (updateState.status === 'downloading') {
    const progress = updateState.progress ?? 0
    return (
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-blue-50 border-b border-blue-100">
        <Download size={16} className="text-blue-500 shrink-0 animate-pulse" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-xs text-blue-700 mb-1">
            <span className="font-medium">Downloading Raven {updateState.version}...</span>
            <span className="text-blue-500">{progress}%</span>
          </div>
          <div className="w-full h-1 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    )
  }

  if (updateState.status === 'downloaded') {
    return (
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
        <div className="flex items-center gap-2.5 min-w-0">
          <Download size={16} className="shrink-0" />
          <span className="text-sm font-medium">Raven {updateState.version} is ready to install</span>
        </div>
        <button
          onClick={handleInstall}
          className="px-3.5 py-1 bg-white text-emerald-700 text-xs font-semibold rounded-md hover:bg-white/90 transition-colors shrink-0 ml-3"
        >
          Restart & update
        </button>
      </div>
    )
  }

  if (updateState.status === 'error') {
    return (
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-red-50 border-b border-red-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <RefreshCw size={16} className="text-red-500 shrink-0" />
          <span className="text-sm font-medium text-red-700">Update failed</span>
          {updateState.error && (
            <span className="text-xs text-red-500 truncate">{updateState.error}</span>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 text-red-400 hover:text-red-600 transition-colors rounded shrink-0 ml-3"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  return null
}
