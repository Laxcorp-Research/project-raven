import { describe, expect, it } from 'vitest'
import {
  acceptMemoryText,
  buildMemoryUpdatePrompt,
  buildPinnedSystemBlock,
  buildReplayMessages,
  buildResumedMemory,
  buildTranscriptBlock,
  captureOpeningTranscript,
  createEmptyMemory,
  digestUserTurn,
  MEMORY_UPDATE_PROMPT,
  openingStillVisible,
  parseStoredSessionMemory,
  pinOpeningIfNeeded,
  pinUserQuestion,
  selectRecentTurns,
  serializeSessionMemory,
  stripResumedNote,
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

describe('resumed-session memory (yesterday must survive a restart)', () => {
  const YESTERDAY = Date.UTC(2026, 8, 21, 10, 0, 0)
  const TODAY = YESTERDAY + 23 * 3600 * 1000

  it('serialize -> parse round-trips text, opening and pins, and resets conversation indices', () => {
    const memory = {
      text: '## User Intent\nLRU cache\n\n## Meeting Facts\nAcme',
      openingTranscript: 'Them: Implement LRU cache',
      userPins: ['what is the time complexity?'],
      throughMessageIndex: 6,
      lastTranscriptLength: 9_000,
    }
    const json = serializeSessionMemory(memory)
    expect(json).not.toBeNull()
    const parsed = parseStoredSessionMemory(json)
    expect(parsed).toEqual({
      text: memory.text,
      openingTranscript: memory.openingTranscript,
      userPins: memory.userPins,
      throughMessageIndex: 0,
      lastTranscriptLength: 0,
    })
  })

  it('serializes to null when Assist was never used, so the column stays NULL', () => {
    expect(serializeSessionMemory(createEmptyMemory())).toBeNull()
  })

  it('parse tolerates garbage and partial shapes', () => {
    expect(parseStoredSessionMemory(null)).toBeNull()
    expect(parseStoredSessionMemory('not json')).toBeNull()
    expect(parseStoredSessionMemory('[1,2]')).toEqual({
      text: '', openingTranscript: '', userPins: [], throughMessageIndex: 0, lastTranscriptLength: 0,
    })
    expect(parseStoredSessionMemory('{"text":"## A\\n## B","userPins":["q", 7, null]}')?.userPins).toEqual(['q'])
  })

  it('prefers the earlier sitting\'s Assist memory and leads with a resumed note', () => {
    const memory = buildResumedMemory({
      storedMemoryJson: JSON.stringify({
        text: '## Problem / Interview Task\nDesign a rate limiter\n\n## Errors & Corrections\nInterviewer rejected token bucket',
        openingTranscript: 'Them: Design a rate limiter',
        userPins: ['sliding window vs fixed?'],
      }),
      summary: 'A summary that should NOT be used when memory exists',
      actionItems: [],
      title: 'Infra interview',
      firstStartedAt: YESTERDAY,
      resumedAt: TODAY,
    })
    expect(memory.text.startsWith('## Resumed Session')).toBe(true)
    expect(memory.text).toContain('"Infra interview"')
    expect(memory.text).toContain('Interviewer rejected token bucket')
    expect(memory.text).not.toContain('should NOT be used')
    expect(memory.openingTranscript).toBe('Them: Design a rate limiter')
    expect(memory.userPins).toEqual(['sliding window vs fixed?'])
    expect(memory.throughMessageIndex).toBe(0)
    expect(memory.lastTranscriptLength).toBe(0)
  })

  it('falls back to the stored summary and action items when Assist was never used', () => {
    const memory = buildResumedMemory({
      storedMemoryJson: null,
      summary: 'Covered the candidate\'s background and one system design question.',
      actionItems: [
        { task: 'Send the take-home', assignee: 'Priya', deadline: 'Friday' },
        { task: 'Share the JD', assignee: null, deadline: null },
      ],
      title: 'Infra interview',
      firstStartedAt: YESTERDAY,
      resumedAt: TODAY,
    })
    expect(memory.text).toContain('## Resumed Session')
    expect(memory.text).toContain('## Earlier Sitting Summary')
    expect(memory.text).toContain('one system design question')
    expect(memory.text).toContain('## Action Items From Earlier Sitting')
    expect(memory.text).toContain('- Send the take-home (Priya) - due Friday')
    expect(memory.text).toContain('- Share the JD')
    expect(memory.openingTranscript).toBe('')
    expect(memory.userPins).toEqual([])
  })

  it('a third sitting replaces the previous resumed note instead of stacking a second one', () => {
    const second = buildResumedMemory({
      storedMemoryJson: JSON.stringify({
        text: '## Problem / Interview Task\nRate limiter\n\n## Meeting Facts\nAcme',
        openingTranscript: '',
        userPins: [],
      }),
      summary: null,
      actionItems: [],
      title: 'Infra interview',
      firstStartedAt: YESTERDAY,
      resumedAt: TODAY,
    })
    // What the app would have persisted after sitting two, then resume again.
    const third = buildResumedMemory({
      storedMemoryJson: serializeSessionMemory(second),
      summary: null,
      actionItems: [],
      title: 'Infra interview',
      firstStartedAt: YESTERDAY,
      resumedAt: TODAY + 24 * 3600 * 1000,
    })
    expect(third.text.match(/## Resumed Session/g)).toHaveLength(1)
    expect(third.text).toContain('Rate limiter')
    expect(third.text).toContain('Acme')
  })

  it('stripResumedNote removes only the resumed section, wherever it sits', () => {
    expect(stripResumedNote('## Resumed Session\nnote\n\n## A\na\n\n## B\nb')).toBe('## A\na\n\n## B\nb')
    expect(stripResumedNote('## A\na\n\n## Resumed Session\nnote')).toBe('## A\na')
    expect(stripResumedNote('## A\na')).toBe('## A\na')
    expect(stripResumedNote('')).toBe('')
  })

  it('still tells the model it is a continuation when there are no notes at all', () => {
    const memory = buildResumedMemory({
      storedMemoryJson: null,
      summary: null,
      actionItems: [],
      title: '',
      firstStartedAt: YESTERDAY,
      resumedAt: TODAY,
    })
    expect(memory.text).toContain('## Resumed Session')
    expect(memory.text).toContain('"Untitled session"')
    expect(memory.text).toContain('## Earlier Sitting')
    expect(memory.text).toContain('No notes exist')
  })

  it('the resumed memory lands in the <session_memory> system block on the first Assist', () => {
    const memory = buildResumedMemory({
      storedMemoryJson: null,
      summary: 'Yesterday we covered LRU cache design.',
      actionItems: [],
      title: 'Interview',
      firstStartedAt: YESTERDAY,
      resumedAt: TODAY,
    })
    const block = buildPinnedSystemBlock(memory, 'Them: welcome back')
    expect(block).toContain('<session_memory>')
    expect(block).toContain('LRU cache design')
    expect(block).toContain('## Resumed Session')
  })
})
