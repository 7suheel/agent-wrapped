import { createReadStream } from 'node:fs';
import { basename, dirname, relative, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { AGENT_PHRASES, USER_PHRASES, addPhrases, countPhrases } from '../stats/phrases.ts';
import { listJsonlFiles, projectNameFromCwd, projectNameFromDirName } from '../paths.ts';
import type {
  AgentEvent,
  AssistantEvent,
  ParseReport,
  ParseResult,
  TokenUsage,
  UserEvent,
} from '../types.ts';

/*
 * Claude Code writes one JSON object per line to
 *   <config>/projects/<cwd-with-separators-as-dashes>/<sessionId>.jsonl
 * (subagents: <sessionId>/subagents/*.jsonl). Lines we use:
 *
 *   { type: "user", sessionId, timestamp, cwd, isSidechain,
 *     message: { role: "user", content: string | [{type:"text"|"tool_result", ...}] } }
 *   { type: "assistant", sessionId, timestamp, cwd, requestId,
 *     message: { id, model, content: [{type:"thinking"|"text"|"tool_use", ...}],
 *                usage: { input_tokens, output_tokens, cache_creation_input_tokens,
 *                         cache_read_input_tokens, cache_creation: { ephemeral_5m_input_tokens,
 *                         ephemeral_1h_input_tokens } } } }
 *
 * One API response is written as several lines (one per content block) that all
 * repeat the same `usage`, so responses are merged by message id + request id.
 * Everything else (attachments, summaries, snapshots, queue operations) is ignored.
 */

export interface ParseOptions {
  /** Skip files last modified before this time: they can't hold newer events. */
  modifiedAfter?: Date;
}

export async function parseClaudeLogs(
  roots: string[],
  options: ParseOptions = {},
): Promise<ParseResult> {
  const report: ParseReport = {
    agent: 'claude-code',
    roots,
    files: 0,
    lines: 0,
    malformedLines: 0,
    ignoredLines: 0,
    duplicateLines: 0,
  };
  const state = new ParserState(report);
  for (const root of roots) {
    for (const file of await listJsonlFiles(root)) {
      if (options.modifiedAfter && file.mtimeMs < options.modifiedAfter.getTime()) continue;
      report.files++;
      await parseFile(file.path, root, state);
    }
  }
  return { events: state.finish(), report };
}

/** Parse in-memory lines (used by tests and anyone embedding the parser). */
export function parseClaudeLines(
  lines: Iterable<string>,
  fallbackProject = 'unknown',
): ParseResult {
  const report: ParseReport = {
    agent: 'claude-code',
    roots: [],
    files: 1,
    lines: 0,
    malformedLines: 0,
    ignoredLines: 0,
    duplicateLines: 0,
  };
  const state = new ParserState(report);
  for (const line of lines) state.addLine(line, fallbackProject, false);
  return { events: state.finish(), report };
}

async function parseFile(path: string, root: string, state: ParserState): Promise<void> {
  const rel = relative(root, path).split(sep);
  const projectDir = rel.length > 1 ? rel[0]! : basename(dirname(path));
  const fallbackProject = projectNameFromDirName(projectDir);
  const inSubagentFolder = rel.includes('subagents');
  try {
    const stream = createReadStream(path, { encoding: 'utf8' });
    const reader = createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of reader) state.addLine(line, fallbackProject, inSubagentFolder);
  } catch {
    // unreadable or truncated file: keep what we have
  }
}

class ParserState {
  private readonly seenLines = new Set<string>();
  private readonly assistants = new Map<string, AssistantEvent>();
  private readonly users: UserEvent[] = [];
  /** Project per session, for lines that carry no `cwd`. */
  private readonly sessionProjects = new Map<string, string>();
  private readonly report: ParseReport;

  constructor(report: ParseReport) {
    this.report = report;
  }

  addLine(raw: string, fallbackProject: string, inSubagentFolder: boolean): void {
    const line = raw.trim();
    if (!line) return;
    this.report.lines++;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      this.report.malformedLines++;
      return;
    }
    if (!isRecord(entry)) {
      this.report.malformedLines++;
      return;
    }
    const type = entry.type;
    if (type !== 'assistant' && type !== 'user') {
      this.report.ignoredLines++;
      return;
    }
    const timestamp = parseDate(entry.timestamp);
    const message = entry.message;
    if (!timestamp || !isRecord(message)) {
      this.report.ignoredLines++;
      return;
    }
    const uuid = typeof entry.uuid === 'string' ? entry.uuid : undefined;
    if (uuid) {
      if (this.seenLines.has(uuid)) {
        this.report.duplicateLines++;
        return;
      }
      this.seenLines.add(uuid);
    }
    const sessionId = str(entry.sessionId) ?? 'unknown-session';
    const cwd = str(entry.cwd);
    let project: string;
    if (cwd) {
      project = projectNameFromCwd(cwd);
      this.sessionProjects.set(sessionId, project);
    } else {
      project = this.sessionProjects.get(sessionId) ?? fallbackProject;
    }
    const isSidechain = entry.isSidechain === true || inSubagentFolder;

    if (type === 'assistant') {
      this.addAssistant(entry, message, { sessionId, project, timestamp, isSidechain, uuid });
    } else {
      this.addUser(entry, message, { sessionId, project, timestamp, isSidechain });
    }
  }

  private addAssistant(
    entry: Record<string, unknown>,
    message: Record<string, unknown>,
    base: {
      sessionId: string;
      project: string;
      timestamp: Date;
      isSidechain: boolean;
      uuid: string | undefined;
    },
  ): void {
    const model = str(message.model) ?? 'unknown';
    const messageId = str(message.id);
    const requestId = str(entry.requestId);
    const key = messageId
      ? `${messageId}:${requestId ?? ''}`
      : (base.uuid ?? `${base.sessionId}:${base.timestamp.toISOString()}`);

    const tools: string[] = [];
    let text = '';
    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (!isRecord(block)) continue;
        if (block.type === 'tool_use' && typeof block.name === 'string') tools.push(block.name);
        if (block.type === 'text' && typeof block.text === 'string') text += block.text + '\n';
      }
    } else if (typeof message.content === 'string') {
      text = message.content;
    }
    const phrases = countPhrases(text, AGENT_PHRASES);
    const usage = readUsage(message.usage);

    const existing = this.assistants.get(key);
    if (existing) {
      existing.tools.push(...tools);
      addPhrases(existing.phrases, phrases);
      if (usage && (!existing.usage || totalOf(usage) > totalOf(existing.usage))) {
        existing.usage = usage;
      }
      return;
    }
    this.assistants.set(key, {
      kind: 'assistant',
      key,
      sessionId: base.sessionId,
      project: base.project,
      timestamp: base.timestamp,
      model,
      usage,
      tools,
      phrases,
      isSidechain: base.isSidechain,
    });
  }

  private addUser(
    entry: Record<string, unknown>,
    message: Record<string, unknown>,
    base: { sessionId: string; project: string; timestamp: Date; isSidechain: boolean },
  ): void {
    if (entry.isMeta === true) {
      this.report.ignoredLines++;
      return;
    }
    let text = '';
    let hasToolResult = false;
    if (typeof message.content === 'string') {
      text = message.content;
    } else if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (!isRecord(block)) continue;
        if (block.type === 'tool_result') hasToolResult = true;
        if (block.type === 'text' && typeof block.text === 'string') text += block.text + '\n';
      }
    }
    const isCommandOutput = /^\s*<(?:command-|local-command-|bash-)/.test(text);
    const isPrompt =
      !hasToolResult &&
      !base.isSidechain &&
      text.trim().length > 0 &&
      !isCommandOutput &&
      !text.startsWith('[Request interrupted');
    this.users.push({
      kind: 'user',
      ...base,
      isPrompt,
      phrases: hasToolResult || isCommandOutput ? {} : countPhrases(text, USER_PHRASES),
    });
  }

  finish(): AgentEvent[] {
    const events: AgentEvent[] = [...this.assistants.values(), ...this.users];
    // A session's first lines may come before any line with a `cwd`.
    for (const event of events) {
      const known = this.sessionProjects.get(event.sessionId);
      if (known) event.project = known;
    }
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
}

function readUsage(value: unknown): TokenUsage | null {
  if (!isRecord(value)) return null;
  const input = num(value.input_tokens);
  const output = num(value.output_tokens);
  const cacheRead = num(value.cache_read_input_tokens);
  const cacheCreation = num(value.cache_creation_input_tokens);
  let cacheWrite5m = cacheCreation;
  let cacheWrite1h = 0;
  if (isRecord(value.cache_creation)) {
    const fiveMin = num(value.cache_creation.ephemeral_5m_input_tokens);
    const oneHour = num(value.cache_creation.ephemeral_1h_input_tokens);
    if (fiveMin + oneHour > 0) {
      cacheWrite5m = fiveMin;
      cacheWrite1h = oneHour;
    }
  }
  return { input, output, cacheRead, cacheWrite5m, cacheWrite1h };
}

export function totalOf(usage: TokenUsage): number {
  return usage.input + usage.output + usage.cacheRead + usage.cacheWrite5m + usage.cacheWrite1h;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
