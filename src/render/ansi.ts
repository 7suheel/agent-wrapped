/** Tiny ANSI helper: truecolor gradients with a 256-color fallback, no dependencies. */

export type ColorLevel = 0 | 1 | 2 | 3; // none, 16, 256, truecolor

export function detectColorLevel(
  stream: { isTTY?: boolean } = process.stdout,
  env: Record<string, string | undefined> = process.env,
): ColorLevel {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return 0;
  if (env.FORCE_COLOR !== undefined) {
    const level = Number(env.FORCE_COLOR);
    if (env.FORCE_COLOR === '' || env.FORCE_COLOR === 'true') return 3;
    return (Number.isFinite(level) ? Math.min(Math.max(level, 0), 3) : 3) as ColorLevel;
  }
  if (!stream.isTTY) return 0;
  if (env.TERM === 'dumb') return 0;
  if (env.COLORTERM === 'truecolor' || env.COLORTERM === '24bit') return 3;
  if (env.WT_SESSION || env.TERM_PROGRAM === 'vscode' || env.TERM_PROGRAM === 'iTerm.app') return 3;
  if (process.platform === 'win32') return 3; // Windows 10+ terminals support truecolor
  if (env.TERM?.includes('256')) return 2;
  return 1;
}

export type Rgb = [number, number, number];

export function hex(color: string): Rgb {
  const h = color.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Color at position t (0..1) along a multi-stop gradient. */
export function gradientAt(stops: Rgb[], t: number): Rgb {
  if (stops.length === 1) return stops[0]!;
  const scaled = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const i = Math.min(Math.floor(scaled), stops.length - 2);
  return mix(stops[i]!, stops[i + 1]!, scaled - i);
}

function to256([r, g, b]: Rgb): number {
  const q = (v: number): number => Math.round((v / 255) * 5);
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

function to16([r, g, b]: Rgb): number {
  const bright = Math.max(r, g, b) > 170 ? 60 : 0;
  const code = (b > 127 ? 4 : 0) + (g > 127 ? 2 : 0) + (r > 127 ? 1 : 0);
  return 30 + code + bright;
}

export class Painter {
  readonly level: ColorLevel;

  constructor(level: ColorLevel) {
    this.level = level;
  }

  fg(color: Rgb | string, text: string): string {
    if (this.level === 0) return text;
    const rgb = typeof color === 'string' ? hex(color) : color;
    if (this.level === 3) return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}\x1b[39m`;
    if (this.level === 2) return `\x1b[38;5;${to256(rgb)}m${text}\x1b[39m`;
    return `\x1b[${to16(rgb)}m${text}\x1b[39m`;
  }

  bold(text: string): string {
    return this.level ? `\x1b[1m${text}\x1b[22m` : text;
  }

  dim(text: string): string {
    return this.level ? `\x1b[2m${text}\x1b[22m` : text;
  }

  /** Each character gets its own color along the gradient. */
  gradient(text: string, stops: (Rgb | string)[], offset = 0): string {
    if (this.level === 0) return text;
    const rgbStops = stops.map((s) => (typeof s === 'string' ? hex(s) : s));
    const chars = [...text];
    const width = Math.max(chars.length - 1, 1);
    return chars
      .map((ch, i) =>
        ch === ' ' ? ch : this.fg(gradientAt(rgbStops, (i / width + offset) % 1.0001), ch),
      )
      .join('');
  }
}

/** Visible width of a string (ANSI codes removed). */
export function visibleLength(text: string): number {
  // eslint-disable-next-line no-control-regex
  return [...text.replace(/\x1b\[[0-9;]*m/g, '')].length;
}
