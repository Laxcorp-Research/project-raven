import { describe, it, expect } from 'vitest'
import { parseActionItems, normalizeActionItemsForStorage } from '../../shared/actionItems'

describe('parseActionItems', () => {
  it('returns an empty array for null, undefined, or blank input', () => {
    expect(parseActionItems(null)).toEqual([])
    expect(parseActionItems(undefined)).toEqual([])
    expect(parseActionItems('')).toEqual([])
    expect(parseActionItems('   ')).toEqual([])
  })

  it('parses a plain JSON array of tasks', () => {
    const raw = JSON.stringify([
      { task: 'Send the deck', assignee: 'Sam', deadline: 'Friday' },
      { task: 'Book the room', assignee: null, deadline: null },
    ])
    expect(parseActionItems(raw)).toEqual([
      { task: 'Send the deck', assignee: 'Sam', deadline: 'Friday' },
      { task: 'Book the room', assignee: null, deadline: null },
    ])
  })

  it('strips a ```json code fence the model sometimes adds', () => {
    const raw = '```json\n[{"task":"Follow up","assignee":"Alex","deadline":"next week"}]\n```'
    expect(parseActionItems(raw)).toEqual([
      { task: 'Follow up', assignee: 'Alex', deadline: 'next week' },
    ])
  })

  it('drops entries without a usable task and normalizes empty/null-ish fields', () => {
    const raw = JSON.stringify([
      { task: '   ', assignee: 'Sam', deadline: 'Friday' },
      { task: 'Real task', assignee: 'null', deadline: 'none' },
      { assignee: 'No task field' },
    ])
    expect(parseActionItems(raw)).toEqual([
      { task: 'Real task', assignee: null, deadline: null },
    ])
  })

  it('returns an empty array for unparseable or non-array JSON instead of throwing', () => {
    expect(parseActionItems('not json at all')).toEqual([])
    expect(parseActionItems('{"task":"single object not array"}')).toEqual([])
    expect(parseActionItems('42')).toEqual([])
  })

  it('preserves a checked (done) flag only when explicitly true', () => {
    const raw = JSON.stringify([
      { task: 'Checked', assignee: null, deadline: null, done: true },
      { task: 'Unchecked', assignee: null, deadline: null, done: false },
      { task: 'No flag', assignee: null, deadline: null },
    ])
    expect(parseActionItems(raw)).toEqual([
      { task: 'Checked', assignee: null, deadline: null, done: true },
      { task: 'Unchecked', assignee: null, deadline: null },
      { task: 'No flag', assignee: null, deadline: null },
    ])
  })
})

describe('normalizeActionItemsForStorage', () => {
  it('returns a canonical JSON string for valid items', () => {
    const raw = '```json\n[{"task":"Send deck","assignee":"Sam","deadline":null}]\n```'
    expect(normalizeActionItemsForStorage(raw)).toBe(
      JSON.stringify([{ task: 'Send deck', assignee: 'Sam', deadline: null }]),
    )
  })

  it('returns null when there are no valid items (so the DB column stays NULL)', () => {
    expect(normalizeActionItemsForStorage(null)).toBeNull()
    expect(normalizeActionItemsForStorage('garbage')).toBeNull()
    expect(normalizeActionItemsForStorage('[]')).toBeNull()
  })
})
