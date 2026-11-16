// Spike S9: runs in the background through a machine sleep and logs what each clock and timer did,
// to .dev-raw/s9/clock.jsonl (raw data, never committed).
//
//   node scripts/spikes/lifecycle/clock-probe.ts [periodMs=5000]
//
// - Every period, a tick compares the wall clock with performance.now and process.hrtime
//   (compareTicks). Normal ticks are logged once a minute; anything else is logged at once.
// - A 60 s setTimeout, re-armed each time it fires, shows whether a timer counts the sleep.
import { appendFileSync, mkdirSync } from 'node:fs';
import { uptime } from 'node:os';
import { join, resolve } from 'node:path';
import { compareTicks, type Tick } from './clock.ts';

const period = Number(process.argv[2] ?? 5000);
const rawDir = resolve(import.meta.dirname, '../../../.dev-raw/s9');
mkdirSync(rawDir, { recursive: true });
const log = (entry: object) => appendFileSync(join(rawDir, 'clock.jsonl'), `${JSON.stringify(entry)}\n`);

const hrMs = () => Number(process.hrtime.bigint() / 1_000_000n);
const now = () => ({ wall: Date.now(), mono: performance.now(), hr: hrMs(), osUptimeS: uptime() });

let previous = now();
let ticks = 0;
log({ event: 'start', pid: process.pid, period, ...previous });

setInterval(() => {
  const current = now();
  const byPerf = compareTicks(previous as Tick, current as Tick, period);
  const byHr = compareTicks({ wall: previous.wall, mono: previous.hr }, { wall: current.wall, mono: current.hr }, period);
  ticks += 1;
  if (byPerf.kind !== 'normal' || byHr.kind !== 'normal' || ticks % Math.round(60_000 / period) === 0) {
    log({ event: 'tick', ...current, byPerf, byHr, osUptimeDeltaS: current.osUptimeS - previous.osUptimeS });
  }
  previous = current;
}, period);

function armLongTimer() {
  const armed = now();
  setTimeout(() => {
    const fired = now();
    log({ event: 'long-timer', setMs: 60_000, wallElapsed: fired.wall - armed.wall, monoElapsed: Math.round(fired.mono - armed.mono) });
    armLongTimer();
  }, 60_000);
}
armLongTimer();

for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
  process.on(signal, () => {
    log({ event: 'stop', signal, ...now() });
    process.exit(0);
  });
}
