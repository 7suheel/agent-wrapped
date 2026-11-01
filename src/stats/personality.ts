import { formatInt } from '../format.ts';
import type { WrappedStats } from './compute.ts';

export interface Personality {
  id: string;
  title: string;
  tagline: string;
  /** Why you got it, with your own numbers. */
  reason: string;
  /** Card gradient, from -> via -> to. */
  colors: [string, string, string];
  /** Runner-up archetypes you also qualify for. */
  traits: string[];
}

type Input = Omit<WrappedStats, 'personality'>;

interface Archetype {
  id: string;
  title: string;
  tagline: string;
  colors: [string, string, string];
  /** >= 1 means the archetype applies; higher means it fits better. */
  score: (s: Input) => number;
  reason: (s: Input) => string;
}

const share = (part: number, whole: number): number => (whole > 0 ? part / whole : 0);
const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);
const range = (values: number[], from: number, to: number): number => {
  let total = 0;
  for (let h = from; h !== to; h = (h + 1) % 24) total += values[h] ?? 0;
  return total;
};
const toolShare = (s: Input, names: string[]): number =>
  share(sum(s.tools.filter((t) => names.includes(t.name)).map((t) => t.count)), s.toolCalls);
const pct = (value: number): string => `${Math.round(value * 100)}%`;

/**
 * The rules. Each score is "your number / the threshold", so the archetype you
 * exceed by the widest margin wins. Thresholds are tuned so a typical heavy
 * user lands somewhere fun, not everyone on the same one.
 */
export const ARCHETYPES: Archetype[] = [
  {
    id: 'night-owl',
    title: 'The Night Owl',
    tagline: 'Your best commits happen after the city goes quiet.',
    colors: ['#1e1b4b', '#6d28d9', '#ec4899'],
    score: (s) => share(range(s.hours, 22, 5), sum(s.hours)) / 0.3,
    reason: (s) =>
      `${pct(share(range(s.hours, 22, 5), sum(s.hours)))} of your activity was between 10 PM and 5 AM.`,
  },
  {
    id: 'early-bird',
    title: 'The Early Bird',
    tagline: 'Shipping before most people finish their first coffee.',
    colors: ['#f59e0b', '#f97316', '#db2777'],
    score: (s) => share(range(s.hours, 5, 9), sum(s.hours)) / 0.22,
    reason: (s) =>
      `${pct(share(range(s.hours, 5, 9), sum(s.hours)))} of your activity was between 5 and 9 AM.`,
  },
  {
    id: 'token-burner',
    title: 'The Token Burner',
    tagline: 'Context windows fear you. GPUs know your name.',
    colors: ['#7f1d1d', '#ea580c', '#facc15'],
    score: (s) => share(s.cost.total, Math.max(s.activeDays, 1)) / 60,
    reason: (s) =>
      `About $${Math.round(share(s.cost.total, Math.max(s.activeDays, 1)))} of tokens per active day.`,
  },
  {
    id: 'refactorer',
    title: 'The Refactorer',
    tagline: 'Leaves every file a little better than they found it.',
    colors: ['#064e3b', '#10b981', '#a3e635'],
    score: (s) =>
      s.toolCalls >= 30 ? toolShare(s, ['Edit', 'MultiEdit', 'Write', 'NotebookEdit']) / 0.33 : 0,
    reason: (s) =>
      `${pct(toolShare(s, ['Edit', 'MultiEdit', 'Write', 'NotebookEdit']))} of all tool calls were edits.`,
  },
  {
    id: 'shell-whisperer',
    title: 'The Shell Whisperer',
    tagline: 'Why click when you can pipe?',
    colors: ['#022c22', '#0d9488', '#22d3ee'],
    score: (s) =>
      s.toolCalls >= 30 ? toolShare(s, ['Bash', 'BashOutput', 'KillShell']) / 0.42 : 0,
    reason: (s) =>
      `${pct(toolShare(s, ['Bash', 'BashOutput', 'KillShell']))} of all tool calls ran a shell command.`,
  },
  {
    id: 'archaeologist',
    title: 'The Code Archaeologist',
    tagline: 'Reads ten files before touching one. Respect.',
    colors: ['#451a03', '#b45309', '#fcd34d'],
    score: (s) => (s.toolCalls >= 30 ? toolShare(s, ['Read', 'Grep', 'Glob', 'LS']) / 0.48 : 0),
    reason: (s) =>
      `${pct(toolShare(s, ['Read', 'Grep', 'Glob', 'LS']))} of all tool calls were reading and searching code.`,
  },
  {
    id: 'delegator',
    title: 'The Delegator',
    tagline: 'Why do it yourself when you can spawn a team?',
    colors: ['#172554', '#2563eb', '#a78bfa'],
    score: (s) =>
      share(s.tools.find((t) => t.name === 'Agent')?.count ?? 0, Math.max(s.sessions, 1)) / 1.2,
    reason: (s) =>
      `You sent out ${formatInt(s.tools.find((t) => t.name === 'Agent')?.count ?? 0)} subagents.`,
  },
  {
    id: 'marathoner',
    title: 'The Marathoner',
    tagline: 'Sessions so long they need their own save points.',
    colors: ['#3b0764', '#c026d3', '#fb7185'],
    score: (s) => (s.longestSession?.activeMs ?? 0) / (5 * 3_600_000),
    reason: (s) =>
      `Your longest session ran ${Math.round((s.longestSession?.activeMs ?? 0) / 3_600_000)} hours of active work.`,
  },
  {
    id: 'weekend-warrior',
    title: 'The Weekend Warrior',
    tagline: 'Saturdays are for side projects.',
    colors: ['#831843', '#e11d48', '#fb923c'],
    score: (s) => share((s.weekdays[0] ?? 0) + (s.weekdays[6] ?? 0), sum(s.weekdays)) / 0.36,
    reason: (s) =>
      `${pct(share((s.weekdays[0] ?? 0) + (s.weekdays[6] ?? 0), sum(s.weekdays)))} of your activity was on weekends.`,
  },
  {
    id: 'streak-machine',
    title: 'The Streak Machine',
    tagline: 'Consistency is your superpower.',
    colors: ['#0c4a6e', '#0ea5e9', '#34d399'],
    score: (s) => (s.longestStreak?.days ?? 0) / 21,
    reason: (s) => `You showed up ${s.longestStreak?.days ?? 0} days in a row.`,
  },
  {
    id: 'always-right',
    title: 'The Always Right',
    tagline: 'Your agent agrees. Absolutely.',
    colors: ['#4c1d95', '#8b5cf6', '#f0abfc'],
    score: (s) => share(s.phrases.agent.absolutelyRight ?? 0, Math.max(s.sessions, 1)) / 1.5,
    reason: (s) =>
      `Your agent told you "you're absolutely right" ${formatInt(s.phrases.agent.absolutelyRight ?? 0)} times.`,
  },
  {
    id: 'juggler',
    title: 'The Juggler',
    tagline: 'Ten repos, one brain, zero context switching cost (allegedly).',
    colors: ['#134e4a', '#14b8a6', '#facc15'],
    score: (s) => s.projects.length / 10,
    reason: (s) => `You worked across ${s.projects.length} projects.`,
  },
  {
    id: 'polite-one',
    title: 'The Polite One',
    tagline: 'Says please to the robot. Will be spared in the uprising.',
    colors: ['#1e3a8a', '#6366f1', '#f9a8d4'],
    score: (s) =>
      s.prompts >= 20
        ? share((s.phrases.user.please ?? 0) + (s.phrases.user.thanks ?? 0), s.prompts) / 0.3
        : 0,
    reason: (s) =>
      `You said "please" ${formatInt(s.phrases.user.please ?? 0)} times and "thanks" ${formatInt(s.phrases.user.thanks ?? 0)} times.`,
  },
];

const PRAGMATIST: Omit<Archetype, 'score'> = {
  id: 'pragmatist',
  title: 'The Pragmatist',
  tagline: 'No drama, no 4 AM heroics. Just shipping.',
  colors: ['#0f172a', '#4f46e5', '#06b6d4'],
  reason: (s) =>
    `${formatInt(s.sessions)} sessions across ${formatInt(s.activeDays)} days, steady as a metronome.`,
};

const NEWCOMER: Omit<Archetype, 'score'> = {
  id: 'newcomer',
  title: 'The Fresh Start',
  tagline: 'Every legend has an origin story. This is yours.',
  colors: ['#0f172a', '#7c3aed', '#22d3ee'],
  reason: (s) =>
    `${s.sessions} ${s.sessions === 1 ? 'session' : 'sessions'} so far. Come back when the logs pile up.`,
};

/** Fewer sessions than this and ratios are noise, so you're a newcomer. */
export const MIN_SESSIONS_FOR_ARCHETYPE = 3;

export function assignPersonality(stats: Input): Personality {
  const ranked = ARCHETYPES.map((archetype) => ({
    archetype,
    score: finite(archetype.score(stats)),
  }))
    .filter((entry) => entry.score >= 1)
    .sort((a, b) => b.score - a.score);

  const pick = (a: Omit<Archetype, 'score'>, traits: string[]): Personality => ({
    id: a.id,
    title: a.title,
    tagline: a.tagline,
    reason: a.reason(stats),
    colors: a.colors,
    traits,
  });

  if (stats.sessions < MIN_SESSIONS_FOR_ARCHETYPE) {
    return pick(
      NEWCOMER,
      ranked.slice(0, 1).map((e) => e.archetype.title),
    );
  }
  const [winner, ...rest] = ranked;
  if (!winner) return pick(PRAGMATIST, []);
  return pick(
    winner.archetype,
    rest.slice(0, 2).map((e) => e.archetype.title),
  );
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
