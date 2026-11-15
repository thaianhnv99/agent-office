// Spike hook logger for M0 (S0, S1): appends whatever Claude Code sends on stdin to
// .dev-raw/<tag>.jsonl, which git ignores (raw data, never committed).
//
//   node scripts/spikes/log-event.ts <tag> [--print <text>]
//
// A hook must never disturb the agent: this always exits 0, swallows every error and writes
// nothing to stdout, because SessionStart/UserPromptSubmit stdout is added to Claude's context.
// A status line command is the exception and passes --print with the line to display.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const TAG = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;
const ENV_KEYS = [
  'CLAUDE_PROJECT_DIR',
  'CLAUDE_PLUGIN_ROOT',
  'CLAUDE_PLUGIN_DATA',
  'CLAUDE_CONFIG_DIR',
  'CLAUDE_ENV_FILE',
  'CLAUDE_CODE_ENTRYPOINT',
];

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function parse(input: string): { payload: unknown } | { raw: string } {
  try {
    return { payload: JSON.parse(input) as unknown };
  } catch {
    return { raw: input };
  }
}

try {
  const [tag = '', flag, text] = process.argv.slice(2);
  if (flag === '--print' && text !== undefined) process.stdout.write(`${text}\n`);

  const input = await readStdin();
  if (TAG.test(tag)) {
    const rawDir = process.env['AGENT_OFFICE_RAW_DIR'] ?? resolve(import.meta.dirname, '../../.dev-raw');
    const file = join(rawDir, `${tag}.jsonl`);
    const env = Object.fromEntries(ENV_KEYS.flatMap((key) => (process.env[key] === undefined ? [] : [[key, process.env[key]]])));
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ receivedAt: Date.now(), tag, pid: process.pid, ppid: process.ppid, env, ...parse(input) })}\n`);
  }
} catch {
  // Never disturb the agent: a lost log line is better than a failed hook.
}
process.exitCode = 0;
