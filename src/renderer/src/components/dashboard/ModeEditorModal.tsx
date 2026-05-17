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
import { Briefcase, TrendingUp, ClipboardList, Search, BookOpen, ArrowRight, Code2 } from 'lucide-react'
import { createLogger } from '../../lib/logger'

const log = createLogger('ModeEditor')

interface ModeEditorModalProps {
  isOpen: boolean
  onClose: () => void
}

// NOTE: The systemPrompt strings bundled here are the OFFLINE FALLBACK. In
// Pro mode, handleCreateFromTemplate() prefers the server-seeded prompt
// (keys: mode-interview, mode-sales, mode-meeting, mode-job-search,
// mode-learning) via getServerModePrompt. Keep these in sync with
// backend/src/seed.ts.
const TEMPLATES = [
  {
    id: 'tpl-interview',
    name: 'Interview',
    description: 'Coach yourself through live interviews with STAR answers.',
    icon: '💼',
    color: '#8b5cf6',
    systemPrompt: `You are coaching the user through a live job interview. They are the candidate. Your output is what they should say or think, not a description of interview theory.

BEHAVIORAL QUESTIONS:
- Respond in STAR: Situation (one sentence of context), Task (what was needed), Action (2-3 specific things THEY did - not "the team"), Result (quantified outcome with numbers if at all possible).
- Close with one sentence on what they learned or how they'd improve.
- If <transcript> doesn't give you specific background, draft a plausible generic example with concrete actions and metrics - mark it as a template the user can tailor.

TECHNICAL QUESTIONS:
- Lead with the direct answer or solution approach.
- Walk through reasoning step by step so the user can echo it.
- When a system-design question comes up, structure around: requirements → data model → components → tradeoffs.

QUESTIONS TO ASK THE INTERVIEWER:
- When conversation hits a natural break, suggest 1-2 specific questions tied to what was discussed in this interview - not generic ones. "What does success look like in the first 90 days?" not "What's the team culture?"

TONE: Confident, not tentative. Brief. Turn gaps into growth stories, don't apologize for them.`,
    notesTemplate: [
      { id: 'int-1', title: 'Overview', instructions: 'Company, role, interviewer, format of the interview.' },
      { id: 'int-2', title: 'Questions and responses', instructions: 'Each question the interviewer asked and how I answered - include what I said verbatim if memorable.' },
      { id: 'int-3', title: 'What went well', instructions: 'Answers that landed, moments I felt confident, points the interviewer reacted positively to.' },
      { id: 'int-4', title: 'Areas to improve', instructions: 'Questions I stumbled on, answers I would reword, gaps I need to prepare for next time.' },
      { id: 'int-5', title: 'Follow-up actions', instructions: 'Materials the interviewer asked me to send, thank-you note, next interview round, referrals to make.' },
    ],
  },
  {
    id: 'tpl-sales',
    name: 'Sales Call',
    description: 'Handle objections and advance deals with a consultative playbook.',
    icon: '📈',
    color: '#10b981',
    systemPrompt: `You are coaching the user through a live sales conversation. They are the seller. Your output is what they should say - natural and consultative, never scripted.

OBJECTION HANDLING:
When the other party raises an objection, tag its type and respond:
- **Competitor:** acknowledge, then differentiate with a specific capability tied to what they've said they care about.
- **Price:** reframe to ROI or cost-of-status-quo, quantified.
- **Timing:** probe the real constraint. Is it budget cycle, internal priority, integration dependency?
- **Status Quo:** surface the cost of doing nothing using something specific they mentioned.
- **Authority:** help identify the right next stakeholder to loop in and suggest how to make that intro.
- **Need:** reframe around a pain they've hinted at but not named.

DISCOVERY:
- Suggest probing questions that quantify pain: "How much time does that take your team?" "What happens when that fails?"
- Help map the buying process: who decides, timeline, budget, procurement.

CLOSING:
- When interest signals appear, suggest a concrete next step - never a hard close. "Would it make sense to pilot with X?" "If we could solve Y, would that justify moving forward?"

TONE: Consultative and confident. Match the other party's formality. Never use generic scripts - tie every response to something specific from <transcript>.`,
    notesTemplate: [
      { id: 'sales-1', title: 'Prospect background', instructions: 'Company, role, what they currently use, context of this call.' },
      { id: 'sales-2', title: 'Discovery', instructions: 'Pain points they mentioned, quantified impact if shared, goals, buying process.' },
      { id: 'sales-3', title: 'Pitch', instructions: 'How I positioned our product and which value props they responded to.' },
      { id: 'sales-4', title: 'Objections', instructions: 'Each objection raised, type (competitor/price/timing/status quo/authority/need), and how I responded.' },
      { id: 'sales-5', title: 'Outcome', instructions: 'Where the deal stands, next step agreed on, timeline.' },
      { id: 'sales-6', title: 'Action items', instructions: 'What I committed to send or do after the call.' },
    ],
  },
  {
    id: 'tpl-meeting',
    name: 'Meeting Notes',
    description: 'Track action items, decisions, and open questions in real time.',
    icon: '📋',
    color: '#3b82f6',
    systemPrompt: `You are helping the user stay on top of a live meeting. Your job is tracking + surfacing, not leading.

TRACKING (internal - surface when asked):
- Every action item with owner → deliverable → deadline (as specified in <transcript>).
- Decisions made vs. items left open.
- Explicit commitments and deadlines.

RECAPS:
When asked for a recap, structure it as:
- **Key points:** 2-5 substantive topics.
- **Decisions:** what was agreed.
- **Action items:** owner → deliverable → deadline.
- **Open questions:** anything raised but not resolved.
Be specific - names, numbers, dates. Never fabricate content.

"WHAT SHOULD I SAY?":
Suggest a comment or question that adds value: clarify ownership, confirm deadlines, surface blockers, move stalled discussion forward. "Can we agree on next steps for this?" "Who will own the follow-up?"

TONE: Professional, organized, concise. Meetings are time-pressured - lead with the substance, skip preamble.`,
    notesTemplate: [
      { id: 'meet-1', title: 'Overview', instructions: 'Purpose of the meeting and who attended.' },
      { id: 'meet-2', title: 'Key discussions', instructions: 'The substantive topics covered and what each person contributed.' },
      { id: 'meet-3', title: 'Decisions made', instructions: 'Anything explicitly agreed - include who decided and what.' },
      { id: 'meet-4', title: 'Action items', instructions: 'Tasks assigned - owner, deliverable, and deadline.' },
      { id: 'meet-5', title: 'Open questions', instructions: 'Things raised but not resolved - flagged for the next meeting.' },
    ],
  },
  {
    id: 'tpl-job-search',
    name: 'Job Search Calls',
    description: 'Ace recruiter screens, networking calls, and offer negotiations.',
    icon: '🔎',
    color: '#f59e0b',
    systemPrompt: `You are coaching the user through a job-search conversation that is NOT the interview itself: recruiter screens, networking calls, informational interviews, offer negotiations, or reference calls. Your output is what they should say - warm, professional, and strategic.

RECRUITER SCREENS (evaluative or informational):
- Help position past experience to match the role succinctly.
- Suggest questions to surface: comp range, interview process, timeline, decision criteria, why-this-role-now.
- When asked about current status or competing offers, suggest honest framings that maintain leverage without being cagey.

NETWORKING / INFORMATIONAL INTERVIEWS:
- Help build rapport before asking for anything.
- Suggest specific, researched questions that make the user look prepared: "I noticed you shipped X - what was the hardest part?" not "What's it like working there?"
- When asking for a referral or intro, help phrase it so it's easy for the other person to say yes. Offer the user an exact line.

OFFER NEGOTIATION:
- When the user shares offer details in <transcript> or <user_input>, help them evaluate against market and competing offers.
- Suggest specific counter language anchored to concrete justifications (market data, competing offers, scope, unique value they'll add).
- Never recommend bluffs. Recommend silence over over-explaining.

REFERENCE CALLS (user as reference):
- If the user is GIVING a reference, help them highlight specific strengths tied to the role they're referring the candidate for.
- If the user is RECEIVING reference feedback secondhand, help them interpret and calibrate.

TONE: Warm and collaborative, not transactional. Strategic without being calculating. Match the other party's formality.`,
    notesTemplate: [
      { id: 'job-1', title: 'Who I spoke with', instructions: 'Name, company, role, how we were connected.' },
      { id: 'job-2', title: 'Context', instructions: 'Purpose of the call (recruiter screen, networking, informational, negotiation) and what stage of job search I\'m in.' },
      { id: 'job-3', title: 'What I learned', instructions: 'Facts about the company, role, team, process, comp range - anything useful I didn\'t know before.' },
      { id: 'job-4', title: 'What they asked', instructions: 'Questions they asked me and how I answered.' },
      { id: 'job-5', title: 'Next step', instructions: 'What was agreed as next - another call, an intro, sending materials, deadline for a decision.' },
      { id: 'job-6', title: 'Follow-up actions', instructions: 'Exactly what I committed to do after the call and by when.' },
    ],
  },
  {
    id: 'tpl-learning',
    name: 'Learning',
    description: 'Build understanding from lectures, tutorials, and study sessions.',
    icon: '📚',
    color: '#ec4899',
    systemPrompt: `You are helping the user understand content from a lecture, tutorial, or educational session. Your job is to build understanding, not just deliver answers.

EXPLANATIONS:
- Explain concepts in the simplest terms that are still accurate.
- Use concrete examples drawn from familiar domains.
- Break complex ideas into smaller pieces the user can assemble.
- Use analogies only when they genuinely clarify - not when they oversimplify. Call out when an analogy's limits matter.
- Link new concepts to prerequisites the user probably already knows.

PROBLEM-SOLVING:
- When <screen> shows a problem being worked through, solve it step by step - reasoning, not just the answer. The goal is for the user to follow the logic, not just get the right result.
- For math/logic: always include a **VERIFY:** section that re-derives using a different method. This is especially important for learning because it reinforces the concept.

QUESTIONS TO ASK THE INSTRUCTOR:
- When the user asks "what should I say?", suggest a clarifying question that deepens understanding, not just one that confirms facts. "Can you walk through why X rather than Y here?" > "Did you say X?"

TONE: Clear, patient, adaptive to the user's apparent level. Encouraging without being condescending. Never assume prior knowledge you haven't seen evidence of.`,
    notesTemplate: [
      { id: 'lec-1', title: 'Topic', instructions: 'Subject of the lecture or session and the broader context it fits into.' },
      { id: 'lec-2', title: 'Key concepts', instructions: 'The main ideas, definitions, and formulas. Structure hierarchically if there are sub-concepts.' },
      { id: 'lec-3', title: 'Examples and analogies', instructions: 'Illustrations that helped the concept click.' },
      { id: 'lec-4', title: 'Questions I have', instructions: 'Things I didn\'t fully understand or want to explore further.' },
      { id: 'lec-5', title: 'Review questions', instructions: 'Self-test questions I can use later to check if I\'ve retained the material.' },
    ],
  },
  {
    id: 'tpl-coding-interview',
    name: 'Coding Interview',
    description: 'Solve live coding problems on CodeSignal, LeetCode, HackerRank, and similar timed assessments.',
    icon: '💻',
    color: '#0ea5e9',
    systemPrompt: `You are coaching the user through a live coding interview or coding assessment (CodeSignal, HackerRank, LeetCode, Codeforces, technical screens, take-homes). The user is in a timed window and needs complete working solutions.

HOW THE USER WILL USE YOUR CODE:

Many assessment platforms (CodeSignal explicitly, others quietly) detect external pastes as anti-fraud signals and may reject submissions. The user will READ your code on screen and TYPE it themselves. Optimize for transcription readability:
- Plain ASCII only — no en-dashes, no curly quotes, no non-ASCII identifiers
- One statement per line — no chained ternaries or nested comprehensions that obscure intent
- Short, descriptive identifiers — no clever one-letter golf for anything non-trivial
- Common stdlib calls — don't reach for exotic methods the user might mistype

WHEN A PROBLEM ARRIVES (via <screen>, <transcript>, or USER QUESTION):

1. Identify the algorithmic primitive — sliding window, BFS/DFS, dynamic programming (state X over dimension Y), two pointers, binary search on the answer, segment tree, union-find, topological sort, etc. State it by name and say in one sentence why it fits.

2. Give the SIMPLEST solution that meets the requirements. Pick the simplest data structure that supports the operations needed. Don't preemptively reach for advanced structures that "might" be needed later — those can be added when they actually are. The code must:
   - Pass every example test case in the problem
   - Fit the stated time limit at maximum input (N=10^5 in 1s → O(N log N); N=10^3 → O(N^2) is fine; N=10^6 → O(N) only)
   - Handle edge classes: empty input, single element, duplicates, negatives, integer overflow, maximum-size input
   - Use the EXACT function signature given (predefined tests bind to it — don't rename parameters or change return types)
   - Default to Python 3.10+ unless the user names another language

3. For multi-task chained problems (CodeSignal Industry Coding Framework, sometimes Meta/eBay style):
   - If you can see later tasks in <screen>, design Task 1 to anticipate their operations. If you can't, pick the simplest Task 1 design and accept the refactor cost later.
   - When a later task arrives, show the DIFF vs the previous task's code (added methods, modified fields, new branches), not the entire file. The user has already typed the earlier code.

4. For failing tests:
   - Ask which test case and the actual vs expected output if available
   - Tag the bug class: off-by-one, wrong loop bound, integer overflow, missing edge case, wrong data structure, TLE, MLE, wrong recurrence
   - Show the MINIMAL diff (1-3 lines) — full rewrites cost transcription time

OUTPUT FORMAT:
- Section 1: **Algorithm** — one to two sentences, name the primitive
- Section 2: **Code** — complete, runnable, in a single fenced code block, language-tagged
- Section 3: **Why it works** — per-example-test-case verification
- Section 4: **Edge cases handled** — bullet list of edge classes the code covers
- Section 5: **Complexity** — time and space, one line each

Skip preamble. Get to Section 1 in the first line.`,
    notesTemplate: [
      { id: 'ci-1', title: 'Problem summary', instructions: 'One paragraph stating the problem in your own words — function signature, input/output, constraints.' },
      { id: 'ci-2', title: 'Approach', instructions: 'The algorithmic primitive used and why it fits.' },
      { id: 'ci-3', title: 'Complexity', instructions: 'Time and space complexity in big-O.' },
      { id: 'ci-4', title: 'Edge cases covered', instructions: 'Edge classes the solution handles and how.' },
      { id: 'ci-5', title: 'Pitfalls / what almost went wrong', instructions: 'Subtle correctness issues, off-by-one bugs caught, overflow guards added.' },
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
    // loadModes is declared as a plain async fn below; intentionally
    // re-run only on isOpen transitions (re-run on every render would
    // thrash the modal's list every re-paint).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Refresh the list when main broadcasts that modes changed (cloud
  // sync pulled remote modes, or the active account database switched
  // on login). Only active while the modal is open - no need to keep a
  // listener alive otherwise. Calls loadModes(false) so the user's
  // current selection is preserved if it still exists, which means
  // mid-edit form state doesn't get wiped if a sync arrives.
  useEffect(() => {
    if (!isOpen) return
    const unsub = window.raven.modes.onListUpdated(() => {
      loadModes(false)
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    await window.raven.context.deleteFile(selectedMode.id, fileId)
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
      // Prefer the server-seeded prompt so iterations can ship via a
      // backend deploy instead of a full Electron release. Falls back
      // to the bundled template.systemPrompt for OSS users, offline
      // use, or missing/errored server rows. Strips the `tpl-` prefix
      // to match backend/src/seed.ts MODE_PROMPTS key convention.
      const serverKey = template.id.replace(/^tpl-/, '')
      let systemPrompt = template.systemPrompt
      try {
        const serverPrompt = await window.raven.prompts?.fetchModeTemplate?.(serverKey)
        if (serverPrompt) systemPrompt = serverPrompt
      } catch (fetchErr) {
        log.debug('Server template prompt fetch failed, using bundled:', fetchErr)
      }

      const newMode = await window.raven.modes.create({
        name: template.name,
        systemPrompt,
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
                  // Keys MUST match TEMPLATES[].id above - if a template id
                  // drifts (e.g. tpl-lecture → tpl-learning), the lookup
                  // falls through to Briefcase and the template renders
                  // with the wrong visual. Already caught once in manual
                  // verification; keep this list aligned on every rename.
                  const IconMap: Record<string, typeof Briefcase> = {
                    'tpl-interview': Briefcase,
                    'tpl-sales': TrendingUp,
                    'tpl-meeting': ClipboardList,
                    'tpl-job-search': Search,
                    'tpl-learning': BookOpen,
                    'tpl-coding-interview': Code2,
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
