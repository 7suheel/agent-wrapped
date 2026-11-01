/** Token counts reported by the API for one response. */
export interface TokenUsage {
  input: number;
  output: number;
  /** Tokens written to the prompt cache with a 5-minute TTL. */
  cacheWrite5m: number;
  /** Tokens written to the prompt cache with a 1-hour TTL. */
  cacheWrite1h: number;
  cacheRead: number;
}

/** Phrase counters filled while parsing, so message text never has to be kept in memory. */
export type PhraseCounts = Record<string, number>;

/** One API response from the agent (several log lines can belong to the same response). */
export interface AssistantEvent {
  kind: 'assistant';
  /** Stable id used to de-duplicate repeated usage across log lines. */
  key: string;
  sessionId: string;
  project: string;
  timestamp: Date;
  model: string;
  usage: TokenUsage | null;
  tools: string[];
  phrases: PhraseCounts;
  isSidechain: boolean;
}

/** A message from the human (a typed prompt or an interruption), not a tool result. */
export interface UserEvent {
  kind: 'user';
  sessionId: string;
  project: string;
  timestamp: Date;
  /** True for a prompt the human typed (false for tool results). */
  isPrompt: boolean;
  phrases: PhraseCounts;
  isSidechain: boolean;
}

export type AgentEvent = AssistantEvent | UserEvent;

export interface ParseReport {
  agent: AgentName;
  roots: string[];
  files: number;
  lines: number;
  /** Lines that were not valid JSON (skipped, never fatal). */
  malformedLines: number;
  /** Valid JSON lines that carried nothing we use (metadata, snapshots, ...). */
  ignoredLines: number;
  /** Log lines seen twice (e.g. history copied into a resumed session). */
  duplicateLines: number;
}

export interface ParseResult {
  events: AgentEvent[];
  report: ParseReport;
}

export type AgentName = 'claude-code';

export interface DateRange {
  from: Date;
  to: Date;
  label: string;
}
