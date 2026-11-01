import { fileURLToPath } from 'node:url';
import type { AssistantEvent, TokenUsage, UserEvent } from '../src/types.ts';

export const FIXTURES = fileURLToPath(new URL('./fixtures/claude/projects', import.meta.url));

const ZERO: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 };

let counter = 0;

/** A synthetic assistant response at an ISO time (tests run with TZ=UTC). */
export function reply(
  at: string,
  overrides: Partial<Omit<AssistantEvent, 'timestamp' | 'kind'>> = {},
): AssistantEvent {
  counter++;
  return {
    kind: 'assistant',
    key: `k${counter}`,
    sessionId: 's1',
    project: 'demo',
    model: 'claude-sonnet-4-5',
    usage: { ...ZERO, input: 100, output: 100 },
    tools: [],
    phrases: {},
    isSidechain: false,
    ...overrides,
    timestamp: new Date(at),
  };
}

export function prompt(
  at: string,
  overrides: Partial<Omit<UserEvent, 'timestamp' | 'kind'>> = {},
): UserEvent {
  return {
    kind: 'user',
    sessionId: 's1',
    project: 'demo',
    isPrompt: true,
    phrases: {},
    isSidechain: false,
    ...overrides,
    timestamp: new Date(at),
  };
}

export const YEAR_2026 = {
  from: new Date('2026-01-01T00:00:00Z'),
  to: new Date('2027-01-01T00:00:00Z'),
  label: '2026',
};
