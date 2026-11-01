import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UsageError, parseCliArgs, parseLocalDate, resolveRange } from '../src/args.ts';
import { claudeProjectDirCandidates, projectNameFromCwd } from '../src/paths.ts';
import { Painter, detectColorLevel, visibleLength } from '../src/render/ansi.ts';
import { reveal } from '../src/render/terminal.ts';
import { computeStats } from '../src/stats/compute.ts';
import { YEAR_2026, prompt, reply } from './helpers.ts';

describe('parseCliArgs', () => {
  it('has sensible defaults', () => {
    expect(parseCliArgs([])).toMatchObject({
      json: false,
      card: true,
      animate: true,
      hideProjects: false,
      out: '.',
      dirs: [],
    });
  });

  it('turns off the card and animation for --json', () => {
    expect(parseCliArgs(['--json'])).toMatchObject({ json: true, card: false, animate: false });
  });

  it('reads every flag', () => {
    const options = parseCliArgs([
      '--year',
      '2025',
      '--since',
      '2025-06-01',
      '--hide-projects',
      '--no-card',
      '--no-animation',
      '--dir',
      'a',
      '--dir',
      'b',
    ]);
    expect(options.year).toBe(2025);
    expect(options.since).toEqual(new Date(2025, 5, 1));
    expect(options).toMatchObject({ hideProjects: true, card: false, animate: false });
    expect(options.dirs).toEqual(['a', 'b']);
  });

  it('rejects bad input with a usage error', () => {
    expect(() => parseCliArgs(['--year', '26'])).toThrow(UsageError);
    expect(() => parseCliArgs(['--since', '2026-02-30'])).toThrow(UsageError);
    expect(() => parseCliArgs(['--nope'])).toThrow(UsageError);
  });
});

describe('resolveRange', () => {
  const now = new Date(2026, 10, 1, 12);

  it('defaults to the current calendar year', () => {
    const range = resolveRange({}, now);
    expect(range).toEqual({ from: new Date(2026, 0, 1), to: new Date(2027, 0, 1), label: '2026' });
  });

  it('wraps a given year', () => {
    expect(resolveRange({ year: 2025 }, now).label).toBe('2025');
  });

  it('starts at --since and runs until now', () => {
    const range = resolveRange({ since: new Date(2026, 5, 1) }, now);
    expect(range.from).toEqual(new Date(2026, 5, 1));
    expect(range.to.getTime()).toBe(now.getTime() + 1);
    expect(range.label).toBe('Since Jun 1, 2026');
  });

  it('combines --year and --since', () => {
    const range = resolveRange({ year: 2026, since: new Date(2026, 5, 1) }, now);
    expect(range.from).toEqual(new Date(2026, 5, 1));
    expect(range.to).toEqual(new Date(2027, 0, 1));
  });

  it('parses only real dates', () => {
    expect(parseLocalDate('2026-02-28')).toEqual(new Date(2026, 1, 28));
    expect(parseLocalDate('2026-13-01')).toBeUndefined();
    expect(parseLocalDate('yesterday')).toBeUndefined();
  });
});

describe('log folder discovery', () => {
  it('checks CLAUDE_CONFIG_DIR, ~/.claude and the XDG folder', () => {
    const dirs = claudeProjectDirCandidates({
      home: '/home/me',
      env: { CLAUDE_CONFIG_DIR: '/custom/a,/custom/b' },
    });
    expect(dirs).toEqual([
      join('/custom/a', 'projects'),
      join('/custom/b', 'projects'),
      join('/home/me', '.claude', 'projects'),
      join('/home/me', '.config', 'claude', 'projects'),
    ]);
  });

  it('reads project names from Windows and POSIX paths', () => {
    expect(projectNameFromCwd('C:\\Users\\me\\code\\api')).toBe('api');
    expect(projectNameFromCwd('/Users/me/code/web/')).toBe('web');
  });
});

describe('colors', () => {
  it('respects NO_COLOR and plain pipes', () => {
    expect(detectColorLevel({ isTTY: true }, { NO_COLOR: '1' })).toBe(0);
    expect(detectColorLevel({ isTTY: false }, {})).toBe(0);
    expect(detectColorLevel({ isTTY: true }, { COLORTERM: 'truecolor' })).toBe(3);
  });

  it('measures visible width without escape codes', () => {
    const paint = new Painter(3);
    expect(visibleLength(paint.gradient('hello', ['#ff0000', '#0000ff']))).toBe(5);
  });
});

describe('terminal reveal', () => {
  const run = async (hideProjects: boolean): Promise<string> => {
    const events = [
      prompt('2026-04-01T22:00:00Z', { project: 'secret-repo' }),
      reply('2026-04-01T22:01:00Z', { project: 'secret-repo', tools: ['Bash'] }),
    ];
    let out = '';
    await reveal(computeStats(events, YEAR_2026), {
      animate: false,
      hideProjects,
      paint: new Painter(0),
      write: (text) => (out += text),
    });
    return out;
  };

  it('prints every section as plain text when colors are off', async () => {
    const out = await run(false);
    expect(out).not.toMatch(/\x1b/); // eslint-disable-line no-control-regex
    for (const section of ['THE BASICS', 'TOKENS', 'WHEN YOU CODE', 'AGENT PERSONALITY']) {
      expect(out).toContain(section);
    }
    expect(out).toContain('secret-repo');
  });

  it('keeps project names out with --hide-projects', async () => {
    expect(await run(true)).not.toContain('secret-repo');
  });
});
