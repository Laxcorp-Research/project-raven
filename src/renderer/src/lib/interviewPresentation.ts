export interface InterviewPresentation {
  sayNow: string
  supporting: string
}

const SAY_NOW_MAX_WORDS = 55

export function buildInterviewPresentation(content: string): InterviewPresentation {
  const trimmed = content.trim()
  if (!trimmed) return { sayNow: '', supporting: '' }

  const codeFenceIndex = trimmed.indexOf('```')
  if (codeFenceIndex >= 0) {
    const preface = trimmed.slice(0, codeFenceIndex).trim()
    const sayNow = preface || 'I’ll start with a correct, testable implementation and then explain the tradeoffs.'
    return { sayNow: limitWords(sayNow, SAY_NOW_MAX_WORDS), supporting: trimmed }
  }

  const paragraphs = trimmed.split(/\n\s*\n/).filter(Boolean)
  if (paragraphs.length > 1 && wordCount(paragraphs[0]) <= SAY_NOW_MAX_WORDS) {
    return { sayNow: paragraphs[0].trim(), supporting: paragraphs.slice(1).join('\n\n').trim() }
  }

  const sentences = trimmed.match(/[^.!?\n]+(?:[.!?]+|$)/g)?.map((value) => value.trim()).filter(Boolean) || [trimmed]
  const selected: string[] = []
  for (const sentence of sentences) {
    if (selected.length >= 2 || wordCount([...selected, sentence].join(' ')) > SAY_NOW_MAX_WORDS) break
    selected.push(sentence)
  }
  if (selected.length === 0) selected.push(limitWords(sentences[0], SAY_NOW_MAX_WORDS))
  const sayNow = selected.join(' ').trim()
  const supporting = trimmed.slice(Math.min(trimmed.length, sayNow.length)).trim()
  return { sayNow, supporting }
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length
}

function limitWords(value: string, limit: number): string {
  const words = value.split(/\s+/).filter(Boolean)
  return words.length <= limit ? value.trim() : `${words.slice(0, limit).join(' ')}…`
}
