import { describe, expect, it } from 'vitest';
import { MODEL_PRICES, costOf, modelInfo } from '../src/pricing.ts';

describe('modelInfo', () => {
  it.each([
    ['claude-opus-5-5', 'opus-5.5', 'Opus 5.5'],
    ['claude-opus-4-1-20250805', 'opus-4.1', 'Opus 4.1'],
    ['claude-opus-4-20250514', 'opus-4', 'Opus 4'],
    ['claude-sonnet-4-5-20250929', 'sonnet-4.5', 'Sonnet 4.5'],
    ['claude-3-5-sonnet-20241022', 'sonnet-3.5', 'Sonnet 3.5'],
    ['claude-3-7-sonnet-latest', 'sonnet-3.7', 'Sonnet 3.7'],
    ['claude-3-opus-20240229', 'opus-3', 'Opus 3'],
    ['claude-3-5-haiku-20241022', 'haiku-3.5', 'Haiku 3.5'],
    ['claude-haiku-4-5', 'haiku-4.5', 'Haiku 4.5'],
    ['claude-fable-5-1', 'fable-5.1', 'Fable 5.1'],
    ['us.anthropic.claude-sonnet-4-5-20250929-v1:0', 'sonnet-4.5', 'Sonnet 4.5'],
    ['claude-sonnet-4-5@20250929', 'sonnet-4.5', 'Sonnet 4.5'],
  ])('%s -> %s', (id, key, name) => {
    expect(modelInfo(id)).toEqual({ key, name });
  });

  it('keeps unknown ids as they are', () => {
    expect(modelInfo('gpt-imaginary-1')).toEqual({ key: null, name: 'gpt-imaginary-1' });
  });

  it('has a price for every key it produces in the table', () => {
    for (const key of Object.keys(MODEL_PRICES)) {
      const [family, version] = key.split('-');
      const id = `claude-${family}-${version!.replace('.', '-')}`;
      expect(modelInfo(id).key).toBe(key);
    }
  });
});

describe('costOf', () => {
  const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 };

  it('prices input and output per million tokens', () => {
    expect(costOf('claude-sonnet-4-5', { ...zero, input: 100_000, output: 1e6 })).toBeCloseTo(
      0.3 + 15,
    );
    expect(costOf('claude-opus-5-5', { ...zero, input: 1e6, output: 1e6 })).toBeCloseTo(24);
  });

  it('uses the standard cache multipliers by default', () => {
    const cost = costOf('claude-opus-4-1', {
      ...zero,
      cacheRead: 1e6,
      cacheWrite5m: 1e6,
      cacheWrite1h: 1e6,
    });
    expect(cost).toBeCloseTo(15 * 0.1 + 15 * 1.25 + 15 * 2);
  });

  it('uses model-specific cache read prices', () => {
    expect(costOf('claude-opus-5-5', { ...zero, cacheRead: 1e6 })).toBeCloseTo(0.2);
    expect(costOf('claude-fable-5-1', { ...zero, cacheRead: 1e6 })).toBeCloseTo(0.25);
  });

  it('applies long-context rates above the threshold', () => {
    const small = costOf('claude-haiku-5-5', { ...zero, input: 100_000, output: 1000 });
    const large = costOf('claude-haiku-5-5', { ...zero, input: 100_001, output: 1000 });
    expect(small).toBeCloseTo((100_000 * 0.1 + 1000 * 0.5) / 1e6);
    expect(large).toBeCloseTo((100_001 * 0.5 + 1000 * 2.5) / 1e6);
  });

  it('returns null for models without a price', () => {
    expect(costOf('gpt-imaginary-1', { ...zero, input: 10 })).toBeNull();
  });
});
