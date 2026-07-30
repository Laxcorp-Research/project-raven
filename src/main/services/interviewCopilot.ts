import type { AIProvider, AIRequestOptions } from './ai/types';
import { prepareInterviewTranscript } from './interviewTranscript';

export type InterviewQuestionType =
  | 'introduction'
  | 'behavioral'
  | 'debugging'
  | 'coding'
  | 'test-strategy'
  | 'planning'
  | 'current-research'
  | 'general';

export interface InterviewMemory {
  constraints: string[];
  evidence: string[];
  technicalFacts: string[];
}

export interface InterviewContext {
  questionType: InterviewQuestionType;
  question: string;
  memory: InterviewMemory;
  guidance: string;
  maxWords: number;
}

export interface InterviewAssessment {
  missing: string[];
  wordCount: number;
}

export interface InterviewKnowledgeChunk {
  chunkText: string;
  fileName: string;
  score: number;
}

export type InterviewKnowledgeRole = 'candidate-profile' | 'star-story' | 'target-role' | 'project-evidence' | 'general';

interface CoverageRequirement {
  label: string;
  patterns: RegExp[];
}

const MAX_MEMORY_ITEMS = 18;

const QUESTION_TEMPLATES: Record<InterviewQuestionType, string> = {
  introduction: 'Give a natural 45-60 second summary: experience length, strongest relevant tools, scope, and one leadership or impact example. Use only supplied facts.',
  behavioral: 'Use a compact STAR flow: context and responsibility, specific actions owned by the candidate, evidence-based result, and lesson. Preserve every supplied outcome; never invent a metric.',
  debugging: 'State the most likely root cause, reject masking symptoms, then give three ordered actions: collect diagnostic evidence, isolate the cause, and verify the fix.',
  coding: 'Lead with complete corrected code. Cover async correctness, success/failure handling, bounded retry or polling, cancellation/timeouts, testability, and concise complexity or tradeoff notes.',
  'test-strategy': 'Prioritize by failure impact. Cover the requested layers and explicitly test each named failure mode, state transition, retry, duplicate, and ordering constraint. Keep UI coverage to essential journeys.',
  planning: 'Give an ordered, time-boxed execution plan tied to the stated deadline, staffing, highest risks, evidence collection, API checks, and a minimal critical-path smoke suite.',
  'current-research': 'Answer only from returned evidence. State the policy first, distinguish separate product behaviors, and cite supporting official sources inline. Say verification failed if no evidence was returned.',
  general: 'Answer the exact question first, then give two or three concrete supporting points grounded in the supplied facts.',
};

export function isInterviewMode(modeId?: string, modePrompt?: string): boolean {
  return modeId === 'mode-interview'
    || /coaching the user through a live (?:job )?interview|they are the candidate|behavioral questions:[\s\S]*\bSTAR\b/i.test(modePrompt || '');
}

export function classifyInterviewQuestion(question: string): InterviewQuestionType {
  if (/\b(?:verify|latest|current|official (?:docs?|documentation)|sources?|search|look up)\b/i.test(question)) return 'current-research';
  if (/```|\b(?:fix (?:this|the)|function|implement|write code|coding problem|algorithm|complexity)\b/i.test(question)) return 'coding';
  if (/\b(?:behavioral|tell me about a time|describe a time|pushing back|conflict|disagree|STAR)\b/i.test(question)) return 'behavioral';
  if (/\b(?:execution plan|release|deadline|prioriti[sz]e|what do you automate first|first-day|timebox)\b/i.test(question)) return 'planning';
  if (/\b(?:flaky|flake|fails?\b[^.?!]{0,30}\b(?:in|on)\b|diagnos\w*|debug\w*|root cause|race condition)\b/i.test(question)) return 'debugging';
  if (/\b(?:design (?:the )?(?:tests?|test strategy)|highest-value tests?|test strategy|what (?:would|do) you test)\b/i.test(question)) return 'test-strategy';
  if (/\b(?:introduce yourself|introduction|tell me about yourself|summary of your experience|60-second)\b/i.test(question)) return 'introduction';
  return 'general';
}

export function extractInterviewMemory(transcript: string): InterviewMemory {
  const segments = transcript
    .replace(/<[^>]+>/g, ' ')
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((value) => value.replace(/^\s*(?:interviewer|candidate|them|you|[^:]{1,40}):\s*/i, '').trim())
    .filter((value) => value.length >= 8 && value.length <= 420);

  return {
    constraints: selectUnique(segments, /\b(?:only|deadline|days?|hours?|minutes?|percent|%|without|must|exact|fixed|limited|do not|don't|prior|history|first-day)\b/i),
    evidence: selectUnique(segments, /\b(?:found|root cause|trace|logs?|video|screenshot|quarantin|owner|fixed|re-enabled|restored|result|incident|failed|passes?|happened)\b/i),
    technicalFacts: selectUnique(segments, /\b(?:API|REST|Playwright|Cypress|TypeScript|GitHub Actions|CI|worker|account|order|payment|webhook|idempoten|database|persistence|promo|PayPal|card|504|retry)\b/i),
  };
}

export function buildInterviewContext(transcript: string, explicitQuestion?: string): InterviewContext {
  const prepared = prepareInterviewTranscript(transcript);
  const stableTranscript = prepared.transcript || transcript;
  const question = explicitQuestion?.trim() || prepared.latestCompletedQuestion || latestQuestion(stableTranscript);
  const questionType = classifyInterviewQuestion(question);
  const memory = extractInterviewMemory(stableTranscript);
  const maxWords = questionType === 'coding' ? 280 : questionType === 'test-strategy' ? 220 : 180;
  const memoryText = [
    ...memory.constraints.map((item) => `Constraint: ${item}`),
    ...memory.evidence.map((item) => `Evidence/outcome: ${item}`),
    ...memory.technicalFacts.map((item) => `Technical fact: ${item}`),
  ].slice(-MAX_MEMORY_ITEMS).join('\n');

  const guidance = `<interview_answer_contract>
Detected question type: ${questionType}
Maximum length: ${maxWords} words.
Template: ${QUESTION_TEMPLATES[questionType]}
Before writing, silently form a checklist from the question and structured memory. Cover each named constraint exactly once. The final output must contain only the candidate's immediately speakable answer (plus code when requested), never the checklist.
</interview_answer_contract>
<interview_memory>
${memoryText || 'No durable interview facts extracted yet.'}
</interview_memory>`;
  const context = { questionType, question, memory, guidance, maxWords };
  const requiredCoverage = coverageRequirements(context).map((item) => item.label);
  context.guidance += `\n<required_coverage>\n${requiredCoverage.map((item) => `- ${item}`).join('\n') || '- Directly answer the question'}\n</required_coverage>`;
  return context;
}

export function classifyInterviewKnowledgeFile(fileName: string): InterviewKnowledgeRole {
  const normalized = fileName.toLowerCase().replace(/[_-]+/g, ' ');
  if (/\b(?:job description|job posting|role description|requirements|jd)\b/.test(normalized)) return 'target-role';
  if (/\b(?:star|behavioral|story|stories|achievement)\b/.test(normalized)) return 'star-story';
  if (/\b(?:resume|résumé|cv|curriculum vitae|candidate profile)\b/.test(normalized)) return 'candidate-profile';
  if (/\b(?:project|portfolio|case study)\b/.test(normalized)) return 'project-evidence';
  return 'general';
}

export function buildInterviewKnowledgePrompt(chunks: InterviewKnowledgeChunk[]): string {
  if (chunks.length === 0) return '';
  const evidence = chunks.map((chunk, index) => {
    const role = classifyInterviewKnowledgeFile(chunk.fileName);
    return `[${index + 1}] role="${role}" file="${chunk.fileName}"\n${chunk.chunkText}`;
  }).join('\n\n');
  return `<interview_knowledge>
${evidence}
</interview_knowledge>
Knowledge boundary rules:
- candidate-profile, star-story, and project-evidence may support factual claims about the candidate.
- target-role describes what the employer wants; use it to choose emphasis, never as evidence that the candidate has that experience.
- general material may provide context but does not establish a candidate claim unless it explicitly describes the candidate.
- Never invent employers, dates, metrics, ownership, or outcomes. If the needed fact is absent, provide a clearly labeled fill-in phrase instead.`;
}

export function assessInterviewAnswer(context: InterviewContext, answer: string): InterviewAssessment {
  const requirements = coverageRequirements(context);
  const missing = requirements
    .filter((requirement) => !requirement.patterns.some((pattern) => pattern.test(answer)))
    .map((requirement) => requirement.label);
  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > context.maxWords) missing.push(`concise answer at or below ${context.maxWords} words`);
  if (context.questionType === 'coding' && /try[\s\S]*const timeoutId[\s\S]*catch[\s\S]*clearTimeout\(timeoutId\)/i.test(answer)) {
    missing.push('valid timer scope: declare the timeout handle outside try before clearing it in catch or finally');
  }
  return { missing, wordCount };
}

export async function generateVerifiedInterviewAnswer(
  provider: AIProvider,
  params: { system: string; messages: Parameters<AIProvider['streamResponse']>[0]['messages']; maxTokens?: number },
  options: AIRequestOptions | undefined,
  context: InterviewContext,
  onDraft?: (draft: string) => void,
): Promise<{ text: string; repaired: boolean; assessment: InterviewAssessment }> {
  let draft = '';
  await provider.streamResponse(
    { ...params, system: `${params.system}\n\n${context.guidance}` },
    {
      onText: (text) => { draft += text; },
      onDone: () => {},
      onError: (message) => { throw new Error(message); },
    },
    options,
  );

  onDraft?.(draft);

  const firstAssessment = assessInterviewAnswer(context, draft);
  if (firstAssessment.missing.length === 0 || context.questionType === 'current-research') {
    return { text: draft, repaired: false, assessment: firstAssessment };
  }

  const repaired = await provider.generateShort({
    system: `${params.system}\n\n${context.guidance}`,
    prompt: `<draft_answer>\n${draft}\n</draft_answer>\nRewrite the answer once. Preserve correct content. Every missing component below is mandatory; use its named technical terms explicitly rather than substituting a broader idea:\n- ${firstAssessment.missing.join('\n- ')}\nStay within ${context.maxWords} words. Output only the improved candidate answer.`,
    maxTokens: params.maxTokens,
  }, { signal: options?.signal });
  const repairedAssessment = assessInterviewAnswer(context, repaired);

  if (repairedAssessment.missing.length < firstAssessment.missing.length
    || (repairedAssessment.missing.length === firstAssessment.missing.length && repairedAssessment.wordCount < firstAssessment.wordCount)) {
    return { text: repaired, repaired: true, assessment: repairedAssessment };
  }
  return { text: draft, repaired: false, assessment: firstAssessment };
}

function coverageRequirements(context: InterviewContext): CoverageRequirement[] {
  const requirements: CoverageRequirement[] = [];
  const add = (label: string, ...patterns: RegExp[]) => requirements.push({ label, patterns });

  switch (context.questionType) {
    case 'introduction':
      add('experience length', /\b\d+\s+years?\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten) years?\b/i);
      add('relevant technical experience', /\b(?:automation|test|quality|QA|API|Playwright|Cypress|Selenium|TypeScript|JavaScript|Python|Java|CI)\b/i);
      break;
    case 'behavioral':
      add('specific candidate action', /\b(?:I|my)\s+(?:created|used|assigned|investigated|proposed|implemented|fixed|isolated|quarantined|pushed|explained|showed)\b/i);
      add('result or outcome', /\b(?:result|outcome|re-enabled|restored|resolved|fixed|learned|ultimately)\b/i);
      if (/\bowner\b/i.test(context.question)) add('assigned owner', /\bowner\b/i);
      if (/\btrace/i.test(context.question)) add('trace evidence', /\btrace/i);
      if (/\bshared (?:test )?account\b/i.test(context.question)) add('shared-account root cause', /\bshared\b[^.]{0,30}\baccount\b|\baccount\b[^.]{0,30}\bshared\b/i);
      break;
    case 'debugging':
      add('root-cause hypothesis', /\b(?:root cause|race|collision|shared|fixed order|state leak|contention)\b/i);
      add('the explicit term Playwright trace (or video/screenshot) as diagnostic evidence', /\b(?:trace|video|screenshot)\b/i);
      add('test isolation', /\b(?:unique|isolat|per-worker|worker-specific)\b/i);
      add('avoid arbitrary waits', /\b(?:avoid|not|don't|wouldn't|instead of|mask)\b[^.]{0,50}\b(?:waitForTimeout|hard wait|fixed wait|arbitrary wait)\b|\b(?:waitForTimeout|hard wait|fixed wait|arbitrary wait)\b[^.]{0,50}\b(?:avoid|not|don't|wouldn't|mask)\b/i);
      break;
    case 'coding':
      add('await fetch before reading the response', /\bawait\s+fetch/i);
      add('response status handling', /response\.(?:ok|status)|status\s*===?\s*200/i);
      add('bounded polling or backoff', /\b(?:backoff|delay|interval|poll|attempt|maxAttempts|retry)\b/i);
      add('error, timeout, or cancellation handling', /\b(?:throw|catch|error|abort|timeout|signal)\b/i);
      break;
    case 'test-strategy':
      add('API behavior', /\bAPI\b|\bPOST\b|\brequest\b|\bresponse\b/i);
      add('persistence or state verification', /\b(?:database|persist|ledger|state|record|transaction)\b/i);
      add('event or webhook verification', /\b(?:event|webhook|message|queue)\b/i);
      add('essential UI coverage', /\b(?:UI|checkout|browser|end-to-end|E2E)\b/i);
      if (/\b504\b|\bretr/i.test(context.question)) add('504 retry behavior', /\b504\b|\bretr/i);
      if (/\b(?:duplicate|at-least-once|idempoten)\b/i.test(context.question)) add('duplicate and idempotency behavior', /\b(?:duplicate|dedup|at-least-once|idempoten)\b/i);
      if (/\bout of order\b/i.test(context.question)) add('the explicit phrase out-of-order webhook delivery', /\bout[- ]of[- ]order\b|\breorder/i);
      break;
    case 'planning':
      add('risk-based priority', /\b(?:risk|impact|highest|critical|priority|prioriti)\b/i);
      if (/\btwo days\b|\b2 days\b/i.test(context.question)) add('explicit two-day timebox', /\btwo days\b|\b2 days\b|\btwo-day\b|\b2-day\b|\btimebox/i);
      else add('time constraint', /\b(?:day|deadline|timebox|hour|limited time|morning|afternoon)\b/i);
      add('API or service checks', /\b(?:API|service|endpoint|contract)\b/i);
      add('critical-path smoke coverage', /\b(?:smoke|critical path|happy path|checkout)\b/i);
      if (/\bduplicate|idempoten/i.test(context.question)) add('duplicate-charge risk', /\bduplicate|idempoten/i);
      if (/\bwhat we discussed|uses? what we discussed|given the/i.test(context.question)) {
        if (memoryContains(context.memory, /\btrace/i)) add('previously discussed trace evidence', /\btrace/i);
        if (memoryContains(context.memory, /\bquarantin/i)) add('previously discussed quarantine', /\bquarantin/i);
        if (memoryContains(context.memory, /\bisolat|unique account/i)) add('previously discussed isolation', /\bisolat|unique (?:test )?account|test data/i);
      }
      break;
    case 'current-research':
      add('source citation', /https?:\/\/|\[[^\]]+\]\([^)]+\)/i);
      break;
    default:
      break;
  }
  return requirements;
}

function memoryContains(memory: InterviewMemory, pattern: RegExp): boolean {
  return [...memory.constraints, ...memory.evidence, ...memory.technicalFacts].some((item) => pattern.test(item));
}

function latestQuestion(transcript: string): string {
  const lines = transcript.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return [...lines].reverse().find((line) => /\?|\b(?:explain|describe|design|fix|give me|tell me|what|how|why|verify)\b/i.test(line)) || lines.at(-1) || '';
}

function selectUnique(values: string[], pattern: RegExp): string[] {
  const seen = new Set<string>();
  const selected: string[] = [];
  for (const value of values) {
    if (!pattern.test(value)) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(value);
  }
  return selected.slice(-MAX_MEMORY_ITEMS);
}
