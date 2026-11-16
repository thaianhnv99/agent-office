import { describe, expect, it } from 'vitest';
import { compareTicks, type Tick } from './clock.ts';

const PERIOD = 5000;
const tick = (wall: number, mono: number): Tick => ({ wall, mono });
const start = tick(1_000_000, 50_000);

describe('compareTicks', () => {
  it.each([
    ['an on-time tick', tick(1_005_000, 55_000), 'normal'],
    ['a tick a little late from load', tick(1_005_900, 55_900), 'normal'],
    ['sleep with a monotonic clock that stops', tick(1_605_000, 55_000), 'wall-jump'],
    ['sleep with a monotonic clock that keeps counting', tick(1_605_000, 655_000), 'late-tick'],
    ['the wall clock set back (NTP or by hand)', tick(985_000, 55_000), 'wall-back'],
  ] as const)('classifies %s', (_name, current, kind) => {
    expect(compareTicks(start, current, PERIOD).kind).toBe(kind);
  });

  it('reports the deltas and how far the wall clock ran ahead of the monotonic one', () => {
    expect(compareTicks(start, tick(1_605_000, 55_000), PERIOD)).toEqual({
      wallDeltaMs: 605_000,
      monoDeltaMs: 5_000,
      jumpMs: 600_000,
      lateMs: 0,
      kind: 'wall-jump',
    });
  });

  it('uses three periods as the threshold, as the plan proposes', () => {
    expect(compareTicks(start, tick(1_005_000 + 3 * PERIOD, 55_000), PERIOD).kind).toBe('normal');
    expect(compareTicks(start, tick(1_005_000 + 3 * PERIOD + 1, 55_000), PERIOD).kind).toBe('wall-jump');
  });
});
