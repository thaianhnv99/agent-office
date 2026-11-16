// Spike S8: hook entry of a prototype plugin. It validates the payload with zod, a real runtime
// dependency, to show that the bundle runs with no node_modules next to it, and records how it was
// started: which node, which parent, which plugin env vars, how long the start took.
//
// The build (build.mjs) bakes the log directory in as __RAW_DIR__. Raw data only: never commit the log.
// Like every hook here it always exits 0 and prints nothing.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

declare const __RAW_DIR__: string;

const Payload = z.looseObject({ session_id: z.string(), hook_event_name: z.string() });

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

try {
  const input = await readStdin();
  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch {
    parsed = undefined;
  }
  const result = Payload.safeParse(parsed);
  const env = process.env;
  const record = {
    startedAt: Math.round(performance.timeOrigin),
    // Time from process start until the payload was read and validated.
    readyMs: Math.round(performance.now()),
    event: result.success ? result.data.hook_event_name : null,
    sessionId: result.success ? result.data.session_id : null,
    valid: result.success,
    pid: process.pid,
    ppid: process.ppid,
    node: { execPath: process.execPath, version: process.version },
    pathNodeDirs: (env['PATH'] ?? '').split(':').filter((dir) => /node|nvm/.test(dir)),
    env: {
      CLAUDE_PLUGIN_ROOT: env['CLAUDE_PLUGIN_ROOT'],
      CLAUDE_PLUGIN_DATA: env['CLAUDE_PLUGIN_DATA'],
      CLAUDE_PROJECT_DIR: env['CLAUDE_PROJECT_DIR'],
      CLAUDE_CODE_ENTRYPOINT: env['CLAUDE_CODE_ENTRYPOINT'],
    },
  };
  mkdirSync(__RAW_DIR__, { recursive: true });
  appendFileSync(join(__RAW_DIR__, 'hook.jsonl'), `${JSON.stringify(record)}\n`);
} catch {
  // A hook must never disturb the agent.
}
process.exit(0);
