import { describe, expect, it } from 'vitest';
import { parseClaudeLogs } from '../src/parsers/claude.ts';
import {
  IDLE_GAP_MS,
  TAIL_MS,
  activeTime,
  computeStats,
  computeStreaks,
  toolName,
} from '../src/stats/compute.ts';
import { FIXTURES, YEAR_2026, prompt, reply } from './helpers.ts';

describe('computeStats on the fixtures', async () => {
  const { events } = await parseClaudeLogs([FIXTURES]);
  const stats = computeStats(events, YEAR_2026, { now: new Date('2026-03-04T12:00:00Z') });

  it('counts sessions, days and prompts inside the period only', () => {
    expect(stats.sessions).toBe(2);
    expect(stats.activeDays).toBe(3);
    expect(stats.prompts).toBe(2); // the 2025 prompt is outside the year
    expect(stats.responses).toBe(6); // the <synthetic> notice is not a reply
    expect(stats.subagentResponses).toBe(1);
  });

  it('adds up tokens across models and subagents', () => {
    expect(stats.tokens).toEqual({
      input: 1145,
      output: 1660,
      cacheRead: 11000,
      cacheWrite5m: 1000,
      cacheWrite1h: 2000,
      total: 16805,
    });
  });

  it('estimates the cost and lists models it could not price', () => {
    expect(stats.cost.total).toBeCloseTo(0.100745, 6);
    expect(stats.cost.unpricedModels).toEqual(['gpt-imaginary-1']);
  });

  it('ranks models and projects', () => {
    expect(stats.topModel?.name).toBe('Sonnet 4.5');
    expect(stats.topModel?.responses).toBe(2);
    expect(stats.projects.map((p) => p.name)).toEqual(['win-tool', 'demo-app']);
  });

  it('measures active time without counting idle gaps', () => {
    expect(stats.totalActiveMs).toBe(342_000 + 360_000);
    expect(stats.longestSession).toEqual({
      activeMs: 360_000,
      date: '2026-01-01',
      project: 'win-tool',
    });
  });

  it('finds the peak hour, late nights and streaks', () => {
    expect(stats.peakHour).toBe(23);
    expect(stats.peakWeekday).toBe('Monday');
    expect(stats.lateNightSessions).toBe(1);
    expect(stats.longestStreak).toEqual({ days: 2, from: '2026-03-02', to: '2026-03-03' });
    expect(stats.currentStreak).toBe(2);
  });

  it('ranks tools and names MCP tools readably', () => {
    expect(stats.toolCalls).toBe(5);
    expect(stats.tools.map((t) => t.name).sort()).toEqual([
      'Bash',
      'Edit',
      'Grep',
      'Read',
      'github:create_pull_request',
    ]);
  });

  it('adds up the fun phrases', () => {
    expect(stats.phrases.agent).toEqual({
      absolutelyRight: 2,
      apologies: 1,
      shouldWorkNow: 1,
      greatQuestion: 1,
      perfect: 1,
    });
    expect(stats.phrases.user).toEqual({ please: 1, thanks: 1, interrupted: 1, wtf: 2 });
  });

  it('calls a two-session year a fresh start', () => {
    expect(stats.personality.id).toBe('newcomer');
  });
});

describe('computeStats edge cases', () => {
  it('handles a year without any activity', () => {
    const stats = computeStats([], YEAR_2026);
    expect(stats.empty).toBe(true);
    expect(stats.sessions).toBe(0);
    expect(stats.peakHour).toBeNull();
    expect(stats.topModel).toBeNull();
    expect(stats.longestStreak).toBeNull();
    expect(stats.personality.id).toBe('newcomer');
  });
});

describe('activeTime', () => {
  it('counts short gaps fully and long gaps as a short tail', () => {
    const t0 = Date.UTC(2026, 0, 1, 10);
    expect(activeTime([t0])).toBe(TAIL_MS);
    expect(activeTime([t0, t0 + 60_000])).toBe(TAIL_MS + 60_000);
    expect(activeTime([t0, t0 + IDLE_GAP_MS + 1])).toBe(TAIL_MS * 2);
  });
});

describe('computeStreaks', () => {
  it('finds the longest run of consecutive days, across months', () => {
    const { longest } = computeStreaks(
      ['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-05', '2026-02-06'],
      new Date('2026-06-01T12:00:00Z'),
    );
    expect(longest).toEqual({ days: 3, from: '2026-01-30', to: '2026-02-01' });
  });

  it('keeps the current streak alive until the day is over', () => {
    const days = ['2026-05-30', '2026-05-31'];
    expect(computeStreaks(days, new Date('2026-06-01T12:00:00Z')).current).toBe(2);
    expect(computeStreaks(days, new Date('2026-06-02T12:00:00Z')).current).toBe(0);
  });
});

describe('toolName', () => {
  it('shortens MCP tools and renames the subagent tool', () => {
    expect(toolName('mcp__linear__create_issue')).toBe('linear:create_issue');
    expect(toolName('Task')).toBe('Agent');
    expect(toolName('Bash')).toBe('Bash');
  });
});

describe('personality', () => {
  /** Several short sessions at the given UTC hours. */
  const sessionsAt = (hours: number[], extra: Parameters<typeof reply>[1] = {}) =>
    hours.flatMap((hour, i) => {
      const at = `2026-04-${String(1 + i).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`;
      return [
        prompt(at, { sessionId: `s${i}` }),
        reply(at.replace(':00:00Z', ':01:00Z'), { sessionId: `s${i}`, ...extra }),
      ];
    });

  it('spots a night owl', () => {
    const stats = computeStats(sessionsAt([23, 1, 2, 3, 0, 14]), YEAR_2026);
    expect(stats.personality.id).toBe('night-owl');
    expect(stats.personality.reason).toMatch(/between 10 PM and 5 AM/);
  });

  it('spots an early bird', () => {
    const stats = computeStats(sessionsAt([6, 6, 7, 8, 13, 15]), YEAR_2026);
    expect(stats.personality.id).toBe('early-bird');
  });

  it('spots a shell whisperer from tool use', () => {
    const tools = [...Array<string>(40).fill('Bash'), ...Array<string>(10).fill('Read')];
    const stats = computeStats(sessionsAt([10, 11, 14, 15], { tools }), YEAR_2026);
    expect(stats.personality.id).toBe('shell-whisperer');
  });

  it('falls back to the pragmatist when nothing stands out', () => {
    const stats = computeStats(sessionsAt([10, 11, 13, 14, 15, 16, 17]), YEAR_2026);
    expect(stats.personality.id).toBe('pragmatist');
  });

  it('lists runner-up traits', () => {
    const tools = Array<string>(40).fill('Edit');
    const stats = computeStats(sessionsAt([23, 1, 2, 3, 0], { tools }), YEAR_2026);
    expect(stats.personality.id).toBe('night-owl');
    expect(stats.personality.traits).toContain('The Refactorer');
  });
});
