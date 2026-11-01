/**
 * Model pricing in US dollars per million tokens (Anthropic first-party API rates).
 *
 * HOW TO UPDATE: edit a row or add one. Keys are `<family>-<major>.<minor>` as
 * produced by `modelKey()` (e.g. "claude-sonnet-4-5-20250929" -> "sonnet-4.5",
 * "claude-3-5-haiku-20241022" -> "haiku-3.5"). Cache prices default to the
 * standard multipliers (write 5m = 1.25x input, write 1h = 2x input, read = 0.1x
 * input) and only need to be set where a model differs.
 *
 * Current models checked against Anthropic's pricing on 2026-11-01. Legacy rows
 * are the published list prices at the time those models were current.
 * This is an estimate: subscription plans (Pro/Max) are not billed per token,
 * and Bedrock / Vertex prices can differ.
 */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite5m?: number;
  cacheWrite1h?: number;
  /** Higher rates when one request's prompt is larger than `threshold` tokens. */
  longContext?: { threshold: number; input: number; output: number };
}

export const PRICING_UPDATED = '2026-11-01';

export const MODEL_PRICES: Record<string, ModelPrice> = {
  // Fable / Mythos
  'fable-5.1': { input: 10, output: 50, cacheRead: 0.25 },
  'mythos-5.1': { input: 10, output: 50, cacheRead: 0.25 },
  'fable-5': { input: 10, output: 50 },
  'mythos-5': { input: 10, output: 50 },

  // Opus
  'opus-5.5': { input: 4, output: 20, cacheRead: 0.2 },
  'opus-5': { input: 5, output: 25 },
  'opus-4.8': { input: 5, output: 25 },
  'opus-4.7': { input: 5, output: 25 },
  'opus-4.6': { input: 5, output: 25 },
  'opus-4.5': { input: 5, output: 25 },
  'opus-4.1': { input: 15, output: 75 },
  'opus-4': { input: 15, output: 75 },
  'opus-3': { input: 15, output: 75 },

  // Sonnet
  'sonnet-5.5': { input: 2, output: 10 },
  'sonnet-5': { input: 2, output: 10 },
  'sonnet-4.6': { input: 3, output: 15 },
  'sonnet-4.5': {
    input: 3,
    output: 15,
    longContext: { threshold: 200_000, input: 6, output: 22.5 },
  },
  'sonnet-4': { input: 3, output: 15, longContext: { threshold: 200_000, input: 6, output: 22.5 } },
  'sonnet-3.7': { input: 3, output: 15 },
  'sonnet-3.5': { input: 3, output: 15 },

  // Haiku
  'haiku-5.5': {
    input: 0.1,
    output: 0.5,
    longContext: { threshold: 100_000, input: 0.5, output: 2.5 },
  },
  'haiku-4.5': { input: 1, output: 5 },
  'haiku-3.5': { input: 0.8, output: 4 },
  'haiku-3': { input: 0.25, output: 1.25 },
};

type Family = 'fable' | 'mythos' | 'opus' | 'sonnet' | 'haiku';

export interface ModelInfo {
  /** Pricing key, e.g. "opus-4.1". Null when the id isn't a recognisable Claude model. */
  key: string | null;
  /** Human name for cards, e.g. "Opus 4.1". */
  name: string;
}

/**
 * Understands every naming scheme seen in logs:
 * "claude-opus-4-1-20250805", "claude-3-5-sonnet-20241022", "claude-opus-5-5",
 * "us.anthropic.claude-sonnet-4-5-20250929-v1:0", "claude-sonnet-4-5@20250929".
 */
export function modelInfo(modelId: string): ModelInfo {
  const id = modelId.toLowerCase();
  // New style: family first. Minor is 1-2 digits, so 8-digit dates aren't read as one.
  const modern =
    /\b(?:claude-)?(fable|mythos|opus|sonnet|haiku)-(\d{1,2})(?:[-.](\d{1,2}))?(?!\d)/.exec(id);
  // Old style: version first ("claude-3-5-sonnet").
  const legacy = /claude-(\d)(?:[-.](\d))?-(opus|sonnet|haiku)/.exec(id);
  let family: Family | undefined;
  let major: string | undefined;
  let minor: string | undefined;
  if (legacy) {
    [, major, minor] = legacy;
    family = legacy[3] as Family;
  } else if (modern) {
    family = modern[1] as Family;
    [, , major, minor] = modern;
  }
  if (!family || !major) return { key: null, name: modelId };
  const version = minor ? `${major}.${minor}` : major;
  const name = `${family[0]!.toUpperCase()}${family.slice(1)} ${version}`;
  return { key: `${family}-${version}`, name };
}

export function priceFor(modelId: string): ModelPrice | undefined {
  const { key } = modelInfo(modelId);
  return key ? MODEL_PRICES[key] : undefined;
}

export interface UsageForCost {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
}

/** Estimated cost of one response in dollars, or null when the model has no price. */
export function costOf(modelId: string, usage: UsageForCost): number | null {
  const price = priceFor(modelId);
  if (!price) return null;
  const promptSize = usage.input + usage.cacheRead + usage.cacheWrite5m + usage.cacheWrite1h;
  const long = price.longContext && promptSize > price.longContext.threshold;
  const input = long ? price.longContext!.input : price.input;
  const output = long ? price.longContext!.output : price.output;
  const scale = input / price.input;
  const cacheRead = (price.cacheRead ?? price.input * 0.1) * scale;
  const cacheWrite5m = (price.cacheWrite5m ?? price.input * 1.25) * scale;
  const cacheWrite1h = (price.cacheWrite1h ?? price.input * 2) * scale;
  return (
    (usage.input * input +
      usage.output * output +
      usage.cacheRead * cacheRead +
      usage.cacheWrite5m * cacheWrite5m +
      usage.cacheWrite1h * cacheWrite1h) /
    1_000_000
  );
}
