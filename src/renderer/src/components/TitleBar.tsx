import type { CSSProperties } from 'react'
import { useAppStore } from '../stores/appStore'

export function TitleBar() {
  const { isRecording, stealthEnabled, setStealth, setShowSettings } = useAppStore()

  const toggleStealth = async () => {
    const newState = !stealthEnabled
    setStealth(newState)
    await window.raven.toggleStealth(newState)
  }

  return (
    <div
      className="flex items-center justify-between px-3 py-1.5 border-b border-white/5"
      style={{ WebkitAppRegion: 'drag' } as CSSProperties}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-300 tracking-wide">RAVEN</span>
        <span
          className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-600'}`}
          title={isRecording ? 'Recording' : 'Not recording'}
        />
      </div>

      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <button
          onClick={toggleStealth}
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
            stealthEnabled
              ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
              : 'bg-white/5 text-gray-500 hover:bg-white/10'
          }`}
          title={stealthEnabled ? 'Stealth ON' : 'Stealth OFF'}
        >
          {stealthEnabled ? '👻' : '👁'}
        </button>

        <button
          onClick={() => setShowSettings(true)}
          className="px-1.5 py-0.5 rounded text-[10px] text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          title="Settings"
        >
          ⚙
        </button>

        <button
          onClick={() => window.raven.minimizeWindow()}
          className="px-1.5 py-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors text-sm leading-none"
        >
          −
        </button>

        <button
          onClick={() => window.raven.hideWindow()}
          className="px-1.5 py-0.5 rounded text-gray-500 hover:text-red-400 hover:bg-white/5 transition-colors text-sm leading-none"
        >
          ×
        </button>
      </div>
    </div>
  )
}
