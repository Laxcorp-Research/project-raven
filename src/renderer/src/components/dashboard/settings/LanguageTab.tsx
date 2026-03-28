import { useState, useEffect, useRef } from 'react'
import { createLogger } from '../../../lib/logger'

const log = createLogger('Settings:Language')

export function LanguageTab() {
  const [transcriptionLang, setTranscriptionLang] = useState('en')
  const [outputLang, setOutputLang] = useState('en')
  const [transcriptionDropdownOpen, setTranscriptionDropdownOpen] = useState(false)
  const [outputDropdownOpen, setOutputDropdownOpen] = useState(false)
  const transcriptionDropdownRef = useRef<HTMLDivElement>(null)
  const outputDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function loadSettings() {
      try {
        const tLang = (await window.raven.storeGet('transcriptionLanguage')) as string
        const oLang = (await window.raven.storeGet('outputLanguage')) as string
        if (tLang) setTranscriptionLang(tLang)
        if (oLang) setOutputLang(oLang)
      } catch (error) {
        log.error('Failed to load language settings:', error)
      }
    }
    loadSettings()
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (transcriptionDropdownRef.current && !transcriptionDropdownRef.current.contains(event.target as Node)) {
        setTranscriptionDropdownOpen(false)
      }
      if (outputDropdownRef.current && !outputDropdownRef.current.contains(event.target as Node)) {
        setOutputDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleTranscriptionLangChange = async (value: string) => {
    setTranscriptionLang(value)
    setTranscriptionDropdownOpen(false)
    await window.raven.storeSet('transcriptionLanguage', value)
    try { await window.raven.authUpdateProfile({ preferences: { transcriptionLanguage: value } }) } catch { /* free mode */ }
  }

  const handleOutputLangChange = async (value: string) => {
    setOutputLang(value)
    setOutputDropdownOpen(false)
    await window.raven.storeSet('outputLanguage', value)
    try { await window.raven.authUpdateProfile({ preferences: { outputLanguage: value } }) } catch { /* free mode */ }
  }

  const transcriptionLanguages = [
    { value: 'en', label: 'English (recommended)' },
    { value: 'multi', label: 'Auto-detect language' },
    { value: 'hi', label: 'Hindi (हिन्दी)' },
    { value: 'es', label: 'Spanish (Español)' },
    { value: 'fr', label: 'French (Français)' },
    { value: 'de', label: 'German (Deutsch)' },
    { value: 'it', label: 'Italian (Italiano)' },
    { value: 'pt', label: 'Portuguese (Português)' },
    { value: 'ja', label: 'Japanese (日本語)' },
    { value: 'ko', label: 'Korean (한국어)' },
    { value: 'zh', label: 'Mandarin (普通话)' },
    { value: 'ar', label: 'Arabic (العربية)' },
    { value: 'bn', label: 'Bengali (বাংলা)' },
    { value: 'nl', label: 'Dutch (Nederlands)' },
    { value: 'pl', label: 'Polish (Polski)' },
    { value: 'ru', label: 'Russian (Русский)' },
    { value: 'ta', label: 'Tamil (தமிழ்)' },
    { value: 'th', label: 'Thai (ไทย)' },
    { value: 'tr', label: 'Turkish (Türkçe)' },
    { value: 'uk', label: 'Ukrainian (Українська)' },
    { value: 'vi', label: 'Vietnamese (Tiếng Việt)' },
  ]

  const outputLanguages = [
    { value: 'en', label: 'English (recommended)' },
    { value: 'auto', label: 'Auto-detect language' },
    { value: 'hi', label: 'Hindi (हिन्दी)' },
    { value: 'es', label: 'Spanish (Español)' },
    { value: 'fr', label: 'French (Français)' },
    { value: 'de', label: 'German (Deutsch)' },
    { value: 'it', label: 'Italian (Italiano)' },
    { value: 'pt', label: 'Portuguese (Português)' },
    { value: 'ja', label: 'Japanese (日本語)' },
    { value: 'ko', label: 'Korean (한국어)' },
    { value: 'zh', label: 'Mandarin (普通话)' },
  ]

  const getLanguageLabel = (languages: typeof transcriptionLanguages, value: string) => {
    return languages.find((l) => l.value === value)?.label || value
  }

  return (
    <div className="space-y-6 max-w-xl">
      <p className="text-sm text-gray-500">
        Select the languages for your meetings.
      </p>

      <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-white rounded-lg border border-gray-200 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900">Transcription language</div>
            <div className="text-xs text-gray-500">The language you speak in meetings</div>
          </div>
        </div>

        <div className="relative" ref={transcriptionDropdownRef}>
          <button
            onClick={() => {
              setTranscriptionDropdownOpen(!transcriptionDropdownOpen)
              setOutputDropdownOpen(false)
            }}
            className="flex items-center justify-between gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:border-gray-400 transition-colors min-w-[200px]"
          >
            <span className="truncate">{getLanguageLabel(transcriptionLanguages, transcriptionLang)}</span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${transcriptionDropdownOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {transcriptionDropdownOpen && (
            <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">
              {transcriptionLanguages.map((lang) => (
                <button
                  key={lang.value}
                  onClick={() => handleTranscriptionLangChange(lang.value)}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50 ${
                    lang.value === transcriptionLang ? 'text-blue-600 bg-blue-50' : 'text-gray-700'
                  }`}
                >
                  <span>{lang.label}</span>
                  {lang.value === transcriptionLang && (
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-white rounded-lg border border-gray-200 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900">Output language</div>
            <div className="text-xs text-gray-500">Language for AI responses and meeting notes</div>
          </div>
        </div>

        <div className="relative" ref={outputDropdownRef}>
          <button
            onClick={() => {
              setOutputDropdownOpen(!outputDropdownOpen)
              setTranscriptionDropdownOpen(false)
            }}
            className="flex items-center justify-between gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:border-gray-400 transition-colors min-w-[200px]"
          >
            <span className="truncate">{getLanguageLabel(outputLanguages as typeof transcriptionLanguages, outputLang)}</span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${outputDropdownOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {outputDropdownOpen && (
            <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">
              {outputLanguages.map((lang) => (
                <button
                  key={lang.value}
                  onClick={() => handleOutputLangChange(lang.value)}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50 ${
                    lang.value === outputLang ? 'text-blue-600 bg-blue-50' : 'text-gray-700'
                  }`}
                >
                  <span>{lang.label}</span>
                  {lang.value === outputLang && (
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
