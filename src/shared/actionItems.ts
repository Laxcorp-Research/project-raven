/**
 * Shared action-item shape + parser.
 *
 * The notes model returns action items as a JSON array of
 * {task, assignee, deadline} (see INSIGHT_PROMPTS.action_items in
 * insightsService). The model sometimes wraps the array in a ```json fence
 * or emits stray text, so parsing is defensive: anything that is not a
 * well-formed array of tasks yields an empty list rather than throwing.
 *
 * Used by the main process to validate/normalize before persisting, and by
 * the renderer to render the checklist. Keeping it in shared/ guarantees both
 * sides agree on the shape.
 */

export interface ActionItem {
  task: string
  assignee: string | null
  deadline: string | null
  /** Whether the user has checked this item off. Only stored when true. */
  done?: boolean
}

function cleanField(value: unknown): string | null {
  if (value == null) return null
  const str = String(value).trim()
  if (!str) return null
  // Models sometimes emit the literal string "null"/"none" for empty fields.
  if (str.toLowerCase() === 'null' || str.toLowerCase() === 'none') return null
  return str
}

/**
 * Parse the raw model output (or a stored JSON string) into a clean list of
 * action items. Returns [] for null/blank/malformed input.
 */
export function parseActionItems(raw: string | null | undefined): ActionItem[] {
  if (!raw || typeof raw !== 'string') return []

  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  if (!text) return []

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return []
  }

  if (!Array.isArray(data)) return []

  const items: ActionItem[] = []
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const task = cleanField(record.task)
    if (!task) continue
    const item: ActionItem = {
      task,
      assignee: cleanField(record.assignee),
      deadline: cleanField(record.deadline),
    }
    // Only carry `done` when explicitly true, so unchecked items serialize to
    // the same {task, assignee, deadline} shape as before (clean round-trip).
    if (record.done === true) item.done = true
    items.push(item)
  }
  return items
}

/**
 * Normalize raw model output to a canonical JSON string for storage, or null
 * when there are no valid items (so the DB column stays NULL rather than
 * holding "[]" or garbage).
 */
export function normalizeActionItemsForStorage(raw: string | null | undefined): string | null {
  const items = parseActionItems(raw)
  return items.length > 0 ? JSON.stringify(items) : null
}
