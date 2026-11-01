/**
 * Writes a year of realistic but entirely FAKE Claude Code logs to .demo-data/,
 * in the same format Claude Code uses, for the README example card and demos.
 * Deterministic: the same seed always gives the same data.
 *
 *   node scripts/generate-demo-data.ts [outDir] [seed]
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] ?? '.demo-data';
let seed = Number(process.argv[3] ?? 2026);

/** mulberry32: small, fast, seeded PRNG. */
function random(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (min: number, max: number): number => min + random() * (max - min);
const int = (min: number, max: number): number => Math.floor(between(min, max + 1));
function pick<T>(items: [T, number][]): T {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [item, weight] of items) {
    roll -= weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1]![0];
}

const PROJECTS: [string, number][] = [
  ['nebula-api', 30],
  ['pixel-forge', 22],
  ['side-quest', 14],
  ['dotfiles', 6],
  ['tiny-compiler', 10],
  ['landing-page', 8],
  ['infra-terraform', 6],
  ['ml-playground', 4],
];
const TOOLS: [string, number][] = [
  ['Read', 30],
  ['Edit', 26],
  ['Bash', 22],
  ['Grep', 9],
  ['Write', 6],
  ['Glob', 4],
  ['TodoWrite', 4],
  ['Task', 2],
  ['WebFetch', 1],
  ['mcp__github__create_pull_request', 1],
];
/** Hour-of-day weights: a night owl with an afternoon bump. */
const HOURS: [number, number][] = [
  [0, 9],
  [1, 7],
  [2, 5],
  [3, 2],
  [4, 1],
  [8, 1],
  [9, 3],
  [10, 5],
  [11, 5],
  [13, 4],
  [14, 6],
  [15, 6],
  [16, 5],
  [17, 3],
  [19, 4],
  [20, 7],
  [21, 10],
  [22, 13],
  [23, 12],
];
const REPLIES: [string, number][] = [
  ["I'll start by reading the relevant files.", 30],
  ['Let me check how this is wired up.', 30],
  ['Done. The tests pass now.', 20],
  ['Good catch. Fixing it now.', 10],
  ['Here is a summary of the changes.', 10],
  ["You're absolutely right! I missed that edge case.", 2],
  ['This should work now.', 2],
];
const PROMPTS = [
  'add pagination to the users endpoint',
  'why is this test flaky?',
  'please refactor the auth middleware',
  'thanks! now write the migration',
  'make the button gradient pop more',
  'fix the type errors',
];

function modelFor(day: Date): string {
  const month = day.getUTCMonth();
  if (month < 3)
    return pick([
      ['claude-opus-4-8', 6],
      ['claude-sonnet-5', 4],
    ]);
  if (month < 7)
    return pick([
      ['claude-opus-5', 6],
      ['claude-sonnet-5', 4],
    ]);
  return pick([
    ['claude-opus-5-5', 7],
    ['claude-sonnet-5-5', 3],
  ]);
}

rmSync(outDir, { recursive: true, force: true });
let lineCount = 0;
let sessionCount = 0;
let uuidCounter = 0;
const uuid = (): string => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`;

const start = Date.UTC(2026, 0, 3);
const end = Date.UTC(2026, 10, 1);
for (let dayMs = start; dayMs < end; dayMs += 86_400_000) {
  const day = new Date(dayMs);
  const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
  // A 17-day streak in the summer, otherwise about 2 days in 3.
  const inStreak = dayMs >= Date.UTC(2026, 5, 10) && dayMs < Date.UTC(2026, 5, 27);
  if (!inStreak && random() > (weekend ? 0.45 : 0.72)) continue;

  const sessionsToday = int(1, weekend ? 2 : 4);
  for (let s = 0; s < sessionsToday; s++) {
    sessionCount++;
    const sessionId = `demo-${String(sessionCount).padStart(5, '0')}`;
    const project = pick(PROJECTS);
    const cwd = `/Users/demo/code/${project}`;
    const model = modelFor(day);
    let t = dayMs + pick(HOURS) * 3_600_000 + int(0, 59) * 60_000;
    const lines: string[] = [];
    const base = { sessionId, cwd, version: '2.1.300', gitBranch: 'main', userType: 'external' };
    let parent: string | null = null;
    const push = (entry: Record<string, unknown>): void => {
      const id = uuid();
      lines.push(
        JSON.stringify({ parentUuid: parent, isSidechain: false, ...base, ...entry, uuid: id }),
      );
      parent = id;
    };

    let context = int(18_000, 30_000);
    const turns = int(2, 9);
    for (let turn = 0; turn < turns; turn++) {
      push({
        type: 'user',
        timestamp: new Date(t).toISOString(),
        message: { role: 'user', content: PROMPTS[int(0, PROMPTS.length - 1)] },
      });
      const steps = int(2, 12);
      for (let step = 0; step < steps; step++) {
        t += int(4, 45) * 1000;
        const messageId = `msg_demo_${uuidCounter}`;
        const requestId = `req_demo_${uuidCounter}`;
        const write = int(500, 9000);
        const usage = {
          input_tokens: int(2, 12),
          output_tokens: int(120, 2200),
          cache_creation_input_tokens: write,
          cache_read_input_tokens: context,
          cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: write },
        };
        context = Math.min(context + write, 180_000);
        const tool = pick(TOOLS);
        const text = pick(REPLIES);
        const blocks = [
          { type: 'thinking', thinking: '', signature: 'demo' },
          { type: 'text', text },
          { type: 'tool_use', id: `toolu_${uuidCounter}`, name: tool, input: {} },
        ];
        for (const block of blocks) {
          push({
            type: 'assistant',
            timestamp: new Date(t).toISOString(),
            requestId,
            message: {
              id: messageId,
              type: 'message',
              role: 'assistant',
              model,
              content: [block],
              usage,
            },
          });
        }
        t += int(1, 20) * 1000;
        push({
          type: 'user',
          timestamp: new Date(t).toISOString(),
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: `toolu_${uuidCounter}`, content: 'ok' }],
          },
        });
      }
      t += int(1, 6) * 60_000; // reading the answer, typing the next prompt
    }
    const dir = join(outDir, 'projects', `-Users-demo-code-${project}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${sessionId}.jsonl`), lines.join('\n') + '\n');
    lineCount += lines.length;
  }
}
console.log(`Wrote ${sessionCount} fake sessions (${lineCount} lines) to ${outDir}/projects`);
