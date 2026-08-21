import { useEffect, useRef, useState } from 'react'
import { createLogger } from '../../../lib/logger'
import {
  MEMORY_MODELS,
  notesSlotIsExplicit,
  parseAIProviderName,
  resolveNotesModel,
  resolveNotesProvider,
  resolveSettingsPickerEffort,
  resolveSettingsPickerModel,
} from '../../../../../shared/aiSlots'
import {
  DEFAULT_EFFORT,
  DEFAULT_MODELS,
  EFFORT_LABELS,
  MODEL_CATALOG,
  effortLevelsForModel,
  resolveEffort,
  settingsPickerEffortLevels,
  settingsPickerModels,
  type AIProviderName,
  type EffortLevel,
  type ModelOption,
} from '../../../lib/aiModels'

const log = createLogger('Settings:Models')

interface SlotState {
  provider: AIProviderName
  model: string
  effort: EffortLevel
}

function catalogIds(provider: AIProviderName): string[] {
  return MODEL_CATALOG[provider].map((m) => m.id)
}

function liveSlotFromStore(
  providerRaw: unknown,
  modelRaw: unknown,
  effortRaw: unknown,
  fallbackProvider: AIProviderName,
): SlotState {
  const provider = (parseAIProviderName(providerRaw) ?? fallbackProvider) as AIProviderName
  const model = resolveNotesModel(provider, modelRaw, catalogIds(provider))
  const effort = resolveEffort(provider, model, typeof effortRaw === 'string' ? effortRaw : undefined) ?? DEFAULT_EFFORT
  return { provider, model, effort }
}

function notesSlotFromStore(
  providerRaw: unknown,
  modelRaw: unknown,
  effortRaw: unknown,
  fallbackProvider: AIProviderName,
): SlotState {
  const provider = (parseAIProviderName(providerRaw) ?? fallbackProvider) as AIProviderName
  const model = resolveSettingsPickerModel(provider, modelRaw)
  const effort = resolveSettingsPickerEffort(effortRaw)
  return { provider, model, effort }
}

export function ModelsTab() {
  const [live, setLive] = useState<SlotState>({
    provider: 'anthropic',
    model: DEFAULT_MODELS.anthropic,
    effort: DEFAULT_EFFORT,
  })
  const [notes, setNotes] = useState<SlotState>({
    provider: 'anthropic',
    model: DEFAULT_MODELS.anthropic,
    effort: DEFAULT_EFFORT,
  })
  const [notesExplicit, setNotesExplicit] = useState(false)
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false)
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle')
  const saveFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [
          aiProviderRaw,
          aiModelRaw,
          aiEffortRaw,
          notesProviderRaw,
          notesModelRaw,
          notesEffortRaw,
          anthropicKey,
          openaiKey,
        ] = await Promise.all([
          window.raven.storeGet('aiProvider'),
          window.raven.storeGet('aiModel'),
          window.raven.storeGet('aiEffort'),
          window.raven.storeGet('notesProvider'),
          window.raven.storeGet('notesModel'),
          window.raven.storeGet('notesEffort'),
          window.raven.storeGet('anthropicApiKey'),
          window.raven.storeGet('openaiApiKey'),
        ])

        const liveProvider = parseAIProviderName(aiProviderRaw) ?? 'anthropic'
        setLive(liveSlotFromStore(liveProvider, aiModelRaw, aiEffortRaw, liveProvider))

        const explicit = notesSlotIsExplicit(notesProviderRaw, notesModelRaw)
        setNotesExplicit(explicit)
        const notesProvider = resolveNotesProvider(notesProviderRaw, liveProvider)
        setNotes(notesSlotFromStore(notesProvider, notesModelRaw, notesEffortRaw, notesProvider))

        setHasAnthropicKey(typeof anthropicKey === 'string' && anthropicKey.trim().length > 0)
        setHasOpenaiKey(typeof openaiKey === 'string' && openaiKey.trim().length > 0)
      } catch (error) {
        log.error('Failed to load model settings:', error)
      }
    }
    void load()
  }, [])

  useEffect(() => {
    return () => {
      if (saveFlashRef.current) clearTimeout(saveFlashRef.current)
    }
  }, [])

  const flashSaved = () => {
    setSaveState('saved')
    if (saveFlashRef.current) clearTimeout(saveFlashRef.current)
    saveFlashRef.current = setTimeout(() => setSaveState('idle'), 1500)
  }

  const persistLive = async (next: SlotState) => {
    await window.raven.storeSet('aiProvider', next.provider)
    await window.raven.storeSet('aiModel', next.model)
    await window.raven.storeSet('aiEffort', next.effort)
    flashSaved()
  }

  const persistNotes = async (next: SlotState) => {
    setNotesExplicit(true)
    await window.raven.storeSet('notesProvider', next.provider)
    await window.raven.storeSet('notesModel', next.model)
    await window.raven.storeSet('notesEffort', next.effort)
    flashSaved()
  }

  const onLiveChange = (next: SlotState) => {
    setLive(next)
    void persistLive(next)
    if (!notesExplicit) {
      const model = DEFAULT_MODELS[next.provider]
      const effort = resolveSettingsPickerEffort(DEFAULT_EFFORT)
      setNotes({ provider: next.provider, model, effort })
    }
  }

  const hasKey = (provider: AIProviderName) =>
    provider === 'openai' ? hasOpenaiKey : hasAnthropicKey

  const missingKeyWarning = (slot: SlotState, label: string) => {
    if (hasKey(slot.provider)) return null
    const vendor = slot.provider === 'openai' ? 'OpenAI' : 'Anthropic'
    return (
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        {label} uses {vendor}, but no {vendor} key is set. Add it under API Keys.
      </p>
    )
  }

  return (
    <div className="space-y-6 max-w-lg">
      <p className="text-sm text-gray-500">
        Keys stay under API Keys. Live assist is the overlay. Notes is titles, summaries, and insights after a call — Haiku / Luna only.
      </p>

      {!hasAnthropicKey && !hasOpenaiKey && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Add an Anthropic or OpenAI key under API Keys before picking models.
        </p>
      )}

      <ModelSlotCard
        title="Live assist"
        description="Overlay Assist, What should I say, and Recap during a call."
        slot={live}
        hasAnthropicKey={hasAnthropicKey}
        hasOpenaiKey={hasOpenaiKey}
        onChange={onLiveChange}
      />
      {missingKeyWarning(live, 'Live assist')}

      <ModelSlotCard
        title="Notes"
        description="Titles, summaries, and insights after a call. Fast models only (Haiku / Luna)."
        slot={notes}
        fastOnly
        hasAnthropicKey={hasAnthropicKey}
        hasOpenaiKey={hasOpenaiKey}
        onChange={(next) => {
          setNotes(next)
          void persistNotes(next)
        }}
      />
      {missingKeyWarning(notes, 'Notes')}

      <div className="pt-2 space-y-2">
        <h4 className="text-sm font-medium text-gray-900">Session memory</h4>
        <p className="text-xs text-gray-400">
          Not configurable. Compacts the overlay thread in the background so Assist does not drop the original task.
          Uses a stronger model on the same key as Live assist, not the cheap notes default.
        </p>
        <p className="px-3 py-2.5 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg">
          {MODEL_CATALOG[live.provider].find((m) => m.id === MEMORY_MODELS[live.provider])?.label
            ?? MEMORY_MODELS[live.provider]}
          <span className="block text-[11px] text-gray-400 mt-0.5">
            {live.provider === 'openai' ? 'OpenAI key' : 'Anthropic key'} · system default
          </span>
        </p>
      </div>

      {saveState === 'saved' && (
        <p className="text-xs text-green-700">Saved</p>
      )}
    </div>
  )
}

function ModelSlotCard({
  title,
  description,
  slot,
  fastOnly = false,
  hasAnthropicKey,
  hasOpenaiKey,
  onChange,
}: {
  title: string
  description: string
  slot: SlotState
  fastOnly?: boolean
  hasAnthropicKey: boolean
  hasOpenaiKey: boolean
  onChange: (next: SlotState) => void
}) {
  const [modelOpen, setModelOpen] = useState(false)
  const [effortOpen, setEffortOpen] = useState(false)
  const modelRef = useRef<HTMLDivElement>(null)
  const effortRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!modelOpen && !effortOpen) return
    const handleClick = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setModelOpen(false)
      if (effortRef.current && !effortRef.current.contains(e.target as Node)) setEffortOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [modelOpen, effortOpen])

  const modelOptions: ModelOption[] = fastOnly
    ? settingsPickerModels(slot.provider)
    : MODEL_CATALOG[slot.provider]
  const effortLevels = fastOnly
    ? settingsPickerEffortLevels(slot.provider, slot.model)
    : effortLevelsForModel(slot.provider, slot.model)
  const selectedModelLabel = modelOptions.find((m) => m.id === slot.model)?.label || slot.model

  const applyProvider = (provider: AIProviderName) => {
    const allowed = provider === 'openai' ? hasOpenaiKey : hasAnthropicKey
    if (!allowed) return
    const model = DEFAULT_MODELS[provider]
    const effort = fastOnly
      ? resolveSettingsPickerEffort(slot.effort)
      : (resolveEffort(provider, model, slot.effort) ?? DEFAULT_EFFORT)
    onChange({ provider, model, effort })
  }

  const applyModel = (modelId: string) => {
    const effort = fastOnly
      ? resolveSettingsPickerEffort(slot.effort)
      : (resolveEffort(slot.provider, modelId, slot.effort) ?? DEFAULT_EFFORT)
    onChange({ ...slot, model: modelId, effort })
  }

  const effortHint = (opt: ModelOption) => {
    const levels = fastOnly
      ? settingsPickerEffortLevels(slot.provider, opt.id)
      : opt.effort
    return levels ? `Effort: ${levels.join(', ')}` : 'No effort setting'
  }

  const providerBtn = (provider: AIProviderName, label: string, sub: string) => {
    const allowed = provider === 'openai' ? hasOpenaiKey : hasAnthropicKey
    const selected = slot.provider === provider
    return (
      <button
        type="button"
        disabled={!allowed}
        onClick={() => applyProvider(provider)}
        className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium text-left transition-colors ${
          selected
            ? 'border-blue-500 bg-blue-50 text-blue-700'
            : allowed
              ? 'border-gray-200 text-gray-600 hover:bg-gray-50'
              : 'border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50'
        }`}
      >
        <div className="font-medium">{label}</div>
        <div className="text-xs mt-0.5 opacity-70">{allowed ? sub : 'Add key under API Keys'}</div>
      </button>
    )
  }

  return (
    <div className="pt-4 first:pt-0 space-y-4">
      <div>
        <h4 className="text-sm font-medium text-gray-900">{title}</h4>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>

      <div className="flex gap-3">
        {providerBtn('anthropic', 'Anthropic', 'Claude models')}
        {providerBtn('openai', 'OpenAI', 'GPT models')}
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-500">Model</label>
        <div className="relative" ref={modelRef}>
          <button
            type="button"
            onClick={() => { setModelOpen(!modelOpen); setEffortOpen(false) }}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-left hover:border-gray-400 transition-colors"
          >
            <span className="truncate">{selectedModelLabel}</span>
            <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-2 transition-transform ${modelOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {modelOpen && (
            <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-56 overflow-y-auto">
              {modelOptions.map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => { applyModel(opt.id); setModelOpen(false) }}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50 ${
                    opt.id === slot.model ? 'text-blue-600 bg-blue-50' : 'text-gray-700'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{opt.label}</span>
                    <span className={`block truncate text-[11px] ${opt.id === slot.model ? 'text-blue-500' : 'text-gray-400'}`}>
                      {effortHint(opt)}
                    </span>
                  </span>
                  {opt.id === slot.model && (
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-500">
          Effort for {selectedModelLabel}
        </label>
        {effortLevels ? (
          <div className="relative" ref={effortRef}>
            <button
              type="button"
              onClick={() => { setEffortOpen(!effortOpen); setModelOpen(false) }}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-left hover:border-gray-400 transition-colors"
            >
              <span className="truncate">
                {effortLevels.includes(slot.effort) ? (EFFORT_LABELS[slot.effort] || slot.effort) : (EFFORT_LABELS[effortLevels[0]])}
              </span>
              <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-2 transition-transform ${effortOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {effortOpen && (
              <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-56 overflow-y-auto">
                {effortLevels.map((level) => (
                  <button
                    type="button"
                    key={level}
                    onClick={() => { onChange({ ...slot, effort: level }); setEffortOpen(false) }}
                    className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50 ${
                      level === slot.effort ? 'text-blue-600 bg-blue-50' : 'text-gray-700'
                    }`}
                  >
                    <span className="truncate">{EFFORT_LABELS[level]}</span>
                    {level === slot.effort && (
                      <svg className="w-4 h-4 text-blue-600 flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="px-3 py-2.5 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg">
            This model has no effort parameter.
          </p>
        )}
        {effortLevels && (
          <p className="text-xs text-gray-400">
            {fastOnly
              ? 'Fast settings only. Session memory and Live assist are not affected.'
              : 'Only the levels this model accepts. Higher is slower and more thorough.'}
          </p>
        )}
      </div>
    </div>
  )
}
