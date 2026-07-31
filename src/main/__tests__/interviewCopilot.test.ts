import { describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../services/ai/types';
import {
  assessInterviewAnswer,
  buildInterviewContext,
  buildInterviewKnowledgePrompt,
  classifyInterviewQuestion,
  classifyInterviewKnowledgeFile,
  classifyInterviewComplexity,
  decomposeInterviewQuestion,
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

  it('assigns distinct evidence roles to interview knowledge files', () => {
    expect(classifyInterviewKnowledgeFile('Taylor Resume.pdf')).toBe('candidate-profile');
    expect(classifyInterviewKnowledgeFile('STAR Stories.md')).toBe('star-story');
    expect(classifyInterviewKnowledgeFile('QA Job Description.txt')).toBe('target-role');
    expect(classifyInterviewKnowledgeFile('Checkout Project.docx')).toBe('project-evidence');
  });

  it('prevents target-role requirements from becoming candidate claims', () => {
    const prompt = buildInterviewKnowledgePrompt([
      { fileName: 'Resume.pdf', chunkText: 'Six years of QA automation.', score: 0.9 },
      { fileName: 'Job Description.txt', chunkText: 'Requires Kubernetes expertise.', score: 0.8 },
    ]);
    expect(prompt).toContain('role="candidate-profile"');
    expect(prompt).toContain('role="target-role"');
    expect(prompt).toContain('never as evidence that the candidate has that experience');
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

  it('compiles newest-wins corrections and marks the previous consistency assumption superseded', () => {
    const context = buildInterviewContext([
      'Interviewer: Assume immediate consistency for the API.',
      'Candidate: I would assert the response immediately.',
      'Interviewer: Actually, assume the API is eventually consistent. What would you change?',
    ].join('\n'));
    expect(context.activeConstraints.find((item) => item.family === 'consistency')?.value).toMatch(/eventually consistent/i);
    expect(context.supersededConstraints.find((item) => item.family === 'consistency')?.value).toMatch(/immediate consistency/i);
    expect(context.requirements.map((item) => item.label)).toEqual(expect.arrayContaining([
      'the active eventual-consistency constraint',
      'observable readiness or terminal state',
      'a bounded timeout or retry limit',
      'an explicit revision using the newest correction',
    ]));
  });

  it('decomposes multipart questions and preserves their order', () => {
    expect(decomposeInterviewQuestion('What edge cases matter, what is the time complexity, and what tradeoff would you choose?')).toEqual([
      'What edge cases matter',
      'what is the time complexity',
      'what tradeoff would you choose',
    ]);
  });

  it('anchors a short follow-up to the previous question and answer', () => {
    const context = buildInterviewContext('Interviewer: What tradeoff would you choose?\nCandidate: I would choose readability over a small memory saving.\nInterviewer: Why?');
    expect(context.question).toBe('Why?');
    expect(context.anchor).toEqual({
      question: 'What tradeoff would you choose?',
      answer: 'I would choose readability over a small memory saving.',
      decisionTerms: ['readability', 'memory'],
    });
    expect(context.guidance).toMatch(/Previous candidate answer: I would choose readability/i);
  });

  it('detects screen conflicts and ambiguous undocumented claims', () => {
    const conflict = buildInterviewContext('', 'Switch the implementation to Python.', 'The visible editor contains a TypeScript implementation.');
    expect(conflict.screenConflict).toBe(true);
    expect(classifyInterviewComplexity(conflict).reasons).toContain('screen-conflict');
    const unknown = buildInterviewContext('', 'Does the undocumented Zephyr mode guarantee exactly-once rollback?');
    expect(unknown.ambiguous).toBe(true);
    expect(unknown.requirements.map((item) => item.label)).toContain('stated uncertainty or assumption');
  });

  it('repairs a multipart corrected answer using dynamically missing requirements', async () => {
    const streamResponse = vi.fn(async (_params, callbacks) => {
      callbacks.onText('I would retry it.');
      callbacks.onDone('');
    });
    const generateShort = vi.fn(async (_params: { prompt: string }) => '1. Given that the API is eventually consistent, I would now poll observable status.\n2. Bound it with a timeout and retry limit, then verify convergence and timeout behavior.');
    const provider = { name: 'ollama', streamResponse, generateShort } as AIProvider;
    const context = buildInterviewContext('Interviewer: Assume immediate consistency.\nInterviewer: Actually, assume eventual consistency. What changes, and how would you bound the test?');
    const result = await generateVerifiedInterviewAnswer(provider, { system: 'system', messages: [] }, undefined, context);
    expect(result.repaired).toBe(true);
    expect(result.assessment.missing).toEqual([]);
    expect(generateShort.mock.calls[0][0].prompt).toMatch(/active eventual-consistency constraint|bounded timeout/i);
  });

  it('requires numbered multipart coverage in the original sections', () => {
    const context = buildInterviewContext('', 'What edge cases matter, what is the time complexity, and what tradeoff would you choose?', 'A string algorithm is visible.');
    const collapsed = assessInterviewAnswer(context, 'Empty strings, duplicate characters, Unicode, and large input matter. Time complexity is O(n), with a memory tradeoff.');
    expect(collapsed.missingAdvisory).toContain('a numbered response covering every question part in the original order');
    expect(collapsed.missingCritical).toEqual(expect.arrayContaining(['time complexity', 'the requested tradeoff']));

    const ordered = assessInterviewAnswer(context, '1. Test empty strings, duplicate characters, Unicode code points, and large input.\n2. Time complexity is O(n).\n3. The tradeoff is O(n) memory for readability.');
    expect(ordered.missing).toEqual([]);
  });

  it('requires a short why answer to name the prior decision', () => {
    const context = buildInterviewContext('Interviewer: What tradeoff would you choose?\nCandidate: I choose readability over memory savings.\nInterviewer: Why?');
    expect(assessInterviewAnswer(context, 'Readability improves maintenance.').missingCritical).toContain('explicit causal reasoning for the preceding answer');
    expect(assessInterviewAnswer(context, 'Because it is better.').missingCritical).toContain('an explicit reason tied to the prior decision (readability or memory)');
    expect(assessInterviewAnswer(context, 'Because readability reduces maintenance risk more than the small memory saving is worth.').missingCritical).toEqual([]);
  });

  it('deterministically adds causal wording when a follow-up already contains the anchored decision', async () => {
    const streamResponse = vi.fn(async (_params, callbacks) => {
      callbacks.onText('Readability reduces maintenance risk more than the small memory saving is worth.');
      callbacks.onDone('');
    });
    const provider = {
      name: 'ollama',
      streamResponse,
      generateShort: vi.fn(async () => 'Readability reduces maintenance risk more than the small memory saving is worth.'),
    } as AIProvider;
    const context = buildInterviewContext('Interviewer: What tradeoff would you choose?\nCandidate: I choose readability over memory savings.\nInterviewer: Why?');
    const result = await generateVerifiedInterviewAnswer(provider, { system: 'system', messages: [] }, undefined, context);
    expect(result.text).toMatch(/^Because readability/i);
    expect(result.assessment.missingCritical).toEqual([]);
  });

  it('rejects reliance on a superseded correction but permits contrasting it', () => {
    const context = buildInterviewContext('Interviewer: Assume immediate consistency.\nInterviewer: Actually, assume eventual consistency. What changes?');
    expect(assessInterviewAnswer(context, 'Given that correction, I would now assume immediate consistency and assert immediately.').missingCritical).toContain('the active eventual-consistency constraint');
    expect(assessInterviewAnswer(context, 'Given that correction, I would now use eventual consistency and bounded polling for observable convergence rather than immediate consistency.').missingCritical).toEqual([]);
  });

  it('uses a second repair only after the first improves but leaves a critical miss', async () => {
    const streamResponse = vi.fn(async (_params, callbacks) => {
      callbacks.onText('I would test edge cases.');
      callbacks.onDone('');
    });
    const generateShort = vi.fn()
      .mockResolvedValueOnce('1. Test empty input and duplicate characters.\n2. Time complexity is O(n).\n3. Mention the tradeoff.')
      .mockResolvedValueOnce('1. Test empty input, duplicate characters, Unicode code points, and large input.\n2. Time complexity is O(n).\n3. The tradeoff is O(n) memory for simpler readable code.');
    const provider = { name: 'ollama', streamResponse, generateShort } as AIProvider;
    const context = buildInterviewContext('', 'What edge cases matter, what is the time complexity, and what tradeoff would you choose?', 'A string algorithm is visible.');
    const controller = new AbortController();
    const result = await generateVerifiedInterviewAnswer(provider, { system: 'system', messages: [] }, { signal: controller.signal }, context);
    expect(result.repairAttempts).toBe(2);
    expect(result.assessment.missing).toEqual([]);
    expect(generateShort).toHaveBeenCalledTimes(2);
    expect(generateShort.mock.calls.every((call) => call[1]?.signal === controller.signal)).toBe(true);
    expect(generateShort.mock.calls[1][0].prompt).toMatch(/Unicode-input|large-input/i);
  });
});
