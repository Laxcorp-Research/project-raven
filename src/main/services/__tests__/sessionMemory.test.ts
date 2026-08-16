import { describe, expect, it } from 'vitest'
import {
  acceptMemoryText,
  buildMemoryUpdatePrompt,
  buildPinnedSystemBlock,
  buildReplayMessages,
  buildTranscriptBlock,
  captureOpeningTranscript,
  createEmptyMemory,
  digestUserTurn,
  MEMORY_UPDATE_PROMPT,
  openingStillVisible,
  pinOpeningIfNeeded,
  pinUserQuestion,
  selectRecentTurns,
  shouldRefreshMemory,
  shiftMemoryAfterTrim,
  transcriptDeltaForMemory,
  truncateForReplay,
  ASSISTANT_REPLAY_CHAR_LIMIT,
  USER_PIN_LIMIT,
} from '../ai/sessionMemory'

describe('opening pin (problem statement must survive a 2h tail)', () => {
  it('captures the START of the transcript, not the latest lines', () => {
    const lines = [
      'Interviewer: Implement LRU cache, O(1) get and put',
      ...Array.from({ length: 200 }, (_, i) => `Later chatter ${i}`),
    ]
    const opening = captureOpeningTranscript(lines.join('\n'))
    expect(opening).toContain('Implement LRU cache')
    expect(opening).not.toContain('Later chatter 199')
  })

  it('pins opening only once', () => {
    const first = pinOpeningIfNeeded(createEmptyMemory(), 'Them: two sum on sorted array')
    const second = pinOpeningIfNeeded(first, 'Them: ignore that, do three sum')
    expect(second.openingTranscript).toContain('two sum')
    expect(second.openingTranscript).not.toContain('three sum')
  })

  it('treats opening as invisible once the now-window has moved on', () => {
    const opening = 'Interviewer: Implement LRU cache, O(1) get and put\nUser: ok'
    const now = Array.from({ length: 40 }, (_, i) => `Line ${i}`).join('\n')
    expect(openingStillVisible(opening, now)).toBe(false)
    expect(openingStillVisible(opening, `${opening}\nmore`)).toBe(true)
  })
})

describe('user question pins', () => {
  it('keeps typed questions verbatim and dedupes', () => {
    let mem = createEmptyMemory()
    mem = pinUserQuestion(mem, '  What is the time complexity?  ')
    mem = pinUserQuestion(mem, 'What is the time complexity?')
    mem = pinUserQuestion(mem, 'Handle the empty array')
    expect(mem.userPins).toEqual([
      'What is the time complexity?',
      'Handle the empty array',
    ])
  })

  it('caps pins so a 2h session cannot grow unbounded', () => {
    let mem = createEmptyMemory()
    for (let i = 0; i < USER_PIN_LIMIT + 10; i++) {
      mem = pinUserQuestion(mem, `Q${i}`)
    }
    expect(mem.userPins).toHaveLength(USER_PIN_LIMIT)
    expect(mem.userPins[0]).toBe('Q10')
    expect(mem.userPins.at(-1)).toBe(`Q${USER_PIN_LIMIT + 9}`)
  })
})

describe('transcript block (no full+delta duplicate)', () => {
  it('sends the windowed transcript on the first turn', () => {
    const block = buildTranscriptBlock({
      transcript: 'Alice: Hi\nThem: Hello',
      lastProcessedLength: 0,
      isFirstTurn: true,
      nowLineLimit: 300,
    })
    expect(block).toContain('<transcript>')
    expect(block).toContain('Alice: Hi\nThem: Hello')
    expect(block).not.toContain('NEW SINCE LAST')
    expect(block).not.toContain('[FULL TRANSCRIPT]')
  })

  it('on later turns sends NEW + RECENT TAIL, not a second full copy', () => {
    const block = buildTranscriptBlock({
      transcript: 'Old stuff. Brand new content here',
      lastProcessedLength: 10,
      isFirstTurn: false,
      nowLineLimit: 300,
    })
    expect(block).toContain('NEW SINCE LAST')
    expect(block).toContain('[RECENT TAIL]')
    expect(block).not.toContain('[FULL TRANSCRIPT]')
    expect(block).toContain('Brand new content here')
  })

  it('marks an unchanged transcript instead of resending a fake delta', () => {
    const block = buildTranscriptBlock({
      transcript: 'Same old text',
      lastProcessedLength: 100,
      isFirstTurn: false,
      nowLineLimit: 300,
    })
    expect(block).toContain('note="unchanged_since_last"')
  })
})

describe('user turn digest', () => {
  it('stores the typed question, not the Assist button label', () => {
    expect(digestUserTurn({
      actionLabel: 'Question',
      customPrompt: 'Why did we pick two pointers?',
      transcript: 'lots of speech',
    })).toBe('Why did we pick two pointers?')
  })

  it('for Assist, keeps a transcript tail so history is not just "Assist"', () => {
    const digest = digestUserTurn({
      actionLabel: 'Assist',
      transcript: 'please write the binary search',
    })
    expect(digest).toContain('Assist')
    expect(digest).toContain('binary search')
  })
})

describe('replay window', () => {
  it('keeps only the newest turns so old dumps do not rot the prompt', () => {
    const msgs = Array.from({ length: 20 }, (_, i) => i)
    expect(selectRecentTurns(msgs, 8)).toEqual([12, 13, 14, 15, 16, 17, 18, 19])
  })

  it('caps a huge prior coding answer instead of replaying 128k tokens', () => {
    const huge = 'x'.repeat(ASSISTANT_REPLAY_CHAR_LIMIT + 500)
    const cut = truncateForReplay('assistant', huge)
    expect(cut.length).toBeLessThan(huge.length)
    expect(cut).toContain('truncated')
  })

  it('replays user digest + truncated assistant + current turn', () => {
    const messages = buildReplayMessages({
      history: [
        { role: 'user', content: 'Assist', digest: 'Assist: two sum' },
        { role: 'assistant', content: 'Use a hashmap' },
        { role: 'user', content: 'Assist', digest: 'Assist: follow up' },
      ],
      currentUserMessage: 'current',
      screenshot: null,
    })
    expect(messages).toHaveLength(3)
    expect(messages[0].content).toContain('two sum')
    expect(messages[1].content).toBe('Use a hashmap')
    expect(messages[2].content).toBe('current')
  })
})

describe('pinned system block', () => {
  it('injects memory, opening, and typed questions so a window trim cannot drop them', () => {
    const mem = {
      ...createEmptyMemory(),
      text: '## User Intent\nSolve LRU\n## Problem / Interview Task\nO(1)',
      openingTranscript: 'Interviewer: Implement LRU cache, O(1) get and put',
      userPins: ['What is the complexity?'],
    }
    const now = Array.from({ length: 30 }, (_, i) => `now ${i}`).join('\n')
    const block = buildPinnedSystemBlock(mem, now)
    expect(block).toContain('<session_memory>')
    expect(block).toContain('Solve LRU')
    expect(block).toContain('<pinned_opening>')
    expect(block).toContain('Implement LRU cache')
    expect(block).toContain('<pinned_user_questions>')
    expect(block).toContain('What is the complexity?')
  })

  it('does not re-pin opening that is still in the live tail', () => {
    const opening = 'Interviewer: Implement LRU cache, O(1) get and put\nUser: starting now'
    const mem = { ...createEmptyMemory(), openingTranscript: opening }
    const block = buildPinnedSystemBlock(mem, opening)
    expect(block).not.toContain('<pinned_opening>')
  })
})

describe('memory refresh + accept', () => {
  it('does not compact before two full turns exist', () => {
    expect(shouldRefreshMemory(createEmptyMemory(), 2)).toBe(false)
    expect(shouldRefreshMemory(createEmptyMemory(), 4)).toBe(true)
  })

  it('does not re-compact turns already folded in', () => {
    const mem = { ...createEmptyMemory(), throughMessageIndex: 4 }
    expect(shouldRefreshMemory(mem, 4)).toBe(false)
    expect(shouldRefreshMemory(mem, 6)).toBe(true)
  })

  it('rejects garbage / refusal so a bad compact cannot wipe memory', () => {
    expect(acceptMemoryText('short')).toBeNull()
    expect(acceptMemoryText("I'm sorry I cannot help with that")).toBeNull()
    expect(acceptMemoryText('Just a paragraph with no headings at all, even if it is long enough to pass the length gate.')).toBeNull()
    const ok = acceptMemoryText('## User Intent\nTwo sum\n## Errors & Corrections\nDo not use brute force')
    expect(ok).toContain('Two sum')
  })

  it('shifts throughIndex when the RAM ring drops oldest UI messages', () => {
    const mem = { ...createEmptyMemory(), throughMessageIndex: 12 }
    expect(shiftMemoryAfterTrim(mem, 4).throughMessageIndex).toBe(8)
    expect(shiftMemoryAfterTrim(mem, 20).throughMessageIndex).toBe(0)
  })
})

describe('memory update prompt (Anthropic cookbook shape)', () => {
  it('requires original problem, corrections, and failed approaches', () => {
    expect(MEMORY_UPDATE_PROMPT).toContain('## User Intent')
    expect(MEMORY_UPDATE_PROMPT).toContain('## Problem / Interview Task')
    expect(MEMORY_UPDATE_PROMPT).toContain('## Errors & Corrections')
    expect(MEMORY_UPDATE_PROMPT).toContain('user corrections > original problem')
    expect(MEMORY_UPDATE_PROMPT).toContain('Never invent requirements')
  })

  it('folds previous memory + new turns + spoken delta (incremental, not from-scratch)', () => {
    const prompt = buildMemoryUpdatePrompt({
      previousMemory: '## User Intent\nTwo sum',
      turns: [
        { role: 'user', content: 'Assist: follow up on edge cases' },
        { role: 'assistant', content: 'Handle empty input' },
      ],
      transcriptDelta: 'Them: also handle duplicates',
    })
    expect(prompt).toContain('## User Intent\nTwo sum')
    expect(prompt).toContain('follow up on edge cases')
    expect(prompt).toContain('also handle duplicates')
    expect(prompt).toContain('<previous_session_memory>')
  })

  it('keeps both ends of a long spoken delta so mid-meeting facts are not all-tail', () => {
    const delta = `START_FACT unique-opening-token\n${'x'.repeat(20_000)}\nEND_FACT unique-closing-token`
    const sliced = transcriptDeltaForMemory(delta, 0)
    expect(sliced).toContain('unique-opening-token')
    expect(sliced).toContain('unique-closing-token')
    expect(sliced.length).toBeLessThan(delta.length)
  })
})
