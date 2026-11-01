import type { PhraseCounts } from '../types.ts';

/**
 * Phrases counted in the agent's visible replies (never its hidden reasoning).
 * Add a line here to track a new one; the key shows up in the --json output.
 */
export const AGENT_PHRASES: Record<string, RegExp> = {
  absolutelyRight:
    /\byou(?:'|’)?re\s+(?:absolutely|totally|completely)\s+right\b|\byou\s+are\s+(?:absolutely|totally|completely)\s+right\b/gi,
  youreRight: /\byou(?:'|’)?re\s+right\b|\byou\s+are\s+right\b/gi,
  greatQuestion: /\bgreat\s+(?:question|catch|point|idea)\b/gi,
  perfect: /\bperfect!/gi,
  apologies: /\bI\s+apologi[sz]e\b|\bmy\s+apologies\b|\bsorry\s+(?:about|for)\s+(?:that|the)\b/gi,
  shouldWorkNow:
    /\bshould\s+(?:now\s+)?work\s+now\b|\bthis\s+should\s+(?:fix|resolve)\s+(?:it|the|this)\b/gi,
  productionReady: /\bproduction[-\s]ready\b/gi,
};

/** Phrases counted in what the human typed. */
export const USER_PHRASES: Record<string, RegExp> = {
  please: /\bplease\b|\bpls\b|\bplz\b/gi,
  thanks: /\bthanks?\b|\bthank\s+you\b|\bthx\b|\bty\b/gi,
  interrupted: /\[Request interrupted by user/g,
  wtf: /\bwtf\b|\bwhy\s+(?:did|would)\s+you\b/gi,
};

export function countPhrases(text: string, phrases: Record<string, RegExp>): PhraseCounts {
  const counts: PhraseCounts = {};
  if (!text) return counts;
  for (const [key, pattern] of Object.entries(phrases)) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    if (matches?.length) counts[key] = matches.length;
  }
  return counts;
}

export function addPhrases(into: PhraseCounts, from: PhraseCounts): void {
  for (const [key, value] of Object.entries(from)) into[key] = (into[key] ?? 0) + value;
}
