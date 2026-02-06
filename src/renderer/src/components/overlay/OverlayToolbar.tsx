import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { DualAudioCapture } from '../../services/audioCapture'

interface OverlayToolbarProps {
  stealthEnabled: boolean
  isExpanded: boolean
  onToggleExpand: () => void
  onHide: () => void
}

export function OverlayToolbar({
  stealthEnabled,
  isExpanded,
  onToggleExpand,
  onHide
}: OverlayToolbarProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [audioDevices, setAudioDevices] = useState<{ deviceId: string; label: string }[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string | undefined>(undefined)
  const audioCaptureRef = useRef<DualAudioCapture | null>(null)

  useEffect(() => {
    audioCaptureRef.current = new DualAudioCapture()

    DualAudioCapture.getDevices().then(setAudioDevices)

    const unsubRecording = window.raven.onRecordingStateChanged((state) => {
      setIsRecording(state.isRecording)
    })

    window.raven.audioGetState().then((state) => {
      setIsRecording(state.isRecording)
    })

    return () => {
      unsubRecording()
      audioCaptureRef.current?.stop()
      audioCaptureRef.current = null
    }
  }, [])

  const handleMicToggle = useCallback(async () => {
    if (!audioCaptureRef.current) return

    if (isRecording) {
      await audioCaptureRef.current.stop()
      await window.raven.audioStopRecording()
    } else {
      try {
        await window.raven.audioStartRecording(selectedDevice)

        let chunkCount = 0
        const result = await audioCaptureRef.current.start((chunk: Int16Array, source: 'mic' | 'system') => {
          chunkCount++

          if (chunkCount % 25 === 0) {
            console.log(
              `[OverlayToolbar] Sending chunk #${chunkCount}, source: ${source}, size: ${chunk.byteLength}`
            )
          }

          window.raven.audioSendChunk(chunk.buffer, source)
        }, selectedDevice)

        console.log('[OverlayToolbar] Audio capture result:', result)

        if (result.mic && !result.system) {
          console.warn(
            '[OverlayToolbar] System audio not available — only capturing mic'
          )
        }
      } catch (err) {
        console.error('Failed to start recording:', err)
        await window.raven.audioStopRecording()
      }
    }
  }, [isRecording, selectedDevice])

  useEffect(() => {
    const unsubHotkey = window.raven.onHotkeyToggleRecording(() => {
      void handleMicToggle()
    })

    return () => {
      unsubHotkey()
    }
  }, [handleMicToggle])

  return (
    <div
      className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50"
      style={{ WebkitAppRegion: 'drag' } as CSSProperties}
    >
      {/* Left: Logo + Stealth Badge */}
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <span className="text-lg">🐦‍⬛</span>
        <span className="font-semibold text-white text-sm">Raven</span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            stealthEnabled
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
              : 'bg-green-500/20 text-green-300 border border-green-500/30'
          }`}
        >
          {stealthEnabled ? 'Hidden' : 'Visible'}
        </span>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        {/* Mic / Stop toggle */}
        <button
          onClick={handleMicToggle}
          className={`p-1.5 rounded-lg transition-colors ${
            isRecording
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
          }`}
          title={isRecording ? 'Stop Recording (⌘⇧R)' : 'Start Recording (⌘⇧R)'}
        >
          {isRecording ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          )}
        </button>

        {audioDevices.length > 1 && (
          <select
            className="bg-transparent text-white/60 text-xs border border-white/20 rounded px-1 py-0.5 max-w-[120px] cursor-pointer"
            value={selectedDevice || ''}
            onChange={(e) => setSelectedDevice(e.target.value || undefined)}
            title="Select microphone"
          >
            <option value="">Default mic</option>
            {audioDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        )}

        {/* Expand/Collapse */}
        <button
          onClick={onToggleExpand}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {isExpanded ? <polyline points="4 14 10 14 10 20" /> : <polyline points="15 3 21 3 21 9" />}
            {isExpanded ? <polyline points="20 10 14 10 14 4" /> : <polyline points="9 21 3 21 3 15" />}
          </svg>
        </button>

        {/* Hide */}
        <button
          onClick={onHide}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
          title="Hide (⌘⇧H)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" x2="6" y1="6" y2="18" />
            <line x1="6" x2="18" y1="6" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
