import { describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../services/ai/types';
import {
  assessInterviewAnswer,
  buildInterviewContext,
  classifyInterviewQuestion,
  extractInterviewMemory,
  generateVerifiedInterviewAnswer,
  isInterviewMode,
} from '../services/interviewCopilot';

describe('interviewCopilot', () => {
  it('recognizes interview modes without affecting ordinary meetings', () => {
    expect(isInterviewMode('mode-interview')).toBe(true);
    expect(isInterviewMode('custom', 'You are coaching the user through a live job interview. They are the candidate.')).toBe(true);
    expect(isInterviewMode('mode-meeting', 'Track action items.')).toBe(false);
  });

  it('classifies common interview question types', () => {
    expect(classifyInterviewQuestion('Diagnose this flaky CI test and find the root cause.')).toBe('debugging');
    expect(classifyInterviewQuestion('The test fails about 8% in CI. Diagnose it and give three debugging actions.')).toBe('debugging');
    expect(classifyInterviewQuestion('Design the highest-value tests for POST /payments.')).toBe('test-strategy');
    expect(classifyInterviewQuestion('Tell me about a time you pushed back.')).toBe('behavioral');
    expect(classifyInterviewQuestion('Fix this function and explain complexity.')).toBe('coding');
  });

  it('extracts bounded constraints, evidence, and technical facts', () => {
    const memory = extractInterviewMemory('Interviewer: We ship in two days and you are the only QA engineer.\nCandidate: I used Playwright traces, found a shared account, fixed isolation, and re-enabled the test.');
    expect(memory.constraints.join(' ')).toMatch(/two days|only QA/i);
    expect(memory.evidence.join(' ')).toMatch(/traces/i);
    expect(memory.technicalFacts.join(' ')).toMatch(/Playwright/i);
  });

  it('detects missing debugging evidence and accepts a complete answer', () => {
    const context = buildInterviewContext('', 'The test is flaky in CI with a shared account. Diagnose it and give three actions; do not use a fixed wait.');
    expect(assessInterviewAnswer(context, 'It is probably a shared-state race. Give each worker unique data and avoid waitForTimeout.').missing).toContain('the explicit term Playwright trace (or video/screenshot) as diagnostic evidence');
    expect(assessInterviewAnswer(context, 'This is a shared-state race. First collect a Playwright trace, then give every worker unique isolated data, and avoid waitForTimeout because it masks the race.').missing).toEqual([]);
  });

  it('prioritizes an execution-plan request over historical debugging details', () => {
    expect(classifyInterviewQuestion('Given the 8% CI flake, give me an exact first-day execution plan.')).toBe('planning');
  });

  it('rejects a timeout handle that is scoped inside try but cleared in catch', () => {
    const context = buildInterviewContext('', 'Fix this function so the asynchronous fetch is production-safe.');
    const answer = `async function run() { try { const timeoutId = setTimeout(() => {}, 10); const response = await fetch('/x'); if (response.ok) return true; } catch (error) { clearTimeout(timeoutId); throw error; } } // retry polling`;
    expect(assessInterviewAnswer(context, answer).missing).toContain('valid timer scope: declare the timeout handle outside try before clearing it in catch or finally');
  });

  it('repairs one incomplete draft and keeps the improved answer', async () => {
    const streamResponse = vi.fn(async (_params, callbacks) => {
      callbacks.onText('This is a shared-account race. Use unique data and avoid waitForTimeout.');
      callbacks.onDone('');
    });
    const generateShort = vi.fn(async () => 'This is a shared-account race. Collect a Playwright trace, use unique isolated data per worker, and avoid waitForTimeout because it masks the race.');
    const provider = { name: 'ollama', streamResponse, generateShort } as AIProvider;
    const context = buildInterviewContext('', 'Diagnose this flaky test with a shared account and fixed order ID.');

    const result = await generateVerifiedInterviewAnswer(provider, { system: 'system', messages: [], maxTokens: 300 }, undefined, context);

    expect(result.repaired).toBe(true);
    expect(result.assessment.missing).toEqual([]);
    expect(result.text).toMatch(/trace/i);
    expect(generateShort).toHaveBeenCalledTimes(1);
  });

  it('retains the original draft when repair does not improve coverage', async () => {
    const streamResponse = vi.fn(async (_params, callbacks) => {
      callbacks.onText('This is a shared-account race.');
      callbacks.onDone('');
    });
    const provider = {
      name: 'ollama',
      streamResponse,
      generateShort: vi.fn(async () => 'I would investigate it.'),
    } as AIProvider;
    const context = buildInterviewContext('', 'Diagnose this flaky test with a shared account.');

    const result = await generateVerifiedInterviewAnswer(provider, { system: 'system', messages: [] }, undefined, context);

    expect(result.repaired).toBe(false);
    expect(result.text).toContain('shared-account race');
  });
});
