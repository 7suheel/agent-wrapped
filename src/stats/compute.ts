import { costOf, modelInfo } from '../pricing.ts';
import type { AgentEvent, AssistantEvent, DateRange, PhraseCounts, TokenUsage } from '../types.ts';
import { addPhrases } from './phrases.ts';
import { assignPersonality, type Personality } from './personality.ts';

/** A pause longer than this inside a session doesn't count as time spent. */
export const IDLE_GAP_MS = 15 * 60 * 1000;
/** Time credited after the last event of a burst (reading the answer, typing the next prompt). */
export const TAIL_MS = 60 * 1000;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface NamedCount {
  name: string;
  count: number;
}

export interface ModelStat {
  id: string;
  name: string;
  responses: number;
  tokens: number;
  cost: number | null;
}

export interface ProjectStat {
  name: string;
  sessions: number;
  activeMs: number;
  responses: number;
}

export interface WrappedStats {
  period: { from: string; to: string; label: string };
  generatedAt: string;
  empty: boolean;

  sessions: number;
  activeDays: number;
  totalActiveMs: number;
  longestSession: { activeMs: number; date: string; project: string } | null;
  prompts: number;
  responses: number;

  tokens: TokenUsage & { total: number };
  cost: { total: number; unpricedModels: string[] };

  models: ModelStat[];
  topModel: ModelStat | null;
  projects: ProjectStat[];
  topProject: ProjectStat | null;

  /** Responses + prompts per local hour (0-23). */
  hours: number[];
  /** Responses + prompts per weekday (0 = Sunday). */
  weekdays: number[];
  /** [weekday][hour] activity grid. */
  heatmap: number[][];
  peakHour: number | null;
  peakWeekday: string | null;
  busiestDay: { date: string; count: number } | null;

  tools: NamedCount[];
  toolCalls: number;
  subagentResponses: number;

  phrases: { agent: PhraseCounts; user: PhraseCounts };
  lateNightSessions: number;
  longestStreak: { days: number; from: string; to: string } | null;
  currentStreak: number;

  personality: Personality;
}

export interface ComputeOptions {
  /** "Today", for the current streak (default: now). */
  now?: Date;
}

interface SessionAcc {
  id: string;
  project: string;
  times: number[];
  lateNight: boolean;
}

export function computeStats(
  allEvents: AgentEvent[],
  range: DateRange,
  options: ComputeOptions = {},
): WrappedStats {
  const now = options.now ?? new Date();
  const from = range.from.getTime();
  const to = range.to.getTime();
  const events = allEvents.filter((e) => {
    const t = e.timestamp.getTime();
    return t >= from && t < to;
  });

  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, total: 0 };
  let totalCost = 0;
  const unpriced = new Set<string>();
  const models = new Map<string, ModelStat>();
  const tools = new Map<string, number>();
  const hours = new Array<number>(24).fill(0);
  const weekdays = new Array<number>(7).fill(0);
  const heatmap = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const days = new Map<string, number>();
  const sessions = new Map<string, SessionAcc>();
  const agentPhrases: PhraseCounts = {};
  const userPhrases: PhraseCounts = {};
  let prompts = 0;
  let responses = 0;
  let subagentResponses = 0;
  let toolCalls = 0;

  for (const event of events) {
    const date = event.timestamp;
    const hour = date.getHours();
    const weekday = date.getDay();

    let session = sessions.get(event.sessionId);
    if (!session) {
      session = { id: event.sessionId, project: event.project, times: [], lateNight: false };
      sessions.set(event.sessionId, session);
    }
    session.times.push(date.getTime());

    const countsAsActivity =
      event.kind === 'assistant' ? !event.isSidechain : event.isPrompt || !event.isSidechain;
    if (countsAsActivity) {
      hours[hour]!++;
      weekdays[weekday]!++;
      heatmap[weekday]![hour]!++;
      const day = dayKey(date);
      days.set(day, (days.get(day) ?? 0) + 1);
      if (hour >= 2 && hour < 5) session.lateNight = true;
    }

    if (event.kind === 'user') {
      if (event.isPrompt) prompts++;
      addPhrases(userPhrases, event.phrases);
      continue;
    }

    // "<synthetic>" marks messages Claude Code wrote itself (errors, notices): no API call.
    if (event.model.startsWith('<')) continue;
    responses++;
    if (event.isSidechain) subagentResponses++;
    addPhrases(agentPhrases, event.phrases);
    for (const tool of event.tools) {
      const name = toolName(tool);
      tools.set(name, (tools.get(name) ?? 0) + 1);
      toolCalls++;
    }
    accountModel(event, models, tokens, unpriced, (cost) => (totalCost += cost));
  }
  tokens.total =
    tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite5m + tokens.cacheWrite1h;

  // Sessions: active time is the sum of gaps shorter than IDLE_GAP_MS.
  const projects = new Map<string, ProjectStat>();
  let totalActiveMs = 0;
  let longest: WrappedStats['longestSession'] = null;
  let lateNightSessions = 0;
  for (const session of sessions.values()) {
    const activeMs = activeTime(session.times);
    totalActiveMs += activeMs;
    if (session.lateNight) lateNightSessions++;
    if (!longest || activeMs > longest.activeMs) {
      longest = {
        activeMs,
        date: dayKey(new Date(session.times[0]!)),
        project: session.project,
      };
    }
    const project = projects.get(session.project) ?? {
      name: session.project,
      sessions: 0,
      activeMs: 0,
      responses: 0,
    };
    project.sessions++;
    project.activeMs += activeMs;
    projects.set(session.project, project);
  }
  for (const event of events) {
    if (event.kind === 'assistant' && !event.model.startsWith('<')) {
      const project = projects.get(event.project);
      if (project) project.responses++;
    }
  }

  const modelList = [...models.values()].sort((a, b) => b.responses - a.responses);
  const projectList = [...projects.values()].sort(
    (a, b) => b.activeMs - a.activeMs || b.responses - a.responses,
  );
  const toolList = [...tools.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const dayList = [...days.entries()].sort((a, b) => b[1] - a[1]);
  const streaks = computeStreaks([...days.keys()], now);
  const total = hours.reduce((a, b) => a + b, 0);

  const partial: Omit<WrappedStats, 'personality'> = {
    period: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    generatedAt: now.toISOString(),
    empty: events.length === 0,
    sessions: sessions.size,
    activeDays: days.size,
    totalActiveMs,
    longestSession: longest,
    prompts,
    responses,
    tokens,
    cost: { total: totalCost, unpricedModels: [...unpriced].sort() },
    models: modelList,
    topModel: modelList[0] ?? null,
    projects: projectList,
    topProject: projectList[0] ?? null,
    hours,
    weekdays,
    heatmap,
    peakHour: total ? argMax(hours) : null,
    peakWeekday: total ? WEEKDAYS[argMax(weekdays)]! : null,
    busiestDay: dayList[0] ? { date: dayList[0][0], count: dayList[0][1] } : null,
    tools: toolList,
    toolCalls,
    subagentResponses,
    phrases: { agent: agentPhrases, user: userPhrases },
    lateNightSessions,
    longestStreak: streaks.longest,
    currentStreak: streaks.current,
  };
  return { ...partial, personality: assignPersonality(partial) };
}

function accountModel(
  event: AssistantEvent,
  models: Map<string, ModelStat>,
  tokens: TokenUsage & { total: number },
  unpriced: Set<string>,
  addCost: (cost: number) => void,
): void {
  const info = modelInfo(event.model);
  const id = info.key ?? event.model;
  const stat = models.get(id) ?? { id, name: info.name, responses: 0, tokens: 0, cost: 0 };
  stat.responses++;
  const usage = event.usage;
  if (usage) {
    tokens.input += usage.input;
    tokens.output += usage.output;
    tokens.cacheRead += usage.cacheRead;
    tokens.cacheWrite5m += usage.cacheWrite5m;
    tokens.cacheWrite1h += usage.cacheWrite1h;
    stat.tokens +=
      usage.input + usage.output + usage.cacheRead + usage.cacheWrite5m + usage.cacheWrite1h;
    const cost = costOf(event.model, usage);
    if (cost === null) {
      unpriced.add(event.model);
      stat.cost = null;
    } else {
      addCost(cost);
      if (stat.cost !== null) stat.cost += cost;
    }
  }
  models.set(id, stat);
}

/** MCP tools are logged as "mcp__server__tool": show them as "server:tool". */
export function toolName(raw: string): string {
  const mcp = /^mcp__(.+?)__(.+)$/.exec(raw);
  if (mcp) return `${mcp[1]}:${mcp[2]}`;
  if (raw === 'Task') return 'Agent';
  return raw;
}

export function activeTime(times: number[]): number {
  if (times.length === 0) return 0;
  const sorted = [...times].sort((a, b) => a - b);
  let total = TAIL_MS;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i]! - sorted[i - 1]!;
    total += gap <= IDLE_GAP_MS ? gap : TAIL_MS;
  }
  return total;
}

/** Local calendar day, "YYYY-MM-DD". */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d) / 86_400_000);
}

export function computeStreaks(
  dayKeys: string[],
  now: Date,
): { longest: WrappedStats['longestStreak']; current: number } {
  if (dayKeys.length === 0) return { longest: null, current: 0 };
  const sorted = [...new Set(dayKeys)].sort();
  let best = { days: 1, from: sorted[0]!, to: sorted[0]! };
  let runStart = sorted[0]!;
  let runLength = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (dayNumber(sorted[i]!) - dayNumber(sorted[i - 1]!) === 1) {
      runLength++;
    } else {
      runStart = sorted[i]!;
      runLength = 1;
    }
    if (runLength > best.days) best = { days: runLength, from: runStart, to: sorted[i]! };
  }
  // Current streak: ends today or yesterday (today may not have started yet).
  const today = dayNumber(dayKey(now));
  const set = new Set(sorted.map(dayNumber));
  let cursor = set.has(today) ? today : today - 1;
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor--;
  }
  return { longest: best, current };
}

function argMax(values: number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i]! > values[best]!) best = i;
  return best;
}
