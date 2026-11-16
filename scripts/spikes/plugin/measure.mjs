#!/usr/bin/env node
// Spike S8: measures how long one hook process takes to start, read a payload and exit, for several
// ways of packaging the hook. Wall time per run, measured around spawnSync, N runs each.
//
//   node scripts/spikes/plugin/measure.mjs [runs]
//
// Variants: the esbuild bundle (plain and minified), the TypeScript source run with node's type
// stripping and zod from node_modules, a POSIX sh script that posts the payload with curl to a local
// HTTP server (no node at all), and the bundle started through a sh shim that execs node.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildPlugin } from './build.ts';

const runs = Number(process.argv[2] ?? 20);
const dir = mkdtempSync(join(tmpdir(), 'agent-office-s8-measure-'));
const payload = JSON.stringify({ session_id: '00000000-0000-4000-8000-000000000001', hook_event_name: 'PreToolUse' });

// The S6 test server answers 200 at once. It runs in its own process: spawnSync blocks this one.
const port = 47393;
const server = spawn(process.execPath, [resolve(import.meta.dirname, '../hook-overhead/server.mjs'), 'ok', String(port)], { stdio: 'ignore' });
await new Promise((done) => setTimeout(done, 300));

const plain = await buildPlugin({ outDir: join(dir, 'plain'), rawDir: join(dir, 'raw') });
const minified = await buildPlugin({ outDir: join(dir, 'min'), rawDir: join(dir, 'raw'), minify: true });

const curlHook = join(dir, 'hook.sh');
writeFileSync(curlHook, `#!/bin/sh\nexec curl -s -m 1 -o /dev/null --data-binary @- "http://127.0.0.1:${port}/ingest"\n`);
chmodSync(curlHook, 0o755);
const shim = join(dir, 'shim.sh');
writeFileSync(shim, `#!/bin/sh\n[ -x "${process.execPath}" ] || exit 0\nexec "${process.execPath}" "${join(dir, 'min/dist/hook.mjs')}" "$@"\n`);
chmodSync(shim, 0o755);

const empty = join(dir, 'empty.mjs');
writeFileSync(empty, '');

const variants = [
  { name: 'node, empty script (baseline)', cmd: [process.execPath, empty] },
  { name: `bundle (${Math.round(plain.bundleBytes / 1024)} KB)`, cmd: [process.execPath, join(dir, 'plain/dist/hook.mjs')] },
  { name: `bundle, minified (${Math.round(minified.bundleBytes / 1024)} KB)`, cmd: [process.execPath, join(dir, 'min/dist/hook.mjs')] },
  // The source imports zod from the repo's node_modules and needs __RAW_DIR__, which only the build defines,
  // so it fails after the import: this measures node startup, type stripping and the zod import.
  { name: 'source .ts (type stripping, zod from node_modules)', cmd: [process.execPath, resolve(import.meta.dirname, 'src/hook.ts')] },
  { name: 'sh + curl to a local server (no node)', cmd: ['/bin/sh', curlHook] },
  { name: 'sh shim exec node bundle (minified)', cmd: ['/bin/sh', shim] },
];

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
for (const { name, cmd } of variants) {
  const times = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    spawnSync(cmd[0], cmd.slice(1), { input: payload });
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  console.log(`${name.padEnd(52)} p50 ${percentile(times, 0.5).toFixed(0).padStart(4)} ms   p95 ${percentile(times, 0.95).toFixed(0).padStart(4)} ms`);
}

server.kill();
rmSync(dir, { recursive: true, force: true });
