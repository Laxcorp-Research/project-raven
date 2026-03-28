/**
 * Mode Editor Modal - Cluely-style design
 * - Templates create new modes (not editable directly)
 * - Mode list shows only user-created modes
 * - Active mode indicator with checkmark
 */

import { useState, useEffect, useRef, type DragEvent } from 'react'
import type { Mode, NotesSection } from '../../types/global'
import { ConfirmModal } from '../shared/ConfirmModal'
import { Toast } from '../shared/Toast'
import { Briefcase, TrendingUp, ClipboardList, Target, BookOpen, ArrowRight } from 'lucide-react'
import { createLogger } from '../../lib/logger'

const log = createLogger('ModeEditor')

interface ModeEditorModalProps {
  isOpen: boolean
  onClose: () => void
}

const TEMPLATES = [
  {
    id: 'tpl-interview',
    name: 'Interview',
    description: 'Answer interview questions with confidence and clarity.',
    icon: '💼',
    color: '#8b5cf6',
    systemPrompt: `You are an expert interview coach helping someone during a live job interview.

Your role:
- Help formulate strong answers to interview questions
- Use the STAR method (Situation, Task, Action, Result) for behavioral questions
- Provide concise, confident response suggestions
- Help with technical explanations when needed

Guidelines:
- Keep suggestions brief (2-4 sentences) unless more detail is needed
- Be direct and actionable - the user needs to respond quickly
- Focus on highlighting achievements and relevant experience
- Maintain professional, confident tone`,
    notesTemplate: [
      { id: 'int-1', title: 'Overview', instructions: 'Overview of the interview, the company, and general structure.' },
      { id: 'int-2', title: 'Questions and responses', instructions: 'All questions asked during the interview and answers given.' },
      { id: 'int-3', title: 'Follow-up actions', instructions: 'Next interview steps or additional materials to send if applicable.' },
      { id: 'int-4', title: 'Areas to improve', instructions: 'What could have been done better during the interview.' },
    ],
  },
  {
    id: 'tpl-sales',
    name: 'Sales',
    description: 'Close deals with strategic discovery and objection handling.',
    icon: '📈',
    color: '#10b981',
    systemPrompt: `You are a sales coach helping during a live sales call or meeting.

Your role:
- Help handle objections smoothly and professionally
- Suggest ways to reinforce value propositions
- Identify opportunities to advance the deal
- Help build rapport and trust

Guidelines:
- Keep suggestions brief and natural-sounding
- Focus on understanding customer needs
- Help pivot objections into opportunities
- Maintain a consultative, not pushy, tone`,
    notesTemplate: [
      { id: 'sales-1', title: 'Prospect background', instructions: 'Background and context on who I was selling to.' },
      { id: 'sales-2', title: 'Discovery', instructions: 'What the prospect said during discovery.' },
      { id: 'sales-3', title: 'Product', instructions: 'How I pitched the product and the prospect\'s reaction.' },
      { id: 'sales-4', title: 'Objections', instructions: 'Objections from the prospect if there were any.' },
      { id: 'sales-5', title: 'Outcome', instructions: 'Did I close the sale and what was the outcome of the conversation.' },
      { id: 'sales-6', title: 'Action Items', instructions: 'All action items that were said I would do after the meeting.' },
    ],
  },
  {
    id: 'tpl-meeting',
    name: 'Team Meet',
    description: 'Track action items and key decisions from meetings.',
    icon: '📋',
    color: '#3b82f6',
    systemPrompt: `You are a meeting assistant helping capture and organize information during a live meeting.

Your role:
- Identify and summarize key discussion points
- Track action items and who's responsible
- Note important decisions made
- Help with quick recaps when asked

Guidelines:
- Be concise and well-organized
- Use bullet points for clarity
- Attribute action items to specific people when mentioned
- Focus on what's actionable`,
    notesTemplate: [
      { id: 'meet-1', title: 'Overview', instructions: 'High-level summary of the meeting purpose and attendees.' },
      { id: 'meet-2', title: 'Key discussions', instructions: 'Main topics discussed during the meeting.' },
      { id: 'meet-3', title: 'Decisions made', instructions: 'Any decisions that were finalized during the meeting.' },
      { id: 'meet-4', title: 'Action items', instructions: 'Tasks assigned with owners and deadlines if mentioned.' },
      { id: 'meet-5', title: 'Open questions', instructions: 'Questions that need follow-up or weren\'t resolved.' },
    ],
  },
  {
    id: 'tpl-job-search',
    name: 'Looking for Work',
    description: 'Answer interview questions with confidence and clarity.',
    icon: '🎯',
    color: '#f59e0b',
    systemPrompt: `I am a candidate interviewing for a position. Help me answer questions during the interview. If there is code, include line-by-line comments. If a behavioral question involves an example, respond with one specific example story.`,
    notesTemplate: [
      { id: 'job-1', title: 'Overview', instructions: 'Overview of the interview, the company, and general structure.' },
      { id: 'job-2', title: 'Questions and responses', instructions: 'All questions asked to me during the interview and answers that gave.' },
      { id: 'job-3', title: 'Follow-up actions', instructions: 'Next interview steps or additional materials I said I would send if applicable.' },
      { id: 'job-4', title: 'Areas to improve', instructions: 'What I could have done better during the interview.' },
    ],
  },
  {
    id: 'tpl-lecture',
    name: 'Lecture',
    description: 'Capture key concepts and content from lectures.',
    icon: '📚',
    color: '#ec4899',
    systemPrompt: `You are a learning assistant helping someone understand content from a lecture, tutorial, or educational material.

Your role:
- Explain complex concepts in simple terms
- Provide examples and analogies
- Answer questions about the material
- Help connect new information to existing knowledge

Guidelines:
- Adapt explanations to the apparent level of the learner
- Use concrete examples whenever possible
- Break down complex ideas into smaller parts
- Be patient and supportive`,
    notesTemplate: [
      { id: 'lec-1', title: 'Topic overview', instructions: 'Main subject and context of the lecture.' },
      { id: 'lec-2', title: 'Key concepts', instructions: 'Important concepts and definitions covered.' },
      { id: 'lec-3', title: 'Examples', instructions: 'Examples and case studies mentioned.' },
      { id: 'lec-4', title: 'Questions to review', instructions: 'Questions to help study and review the material.' },
    ],
  },
]

export function ModeEditorModal({ isOpen, onClose }: ModeEditorModalProps) {
  const [modes, setModes] = useState<Mode[]>([])
  const [activeMode, setActiveMode] = useState<Mode | null>(null)
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; mode: Mode | null }>({
    isOpen: false,
    mode: null,
  })
  const [toast, setToast] = useState<{ message: string; type: 'loading' | 'success' | 'error' } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const [formName, setFormName] = useState('')
  const [formPrompt, setFormPrompt] = useState('')
  const [formNotesTemplate, setFormNotesTemplate] = useState<NotesSection[] | null>(null)
  const [contextFiles, setContextFiles] = useState<Array<{ id: string; fileName: string; fileSize: number; fileType: string; chunkCount: number }>>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ stage: string; current: number; total: number } | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  useEffect(() => {
    if (isOpen) {
      setToast(null)
      setShowTemplates(false)
      loadModes(true)
    }
  }, [isOpen])

  useEffect(() => {
    if (selectedMode) {
      setFormName(selectedMode.name)
      setFormPrompt(selectedMode.systemPrompt)
      setFormNotesTemplate(selectedMode.notesTemplate ? [...selectedMode.notesTemplate] : null)
      loadContextFiles(selectedMode.id)
    } else {
      setContextFiles([])
    }
  }, [selectedMode])

  async function loadContextFiles(modeId: string) {
    try {
      const files = await window.raven.context.getFiles(modeId)
      setContextFiles(files)
    } catch {
      setContextFiles([])
    }
  }

  async function handleUploadContextFile() {
    if (!selectedMode || isUploading) return
    try {
      const selected = await window.raven.context.selectFile()
      if (!selected) return

      if (selected.fileSize > 10 * 1024 * 1024) {
        alert('File size must be under 10MB')
        return
      }

      setIsUploading(true)
      setUploadProgress({ stage: 'parsing', current: 0, total: 1 })

      const unsub = window.raven.context.onUploadProgress((data) => {
        setUploadProgress(data)
      })

      const result = await window.raven.context.uploadFile(
        selectedMode.id,
        selected.filePath,
        selected.fileName,
        selected.fileSize
      )

      unsub()
      setIsUploading(false)
      setUploadProgress(null)

      if (result.success) {
        await loadContextFiles(selectedMode.id)
      } else {
        alert(result.error || 'Upload failed')
      }
    } catch (err: unknown) {
      setIsUploading(false)
      setUploadProgress(null)
      const msg = err instanceof Error ? err.message : 'Upload failed'
      alert(msg)
    }
  }

  async function handleDeleteContextFile(fileId: string) {
    if (!selectedMode) return
    await window.raven.context.deleteFile(fileId)
    await loadContextFiles(selectedMode.id)
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function loadModes(resetSelection = false) {
    try {
      setIsLoading(true)
      const [allModes, active] = await Promise.all([
        window.raven.modes.getAll(),
        window.raven.modes.getActive(),
      ])
      const userModes = allModes.filter((mode) => !mode.isBuiltin)
      setModes(userModes)
      setActiveMode(active && !active.isBuiltin ? active : null)

      if (userModes.length > 0 && (resetSelection || !selectedMode)) {
        const activeInList = active ? userModes.find((m) => m.id === active.id) : null
        setSelectedMode(activeInList || userModes[0])
      } else if (userModes.length === 0) {
        setSelectedMode(null)
        setShowTemplates(true)
      }
    } catch (err) {
      log.error('Failed to load modes:', err)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSave() {
    if (!selectedMode) return

    try {
      setIsSaving(true)
      await window.raven.modes.update(selectedMode.id, {
        name: formName.trim() || 'Untitled Mode',
        systemPrompt: formPrompt,
        notesTemplate: formNotesTemplate,
      })
      await loadModes()

      const updated = await window.raven.modes.get(selectedMode.id)
      if (updated) setSelectedMode(updated)

      setToast({ message: 'Mode saved', type: 'success' })
    } catch (err) {
      log.error('Failed to save:', err)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleCreateBlank() {
    try {
      const newMode = await window.raven.modes.create({
        name: 'Untitled Mode',
        systemPrompt: '',
        icon: '📝',
        color: '#6b7280',
        isDefault: false,
        isBuiltin: false,
        notesTemplate: null,
      })
      await loadModes()
      setSelectedMode(newMode)
      setShowTemplates(false)
    } catch (err) {
      log.error('Failed to create mode:', err)
    }
  }

  async function handleCreateFromTemplate(template: typeof TEMPLATES[0]) {
    try {
      const newMode = await window.raven.modes.create({
        name: template.name,
        systemPrompt: template.systemPrompt,
        icon: template.icon,
        color: template.color,
        isDefault: false,
        isBuiltin: false,
        notesTemplate: template.notesTemplate || null,
      })
      await loadModes()
      setSelectedMode(newMode)
      setShowTemplates(false)
    } catch (err) {
      log.error('Failed to create from template:', err)
    }
  }

  async function handleSetActive() {
    if (!selectedMode) return
    try {
      await window.raven.modes.setActive(selectedMode.id)
      setActiveMode(selectedMode)
      await loadModes()
    } catch (err) {
      log.error('Failed to set active:', err)
    }
  }

  function handleDelete() {
    if (!selectedMode) return
    setDeleteModal({ isOpen: true, mode: selectedMode })
    setMenuOpen(false)
  }

  async function handleConfirmDelete() {
    const modeToDelete = deleteModal.mode
    setDeleteModal({ isOpen: false, mode: null })
    if (!modeToDelete) return

    setToast({ message: 'Deleting mode...', type: 'loading' })

    try {
      const [result] = await Promise.all([
        window.raven.modes.delete(modeToDelete.id),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ])

      if (!result.success) {
        setToast({ message: result.error || 'Failed to delete mode', type: 'error' })
        return
      }

      setToast({ message: 'Deleted mode', type: 'success' })

      const remainingModes = modes.filter((mode) => mode.id !== modeToDelete.id)
      if (remainingModes.length > 0) {
        setSelectedMode(remainingModes[0])
      } else {
        setSelectedMode(null)
        setShowTemplates(true)
      }

      await loadModes()
    } catch (err) {
      log.error('Failed to delete:', err)
      setToast({ message: 'Failed to delete mode', type: 'error' })
    }
  }

  function handleAddNotesTemplate() {
    setFormNotesTemplate([
      { id: globalThis.crypto.randomUUID(), title: 'Action Items', instructions: 'All action items that were said I would do after the meeting.' },
      { id: globalThis.crypto.randomUUID(), title: 'Summary', instructions: 'Concise overview of the conversation and any note-worthy points that were mentioned.' },
      { id: globalThis.crypto.randomUUID(), title: 'Background', instructions: 'Context about the conversation and the people involved.' },
      { id: globalThis.crypto.randomUUID(), title: 'Questions', instructions: 'All questions and responses that were asked to me during the conversation.' },
      { id: globalThis.crypto.randomUUID(), title: 'Overview', instructions: 'Detailed overview and notes of the conversation, including any deadlines, specifics, or key points.' },
    ])
  }

  function handleRemoveNotesTemplate() {
    setFormNotesTemplate(null)
  }

  function handleAddSection() {
    if (!formNotesTemplate) return
    setFormNotesTemplate([
      ...formNotesTemplate,
      { id: globalThis.crypto.randomUUID(), title: 'Section title', instructions: 'Instructions for Raven' },
    ])
  }

  function handleUpdateSection(id: string, field: 'title' | 'instructions', value: string) {
    if (!formNotesTemplate) return
    setFormNotesTemplate(
      formNotesTemplate.map((section) => (section.id === id ? { ...section, [field]: value } : section))
    )
  }

  function handleDeleteSection(id: string) {
    if (!formNotesTemplate) return
    const updated = formNotesTemplate.filter((section) => section.id !== id)
    setFormNotesTemplate(updated.length > 0 ? updated : null)
  }

  function handleDragStart(index: number) {
    setDraggedIndex(index)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, index: number) {
    event.preventDefault()
    if (draggedIndex === null || draggedIndex === index || !formNotesTemplate) return

    const newTemplate = [...formNotesTemplate]
    const [removed] = newTemplate.splice(draggedIndex, 1)
    newTemplate.splice(index, 0, removed)
    setFormNotesTemplate(newTemplate)
    setDraggedIndex(index)
  }

  function handleDragEnd() {
    setDraggedIndex(null)
  }

  if (!isOpen) return null

  const isActive = selectedMode?.id === activeMode?.id

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white rounded-xl shadow-2xl w-[95vw] max-w-[900px] h-[85vh] max-h-[650px] min-h-[400px] flex overflow-hidden">
        <div className="w-64 min-w-[200px] border-r border-gray-200 flex flex-col bg-white">
          <button
            onClick={onClose}
            className="absolute top-3 left-3 p-1 text-gray-400 hover:text-gray-600 z-10"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="p-4 pt-12">
            <button
              onClick={handleCreateBlank}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
            >
              <span>+</span>
              <span>New Mode</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {isLoading ? (
              <div className="px-4 py-2 text-sm text-gray-500">Loading...</div>
            ) : modes.length === 0 ? (
              <div className="px-4 py-2 text-sm text-gray-500">No modes yet</div>
            ) : (
              <div className="py-1">
                {modes.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => {
                      setSelectedMode(mode)
                      setShowTemplates(false)
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${
                      selectedMode?.id === mode.id && !showTemplates
                        ? 'bg-gray-100 font-medium'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="flex-1 truncate">{mode.name}</span>
                    {mode.id === activeMode?.id && (
                      <svg className="w-4 h-4 text-blue-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-gray-200">
            <button
              onClick={() => setShowTemplates(true)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                showTemplates
                  ? 'bg-gray-100 text-gray-900 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span>Templates</span>
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {showTemplates ? (
            <div className="flex-1 overflow-y-auto p-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">Raven Modes</h2>
              <p className="text-gray-500 mb-6">Get started by selecting a template or start from an empty mode.</p>

              <div className="border-t border-gray-200 pt-5 space-y-2">
                {TEMPLATES.map((template) => {
                  const IconMap: Record<string, typeof Briefcase> = {
                    'tpl-interview': Briefcase,
                    'tpl-sales': TrendingUp,
                    'tpl-meeting': ClipboardList,
                    'tpl-job-search': Target,
                    'tpl-lecture': BookOpen,
                  }
                  const Icon = IconMap[template.id] || Briefcase

                  return (
                    <button
                      key={template.id}
                      onClick={() => handleCreateFromTemplate(template)}
                      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-gray-50 transition-colors text-left group"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${template.color}12` }}
                      >
                        <Icon size={20} style={{ color: template.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{template.name}</span>
                          <ArrowRight size={14} className="text-gray-400 transition-transform duration-200 group-hover:translate-x-0.5" />
                        </div>
                        <p className="text-sm text-gray-500 truncate">{template.description}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : selectedMode ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-start justify-between p-6 pb-0">
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="text-2xl font-semibold text-gray-900 bg-transparent border-0 outline-none focus:ring-0 p-0 w-full max-w-md"
                  placeholder="Mode name"
                />

                <div className="flex items-center gap-2 shrink-0">
                  {isActive ? (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Active
                    </span>
                  ) : (
                    <button
                      onClick={handleSetActive}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Set active
                    </button>
                  )}

                  <div className="relative" ref={menuRef}>
                    <button
                      onClick={() => setMenuOpen(!menuOpen)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>

                    {menuOpen && (
                      <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10">
                        <button
                          onClick={handleDelete}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete Mode
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-gray-700">
                    Real-time prompt
                  </label>
                  <div className="relative">
                    <textarea
                      value={formPrompt}
                      onChange={(e) => setFormPrompt(e.target.value)}
                      rows={10}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      placeholder="Instructions for the AI when this mode is active..."
                    />
                    <div className="flex items-center justify-between mt-2">
                      <div className="relative group">
                        <button
                          onClick={handleUploadContextFile}
                          disabled={isUploading}
                          className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                        </button>
                        <div className="absolute top-full left-0 mt-1 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                          Upload files as context
                        </div>
                      </div>
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>

                    {/* Upload progress */}
                    {isUploading && uploadProgress && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        <span>
                          {uploadProgress.stage === 'parsing' && 'Parsing file...'}
                          {uploadProgress.stage === 'chunking' && 'Splitting into chunks...'}
                          {uploadProgress.stage === 'embedding' && `Embedding chunks (${uploadProgress.current}/${uploadProgress.total})...`}
                          {uploadProgress.stage === 'storing' && `Storing (${uploadProgress.current}/${uploadProgress.total})...`}
                        </span>
                      </div>
                    )}

                    {/* Uploaded context files */}
                    {contextFiles.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {contextFiles.map((file) => (
                          <div
                            key={file.id}
                            className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg group"
                          >
                            <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                              <span className="text-[10px] font-semibold text-gray-500 uppercase">
                                {file.fileType.includes('pdf') ? 'PDF' : file.fileType.includes('docx') || file.fileType.includes('word') ? 'DOC' : file.fileName.split('.').pop()?.toUpperCase() || 'TXT'}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-900 truncate">{file.fileName}</p>
                              <p className="text-xs text-gray-400">{file.chunkCount} chunks · {(file.fileSize / 1024).toFixed(0)}KB</p>
                            </div>
                            <button
                              onClick={() => handleDeleteContextFile(file.id)}
                              className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes Template Section */}
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-medium text-gray-900">Notes template</h4>
                    {formNotesTemplate && (
                      <button
                        onClick={handleRemoveNotesTemplate}
                        className="text-sm text-gray-500 hover:text-gray-700"
                      >
                        Remove template
                      </button>
                    )}
                  </div>

                  {formNotesTemplate ? (
                    <div className="space-y-2">
                      {formNotesTemplate.map((section, index) => (
                        <div
                          key={section.id}
                          draggable
                          onDragStart={() => handleDragStart(index)}
                          onDragOver={(event) => handleDragOver(event, index)}
                          onDragEnd={handleDragEnd}
                          className={`group flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg cursor-move transition-shadow ${
                            draggedIndex === index ? 'shadow-lg opacity-50' : 'hover:shadow-sm'
                          }`}
                        >
                          <div className="mt-1 text-gray-300 cursor-grab active:cursor-grabbing">
                            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                              <circle cx="4" cy="3" r="1.5" />
                              <circle cx="4" cy="8" r="1.5" />
                              <circle cx="4" cy="13" r="1.5" />
                              <circle cx="10" cy="3" r="1.5" />
                              <circle cx="10" cy="8" r="1.5" />
                              <circle cx="10" cy="13" r="1.5" />
                            </svg>
                          </div>

                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={section.title}
                              onChange={(e) => handleUpdateSection(section.id, 'title', e.target.value)}
                              className="w-full text-sm font-medium text-gray-900 bg-transparent border-0 outline-none p-0 focus:ring-0"
                              placeholder="Section title"
                            />
                            <input
                              type="text"
                              value={section.instructions}
                              onChange={(e) => handleUpdateSection(section.id, 'instructions', e.target.value)}
                              className="w-full text-sm text-gray-500 bg-transparent border-0 outline-none p-0 mt-0.5 focus:ring-0"
                              placeholder="Instructions for Raven"
                            />
                          </div>

                          <button
                            onClick={() => handleDeleteSection(section.id)}
                            className="p-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}

                      <button
                        onClick={handleAddSection}
                        className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        <span>+</span>
                        <span>Add section</span>
                      </button>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-sm text-gray-500 mb-3">Add a template for custom formatting for your notes</p>
                      <button
                        onClick={handleAddNotesTemplate}
                        className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                      >
                        Add template +
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Select a mode or create a new one
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={`Delete "${deleteModal.mode?.name}"?`}
        message="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteModal({ isOpen: false, mode: null })}
        variant="danger"
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onComplete={() => setToast(null)}
        />
      )}
    </div>
  )
}
