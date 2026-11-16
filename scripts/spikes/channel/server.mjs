#!/usr/bin/env node
// Spike S3 (and S5): a minimal channel MCP server, written without the SDK so every message is
// visible. It declares the permission-relay capability, logs every message and lifecycle event to
// .dev-raw/s3/channel.jsonl, and answers permission prompts according to a mode file that can be
// changed between sessions without touching the MCP config:
//
//   manual     (default) wait for a verdict posted to the local HTTP endpoint, like a dashboard:
//              curl -X POST 127.0.0.1:<port>/verdict -d '{"request_id":"abcde","behavior":"allow"}'
//              The OS-assigned port is logged in the "listening" event.
//   allow:<s>  send "allow" after <s> seconds
//   deny:<s>   send "deny" after <s> seconds
//   never      drop every request, like a channel whose app server is unreachable
//
// Env: AO_CHANNEL_RAW_DIR (log dir, default .dev-raw/s3), AO_CHANNEL_MODE_FILE
// (default .dev-data/s3/channel-mode). Raw data only: never commit the log.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const root = resolve(import.meta.dirname, '../../..');
const rawDir = process.env.AO_CHANNEL_RAW_DIR ?? join(root, '.dev-raw', 's3');
const modeFile = process.env.AO_CHANNEL_MODE_FILE ?? join(root, '.dev-data', 's3', 'channel-mode');
const logFile = join(rawDir, 'channel.jsonl');
const pending = new Map();

mkdirSync(dirname(logFile), { recursive: true });
const log = (entry) => appendFileSync(logFile, `${JSON.stringify({ t: Date.now(), pid: process.pid, ...entry })}\n`);
const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);

// The mode file holds one default mode, or lines "<marker>=<mode>" plus an optional default line.
// A marker line applies when the marker appears in the request (e.g. "s3-01" in the command), so a
// whole scenario run can be scripted without changing the file between sessions.
function readMode(params = {}) {
  let lines;
  try {
    lines = readFileSync(modeFile, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    return 'manual';
  }
  const text = `${params.input_preview ?? ''} ${params.description ?? ''}`;
  for (const line of lines) {
    const [marker, mode] = line.split('=');
    if (mode !== undefined && text.includes(marker)) return mode;
  }
  return lines.find((line) => !line.includes('=')) ?? 'manual';
}

function sendVerdict(requestId, behavior, via) {
  send({ method: 'notifications/claude/channel/permission', params: { request_id: requestId, behavior } });
  log({ event: 'verdict-sent', request_id: requestId, behavior, via, wasPending: pending.delete(requestId) });
}

function onPermissionRequest(params) {
  const mode = readMode(params);
  log({ event: 'permission_request', mode, params });
  const [kind, seconds] = mode.split(':');
  if (kind === 'never') {
    log({ event: 'dropped', request_id: params.request_id });
    return;
  }
  pending.set(params.request_id, params);
  if (kind === 'allow' || kind === 'deny') {
    setTimeout(() => sendVerdict(params.request_id, kind, `auto:${seconds}`), Number(seconds) * 1000);
  }
}

function onMessage(message) {
  log({ event: 'recv', message });
  if (message.method === 'initialize') {
    send({
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion ?? '2025-06-18',
        capabilities: { experimental: { 'claude/channel': {}, 'claude/channel/permission': {} } },
        serverInfo: { name: 'ao-channel', version: '0.0.0' },
        instructions: 'Agent Office spike channel. It only relays permission prompts and never sends messages.',
      },
    });
  } else if (message.method === 'notifications/claude/channel/permission_request') {
    onPermissionRequest(message.params ?? {});
  } else if (message.method === 'ping') {
    send({ id: message.id, result: {} });
  } else if (message.id !== undefined && message.method) {
    send({ id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } });
  }
}

// Local "dashboard" endpoint for manual verdicts. 127.0.0.1 only, spike use only.
const http = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    if (req.method === 'POST' && req.url === '/verdict') {
      try {
        const { request_id: requestId, behavior } = JSON.parse(body);
        if (behavior !== 'allow' && behavior !== 'deny') throw new Error('behavior must be allow or deny');
        sendVerdict(requestId, behavior, 'http');
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ sent: true }));
      } catch (error) {
        res.writeHead(400).end(String(error));
      }
    } else if (req.method === 'GET' && req.url === '/pending') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify([...pending.keys()]));
    } else {
      res.writeHead(404).end();
    }
  });
});
http.listen(0, '127.0.0.1', () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('CLAUDE')).map(([k, v]) => [k, v]));
  log({ event: 'listening', port: http.address().port, ppid: process.ppid, mode: readMode(), envKeys: Object.keys(env), env: {
    CLAUDE_PROJECT_DIR: env.CLAUDE_PROJECT_DIR, CLAUDE_CODE_ENTRYPOINT: env.CLAUDE_CODE_ENTRYPOINT, CLAUDE_SESSION_ID: env.CLAUDE_SESSION_ID,
  } });
});

createInterface({ input: process.stdin })
  .on('line', (line) => {
    try {
      onMessage(JSON.parse(line));
    } catch (error) {
      log({ event: 'bad-line', error: String(error) });
    }
  })
  .on('close', () => {
    log({ event: 'stdin-end', pendingAtExit: [...pending.keys()] });
    http.close();
    process.exit(0);
  });

for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT']) {
  process.on(signal, () => {
    log({ event: 'signal', signal });
    process.exit(0);
  });
}
