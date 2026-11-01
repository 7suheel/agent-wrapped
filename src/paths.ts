import { existsSync, realpathSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface PathEnv {
  home: string;
  env: Record<string, string | undefined>;
}

const defaultEnv = (): PathEnv => ({ home: homedir(), env: process.env });

/**
 * Candidate Claude Code `projects` directories, most specific first.
 * Works the same on Windows (`C:\Users\me\.claude\projects`), macOS and Linux.
 */
export function claudeProjectDirCandidates({ home, env }: PathEnv = defaultEnv()): string[] {
  const candidates: string[] = [];
  const configDirs = env.CLAUDE_CONFIG_DIR?.split(/[,;]/).map((dir) => dir.trim()) ?? [];
  for (const dir of configDirs) if (dir) candidates.push(join(dir, 'projects'));
  candidates.push(join(home, '.claude', 'projects'));
  const xdg = env.XDG_CONFIG_HOME || join(home, '.config');
  candidates.push(join(xdg, 'claude', 'projects'));
  return candidates;
}

/** Existing, de-duplicated project directories (symlinks resolved). */
export function findClaudeProjectDirs(pathEnv?: PathEnv): string[] {
  return uniqueExisting(claudeProjectDirCandidates(pathEnv));
}

/**
 * A directory given with --dir: either a `projects` folder, a Claude config
 * folder that contains one, or any folder of .jsonl files.
 */
export function resolveCustomDir(dir: string): string {
  const absolute = resolve(dir);
  const nested = join(absolute, 'projects');
  return isDirectory(nested) ? nested : absolute;
}

function uniqueExisting(dirs: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const dir of dirs) {
    if (!isDirectory(dir)) continue;
    const real = realpathSync(dir);
    if (seen.has(real)) continue;
    seen.add(real);
    result.push(real);
  }
  return result;
}

export function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export interface LogFile {
  path: string;
  mtimeMs: number;
}

/** Every .jsonl file below `root`, recursively (subagent logs live in nested folders). */
export async function listJsonlFiles(root: string): Promise<LogFile[]> {
  const files: LogFile[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 8) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable folder: skip it, never crash
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        try {
          files.push({ path, mtimeMs: statSync(path).mtimeMs });
        } catch {
          // file vanished while scanning
        }
      }
    }
  };
  await walk(root, 0);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Claude Code names project folders after the working directory with `/`, `\`,
 * `:` and `.` replaced by `-`, which is lossy. Used only when a line has no `cwd`.
 */
export function projectNameFromDirName(dirName: string): string {
  const parts = dirName.split('-').filter(Boolean);
  return parts.at(-1) ?? dirName;
}

/** Last path segment of a working directory, on any OS. */
export function projectNameFromCwd(cwd: string): string {
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? cwd;
}
