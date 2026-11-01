import { parseArgs } from 'node:util';
import type { DateRange } from './types.ts';

export interface CliOptions {
  year?: number;
  since?: Date;
  json: boolean;
  out: string;
  name?: string;
  card: boolean;
  animate: boolean;
  hideProjects: boolean;
  dirs: string[];
  help: boolean;
  version: boolean;
}

export class UsageError extends Error {}

export const HELP = `
agent-wrapped: your year with AI coding agents, as a shareable card.
Everything runs locally. Nothing leaves your machine.

Usage
  npx agent-wrapped [options]

Options
  --year <yyyy>        Year to wrap (default: the current year)
  --since <yyyy-mm-dd> Start date instead of January 1st (until today)
  --json               Print the stats as JSON (no animation, no card)
  --out <dir>          Where to save the cards (default: current folder)
  --name <prefix>      File name prefix (default: agent-wrapped-<year>)
  --no-card            Don't generate the PNG cards
  --no-animation       Show everything at once
  --hide-projects      Keep project names off the card and terminal
  --dir <path>         Read logs from this folder (repeatable; default: auto-detect)
  -h, --help           Show this help
  -v, --version        Show the version

Examples
  npx agent-wrapped
  npx agent-wrapped --year 2025
  npx agent-wrapped --since 2026-06-01 --hide-projects
  npx agent-wrapped --json > my-year.json
`;

export function parseCliArgs(argv: string[]): CliOptions {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      allowPositionals: false,
      strict: true,
      options: {
        year: { type: 'string' },
        since: { type: 'string' },
        json: { type: 'boolean', default: false },
        out: { type: 'string', default: '.' },
        name: { type: 'string' },
        'no-card': { type: 'boolean', default: false },
        'no-animation': { type: 'boolean', default: false },
        'hide-projects': { type: 'boolean', default: false },
        dir: { type: 'string', multiple: true },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    }));
  } catch (error) {
    throw new UsageError((error as Error).message);
  }

  let year: number | undefined;
  if (values.year !== undefined) {
    if (!/^\d{4}$/.test(values.year))
      throw new UsageError(`--year must be a 4-digit year, got "${values.year}"`);
    year = Number(values.year);
  }
  let since: Date | undefined;
  if (values.since !== undefined) {
    since = parseLocalDate(values.since);
    if (!since)
      throw new UsageError(`--since must be a date like 2026-03-01, got "${values.since}"`);
  }

  return {
    year,
    since,
    json: values.json,
    out: values.out,
    name: values.name,
    card: !values['no-card'] && !values.json,
    animate: !values['no-animation'] && !values.json,
    hideProjects: values['hide-projects'],
    dirs: values.dir ?? [],
    help: values.help,
    version: values.version,
  };
}

/** "2026-03-01" -> local midnight of that day. */
export function parseLocalDate(text: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return undefined;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d)
    return undefined;
  return date;
}

export function resolveRange(
  options: Pick<CliOptions, 'year' | 'since'>,
  now = new Date(),
): DateRange {
  if (options.since && options.year === undefined) {
    const label = `Since ${formatDate(options.since)}`;
    return { from: options.since, to: new Date(now.getTime() + 1), label };
  }
  const year = options.year ?? now.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  if (options.since) {
    const from = options.since > yearStart ? options.since : yearStart;
    return { from, to: yearEnd, label: `${year} since ${formatDate(from)}` };
  }
  return { from: yearStart, to: yearEnd, label: String(year) };
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
