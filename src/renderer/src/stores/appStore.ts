import { create } from 'zustand'

interface AppState {
  // Recording
  isRecording: boolean
  recordingDuration: number

  // Transcript
  transcript: string
  interimText: string

  // AI
  aiResponse: string
  isAiLoading: boolean

  // UI
  activeTab: 'response' | 'transcript'
  showSettings: boolean
  stealthEnabled: boolean

  // Settings
  deepgramApiKey: string
  anthropicApiKey: string

  // Actions
  setRecording: (recording: boolean) => void
  setRecordingDuration: (duration: number) => void
  appendTranscript: (text: string, isFinal: boolean) => void
  clearTranscript: () => void
  setAiResponse: (response: string) => void
  setAiLoading: (loading: boolean) => void
  setActiveTab: (tab: 'response' | 'transcript') => void
  setShowSettings: (show: boolean) => void
  setStealth: (enabled: boolean) => void
  setDeepgramApiKey: (key: string) => void
  setAnthropicApiKey: (key: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  isRecording: false,
  recordingDuration: 0,
  transcript: '',
  interimText: '',
  aiResponse: '',
  isAiLoading: false,
  activeTab: 'response',
  showSettings: false,
  stealthEnabled: true,
  deepgramApiKey: '',
  anthropicApiKey: '',

  setRecording: (recording) => set({ isRecording: recording, ...(recording ? {} : { recordingDuration: 0 }) }),
  setRecordingDuration: (duration) => set({ recordingDuration: duration }),

  appendTranscript: (text, isFinal) => {
    if (isFinal) {
      set((state) => ({
        transcript: state.transcript + (state.transcript ? '\n' : '') + text,
        interimText: '',
      }))
    } else {
      set({ interimText: text })
    }
  },

  clearTranscript: () => set({ transcript: '', interimText: '' }),
  setAiResponse: (response) => set({ aiResponse: response }),
  setAiLoading: (loading) => set({ isAiLoading: loading }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setShowSettings: (show) => set({ showSettings: show }),
  setStealth: (enabled) => set({ stealthEnabled: enabled }),
  setDeepgramApiKey: (key) => set({ deepgramApiKey: key }),
  setAnthropicApiKey: (key) => set({ anthropicApiKey: key }),
}))
