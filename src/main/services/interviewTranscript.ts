export interface PreparedInterviewTranscript {
  transcript: string;
  latestCompletedQuestion: string;
  hasUnfinishedRemoteSpeech: boolean;
}

const TECHNICAL_CORRECTIONS: Array<[RegExp, string]> = [
  [/\bplay\s*right\b/gi, 'Playwright'],
  [/\btype\s*script\b/gi, 'TypeScript'],
  [/\bjava\s*script\b/gi, 'JavaScript'],
  [/\bget\s*hub\s+actions?\b/gi, 'GitHub Actions'],
  [/\brest\s+(?:a\s*p\s*i|API)\b/gi, 'REST API'],
  [/\bsea\s*eye\b/gi, 'CI'],
  [/\bsee\s*eye\b/gi, 'CI'],
  [/\bpost\s+gre\s*s(?:ql)?\b/gi, 'PostgreSQL'],
  [/\bkube(?:r|ra)\s*net(?:e|es)\b/gi, 'Kubernetes'],
  [/\bdocker\s+compose\b/gi, 'Docker Compose'],
];

export function normalizeInterviewTerms(text: string): string {
  return TECHNICAL_CORRECTIONS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text)
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function prepareInterviewTranscript(rawTranscript: string): PreparedInterviewTranscript {
  const parsed = rawTranscript
    .split(/\r?\n/)
    .map(parseLine)
    .filter((line): line is TranscriptLine => Boolean(line));
  const merged: TranscriptLine[] = [];

  for (const line of parsed) {
    const previous = merged.at(-1);
    if (previous && previous.speaker.toLowerCase() === line.speaker.toLowerCase() && previous.unfinished === line.unfinished) {
      previous.text = appendWithoutDuplicate(previous.text, line.text);
    } else {
      merged.push({ ...line });
    }
  }

  const completedRemote = merged.filter((line) => isRemoteSpeaker(line.speaker) && !line.unfinished);
  const latestQuestionLine = [...completedRemote].reverse().find((line) => isQuestionLike(line.text));
  const hasUnfinishedRemoteSpeech = merged.some((line, index) => index === merged.length - 1 && isRemoteSpeaker(line.speaker) && line.unfinished);

  return {
    transcript: merged.map((line) => `${line.speaker}${line.unfinished ? ' (still speaking)' : ''}: ${line.text}`).join('\n'),
    latestCompletedQuestion: latestQuestionLine?.text || '',
    hasUnfinishedRemoteSpeech,
  };
}

interface TranscriptLine {
  speaker: string;
  text: string;
  unfinished: boolean;
}

function parseLine(value: string): TranscriptLine | null {
  const match = value.trim().match(/^([^:]{1,60}?)(\s+\(still speaking\))?:\s*(.+)$/i);
  if (!match) return null;
  const text = normalizeInterviewTerms(match[3]);
  if (!text) return null;
  return { speaker: match[1].trim(), unfinished: Boolean(match[2]), text };
}

function isRemoteSpeaker(speaker: string): boolean {
  return /^(?:them|interviewer|recruiter|hiring manager|panelist|speaker\s*\d*)$/i.test(speaker.trim());
}

function isQuestionLike(text: string): boolean {
  return /\?|\b(?:what|why|how|when|where|which|who|can you|could you|would you|tell me|describe|explain|design|implement|fix|walk me through|give me)\b/i.test(text);
}

function appendWithoutDuplicate(previous: string, next: string): string {
  const left = previous.split(/\s+/);
  const right = next.split(/\s+/);
  const maxOverlap = Math.min(12, left.length, right.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    if (left.slice(-size).join(' ').toLowerCase() === right.slice(0, size).join(' ').toLowerCase()) {
      return [...left, ...right.slice(size)].join(' ');
    }
  }
  return `${previous} ${next}`.trim();
}
