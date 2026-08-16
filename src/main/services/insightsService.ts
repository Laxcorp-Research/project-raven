/**
 * Post-meeting insights. Runs on the user's own LLM key — same prompts
 * the hosted proxy used, without a Raven backend.
 */

import { createLogger } from '../logger'
import { getFastProvider } from './ai/providerFactory'

const log = createLogger('Insights')

const INSIGHT_PROMPTS: Record<string, { key: string; prompt: string }> = {
  summary: {
    key: 'summary',
    prompt: 'Generate a concise meeting summary. Include: key discussion points, decisions made, and overall outcome. Use bullet points. Be specific with names, numbers, and commitments mentioned.',
  },
  action_items: {
    key: 'actionItems',
    prompt: 'Extract all action items from this meeting. For each action item provide: 1) What needs to be done, 2) Who is responsible (if mentioned), 3) Due date or timeline (if mentioned). Format as a JSON array of objects with fields: task, assignee, deadline. If assignee or deadline is not mentioned, use null.',
  },
  topics: {
    key: 'topics',
    prompt: `Identify the main topics discussed in this meeting. For each topic provide:
- topic: a clear, specific topic name (not generic like "Discussion" or "Conclusion")
- description: a 1-2 sentence description of what was discussed
- approximate_duration_percent: estimated percentage of meeting time spent on this topic (all must add to 100)

Return ONLY valid JSON - an array of objects. No markdown, no code fences, no explanation. Example:
[{"topic": "Q3 Revenue Analysis", "description": "Team reviewed Q3 numbers...", "approximate_duration_percent": 40}]`,
  },
  sentiment: {
    key: 'sentiment',
    prompt: `Analyze the sentiment of this meeting. Return ONLY valid JSON with this exact structure (no markdown, no code fences):
{
  "overall_sentiment": {
    "sentiment": "positive" or "neutral" or "negative",
    "confidence_score": 0.0 to 1.0,
    "reasoning": "one sentence explanation"
  },
  "key_sentiment_shifts": [
    {
      "moment": "specific moment description",
      "sentiment": "positive" or "slightly_positive" or "neutral" or "slightly_negative" or "negative",
      "description": "what caused the shift"
    }
  ],
  "per_speaker_sentiment": {
    "Speaker Name": {
      "sentiment": "positive" or "neutral" or "negative",
      "confidence_score": 0.0 to 1.0,
      "summary": "one sentence about their tone and demeanor"
    }
  }
}

Use ONLY these exact sentiment values: positive, slightly_positive, neutral, slightly_negative, negative. Do NOT combine them (no "neutral_to_slightly_positive").`,
  },
  key_phrases: {
    key: 'keyPhrases',
    prompt: `Extract the most important key phrases, technical terms, and meaningful concepts from this meeting.

Rules:
- Only include multi-word phrases or domain-specific single words (e.g., "SQL", "API", "Kubernetes")
- Exclude generic filler words like "second", "close", "okay", "yes", "no", "right", "start", "stop"
- Exclude common verbs and prepositions
- Order by importance/relevance to the meeting's purpose
- Maximum 15 items

Return ONLY a valid JSON array of strings. No markdown, no code fences. Example:
["database normalization", "SQL query optimization", "network latency"]`,
  },
}

export async function analyzeSession(params: {
  transcript: string
  features: string[]
  sessionId?: string
}): Promise<Record<string, unknown>> {
  const { transcript, features, sessionId } = params
  if (!transcript?.trim() || !features?.length) {
    return { error: 'Missing required fields: transcript, features' }
  }

  let provider
  try {
    provider = await getFastProvider()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No AI provider configured'
    return { error: message }
  }

  const results: Record<string, unknown> = { sessionId }
  const tasks = features
    .map((feature) => INSIGHT_PROMPTS[feature])
    .filter((config): config is { key: string; prompt: string } => !!config)
    .map((config) => ({
      key: config.key,
      promise: provider.generateShort({
        prompt: `${config.prompt}\n\nTranscript:\n${transcript}`,
        maxTokens: 2048,
      }),
    }))

  const settled = await Promise.allSettled(tasks.map((t) => t.promise))
  for (let i = 0; i < tasks.length; i++) {
    const result = settled[i]
    if (result.status === 'fulfilled') {
      results[tasks[i].key] = result.value
    } else {
      log.error('Insight task failed:', tasks[i].key, result.reason)
    }
  }

  return results
}
