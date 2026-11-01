import { gradientAt, hex, type Painter } from './ansi.ts';

const BARS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const SHADES = ['·', '░', '▒', '▓', '█'];
const HEAT = ['#312e81', '#7c3aed', '#db2777', '#f97316', '#facc15'].map(hex);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** One row of vertical bars, one per hour, plus an hour axis. */
export function hourBars(hours: number[], paint: Painter): string[] {
  const max = Math.max(...hours, 1);
  const rows = 4;
  const lines: string[] = [];
  for (let row = rows - 1; row >= 0; row--) {
    let line = '';
    hours.forEach((value) => {
      const fill = Math.min(1, Math.max(0, (value / max) * rows - row)); // share of this cell
      const index = Math.round(fill * 8);
      const ch = row === 0 && value > 0 && index === 0 ? '▁' : BARS[index]!;
      const color = gradientAt(HEAT, value / max);
      line += paint.fg(color, ch + ch);
    });
    lines.push(line);
  }
  let axis = '';
  for (let hour = 0; hour < 24; hour += 4)
    axis += String(hour === 0 ? '12a' : hour === 12 ? '12p' : hour % 12).padEnd(8);
  lines.push(paint.dim(axis.trimEnd()));
  return lines;
}

/** Weekday x hour grid with shaded cells. */
export function weekGrid(heatmap: number[][], paint: Painter): string[] {
  const max = Math.max(...heatmap.flat(), 1);
  // Monday first reads more naturally for a work week.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((day) => {
    const cells = (heatmap[day] ?? [])
      .map((value) => {
        if (value === 0) return paint.dim('· ');
        const t = value / max;
        const shade = SHADES[Math.max(1, Math.min(4, Math.ceil(t * 4)))]!;
        return paint.fg(gradientAt(HEAT, t), shade + shade);
      })
      .join('')
      .replace(/ $/, '');
    return `${paint.dim(DAYS[day]!)} ${cells}`;
  });
}

/** Horizontal bar for rankings. */
export function bar(
  value: number,
  max: number,
  width: number,
  paint: Painter,
  colors: string[],
): string {
  const filled = max > 0 ? Math.max(1, Math.round((value / max) * width)) : 0;
  return (
    paint.gradient('█'.repeat(filled), colors) + paint.dim('░'.repeat(Math.max(0, width - filled)))
  );
}
