import { describe, expect, it } from 'vitest';
import { renderCardPng, renderCardSvg } from '../src/card/card.ts';
import { computeStats } from '../src/stats/compute.ts';
import { YEAR_2026, prompt, reply } from './helpers.ts';

const stats = computeStats(
  [
    prompt('2026-04-01T22:00:00Z', { project: 'secret-repo' }),
    reply('2026-04-01T22:01:00Z', { project: 'secret-repo', tools: ['Bash', 'Edit'] }),
  ],
  YEAR_2026,
);

/** Width and height from a PNG's IHDR chunk. */
function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe('cards', () => {
  it('renders the landscape card at 1200x675', async () => {
    const png = await renderCardPng(stats, 'landscape');
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(pngSize(png)).toEqual({ width: 1200, height: 675 });
  });

  it('renders the story card at 1080x1920', async () => {
    expect(pngSize(await renderCardPng(stats, 'story'))).toEqual({ width: 1080, height: 1920 });
  });

  it('draws text as paths, so no name leaks as text, and hides projects on request', async () => {
    const shown = await renderCardSvg(stats, 'landscape');
    const hidden = await renderCardSvg(stats, 'landscape', { hideProjects: true });
    expect(shown).not.toEqual(hidden);
    expect(hidden.length).toBeGreaterThan(1000);
  });
});
