import { describe, expect, it } from 'vitest';
import { buildInterviewPresentation } from '../../renderer/src/lib/interviewPresentation';

describe('interview answer presentation quality', () => {
  it('keeps the immediate answer under the live reading budget', () => {
    const content = `${'I would prioritize the highest-risk checkout behavior first. '.repeat(8)}\n\nThen I would cover the API and critical smoke path.`;
    const result = buildInterviewPresentation(content);
    expect(result.sayNow.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(55);
    expect(result.supporting.length).toBeGreaterThan(0);
  });

  it('keeps implementation code available as supporting detail', () => {
    const result = buildInterviewPresentation('I would use bounded polling.\n\n```ts\nconst response = await fetch(url)\n```');
    expect(result.sayNow).toContain('bounded polling');
    expect(result.supporting).toContain('await fetch');
  });
});
