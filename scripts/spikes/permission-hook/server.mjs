#!/usr/bin/env node
// Spike S4: an HTTP server for a `PermissionRequest` hook of type "http". It logs every request and
// whether Claude Code closed the connection before an answer (the user answered in the terminal, or
// the hook timed out), and answers according to a mode file that can change between sessions:
//
//   allow:<s>  answer "allow" after <s> seconds
//   deny:<s>   answer "deny" after <s> seconds
//   pass:<s>   answer 200 with an empty body after <s> seconds (no decision)
//   answer:<s> answer "allow" with updatedInput after <s> seconds: for AskUserQuestion the questions plus
//              an answer (first option) for each; for other tools, e.g. ExitPlanMode, the input echoed back
//   hang       never answer, like a hung app server
//
// The mode file holds one default mode, or lines "<marker>=<mode>" plus an optional default line; a
// marker line applies when the marker appears in the tool input (e.g. "s4-01" in the command).
//
// Usage: node server.mjs [port]   (default 47392; 0 picks a free port, logged in "listening")
// Env: AO_S4_RAW_DIR (log dir, default .dev-raw/s4), AO_S4_MODE_FILE (default .dev-data/s4/hook-mode).
// 127.0.0.1 only, spike use only. Raw data only: never commit the log.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const rawDir = process.env.AO_S4_RAW_DIR ?? join(root, '.dev-raw', 's4');
const modeFile = process.env.AO_S4_MODE_FILE ?? join(root, '.dev-data', 's4', 'hook-mode');
const logFile = join(rawDir, 'permission-hook.jsonl');
const port = Number(process.argv[2] ?? 47392);

mkdirSync(rawDir, { recursive: true });
const log = (entry) => appendFileSync(logFile, `${JSON.stringify({ t: Date.now(), ...entry })}\n`);

function readMode(text) {
  let lines;
  try {
    lines = readFileSync(modeFile, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    return 'pass:0';
  }
  for (const line of lines) {
    const [marker, mode] = line.split('=');
    if (mode !== undefined && text.includes(marker)) return mode;
  }
  return lines.find((line) => !line.includes('=')) ?? 'pass:0';
}

const output = (decision) => ({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } });

// Answers keyed by question text, value the option label (hooks docs, AskUserQuestion `answers`).
function answeredInput(payload) {
  const input = payload.tool_input ?? {};
  if (payload.tool_name !== 'AskUserQuestion') return input;
  const answers = Object.fromEntries((input.questions ?? []).map((q) => [q.question, q.options?.[0]?.label]));
  return { ...input, answers };
}

function decisionFor(kind, payload) {
  if (kind === 'deny') return output({ behavior: 'deny', message: 'Denied by the S4 hook server' });
  if (kind === 'answer') return output({ behavior: 'allow', updatedInput: answeredInput(payload) });
  return output({ behavior: 'allow' });
}

const server = createServer((req, res) => {
  const receivedAt = Date.now();
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    let payload = {};
    try {
      payload = JSON.parse(body);
    } catch {
      // Logged as is below; an unparsable body still gets the default mode.
    }
    const mode = readMode(JSON.stringify(payload.tool_input ?? {}));
    const id = `${receivedAt}-${Math.random().toString(36).slice(2, 7)}`;
    log({
      event: 'request', id, mode, url: req.url, hook_event_name: payload.hook_event_name, tool_name: payload.tool_name,
      tool_input: payload.tool_input, session_id: payload.session_id, permission_mode: payload.permission_mode,
    });

    let answered = false;
    res.on('close', () => {
      if (!answered) log({ event: 'client-closed', id, answered, afterMs: Date.now() - receivedAt });
    });

    const [kind, seconds = '0'] = mode.split(':');
    if (kind === 'hang') return;
    setTimeout(() => {
      if (res.destroyed) return;
      answered = true;
      if (kind === 'allow' || kind === 'deny' || kind === 'answer') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(decisionFor(kind, payload)));
      } else {
        res.writeHead(200).end();
      }
      log({ event: 'responded', id, kind, afterMs: Date.now() - receivedAt });
    }, Number(seconds) * 1000);
  });
});

server.listen(port, '127.0.0.1', () => log({ event: 'listening', port: server.address().port, mode: readMode('') }));

for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT']) {
  process.on(signal, () => {
    log({ event: 'signal', signal });
    process.exit(0);
  });
}
