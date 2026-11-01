import { describe, expect, it } from 'vitest';
import { parseClaudeLines, parseClaudeLogs } from '../src/parsers/claude.ts';
import type { AssistantEvent, UserEvent } from '../src/types.ts';
import { FIXTURES } from './helpers.ts';

const assistants = (events: { kind: string }[]): AssistantEvent[] =>
  events.filter((e): e is AssistantEvent => e.kind === 'assistant');
const users = (events: { kind: string }[]): UserEvent[] =>
  events.filter((e): e is UserEvent => e.kind === 'user');

describe('parseClaudeLogs on the fixture folder', async () => {
  const { events, report } = await parseClaudeLogs([FIXTURES]);
  const replies = assistants(events);

  it('reads every .jsonl file, including subagent folders and empty files', () => {
    expect(report.files).toBe(4);
    expect(report.lines).toBe(23);
  });

  it('skips broken lines without failing', () => {
    expect(report.malformedLines).toBe(2); // plain text and a JSON array
    expect(report.ignoredLines).toBe(4); // summary, meta, snapshot, bad timestamp
    expect(report.duplicateLines).toBe(1);
  });

  it('merges the lines of one API response so usage is counted once', () => {
    const first = replies.find((e) => e.key.startsWith('msg_1:'));
    expect(first?.usage).toEqual({
      input: 10,
      output: 200,
      cacheRead: 5000,
      cacheWrite5m: 1000,
      cacheWrite1h: 0,
    });
    expect(first?.tools).toEqual(['Read']);
    expect(replies.filter((e) => e.key.startsWith('msg_1:'))).toHaveLength(1);
  });

  it('keeps one copy of a line that appears twice', () => {
    const second = replies.find((e) => e.key.startsWith('msg_2:'));
    expect(second?.tools).toEqual(['Edit', 'mcp__github__create_pull_request']);
  });

  it('finds every response', () => {
    expect(replies.map((e) => e.model).sort()).toEqual([
      '<synthetic>',
      'claude-3-5-sonnet-20241022',
      'claude-haiku-4-5-20251001',
      'claude-opus-4-1-20250805',
      'claude-sonnet-4-5-20250929',
      'claude-sonnet-4-5-20250929',
      'gpt-imaginary-1',
    ]);
  });

  it('splits cache writes by TTL', () => {
    const opus = replies.find((e) => e.model.startsWith('claude-opus'));
    expect(opus?.usage?.cacheWrite1h).toBe(2000);
    expect(opus?.usage?.cacheWrite5m).toBe(0);
  });

  it('names projects after the working directory on any OS', () => {
    const projects = new Set(events.map((e) => e.project));
    expect(projects).toEqual(new Set(['demo-app', 'win-tool']));
  });

  it('gives lines without a cwd the project of their session', () => {
    const legacy = replies.find((e) => e.model === 'claude-3-5-sonnet-20241022');
    expect(legacy?.project).toBe('win-tool');
  });

  it('marks subagent logs as sidechains', () => {
    const haiku = replies.find((e) => e.model.startsWith('claude-haiku'));
    expect(haiku?.isSidechain).toBe(true);
    expect(haiku?.sessionId).toBe('sess-a');
  });

  it('counts phrases in visible text only, never in hidden thinking', () => {
    const first = replies.find((e) => e.key.startsWith('msg_1:'));
    expect(first?.phrases).toEqual({ absolutelyRight: 1 });
    const opus = replies.find((e) => e.model.startsWith('claude-opus'));
    expect(opus?.phrases).toMatchObject({ absolutelyRight: 1, apologies: 1, shouldWorkNow: 1 });
  });

  it('tells typed prompts apart from tool results, commands and interruptions', () => {
    const userEvents = users(events);
    expect(userEvents.filter((e) => e.isPrompt)).toHaveLength(3);
    const interrupted = userEvents.find((e) => e.phrases.interrupted);
    expect(interrupted?.isPrompt).toBe(false);
    const polite = userEvents.find((e) => e.phrases.please);
    expect(polite?.phrases).toEqual({ please: 1, thanks: 1 });
  });

  it('returns events sorted by time', () => {
    const times = events.map((e) => e.timestamp.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('skips files modified before the requested start', async () => {
    const result = await parseClaudeLogs([FIXTURES], { modifiedAfter: new Date('2999-01-01') });
    expect(result.report.files).toBe(0);
    expect(result.events).toHaveLength(0);
  });
});

describe('parseClaudeLines', () => {
  it('survives garbage of every kind', () => {
    const lines = [
      '',
      '   ',
      'null',
      '42',
      '"string"',
      '{"type":"assistant"}',
      '{"type":"assistant","timestamp":"2026-01-01T00:00:00Z","message":"nope"}',
      '{"type":"user","timestamp":"2026-01-01T00:00:00Z","message":{"content":42}}',
      '{"type":"assistant","timestamp":"2026-01-01T00:00:00Z","message":{"content":[null,1,{"type":"tool_use"}],"usage":{"input_tokens":-5,"output_tokens":"9"}}}',
      '{"unterminated": ',
    ];
    const { events, report } = parseClaudeLines(lines);
    expect(report.malformedLines).toBe(4);
    const reply = assistants(events)[0];
    expect(reply?.model).toBe('unknown');
    expect(reply?.usage).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
    });
  });

  it('accepts responses without a message id', () => {
    const line = JSON.stringify({
      type: 'assistant',
      uuid: 'only-uuid',
      sessionId: 's',
      timestamp: '2026-05-05T10:00:00Z',
      message: { model: 'claude-opus-5-5', content: [{ type: 'text', text: 'hi' }] },
    });
    const { events } = parseClaudeLines([line]);
    expect(assistants(events)[0]?.key).toBe('only-uuid');
  });
});
