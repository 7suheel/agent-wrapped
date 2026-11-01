/** 1234 -> "1,234". */
export function formatInt(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/** 1_234_567 -> "1.2M". */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [size, unit] of units) {
    if (abs >= size) {
      const scaled = value / size;
      const digits = Math.abs(scaled) >= 100 ? 0 : 1;
      return `${scaled.toFixed(digits).replace(/\.0$/, '')}${unit}`;
    }
  }
  return String(Math.round(value));
}

/** 5_400_000 -> "1h 30m", 45_000 -> "1m". */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${Math.max(minutes, ms > 0 ? 1 : 0)}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours >= 100) return `${formatInt(hours)}h`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** Whole hours for big headline numbers ("312"), minutes when under one. */
export function formatHoursShort(ms: number): { value: string; unit: string } {
  const hours = ms / 3_600_000;
  if (hours < 1) return { value: String(Math.max(1, Math.round(ms / 60_000))), unit: 'min' };
  if (hours < 10) return { value: hours.toFixed(1).replace(/\.0$/, ''), unit: 'hours' };
  return { value: formatInt(hours), unit: 'hours' };
}

export function formatCost(value: number): string {
  if (value >= 1000) return `$${formatInt(value)}`;
  if (value >= 10) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(2)}`;
}

/** 14 -> "2 PM". */
export function formatHour(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${suffix}`;
}

/** "2026-03-14" -> "Mar 14". */
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatInt(count)} ${count === 1 ? one : many}`;
}
