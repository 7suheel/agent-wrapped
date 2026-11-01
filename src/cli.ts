#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELP, UsageError, parseCliArgs, resolveRange, type CliOptions } from './args.ts';
import { renderCardPng, type CardFormat } from './card/card.ts';
import { parseClaudeLogs } from './parsers/claude.ts';
import {
  claudeProjectDirCandidates,
  findClaudeProjectDirs,
  isDirectory,
  resolveCustomDir,
} from './paths.ts';
import { Painter, detectColorLevel } from './render/ansi.ts';
import { BRAND, reveal } from './render/terminal.ts';
import { computeStats, type WrappedStats } from './stats/compute.ts';

function version(): string {
  const pkg = JSON.parse(
    readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
  ) as { version: string };
  return pkg.version;
}

async function main(argv: string[]): Promise<number> {
  let options: CliOptions;
  try {
    options = parseCliArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`agent-wrapped: ${error.message}\nRun with --help for usage.\n`);
      return 2;
    }
    throw error;
  }
  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (options.version) {
    process.stdout.write(`${version()}\n`);
    return 0;
  }

  const paint = new Painter(options.json ? 0 : detectColorLevel());
  const animate = options.animate && Boolean(process.stdout.isTTY) && !process.env.CI;
  const log = (text: string): void => {
    if (!options.json) process.stdout.write(`  ${text}\n`);
  };

  const roots = options.dirs.length ? options.dirs.map(resolveCustomDir) : findClaudeProjectDirs();
  const missing = roots.filter((dir) => !isDirectory(dir));
  if (missing.length) {
    process.stderr.write(`agent-wrapped: folder not found: ${missing.join(', ')}\n`);
    return 1;
  }
  if (roots.length === 0) {
    process.stderr.write(
      'agent-wrapped: no Claude Code logs found. Looked in:\n' +
        claudeProjectDirCandidates()
          .map((dir) => `  ${dir}\n`)
          .join('') +
        'Use --dir <path> if your logs live somewhere else.\n',
    );
    return 1;
  }

  const range = resolveRange(options);
  const spinner = startSpinner(paint, animate && !options.json, 'Reading your logs locally');
  const { events, report } = await parseClaudeLogs(roots, { modifiedAfter: range.from });
  spinner.stop();
  const stats = computeStats(events, range);

  if (options.json) {
    const output = options.hideProjects ? redactProjects(stats) : stats;
    process.stdout.write(`${JSON.stringify({ ...output, source: report }, null, 2)}\n`);
    return 0;
  }

  log(
    paint.dim(
      `Read ${report.lines.toLocaleString('en-US')} log lines from ${report.files} files` +
        (report.malformedLines ? ` (${report.malformedLines} broken lines skipped)` : '') +
        '. Nothing was uploaded.',
    ),
  );
  await reveal(stats, { animate, hideProjects: options.hideProjects, paint });

  if (options.card && !stats.empty) {
    const outDir = resolve(options.out);
    await mkdir(outDir, { recursive: true });
    const prefix =
      options.name ?? `agent-wrapped-${range.label.replace(/[^\w-]+/g, '-').toLowerCase()}`;
    const saved: string[] = [];
    for (const [format, suffix] of [
      ['landscape', ''],
      ['story', '-story'],
    ] as [CardFormat, string][]) {
      const png = await renderCardPng(stats, format, { hideProjects: options.hideProjects });
      const path = join(outDir, `${prefix}${suffix}.png`);
      await writeFile(path, png);
      saved.push(path);
    }
    log(paint.bold(paint.gradient('Your cards are ready', BRAND)));
    for (const path of saved) {
      const shown = relative(process.cwd(), path) || path;
      log(`  ${shown.startsWith('..') ? path : shown}`);
    }
    log(paint.dim('1200x675 for X / LinkedIn · 1080x1920 for stories'));
    log(`Share it with ${paint.bold(paint.gradient('#AgentWrapped', BRAND))}`);
    log('');
  }
  return 0;
}

function redactProjects(stats: WrappedStats): WrappedStats {
  return {
    ...stats,
    projects: stats.projects.map((p, i) => ({ ...p, name: `project-${i + 1}` })),
    topProject: stats.topProject ? { ...stats.topProject, name: 'project-1' } : null,
    longestSession: stats.longestSession ? { ...stats.longestSession, project: 'hidden' } : null,
  };
}

function startSpinner(paint: Painter, enabled: boolean, text: string): { stop: () => void } {
  if (!enabled) return { stop: () => undefined };
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  process.stdout.write('\x1b[?25l');
  const timer = setInterval(() => {
    process.stdout.write(
      `\r  ${paint.gradient(frames[i++ % frames.length]!, BRAND)} ${paint.dim(text)}…\x1b[K`,
    );
  }, 80);
  return {
    stop: () => {
      clearInterval(timer);
      process.stdout.write('\r\x1b[K\x1b[?25h');
    },
  };
}

process.on('SIGINT', () => {
  process.stdout.write('\x1b[?25h\n');
  process.exit(130);
});

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stdout.write('\x1b[?25h');
    process.stderr.write(
      `agent-wrapped: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  },
);
