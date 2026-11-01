import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import type { WrappedStats } from '../stats/compute.ts';
import {
  formatCompact,
  formatCost,
  formatHour,
  formatHoursShort,
  formatInt,
  plural,
} from '../format.ts';
import { loadFonts } from './fonts.ts';

/* A minimal hyperscript for satori: no React needed. */
type Style = Record<string, string | number>;
interface Node {
  type: string;
  props: { style?: Style; children?: Child | Child[] };
}
type Child = Node | string | null | false;

function h(style: Style, ...children: Child[]): Node {
  const kids = children.filter((c): c is Node | string => c !== null && c !== false);
  return {
    type: 'div',
    props: {
      style: { display: 'flex', boxSizing: 'border-box', ...style },
      children: kids.length === 1 ? kids[0] : kids,
    },
  };
}

export type CardFormat = 'landscape' | 'story';

export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
  landscape: { width: 1200, height: 675 },
  story: { width: 1080, height: 1920 },
};

export interface CardOptions {
  hideProjects?: boolean;
}

interface Tile {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  accent: [string, string];
}

const INK = '#f8f7ff';
const MUTED = 'rgba(232, 228, 255, 0.62)';
const FAINT = 'rgba(232, 228, 255, 0.38)';
const GLASS = 'rgba(255, 255, 255, 0.055)';
const EDGE = 'rgba(255, 255, 255, 0.11)';

function gradientText(colors: string[], style: Style, text: string): Node {
  return h(
    {
      backgroundImage: `linear-gradient(90deg, ${colors.join(', ')})`,
      backgroundClip: 'text',
      color: 'transparent',
      ...style,
    },
    text,
  );
}

function tiles(stats: WrappedStats, options: CardOptions): Tile[] {
  const hours = formatHoursShort(stats.totalActiveMs);
  const topTool = stats.tools[0];
  const right = stats.phrases.agent.absolutelyRight ?? 0;
  const projectTile: Tile = options.hideProjects
    ? {
        label: 'Projects',
        value: formatInt(stats.projects.length),
        note: 'touched this year',
        accent: ['#34d399', '#22d3ee'],
      }
    : {
        label: 'Top project',
        value: stats.topProject?.name ?? '—',
        note:
          stats.projects.length > 1
            ? `of ${formatInt(stats.projects.length)} projects`
            : 'all-in on one',
        accent: ['#34d399', '#22d3ee'],
      };
  return [
    {
      label: 'Sessions',
      value: formatInt(stats.sessions),
      note: plural(stats.activeDays, 'active day'),
      accent: ['#a78bfa', '#f472b6'],
    },
    {
      label: 'Time together',
      value: hours.value,
      unit: hours.unit,
      note: 'of active coding',
      accent: ['#22d3ee', '#818cf8'],
    },
    {
      label: 'Tokens',
      value: formatCompact(stats.tokens.total),
      note: `${formatCompact(stats.tokens.output)} written by AI`,
      accent: ['#fbbf24', '#fb7185'],
    },
    {
      label: 'API value',
      value: formatCost(stats.cost.total),
      note: 'at list prices',
      accent: ['#4ade80', '#facc15'],
    },
    {
      label: 'Top model',
      value: stats.topModel?.name ?? '—',
      note: share(stats.topModel?.responses, stats.responses),
      accent: ['#c084fc', '#60a5fa'],
    },
    projectTile,
    {
      label: 'Longest streak',
      value: formatInt(stats.longestStreak?.days ?? 0),
      unit: (stats.longestStreak?.days ?? 0) === 1 ? 'day' : 'days',
      note: 'in a row',
      accent: ['#f472b6', '#fb923c'],
    },
    {
      label: 'Favorite tool',
      value: topTool?.name ?? '—',
      note: topTool ? `${formatCompact(topTool.count)} calls` : 'none yet',
      accent: ['#38bdf8', '#a78bfa'],
    },
    {
      label: 'Agent agreed',
      value: formatInt(right),
      unit: right === 1 ? 'time' : 'times',
      note: '"You\'re absolutely right!"',
      accent: ['#e879f9', '#fb7185'],
    },
  ];
}

function share(part: number | undefined, whole: number): string {
  if (!part || !whole) return '';
  return `${Math.round((part / whole) * 100)}% of replies`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

interface TileSize {
  width: number;
  height: number;
  /** Largest value font size; long values shrink to fit the tile. */
  value: number;
  /** Multiplier for labels, notes and padding. */
  scale: number;
}

/** Approximate advance width of Bricolage ExtraBold, as a share of the font size. */
const VALUE_CHAR_WIDTH = 0.6;

function tileNode(tile: Tile, size: TileSize): Node {
  const k = size.scale;
  const inner = size.width - 40 * k - (tile.unit ? tile.unit.length * 10 * k + 10 : 0);
  // Shrink long values to fit, but never below ~60% of the full size: shorten them instead.
  const minSize = size.value * 0.6;
  const value = truncate(tile.value, Math.floor(inner / (minSize * VALUE_CHAR_WIDTH)));
  const valueSize = Math.min(size.value, Math.floor(inner / (value.length * VALUE_CHAR_WIDTH)));
  return h(
    {
      flexDirection: 'column',
      justifyContent: 'space-between',
      width: size.width,
      height: size.height,
      padding: `${18 * k}px ${20 * k}px`,
      borderRadius: 22 * k,
      backgroundColor: GLASS,
      border: `1px solid ${EDGE}`,
      position: 'relative',
      overflow: 'hidden',
    },
    h({
      position: 'absolute',
      top: 0,
      left: 0,
      width: size.width,
      height: 3 * k,
      backgroundImage: `linear-gradient(90deg, ${tile.accent[0]}, ${tile.accent[1]})`,
    }),
    h(
      {
        fontSize: 14 * k,
        color: MUTED,
        fontWeight: 600,
        letterSpacing: 1.2 * k,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      },
      tile.label,
    ),
    h(
      { alignItems: 'flex-end', gap: 8 * k },
      gradientText(
        [INK, tile.accent[0]],
        {
          fontFamily: 'Bricolage',
          fontWeight: 800,
          fontSize: valueSize,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        },
        value,
      ),
      tile.unit ? h({ fontSize: 18 * k, color: MUTED, marginBottom: 4 * k }, tile.unit) : null,
    ),
    h({ fontSize: 14 * k, color: FAINT, whiteSpace: 'nowrap' }, tile.note ?? ''),
  );
}

function hourChart(stats: WrappedStats, width: number, height: number, colors: string[]): Node {
  const max = Math.max(...stats.hours, 1);
  const gap = 4;
  const barWidth = (width - gap * 23) / 24;
  return h(
    { flexDirection: 'column', gap: 10, width },
    h(
      { alignItems: 'flex-end', gap, height },
      ...stats.hours.map((value, hour) =>
        h({
          width: barWidth,
          height: Math.max(4, (value / max) * height),
          borderRadius: 4,
          backgroundImage:
            hour === stats.peakHour
              ? `linear-gradient(180deg, #ffffff, ${colors[2]})`
              : `linear-gradient(180deg, ${colors[2]}, ${colors[1]})`,
          opacity: value === 0 ? 0.25 : hour === stats.peakHour ? 1 : 0.55 + 0.45 * (value / max),
        }),
      ),
    ),
    h(
      { justifyContent: 'space-between', fontSize: 13, color: FAINT, fontFamily: 'JetBrains Mono' },
      ...['12a', '6a', '12p', '6p', '11p'].map((t) => h({}, t)),
    ),
  );
}

function background(colors: string[], width: number, height: number): Node[] {
  return [
    h({
      position: 'absolute',
      top: -height * 0.35,
      left: -width * 0.25,
      width: width * 0.95,
      height: width * 0.95,
      backgroundImage: `radial-gradient(circle at center, ${colors[1]}aa 0%, ${colors[1]}00 65%)`,
    }),
    h({
      position: 'absolute',
      bottom: -height * 0.4,
      right: -width * 0.3,
      width: width * 1.0,
      height: width * 1.0,
      backgroundImage: `radial-gradient(circle at center, ${colors[2]}88 0%, ${colors[2]}00 62%)`,
    }),
    h({
      position: 'absolute',
      top: height * 0.3,
      right: width * 0.25,
      width: width * 0.5,
      height: width * 0.5,
      backgroundImage: `radial-gradient(circle at center, ${colors[0]}cc 0%, ${colors[0]}00 70%)`,
    }),
  ];
}

function glow(color: string, alpha: string, x: number, y: number, size: number): Node {
  return h({
    position: 'absolute',
    left: x - size / 2,
    top: y - size / 2,
    width: size,
    height: size,
    backgroundImage: `radial-gradient(circle at center, ${color}${alpha} 0%, ${color}00 68%)`,
  });
}

function storyBackground(colors: string[]): Node[] {
  return [
    glow(colors[1]!, 'b0', 160, 260, 1300),
    glow(colors[2]!, '80', 1000, 1080, 1200),
    glow(colors[0]!, 'd0', 300, 1650, 1100),
    glow(colors[1]!, '60', 900, 1900, 900),
  ];
}

function pill(text: string, colors: string[], scale = 1): Node {
  return h(
    {
      alignItems: 'center',
      gap: 10 * scale,
      padding: `${8 * scale}px ${16 * scale}px`,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.08)',
      border: `1px solid ${EDGE}`,
      fontSize: 15 * scale,
      fontWeight: 700,
      letterSpacing: 2 * scale,
      color: INK,
    },
    h({
      width: 10 * scale,
      height: 10 * scale,
      borderRadius: 999,
      backgroundImage: `linear-gradient(90deg, ${colors[1]}, ${colors[2]})`,
    }),
    text,
  );
}

function footer(fontSize: number): Node {
  return h(
    { alignItems: 'center', justifyContent: 'space-between', width: '100%', fontSize },
    h(
      { alignItems: 'center', gap: 10, fontFamily: 'JetBrains Mono', color: INK },
      h({ color: '#f472b6' }, '$'),
      'npx agent-wrapped',
    ),
    h({ color: FAINT }, '100% local · nothing left my machine'),
  );
}

function landscape(stats: WrappedStats, options: CardOptions): Node {
  const { width, height } = CARD_SIZES.landscape;
  const p = stats.personality;
  const titleSize = p.title.length > 18 ? 54 : p.title.length > 14 ? 62 : 70;
  return h(
    {
      width,
      height,
      backgroundColor: '#07060f',
      color: INK,
      fontFamily: 'Inter',
      position: 'relative',
      overflow: 'hidden',
      padding: 48,
      gap: 40,
    },
    ...background(p.colors, width, height),
    h(
      { flexDirection: 'column', justifyContent: 'space-between', width: 430 },
      h(
        { flexDirection: 'column', gap: 22 },
        h({}, pill(`AGENT WRAPPED · ${stats.period.label.toUpperCase()}`, p.colors)),
        h(
          { flexDirection: 'column' },
          h({ fontSize: 24, color: MUTED }, `My ${stats.period.label} with`),
          gradientText(
            ['#ffffff', '#e9d5ff', '#f9a8d4'],
            { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 52, lineHeight: 1.05 },
            'Claude Code',
          ),
        ),
        h(
          { flexDirection: 'column', gap: 8, marginTop: 10 },
          h(
            { fontSize: 14, color: MUTED, fontWeight: 700, letterSpacing: 2.5 },
            'MY AGENT PERSONALITY',
          ),
          gradientText(
            ['#ffffff', p.colors[2], p.colors[1]],
            { fontFamily: 'Bricolage', fontWeight: 800, fontSize: titleSize, lineHeight: 1 },
            p.title,
          ),
          h({ fontSize: 19, color: INK, lineHeight: 1.35, marginTop: 6 }, p.tagline),
        ),
      ),
      h(
        { flexDirection: 'column', gap: 12 },
        h(
          { justifyContent: 'space-between', fontSize: 14, color: MUTED },
          h({ fontWeight: 700, letterSpacing: 2 }, 'WHEN I CODE'),
          stats.peakHour === null
            ? null
            : h({}, `peak ${formatHour(stats.peakHour)} · ${stats.peakWeekday ?? ''}s`),
        ),
        hourChart(stats, 430, 74, p.colors),
      ),
    ),
    h(
      { flexDirection: 'column', justifyContent: 'space-between', flexGrow: 1 },
      h(
        { flexWrap: 'wrap', gap: 14 },
        ...tiles(stats, options).map((tile) =>
          tileNode(tile, { width: 202, height: 160, value: 46, scale: 1 }),
        ),
      ),
      footer(17),
    ),
  );
}

function story(stats: WrappedStats, options: CardOptions): Node {
  const { width, height } = CARD_SIZES.story;
  const p = stats.personality;
  const titleSize = p.title.length > 18 ? 96 : p.title.length > 14 ? 108 : 124;
  return h(
    {
      width,
      height,
      flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundColor: '#07060f',
      color: INK,
      fontFamily: 'Inter',
      position: 'relative',
      overflow: 'hidden',
      padding: '80px 72px 72px',
    },
    ...storyBackground(p.colors),
    h(
      { flexDirection: 'column', gap: 28 },
      h({}, pill(`AGENT WRAPPED · ${stats.period.label.toUpperCase()}`, p.colors, 1.5)),
      h(
        { flexDirection: 'column' },
        h({ fontSize: 40, color: MUTED }, `My ${stats.period.label} with`),
        gradientText(
          ['#ffffff', '#e9d5ff', '#f9a8d4'],
          { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 92, lineHeight: 1.05 },
          'Claude Code',
        ),
      ),
      h(
        {
          flexDirection: 'column',
          gap: 14,
          marginTop: 12,
          padding: '36px 44px',
          borderRadius: 36,
          backgroundColor: GLASS,
          border: `1px solid ${EDGE}`,
        },
        h(
          { fontSize: 22, color: MUTED, fontWeight: 700, letterSpacing: 3 },
          'MY AGENT PERSONALITY',
        ),
        gradientText(
          ['#ffffff', p.colors[2], p.colors[1]],
          { fontFamily: 'Bricolage', fontWeight: 800, fontSize: titleSize, lineHeight: 1 },
          p.title,
        ),
        h({ fontSize: 32, color: INK, lineHeight: 1.35, marginTop: 8 }, p.tagline),
        h({ fontSize: 24, color: MUTED, lineHeight: 1.4 }, p.reason),
      ),
    ),
    h(
      { flexWrap: 'wrap', gap: 20 },
      ...tiles(stats, options)
        .slice(0, 8)
        .map((tile) => tileNode(tile, { width: 458, height: 168, value: 64, scale: 1.3 })),
    ),
    h(
      { flexDirection: 'column', gap: 18 },
      h(
        { justifyContent: 'space-between', fontSize: 22, color: MUTED },
        h({ fontWeight: 700, letterSpacing: 2.5 }, 'WHEN I CODE'),
        stats.peakHour === null
          ? null
          : h({}, `peak ${formatHour(stats.peakHour)} · ${stats.peakWeekday ?? ''}s`),
      ),
      hourChart(stats, width - 144, 120, p.colors),
    ),
    footer(26),
  );
}

export async function renderCardSvg(
  stats: WrappedStats,
  format: CardFormat,
  options: CardOptions = {},
): Promise<string> {
  const size = CARD_SIZES[format];
  const tree = format === 'landscape' ? landscape(stats, options) : story(stats, options);
  return satori(tree, { ...size, fonts: loadFonts() });
}

export async function renderCardPng(
  stats: WrappedStats,
  format: CardFormat,
  options: CardOptions = {},
): Promise<Buffer> {
  const svg = await renderCardSvg(stats, format, options);
  const resvg = new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: false } });
  return resvg.render().asPng();
}
