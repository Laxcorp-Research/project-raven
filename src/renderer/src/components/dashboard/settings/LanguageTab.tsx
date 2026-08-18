import { useState, useEffect, useRef } from 'react'
import { createLogger } from '../../../lib/logger'
import {
  ASSEMBLYAI_LIVE_LANGUAGE_LABELS,
  assemblyaiSupportsLanguage,
  effectiveSttEngine,
  parseSttProviderPreference,
  type SttProviderPreference,
} from '../../../../../shared/sttCapabilities'

const log = createLogger('Settings:Language')

// Defined here (not inside the component) so they don't re-create on
// every render. Cap + per-term cap match the backend schema in
// backend/src/routes/auth.ts - diverging would cause server-side
// validation 400s that the user wouldn't otherwise see client-side.
const VOCAB_MAX_TERMS = 100
const VOCAB_MAX_PER_TERM = 80

function splitVocab(raw: string): string[] {
  return raw.split(',').map((t) => t.trim()).filter((t) => t.length > 0)
}

export function LanguageTab() {
  const [transcriptionLang, setTranscriptionLang] = useState('en')
  const [outputLang, setOutputLang] = useState('en')
  const [sttProvider, setSttProvider] = useState<SttProviderPreference>('auto')
  const [hasAssemblyKey, setHasAssemblyKey] = useState(false)
  const [hasDeepgramKey, setHasDeepgramKey] = useState(false)
  const [vocabulary, setVocabulary] = useState('')
  const [vocabularySaveState, setVocabularySaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [transcriptionDropdownOpen, setTranscriptionDropdownOpen] = useState(false)
  const [outputDropdownOpen, setOutputDropdownOpen] = useState(false)
  const transcriptionDropdownRef = useRef<HTMLDivElement>(null)
  const outputDropdownRef = useRef<HTMLDivElement>(null)
  const vocabSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    async function loadSettings() {
      try {
        const tLang = (await window.raven.storeGet('transcriptionLanguage')) as string
        const oLang = (await window.raven.storeGet('outputLanguage')) as string
        const vocab = (await window.raven.storeGet('vocabulary')) as string
        const stt = parseSttProviderPreference(await window.raven.storeGet('sttProvider'))
        const dgKey = (await window.raven.storeGet('deepgramApiKey')) as string
        const aaiKey = (await window.raven.storeGet('assemblyaiApiKey')) as string
        if (tLang) setTranscriptionLang(tLang)
        if (oLang) setOutputLang(oLang)
        if (vocab) setVocabulary(vocab)
        setSttProvider(stt)
        setHasDeepgramKey(!!dgKey?.trim())
        setHasAssemblyKey(!!aaiKey?.trim())
      } catch (error) {
        log.error('Failed to load language settings:', error)
      }
    }
    loadSettings()
  }, [])

  useEffect(() => {
    return () => {
      if (vocabSaveTimerRef.current) clearTimeout(vocabSaveTimerRef.current)
    }
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
  }

  const handleOutputLangChange = async (value: string) => {
    setOutputLang(value)
    setOutputDropdownOpen(false)
    await window.raven.storeSet('outputLanguage', value)
  }

  const handleSttProviderChange = async (value: SttProviderPreference) => {
    setSttProvider(value)
    await window.raven.storeSet('sttProvider', value)
  }

  // Debounced save - don't round-trip to the server on every keystroke.
  // 1s after typing stops feels like "auto-saves as you go" without
  // hammering the /api/auth/me endpoint. The local store is updated
  // immediately so the value is available for the next recording even
  // if the sync hasn't landed yet.
  const handleVocabularyChange = (raw: string) => {
    setVocabulary(raw)
    setVocabularySaveState('saving')
    if (vocabSaveTimerRef.current) clearTimeout(vocabSaveTimerRef.current)
    vocabSaveTimerRef.current = setTimeout(async () => {
      try {
        await window.raven.storeSet('vocabulary', raw)
        setVocabularySaveState('saved')
        setTimeout(() => setVocabularySaveState('idle'), 1500)
      } catch (err) {
        log.error('Failed to save vocabulary:', err)
        setVocabularySaveState('idle')
      }
    }, 1000)
  }

  const vocabTerms = splitVocab(vocabulary)
  const vocabOverLimit = vocabTerms.length > VOCAB_MAX_TERMS
  const vocabOverPerTermLimit = vocabTerms.some((t) => t.length > VOCAB_MAX_PER_TERM)

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

  const assemblyLangOk = assemblyaiSupportsLanguage(transcriptionLang)
  const assemblySelectable = assemblyLangOk && hasAssemblyKey
  const deepgramSelectable = hasDeepgramKey
  const willUse = effectiveSttEngine({
    language: transcriptionLang,
    hasAssemblyKey,
    hasDeepgramKey,
    preferredProvider: sttProvider,
  })
  const willUseLabel =
    willUse === 'assemblyai' ? 'AssemblyAI' : willUse === 'deepgram' ? 'Deepgram' : 'no engine (add an API key)'

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

      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-white rounded-lg border border-gray-200 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-gray-900">Speech-to-text engine</div>
            <div className="text-xs text-gray-500">
              Which service transcribes the meeting. Availability depends on the language above.
            </div>
          </div>
        </div>

        <div role="radiogroup" aria-label="Speech-to-text engine" className="space-y-2">
          <SttRadio
            value="auto"
            selected={sttProvider}
            onSelect={handleSttProviderChange}
            title="Automatic"
            description={`AssemblyAI for ${ASSEMBLYAI_LIVE_LANGUAGE_LABELS}. Deepgram for auto-detect and every other language.`}
          />
          <SttRadio
            value="assemblyai"
            selected={sttProvider}
            onSelect={handleSttProviderChange}
            disabled={!assemblySelectable}
            title="AssemblyAI"
            description={`Universal-3 Pro. ${ASSEMBLYAI_LIVE_LANGUAGE_LABELS}.`}
            hint={
              !hasAssemblyKey
                ? 'Add an AssemblyAI key in API Keys to use this engine.'
                : !assemblyLangOk
                  ? 'Not available for this language. Switch to a supported language or use Deepgram.'
                  : undefined
            }
          />
          <SttRadio
            value="deepgram"
            selected={sttProvider}
            onSelect={handleSttProviderChange}
            disabled={!deepgramSelectable}
            title="Deepgram"
            description="nova-3. Works with every language in the list, including auto-detect."
            hint={!hasDeepgramKey ? 'Add a Deepgram key in API Keys to use this engine.' : undefined}
          />
        </div>

        <p className="text-xs text-gray-500">
          Next recording will use <span className="font-medium text-gray-700">{willUseLabel}</span>
          {sttProvider === 'assemblyai' && willUse === 'deepgram' && ' (AssemblyAI is not available for this language).'}
          {sttProvider !== 'auto' && willUse === 'assemblyai' && ' — falls back to Deepgram if AssemblyAI cannot connect.'}
        </p>
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

      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-white rounded-lg border border-gray-200 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900">Custom vocabulary</div>
                <div className="text-xs text-gray-500">Names, jargon, or acronyms the transcriber should recognize</div>
              </div>
              {vocabularySaveState === 'saving' && <span className="text-xs text-gray-400">Saving…</span>}
              {vocabularySaveState === 'saved' && <span className="text-xs text-green-600">Saved</span>}
            </div>
          </div>
        </div>

        <textarea
          value={vocabulary}
          onChange={(e) => handleVocabularyChange(e.target.value)}
          placeholder="e.g., Acme Corp, kubectl, GPT-5, Dr. Singh"
          rows={3}
          className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 resize-y"
        />

        <div className="flex items-center justify-between text-xs">
          <span className={vocabOverLimit ? 'text-red-600' : 'text-gray-400'}>
            {vocabTerms.length} / {VOCAB_MAX_TERMS} terms{vocabOverLimit && ' - excess will be ignored'}
          </span>
          <span className="text-gray-400">Separate with commas</span>
        </div>

        {vocabOverPerTermLimit && (
          <p className="text-xs text-red-600">
            One or more terms are longer than {VOCAB_MAX_PER_TERM} characters and will be rejected on save.
          </p>
        )}

        <p className="text-xs text-gray-500">
          &quot;Raven&quot; is always included automatically - you don&apos;t need to add it.
        </p>
      </div>
    </div>
  )
}

function SttRadio({
  value,
  selected,
  onSelect,
  disabled = false,
  title,
  description,
  hint,
}: {
  value: SttProviderPreference
  selected: SttProviderPreference
  onSelect: (value: SttProviderPreference) => void
  disabled?: boolean
  title: string
  description: string
  hint?: string
}) {
  const checked = selected === value
  return (
    <label
      className={`flex gap-3 p-3 rounded-lg border bg-white ${
        disabled
          ? 'border-gray-200 opacity-60 cursor-not-allowed'
          : checked
            ? 'border-blue-400 ring-1 ring-blue-400 cursor-pointer'
            : 'border-gray-200 hover:border-gray-300 cursor-pointer'
      }`}
    >
      <input
        type="radio"
        name="sttProvider"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
        className="mt-1 accent-blue-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900">{title}</span>
        <span className="block text-xs text-gray-500 mt-0.5">{description}</span>
        {hint && <span className="block text-xs text-amber-700 mt-1">{hint}</span>}
      </span>
    </label>
  )
}
