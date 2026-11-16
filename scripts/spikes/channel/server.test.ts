import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SERVER = resolve(import.meta.dirname, 'server.mjs');

type Message = { id?: number; method?: string; result?: Record<string, unknown>; params?: Record<string, unknown> };

/** Spawns the channel server and reads its stdout as newline-delimited JSON-RPC messages. */
function start(dir: string) {
  const child: ChildProcessWithoutNullStreams = spawn('node', [SERVER], {
    env: { ...process.env, AO_CHANNEL_RAW_DIR: dir, AO_CHANNEL_MODE_FILE: join(dir, 'mode') },
  });
  const inbox: Message[] = [];
  const waiters: Array<() => void> = [];
  createInterface({ input: child.stdout }).on('line', (line) => {
    inbox.push(JSON.parse(line) as Message);
    waiters.splice(0).forEach((wake) => wake());
  });
  const next = async (match: (m: Message) => boolean, timeoutMs = 3000): Promise<Message> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const index = inbox.findIndex(match);
      if (index >= 0) return inbox.splice(index, 1)[0] as Message;
      if (Date.now() > deadline) throw new Error('timed out waiting for a message');
      await new Promise<void>((wake) => {
        waiters.push(wake);
        setTimeout(wake, 50);
      });
    }
  };
  const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`);
  return { child, next, send };
}

const logOf = (dir: string) =>
  readFileSync(join(dir, 'channel.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);

const permissionRequest = (requestId: string) => ({
  jsonrpc: '2.0',
  method: 'notifications/claude/channel/permission_request',
  params: { request_id: requestId, tool_name: 'Bash', description: 'Run a command', input_preview: '{"command": "ls"}' },
});

describe('spike channel server', () => {
  let dir: string;
  let server: ReturnType<typeof start>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agent-office-channel-'));
  });

  afterEach(() => {
    server?.child.kill();
    rmSync(dir, { recursive: true, force: true });
  });

  it('answers initialize with the channel and permission-relay capabilities', async () => {
    server = start(dir);
    server.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } });

    const reply = await server.next((m) => m.id === 1);

    expect(reply.result).toMatchObject({
      protocolVersion: '2025-06-18',
      capabilities: { experimental: { 'claude/channel': {}, 'claude/channel/permission': {} } },
      serverInfo: { name: 'ao-channel' },
    });
  });

  it('sends an allow verdict after the delay set in the mode file', async () => {
    writeFileSync(join(dir, 'mode'), 'allow:0.1');
    server = start(dir);

    server.send(permissionRequest('abcde'));
    const verdict = await server.next((m) => m.method === 'notifications/claude/channel/permission');

    expect(verdict.params).toEqual({ request_id: 'abcde', behavior: 'allow' });
  });

  it('picks the mode whose scenario marker appears in the request', async () => {
    writeFileSync(join(dir, 'mode'), 's3-01=deny:0.1\ns3-02=allow:0.1\nmanual\n');
    server = start(dir);

    server.send({
      ...permissionRequest('pqrst'),
      params: { ...permissionRequest('pqrst').params, input_preview: '{"command": "echo s3-02 > out.txt"}' },
    });
    const verdict = await server.next((m) => m.method === 'notifications/claude/channel/permission');

    expect(verdict.params).toEqual({ request_id: 'pqrst', behavior: 'allow' });
  });

  it('relays a verdict posted to its local HTTP endpoint (manual mode)', async () => {
    server = start(dir);
    server.send(permissionRequest('fghij'));
    await expect.poll(() => logOf(dir).find((e) => e['event'] === 'permission_request')).toBeTruthy();
    const port = (logOf(dir).find((e) => e['event'] === 'listening') as { port: number }).port;

    const response = await fetch(`http://127.0.0.1:${port}/verdict`, {
      method: 'POST',
      body: JSON.stringify({ request_id: 'fghij', behavior: 'deny' }),
    });
    const verdict = await server.next((m) => m.method === 'notifications/claude/channel/permission');

    expect(response.status).toBe(200);
    expect(verdict.params).toEqual({ request_id: 'fghij', behavior: 'deny' });
  });

  it('drops requests in never mode, like a channel whose app server is unreachable', async () => {
    writeFileSync(join(dir, 'mode'), 'never');
    server = start(dir);

    server.send(permissionRequest('klmno'));

    await expect.poll(() => logOf(dir).some((e) => e['event'] === 'dropped')).toBe(true);
    await expect(server.next((m) => m.method === 'notifications/claude/channel/permission', 300)).rejects.toThrow('timed out');
  });

  it('logs stdin closing and exits, which is how it learns the session ended', async () => {
    server = start(dir);
    const exited = new Promise<number | null>((done) => server.child.on('exit', done));

    server.child.stdin.end();

    expect(await exited).toBe(0);
    expect(logOf(dir).map((e) => e['event'])).toContain('stdin-end');
  });
});
