// Spike S9: tells a machine sleep apart from a normal tick of a periodic check (plan §5.4).
// A tick pairs the wall clock (Date.now) with a monotonic one (performance.now). Between two ticks:
//   - wall-jump: the wall clock ran ahead of the monotonic one, i.e. the monotonic clock stopped
//     while the machine slept;
//   - late-tick: both moved together but far more than one period, i.e. the monotonic clock kept
//     counting through the sleep (or the process was stalled);
//   - wall-back: the wall clock moved back (NTP or a manual change);
//   - normal: anything within the threshold, three periods by default (plan §9.2).
export type Tick = { wall: number; mono: number };

export type TickComparison = {
  wallDeltaMs: number;
  monoDeltaMs: number;
  /** How far the wall clock ran ahead of the monotonic clock. */
  jumpMs: number;
  /** How much later than one period the monotonic clock says this tick came. */
  lateMs: number;
  kind: 'normal' | 'wall-jump' | 'late-tick' | 'wall-back';
};

export function compareTicks(previous: Tick, current: Tick, periodMs: number, thresholdMs = 3 * periodMs): TickComparison {
  const wallDeltaMs = current.wall - previous.wall;
  const monoDeltaMs = current.mono - previous.mono;
  const jumpMs = wallDeltaMs - monoDeltaMs;
  const lateMs = Math.max(0, monoDeltaMs - periodMs);
  let kind: TickComparison['kind'] = 'normal';
  if (jumpMs > thresholdMs) kind = 'wall-jump';
  else if (jumpMs < -thresholdMs) kind = 'wall-back';
  else if (lateMs > thresholdMs) kind = 'late-tick';
  return { wallDeltaMs, monoDeltaMs, jumpMs, lateMs, kind };
}
