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

export interface InterviewConstraint {
  family: 'consistency' | 'wait-strategy' | 'deadline' | 'language' | 'general';
  value: string;
  sourceIndex: number;
}

export interface InterviewConversationAnchor {
  question: string;
  answer: string;
  decisionTerms: string[];
}

export interface InterviewContext {
  questionType: InterviewQuestionType;
  question: string;
  subquestions: string[];
  memory: InterviewMemory;
  activeConstraints: InterviewConstraint[];
  supersededConstraints: InterviewConstraint[];
  anchor: InterviewConversationAnchor | null;
  screenFacts: string[];
  screenConflict: boolean;
  ambiguous: boolean;
  guidance: string;
  maxWords: number;
  requirements: CoverageRequirement[];
}

export interface InterviewAssessment {
  missing: string[];
  missingCritical: string[];
  missingAdvisory: string[];
  wordCount: number;
}

export interface InterviewKnowledgeChunk {
  chunkText: string;
  fileName: string;
  score: number;
}

export type InterviewKnowledgeRole = 'candidate-profile' | 'star-story' | 'target-role' | 'project-evidence' | 'general';

export interface CoverageRequirement {
  id: string;
  label: string;
  patterns: RegExp[];
  severity: 'critical' | 'advisory';
  subquestionIndex?: number;
  scope?: 'answer' | 'subquestion-section';
  forbiddenPatterns?: RegExp[];
}

const MAX_MEMORY_ITEMS = 18;
const CAUSAL_REASON_PATTERN = /\b(?:because|the reason|so that|therefore|since)\b/i;

const QUESTION_TEMPLATES: Record<InterviewQuestionType, string> = {
  introduction: 'Give a natural 45-60 second summary: experience length, strongest relevant tools, scope, and one leadership or impact example. Use only supplied facts.',
  behavioral: 'Use a compact STAR flow: context and responsibility, specific actions owned by the candidate, evidence-based result, and lesson. Preserve every supplied outcome; never invent a metric.',
  debugging: 'State the most likely root cause, reject masking symptoms, then give three ordered actions: collect diagnostic evidence, isolate the cause, and verify the fix.',
  coding: 'Lead with complete corrected code. Cover async correctness, success/failure handling, bounded retry or polling, cancellation/timeouts, testability, and concise complexity or tradeoff notes.',
  'test-strategy': 'Prioritize by failure impact. Cover the requested layers and explicitly test each named failure mode, state transition, retry, duplicate, and ordering constraint. Keep UI coverage to essential journeys.',
  planning: 'Give an ordered, time-boxed execution plan tied to the stated deadline, staffing, highest risks, evidence collection, API checks, and a minimal critical-path smoke suite.',
  'current-research': 'Answer only from returned evidence. State the policy first, distinguish separate product behaviors, and cite supporting official sources inline. Say verification failed if no evidence was returned.',
  general: 'Answer the exact question first, then give two or three concrete supporting points grounded in the supplied facts. If the question is obscure or ambiguous, state the assumption or uncertainty and what must be verified instead of inventing a fact.',
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
    constraints: selectUnique(segments, /\b(?:only|deadline|days?|hours?|minutes?|percent|%|without|must|exact|fixed|limited|do not|don't|prior|history|first-day|actually|assume|constraint|eventually consistent)\b/i),
    evidence: selectUnique(segments, /\b(?:found|root cause|trace|logs?|video|screenshot|quarantin|owner|fixed|re-enabled|restored|result|incident|failed|passes?|happened)\b/i),
    technicalFacts: selectUnique(segments, /\b(?:API|REST|Playwright|Cypress|TypeScript|GitHub Actions|CI|worker|account|order|payment|webhook|idempoten|database|persistence|promo|PayPal|card|504|retry|eventual(?:ly)? consistent|consistency)\b/i),
  };
}

export function buildInterviewContext(transcript: string, explicitQuestion?: string, screenContext = ''): InterviewContext {
  const prepared = prepareInterviewTranscript(transcript);
  const stableTranscript = prepared.transcript || transcript;
  const question = explicitQuestion?.trim() || prepared.latestCompletedQuestion || latestQuestion(stableTranscript);
  const memory = extractInterviewMemory(stableTranscript);
  const subquestions = decomposeInterviewQuestion(question);
  const { active: activeConstraints, superseded: supersededConstraints } = compileConstraints(stableTranscript);
  const anchor = buildConversationAnchor(stableTranscript, question);
  const screenFacts = screenContext.split(/\r?\n|(?<=[.!?])\s+/).map((value) => value.trim()).filter(Boolean).slice(-6);
  let questionType = classifyInterviewQuestion(question);
  if (questionType === 'general' && screenFacts.length > 0 && /\b(?:what is wrong|fix|bug|error|complexity)\b/i.test(question)
    && /\b(?:code|function|helper|fetch|loop|array|class|compiler)\b/i.test(screenFacts.join(' '))) questionType = 'coding';
  const screenConflict = detectScreenConflict(question, screenFacts);
  const ambiguous = /\b(?:undocumented|obscure|ambiguous|unknown|cannot verify)\b/i.test(question)
    || /\bguarantee\b/i.test(question) && /\b[A-Z][A-Za-z0-9_-]{3,}\b/.test(question) && !memoryContains(memory, /\bguarantee\b/i);
  const maxWords = questionType === 'coding' ? 280 : questionType === 'test-strategy' ? 220 : 180;
  const memoryText = [
    ...memory.constraints.map((item) => `Constraint: ${item}`),
    ...memory.evidence.map((item) => `Evidence/outcome: ${item}`),
    ...memory.technicalFacts.map((item) => `Technical fact: ${item}`),
  ].slice(-MAX_MEMORY_ITEMS).join('\n');

  const context = {
    questionType, question, subquestions, memory, activeConstraints, supersededConstraints,
    anchor, screenFacts, screenConflict, ambiguous, guidance: '', maxWords, requirements: [],
  } as InterviewContext;
  context.requirements = coverageRequirements(context);
  const guidance = `<interview_answer_contract>
Detected question type: ${questionType}
Maximum length: ${maxWords} words.
Template: ${QUESTION_TEMPLATES[questionType]}
Before writing, silently form a checklist from the question and structured memory. Cover each named constraint exactly once. The final output must contain only the candidate's immediately speakable answer (plus code when requested), never the checklist.
</interview_answer_contract>
<current_question>
${question || 'No completed interviewer question detected.'}
</current_question>
<ordered_subquestions>
${subquestions.map((item, index) => `${index + 1}. ${item}`).join('\n') || '1. Directly answer the current question.'}
</ordered_subquestions>
<active_constraints newest_wins="true">
${activeConstraints.map((item) => `- ${item.family}: ${item.value}`).join('\n') || '- None extracted.'}
</active_constraints>
<superseded_constraints do_not_apply="true">
${supersededConstraints.map((item) => `- ${item.family}: ${item.value}`).join('\n') || '- None.'}
</superseded_constraints>
<conversation_anchor>
${anchor ? `Previous interviewer question: ${anchor.question}\nPrevious candidate answer: ${anchor.answer}\nDecision terms that must be referenced: ${anchor.decisionTerms.join(', ')}` : 'No short-follow-up anchor required.'}
</conversation_anchor>
<screen_facts conflict_with_spoken="${screenConflict}">
${screenFacts.map((item) => `- ${item}`).join('\n') || '- No extracted screen text; rely on any attached image without inventing unseen content.'}
</screen_facts>
<interview_memory>
${memoryText || 'No durable interview facts extracted yet.'}
</interview_memory>`;
  context.guidance = `${guidance}\n<required_coverage>\n${context.requirements.map((item) => `- ${item.label}`).join('\n') || '- Directly answer the question'}\n</required_coverage>`;
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
  const requirements = context.requirements;
  const sections = numberedAnswerSections(answer);
  const failed = requirements.filter((requirement) => {
    if (requirement.id === 'multipart-order') return !hasOrderedNumberedParts(answer, context.subquestions.length);
    const candidate = requirement.scope === 'subquestion-section' && requirement.subquestionIndex !== undefined
      ? sections[requirement.subquestionIndex] || ''
      : answer;
    return !requirement.patterns.some((pattern) => pattern.test(candidate))
      || Boolean(requirement.forbiddenPatterns?.some((pattern) => pattern.test(answer)));
  });
  const missingCritical = failed.filter((requirement) => requirement.severity === 'critical').map((requirement) => requirement.label);
  const missingAdvisory = failed.filter((requirement) => requirement.severity === 'advisory').map((requirement) => requirement.label);
  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > context.maxWords) missingAdvisory.push(`concise answer at or below ${context.maxWords} words`);
  if (context.questionType === 'coding' && /try[\s\S]*const timeoutId[\s\S]*catch[\s\S]*clearTimeout\(timeoutId\)/i.test(answer)) {
    missingCritical.push('valid timer scope: declare the timeout handle outside try before clearing it in catch or finally');
  }
  return { missing: [...missingCritical, ...missingAdvisory], missingCritical, missingAdvisory, wordCount };
}

export async function generateVerifiedInterviewAnswer(
  provider: AIProvider,
  params: { system: string; messages: Parameters<AIProvider['streamResponse']>[0]['messages']; maxTokens?: number },
  options: AIRequestOptions | undefined,
  context: InterviewContext,
  onDraft?: (draft: string) => void,
): Promise<{ text: string; repaired: boolean; repairAttempts: number; assessment: InterviewAssessment }> {
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
    return { text: draft, repaired: false, repairAttempts: 0, assessment: firstAssessment };
  }

  let best = { text: draft, assessment: firstAssessment };
  let repairAttempts = 0;
  for (let attempt = 1; attempt <= 2 && best.assessment.missing.length > 0; attempt += 1) {
    options?.signal?.throwIfAborted();
    const repaired = await provider.generateShort({
      system: `${params.system}\n\n${context.guidance}`,
      prompt: buildRepairPrompt(best.text, best.assessment, context, attempt),
      maxTokens: params.maxTokens,
    }, { signal: options?.signal });
    repairAttempts = attempt;
    const repairedAssessment = assessInterviewAnswer(context, repaired);
    if (!isBetterAssessment(repairedAssessment, best.assessment, context.maxWords)) break;
    best = { text: repaired, assessment: repairedAssessment };
    if (best.assessment.missingCritical.length === 0) break;
  }
  const normalized = normalizeFollowupCausality(best.text, context);
  if (normalized !== best.text) {
    const normalizedAssessment = assessInterviewAnswer(context, normalized);
    if (isBetterAssessment(normalizedAssessment, best.assessment, context.maxWords)) best = { text: normalized, assessment: normalizedAssessment };
  }
  return { text: best.text, repaired: best.text !== draft, repairAttempts, assessment: best.assessment };
}

function coverageRequirements(context: InterviewContext): CoverageRequirement[] {
  const requirements: CoverageRequirement[] = [];
  const add = (label: string, ...patterns: RegExp[]) => requirements.push({
    id: requirementId(label), label, patterns, severity: 'critical', scope: 'answer',
  });

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
      if (/\b(?:fetch|async|poll|retry|request|response|timeout)\b/i.test(`${context.question} ${context.screenFacts.join(' ')}`)) {
        add('await fetch before reading the response', /\bawait\s+fetch/i);
        add('response status handling', /response\.(?:ok|status)|status\s*===?\s*200/i);
        add('bounded polling or backoff', /\b(?:backoff|delay|interval|poll|attempt|maxAttempts|retry)\b/i);
        add('error, timeout, or cancellation handling', /\b(?:throw|catch|error|abort|timeout|signal)\b/i);
      }
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
  if (context.subquestions.length > 1) requirements.push({
    id: 'multipart-order',
    label: 'a numbered response covering every question part in the original order',
    patterns: [],
    severity: 'advisory',
    scope: 'answer',
  });
  if (/\bedge cases?\b/i.test(context.question)) addEdgeCaseRequirements(context, requirements);
  if (context.question.match(/\btime complexity\b/i)) add('time complexity', /\btime complexity\b|\bO\([^)]+\)/i);
  if (context.question.match(/\bspace complexity\b/i)) add('space complexity', /\bspace complexity\b|\bO\([^)]+\)\s+space\b|\bspace\s+(?:is|of)\s+O\([^)]+\)/i);
  if (context.question.match(/\btrade-?offs?\b/i)) add('the requested tradeoff', /\btrade-?off\b|\b(?:memory|latency|readability) cost\b/i);
  if (context.question.match(/^\s*why\??\s*$/i)) add('explicit causal reasoning for the preceding answer', CAUSAL_REASON_PATTERN);
  if (context.anchor && /\b(?:trade-?off|memory|readability|complexity)\b/i.test(context.anchor.answer)) add('the preceding answer’s specific tradeoff', /\b(?:trade-?off|memory|readability|complexity)\b/i);
  if (context.anchor && /\btrade-?off\b/i.test(context.anchor.question)) add('the preceding question’s tradeoff', /\b(?:trade-?off|memory|readability|complexity)\b/i);
  if (/\btomorrow\b/i.test(context.question)) add('the explicit tomorrow deadline', /\btomorrow\b|\bnext day\b/i);
  const activeDeadline = context.activeConstraints.find((item) => item.family === 'deadline');
  if (activeDeadline && /\btomorrow\b/i.test(activeDeadline.value)) add('the active release-tomorrow deadline', /\btomorrow\b|\bnext day\b/i);
  if (context.questionType === 'planning') add('an ordered execution plan', /\b(?:first|then|morning|afternoon|1[.)]|2[.)])\b/i);
  if (context.activeConstraints.some((item) => item.family === 'consistency' && /eventual/i.test(item.value))) {
    add('the active eventual-consistency constraint', /\beventual(?:ly)? consistent|eventual consistency\b/i);
    add('observable readiness or terminal state', /\b(?:poll|status|observable|terminal state|read-after-write|converge)\b/i);
    add('a bounded timeout or retry limit', /\b(?:bound(?:ed)?|timeout|max(?:imum)? attempts?|deadline|retry limit)\b/i);
  }
  if (context.supersededConstraints.length > 0 || /^\s*(?:actually|instead|correction|assume)\b/i.test(context.question)) {
    add('an explicit revision using the newest correction', /\b(?:instead|change|revise|updated|now|given that)\b/i);
  }
  if (context.ambiguous) {
    add('stated uncertainty or assumption', /\b(?:uncertain|cannot verify|not enough information|assum|undocumented|I would not claim)\b/i);
    add('a concrete verification or clarification step', /\b(?:verify|documentation|clarify|contract|test)\b/i);
  }
  if (context.screenConflict) add('an explicit spoken-versus-visible requirement conflict', /\b(?:conflict|spoken|screen|visible|newer requirement|interviewer)\b/i);
  const screenText = context.screenFacts.join(' ');
  if (/\bfetch\b/i.test(screenText)) add('the visible fetch call', /\bfetch\b/i);
  if (/\bfetch without await\b|\bwithout await\b/i.test(screenText)) add('await the visible fetch call', /\bawait\s+fetch\b/i);
  if (/\b(?:fixed sleep|fixed wait)\b/i.test(screenText)) {
    add('replace the visible fixed wait', /\b(?:avoid|replace|remove|not use|instead of)\b[^.]{0,60}\b(?:fixed (?:sleep|wait)|sleep)\b|\b(?:poll|observable readiness)\b/i);
    add('bounded polling for visible asynchronous readiness', /\b(?:bound(?:ed)?|timeout|max(?:imum)? attempts?|retry limit)\b[^.]{0,60}\b(?:poll|retry|readiness)\b|\b(?:poll|retry|readiness)\b[^.]{0,60}\b(?:bound(?:ed)?|timeout|max(?:imum)? attempts?|retry limit)\b/i);
  }
  if (context.anchor?.decisionTerms.length) {
    requirements.push({
      id: 'follow-up-anchor-decision',
      label: `an explicit reason tied to the prior decision (${context.anchor.decisionTerms.join(' or ')})`,
      patterns: context.anchor.decisionTerms.map((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i')),
      severity: 'critical',
      scope: 'answer',
    });
  }
  const activeConsistency = context.activeConstraints.find((item) => item.family === 'consistency');
  if (activeConsistency && /eventual/i.test(activeConsistency.value)) {
    const activeRequirement = requirements.find((item) => item.label === 'the active eventual-consistency constraint');
    if (activeRequirement) activeRequirement.forbiddenPatterns = [/\b(?:assum\w*|use|rely|expect|assert\w*)\b[^.]{0,40}\b(?:immediate|strong) consistency\b/i];
  }
  associateRequirementsWithSubquestions(context.subquestions, requirements);
  return requirements.filter((requirement, index) => requirements.findIndex((item) => item.id === requirement.id) === index);
}

export function classifyInterviewComplexity(context: InterviewContext): { complex: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (['coding', 'debugging', 'test-strategy', 'planning'].includes(context.questionType)) reasons.push(context.questionType);
  if (context.subquestions.length > 1) reasons.push('multipart');
  if (context.supersededConstraints.length > 0 || /^\s*(?:actually|instead|correction|assume)\b/i.test(context.question)) reasons.push('correction');
  if (context.anchor) reasons.push('follow-up');
  if (context.ambiguous) reasons.push('ambiguity');
  if (context.screenConflict) reasons.push('screen-conflict');
  if (/\b(?:summari[sz]e|synthesis|using (?:our|the) corrected|first-day plan)\b/i.test(context.question)) reasons.push('synthesis');
  return { complex: reasons.length > 0, reasons };
}

export function decomposeInterviewQuestion(question: string): string[] {
  const normalized = question.trim();
  if (!normalized) return [];
  const parts = normalized
    .split(/\?\s*|,\s+(?=(?:and\s+)?(?:what|why|how|when|which|who|can|could|would)\b)/i)
    .map((part) => part.replace(/^and\s+/i, '').trim().replace(/[?.]+$/, ''))
    .filter(Boolean);
  return parts.length > 1 ? parts.slice(0, 6) : [normalized.replace(/[?.]+$/, '')];
}

function compileConstraints(transcript: string): { active: InterviewConstraint[]; superseded: InterviewConstraint[] } {
  const candidates: InterviewConstraint[] = [];
  transcript.split(/\r?\n/).forEach((line, sourceIndex) => {
    const match = line.match(/^([^:]{1,60}):\s*(.+)$/);
    if (!match || !/^(?:interviewer|them|recruiter|hiring manager|panelist|speaker\s*\d*)$/i.test(match[1].replace(/\s+\(still speaking\)$/i, '').trim())) return;
    const value = match[2].trim();
    let family: InterviewConstraint['family'] | null = null;
    if (/\b(?:eventual(?:ly)? consistent|strong consistency|immediate consistency|consistency model)\b/i.test(value)) family = 'consistency';
    else if (/\b(?:fixed wait|fixed sleep|hard wait|observable readiness|avoid .*wait)\b/i.test(value)) family = 'wait-strategy';
    else if (/\b(?:tomorrow|two days|2 days|deadline|first day)\b/i.test(value)) family = 'deadline';
    else if (/\b(?:switch|use|write|implement)\b[^.?!]{0,40}\b(?:JavaScript|TypeScript|Python|Java)\b/i.test(value)) family = 'language';
    else if (/^\s*(?:actually|instead|correction|assume)\b/i.test(value)) family = 'general';
    if (family) candidates.push({ family, value, sourceIndex });
  });
  const latestByFamily = new Map<InterviewConstraint['family'], InterviewConstraint>();
  for (const candidate of candidates) latestByFamily.set(candidate.family, candidate);
  const active = [...latestByFamily.values()].sort((left, right) => left.sourceIndex - right.sourceIndex);
  const activeSet = new Set(active);
  return { active, superseded: candidates.filter((candidate) => !activeSet.has(candidate)) };
}

function buildConversationAnchor(transcript: string, currentQuestion: string): InterviewConversationAnchor | null {
  if (!/^(?:why|how so|what would you change|what about that|can you elaborate)\??$/i.test(currentQuestion.trim())) return null;
  const entries = transcript.split(/\r?\n/).map((line) => line.match(/^([^:]{1,60}):\s*(.+)$/)).filter((match): match is RegExpMatchArray => Boolean(match));
  let question = '';
  let answer = '';
  for (const entry of entries) {
    const speaker = entry[1].trim();
    const text = entry[2].trim();
    if (/^(?:interviewer|them|recruiter|hiring manager|panelist)$/i.test(speaker) && text !== currentQuestion && /\?|\b(?:what|why|how|tell me|explain|describe)\b/i.test(text)) {
      question = text;
      answer = '';
    } else if (/^(?:candidate|you)$/i.test(speaker) && question) {
      answer = text;
    }
  }
  return question && answer ? { question, answer, decisionTerms: extractDecisionTerms(answer) } : null;
}

function buildRepairPrompt(draft: string, assessment: InterviewAssessment, context: InterviewContext, attempt: number): string {
  const unresolved = context.requirements.filter((requirement) => assessment.missing.includes(requirement.label));
  const items = unresolved.map((requirement) => {
    const part = requirement.subquestionIndex === undefined ? '' : ` [question part ${requirement.subquestionIndex + 1}]`;
    return `- ${requirement.severity.toUpperCase()} ${requirement.id}${part}: ${requirement.label}`;
  });
  if (assessment.missingAdvisory.some((item) => item.startsWith('concise answer'))) items.push(`- ADVISORY answer-length: ${assessment.missingAdvisory.find((item) => item.startsWith('concise answer'))}`);
  return `<draft_answer>\n${draft}\n</draft_answer>\nTargeted repair ${attempt} of 2. Preserve all correct content and fix only the unresolved items below. Every CRITICAL item is mandatory. For ${context.subquestions.length} question parts, use exactly ${context.subquestions.map((_, index) => `${index + 1}.`).join(', ')} in that order and put each part's content in its matching numbered section.\n${items.join('\n')}\nStay within ${context.maxWords} words. Output only the improved candidate answer.`;
}

function isBetterAssessment(candidate: InterviewAssessment, current: InterviewAssessment, maxWords: number): boolean {
  if (candidate.missingCritical.length !== current.missingCritical.length) return candidate.missingCritical.length < current.missingCritical.length;
  if (candidate.missing.length !== current.missing.length) return candidate.missing.length < current.missing.length;
  const candidateExcess = Math.max(0, candidate.wordCount - maxWords);
  const currentExcess = Math.max(0, current.wordCount - maxWords);
  return candidateExcess < currentExcess;
}

function numberedAnswerSections(answer: string): string[] {
  const matches = [...answer.matchAll(/(?:^|\n)\s*(\d+)[.)]\s*/g)];
  return matches.map((match, index) => answer.slice((match.index || 0) + match[0].length, matches[index + 1]?.index ?? answer.length));
}

function hasOrderedNumberedParts(answer: string, count: number): boolean {
  const numbers = [...answer.matchAll(/(?:^|\n)\s*(\d+)[.)]\s+/g)].map((match) => Number(match[1]));
  return count > 1 && Array.from({ length: count }, (_, index) => index + 1).every((number, index) => numbers[index] === number);
}

function associateRequirementsWithSubquestions(subquestions: string[], requirements: CoverageRequirement[]): void {
  if (subquestions.length < 2) return;
  const concepts: Array<[RegExp, RegExp]> = [
    [/edge cases?/i, /edge case|empty input|duplicate input|unicode input|large input/i],
    [/time complexity/i, /time complexity/i],
    [/space complexity/i, /space complexity/i],
    [/trade-?offs?/i, /trade-?off/i],
  ];
  subquestions.forEach((subquestion, subquestionIndex) => {
    for (const [questionPattern, labelPattern] of concepts) {
      if (!questionPattern.test(subquestion)) continue;
      requirements.filter((requirement) => labelPattern.test(requirement.label)).forEach((requirement) => {
        requirement.subquestionIndex = subquestionIndex;
        requirement.scope = 'subquestion-section';
      });
    }
  });
}

function addEdgeCaseRequirements(context: InterviewContext, requirements: CoverageRequirement[]): void {
  const source = `${context.question} ${context.screenFacts.join(' ')}`;
  const add = (id: string, label: string, pattern: RegExp) => requirements.push({ id, label, patterns: [pattern], severity: 'critical', scope: 'answer' });
  add('edge-empty-input', 'empty-input edge case', /\b(?:empty|zero-length)\b/i);
  if (/\b(?:string|substring|character|array|collection|duplicate)\b/i.test(source)) {
    add('edge-duplicate-input', 'duplicate-input edge case', /\b(?:duplicate|repeat(?:ed|ing)?|same character)\b/i);
  }
  if (/\b(?:string|substring|character|text|unicode)\b/i.test(source)) add('edge-unicode-input', 'Unicode-input edge case', /\bUnicode\b|surrogate pair|code point|grapheme/i);
  add('edge-large-input', 'large-input edge case', /\b(?:large|maximum|max-size|scale|performance)\b/i);
}

function extractDecisionTerms(answer: string): string[] {
  const preferred = ['readability', 'memory', 'latency', 'complexity', 'maintainability', 'correctness', 'polling', 'timeout', 'isolation', 'reliability'];
  const matched = preferred.filter((term) => new RegExp(`\\b${term}\\b`, 'i').test(answer));
  if (matched.length) return matched.slice(0, 3);
  const ignored = new Set(['would', 'choose', 'because', 'that', 'this', 'with', 'from', 'over', 'small', 'answer']);
  return answer.toLowerCase().match(/[a-z][a-z-]{5,}/g)?.filter((term, index, all) => !ignored.has(term) && all.indexOf(term) === index).slice(0, 2) || [];
}

function normalizeFollowupCausality(answer: string, context: InterviewContext): string {
  const trimmed = answer.trim();
  if (!/^why\??$/i.test(context.question.trim()) || CAUSAL_REASON_PATTERN.test(trimmed) || !context.anchor?.decisionTerms.some((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(trimmed))) return answer;
  const first = trimmed.charAt(0);
  const rest = /^[A-Z][a-z]/.test(trimmed) ? `${first.toLowerCase()}${trimmed.slice(1)}` : trimmed;
  return `Because ${rest}`;
}

function requirementId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectScreenConflict(question: string, screenFacts: string[]): boolean {
  if (screenFacts.length === 0) return false;
  const screen = screenFacts.join(' ');
  if (/\b(?:Python)\b/i.test(question) && /\b(?:JavaScript|TypeScript)\b/i.test(screen)) return true;
  if (/\b(?:avoid|without|not use)\b[^.?!]{0,30}\b(?:fixed wait|sleep)\b/i.test(question) && /\b(?:fixed wait|sleep)\b/i.test(screen)) return true;
  return /\b(?:actually|instead|conflict|new requirement)\b/i.test(question);
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
