import type { WrappedStats } from '../stats/compute.ts';
import {
  formatCompact,
  formatCost,
  formatDay,
  formatDuration,
  formatHour,
  formatHoursShort,
  formatInt,
  plural,
} from '../format.ts';
import type { Painter } from './ansi.ts';
import { visibleLength } from './ansi.ts';
import { bar, hourBars, weekGrid } from './heatmap.ts';

export const BRAND = ['#a78bfa', '#f472b6', '#fb923c'];
const COOL = ['#22d3ee', '#818cf8', '#c084fc'];
const WARM = ['#fbbf24', '#fb7185', '#e879f9'];

/** Two-row block letters for the intro banner. */
const LETTERS: Record<string, [string, string]> = {
  A: ['▄▀█', '█▀█'],
  G: ['█▀▀', '█▄█'],
  E: ['█▀▀', '██▄'],
  N: ['█▄ █', '█ ▀█'],
  T: ['▀█▀', ' █ '],
  W: ['█ █ █', '▀▄▀▄▀'],
  R: ['█▀█', '█▀▄'],
  P: ['█▀█', '█▀▀'],
  D: ['█▀▄', '█▄▀'],
  ' ': ['  ', '  '],
};

export function banner(text: string): [string, string] {
  const chars = [...text.toUpperCase()].map((c) => LETTERS[c] ?? LETTERS[' ']!);
  return [chars.map((c) => c[0]).join(' '), chars.map((c) => c[1]).join(' ')];
}

export interface RevealOptions {
  animate: boolean;
  hideProjects: boolean;
  paint: Painter;
  write?: (text: string) => void;
  /** Milliseconds between slides when animating. */
  pace?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The Wrapped-style terminal show: stats appear one by one. */
export async function reveal(stats: WrappedStats, options: RevealOptions): Promise<void> {
  const { paint, animate } = options;
  const write = options.write ?? ((text: string) => process.stdout.write(text));
  const pace = animate ? (options.pace ?? 650) : 0;
  const clearEol = animate ? '\x1b[K' : '';
  const pad = '  ';
  const line = (text = ''): void => write(`${pad}${text}\n`);
  const pause = async (factor = 1): Promise<void> => {
    if (pace) await sleep(pace * factor);
  };

  /** Big number that counts up, then settles on its final text. */
  const countUp = async (
    label: string,
    target: number,
    render: (n: number) => string,
    colors: string[],
  ): Promise<void> => {
    if (animate && target > 0) {
      write('\x1b[?25l');
      const frames = 18;
      for (let i = 1; i <= frames; i++) {
        const eased = 1 - Math.pow(1 - i / frames, 3);
        write(
          `\r${pad}${paint.bold(paint.gradient(render(target * eased), colors))} ${paint.dim(label)}\x1b[K`,
        );
        await sleep(28);
      }
      write('\x1b[?25h');
    }
    write(
      `${animate ? '\r' : ''}${pad}${paint.bold(paint.gradient(render(target), colors))} ${paint.dim(label)}${clearEol}\n`,
    );
  };

  const heading = async (title: string, colors = BRAND): Promise<void> => {
    await pause();
    line();
    line(paint.bold(paint.gradient(`◆ ${title.toUpperCase()}`, colors)));
  };

  // Intro
  line();
  const [top, bottom] = banner('agent wrapped');
  line(paint.gradient(top, BRAND));
  line(paint.gradient(bottom, BRAND, 0.08));
  line(paint.dim(`Your ${stats.period.label} with Claude Code  ·  100% local, nothing uploaded`));

  if (stats.empty) {
    line();
    line(`No Claude Code sessions found for ${stats.period.label}.`);
    line(paint.dim('Try another year with --year, or point to your logs with --dir.'));
    line();
    return;
  }

  await heading('The basics');
  await countUp(
    stats.sessions === 1 ? 'session' : 'sessions',
    stats.sessions,
    (n) => formatInt(n),
    BRAND,
  );
  line(
    paint.dim(
      `across ${plural(stats.activeDays, 'active day')} and ${plural(stats.prompts, 'prompt')} you typed`,
    ),
  );
  await pause(0.5);
  const time = formatHoursShort(stats.totalActiveMs);
  const timeScale = time.unit === 'min' ? 60_000 : 3_600_000;
  await countUp(
    `${time.unit} of pair-programming`,
    stats.totalActiveMs / timeScale,
    (n) => (time.unit === 'min' || n >= 10 ? formatInt(n) : n.toFixed(1).replace(/\.0$/, '')),
    COOL,
  );
  if (stats.longestSession) {
    const where = options.hideProjects ? '' : ` in ${paint.bold(stats.longestSession.project)}`;
    line(
      paint.dim(
        `longest session: ${formatDuration(stats.longestSession.activeMs)} on ${formatDay(stats.longestSession.date)}`,
      ) + where,
    );
  }

  await heading('Tokens', WARM);
  await countUp('tokens moved', stats.tokens.total, formatCompact, WARM);
  const cacheWrite = stats.tokens.cacheWrite5m + stats.tokens.cacheWrite1h;
  line(
    paint.dim(
      `${formatCompact(stats.tokens.input)} in · ${formatCompact(stats.tokens.output)} out · ${formatCompact(cacheWrite)} cache write · ${formatCompact(stats.tokens.cacheRead)} cache read`,
    ),
  );
  await pause(0.5);
  await countUp('estimated at API prices', stats.cost.total, formatCost, ['#4ade80', '#facc15']);
  if (stats.cost.unpricedModels.length) {
    line(paint.dim(`(not priced: ${stats.cost.unpricedModels.join(', ')})`));
  }

  await heading('Your models', COOL);
  const maxModel = stats.models[0]?.responses ?? 0;
  for (const model of stats.models.slice(0, 4)) {
    line(
      `${model.name.padEnd(12)} ${bar(model.responses, maxModel, 22, paint, COOL)} ${paint.dim(formatInt(model.responses))}`,
    );
  }

  if (!options.hideProjects && stats.topProject) {
    await heading('Your projects', BRAND);
    const maxProject = stats.projects[0]?.activeMs ?? 0;
    for (const project of stats.projects.slice(0, 5)) {
      const name = project.name.length > 18 ? `${project.name.slice(0, 17)}…` : project.name;
      line(
        `${name.padEnd(18)} ${bar(project.activeMs, maxProject, 18, paint, BRAND)} ${paint.dim(formatDuration(project.activeMs))}`,
      );
    }
  }

  await heading('When you code', WARM);
  for (const row of hourBars(stats.hours, paint)) line(row);
  line();
  for (const row of weekGrid(stats.heatmap, paint)) line(row);
  line();
  if (stats.peakHour !== null) {
    line(
      `Peak hour ${paint.bold(paint.gradient(formatHour(stats.peakHour), WARM))}   Peak day ${paint.bold(paint.gradient(stats.peakWeekday ?? '', WARM))}`,
    );
  }
  if (stats.busiestDay) {
    line(
      paint.dim(
        `busiest day: ${formatDay(stats.busiestDay.date)} (${formatInt(stats.busiestDay.count)} messages)`,
      ),
    );
  }

  if (stats.tools.length) {
    await heading('Favorite tools', COOL);
    const maxTool = stats.tools[0]?.count ?? 0;
    for (const tool of stats.tools.slice(0, 6)) {
      const name = tool.name.length > 14 ? `${tool.name.slice(0, 13)}…` : tool.name;
      line(
        `${name.padEnd(14)} ${bar(tool.count, maxTool, 24, paint, COOL)} ${paint.dim(formatInt(tool.count))}`,
      );
    }
    line(paint.dim(`${formatInt(stats.toolCalls)} tool calls in total`));
  }

  await heading('The fun part', BRAND);
  const agent = stats.phrases.agent;
  const user = stats.phrases.user;
  const fun: [string, string][] = [
    [formatInt(agent.absolutelyRight ?? 0), `times you were "absolutely right"`],
    [formatInt(agent.shouldWorkNow ?? 0), `"this should work now" (famous last words)`],
    [formatInt(stats.lateNightSessions), 'sessions after 2 AM'],
    [plural(stats.longestStreak?.days ?? 0, 'day'), 'longest streak'],
    [formatInt(user.interrupted ?? 0), 'times you hit Esc on your agent'],
    [formatInt(user.please ?? 0), `times you said "please"`],
  ];
  for (const [value, label] of fun) {
    await pause(0.35);
    line(`${paint.bold(paint.gradient(value.padStart(8), WARM))}  ${label}`);
  }

  // Personality reveal
  const glow = [stats.personality.colors[1], stats.personality.colors[2], '#ffffff'];
  await heading('Your agent personality', glow);
  if (animate) {
    for (const dots of ['.', '..', '...']) {
      write(`\r${pad}${paint.dim(`Analyzing your vibe${dots}`)}\x1b[K`);
      await sleep(380);
    }
    write('\r\x1b[K');
  }
  const p = stats.personality;
  const title = `★ ${p.title.toUpperCase()} ★`;
  const width = Math.max(visibleLength(title), p.tagline.length, p.reason.length) + 4;
  const frame = (text: string, raw: string): string =>
    `${paint.gradient('│', glow)} ${text}${' '.repeat(Math.max(0, width - visibleLength(raw) - 1))}${paint.gradient('│', glow)}`;
  line(paint.gradient(`╭${'─'.repeat(width)}╮`, glow));
  line(frame(paint.bold(paint.gradient(title, [...p.colors.slice(1), '#ffffff'])), title));
  line(frame(p.tagline, p.tagline));
  line(frame(paint.dim(p.reason), p.reason));
  line(paint.gradient(`╰${'─'.repeat(width)}╯`, glow));
  if (p.traits.length) line(paint.dim(`also: ${p.traits.join(' · ')}`));
  line();
}
