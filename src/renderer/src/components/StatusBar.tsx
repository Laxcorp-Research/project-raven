import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'

export function StatusBar() {
  const { isRecording, recordingDuration, setRecordingDuration, transcript, stealthEnabled } = useAppStore()

  useEffect(() => {
    if (!isRecording) return
    const interval = setInterval(() => {
      setRecordingDuration(useAppStore.getState().recordingDuration + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [isRecording])

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0

  return (
    <div className="flex items-center justify-between px-3 py-1 border-t border-white/5 text-[10px] text-gray-600">
      <div className="flex items-center gap-3">
        <span>{stealthEnabled ? '🔒 Stealth' : '🔓 Visible'}</span>
        {isRecording && <span className="text-red-400">⏺ {formatDuration(recordingDuration)}</span>}
      </div>
      <span>{wordCount} words</span>
    </div>
  )
}
