import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SERVER = resolve(import.meta.dirname, 'server.mjs');

type LogEntry = Record<string, unknown>;

const logOf = (dir: string): LogEntry[] => {
  try {
    return readFileSync(join(dir, 'permission-hook.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as LogEntry);
  } catch {
    return [];
  }
};

/** Starts the hook server on an OS-assigned port and resolves once it logs the port. */
async function start(dir: string) {
  const child = spawn('node', [SERVER, '0'], {
    env: { ...process.env, AO_S4_RAW_DIR: dir, AO_S4_MODE_FILE: join(dir, 'mode') },
    stdio: 'ignore',
  });
  await expect.poll(() => logOf(dir).some((e) => e['event'] === 'listening')).toBe(true);
  const port = (logOf(dir).find((e) => e['event'] === 'listening') as { port: number }).port;
  return { child, url: `http://127.0.0.1:${port}/permission` };
}

const hookPayload = (command: string) => ({
  session_id: '00000000-0000-4000-8000-000000000001',
  hook_event_name: 'PermissionRequest',
  tool_name: 'Bash',
  tool_input: { command, description: 'Run it' },
});

const post = (url: string, body: object, signal?: AbortSignal) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });

describe('spike PermissionRequest hook server', () => {
  let dir: string;
  let child: ChildProcess | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agent-office-s4-'));
  });

  afterEach(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((done) => child?.once('exit', done));
      child.kill();
      await exited;
    }
    child = undefined;
    rmSync(dir, { recursive: true, force: true });
  });

  it('answers allow after the delay set in the mode file', async () => {
    writeFileSync(join(dir, 'mode'), 'allow:0.1');
    const server = await start(dir);
    child = server.child;

    const response = await post(server.url, hookPayload('ls'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } },
    });
  });

  it('answers deny with a message', async () => {
    writeFileSync(join(dir, 'mode'), 'deny:0');
    const server = await start(dir);
    child = server.child;

    const body = await (await post(server.url, hookPayload('ls'))).json();

    expect(body).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: { behavior: 'deny', message: 'Denied by the S4 hook server' },
      },
    });
  });

  it('answers with no decision in pass mode, so Claude Code falls back to its own dialog', async () => {
    writeFileSync(join(dir, 'mode'), 'pass:0');
    const server = await start(dir);
    child = server.child;

    const response = await post(server.url, hookPayload('ls'));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('picks the mode whose scenario marker appears in the tool input', async () => {
    writeFileSync(join(dir, 'mode'), 's4-01=deny:0\ns4-02=allow:0\npass:0\n');
    const server = await start(dir);
    child = server.child;

    const body = await (await post(server.url, hookPayload('echo s4-02 > out.txt'))).json();

    expect(body).toMatchObject({ hookSpecificOutput: { decision: { behavior: 'allow' } } });
  });

  it('answers an AskUserQuestion by echoing the questions and picking the first option of each', async () => {
    writeFileSync(join(dir, 'mode'), 'answer:0');
    const server = await start(dir);
    child = server.child;
    const questions = [
      { question: 'Tea or coffee?', header: 'Drink', options: [{ label: 'Tea' }, { label: 'Coffee' }], multiSelect: false },
    ];

    const body = await (
      await post(server.url, { ...hookPayload('unused'), tool_name: 'AskUserQuestion', tool_input: { questions } })
    ).json();

    expect(body).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: { behavior: 'allow', updatedInput: { questions, answers: { 'Tea or coffee?': 'Tea' } } },
      },
    });
  });

  it('answers other tools in answer mode by allowing with the input echoed back (ExitPlanMode needs it)', async () => {
    writeFileSync(join(dir, 'mode'), 'answer:0');
    const server = await start(dir);
    child = server.child;
    const toolInput = { plan: 'Write the file.' };

    const body = await (await post(server.url, { ...hookPayload('unused'), tool_name: 'ExitPlanMode', tool_input: toolInput })).json();

    expect(body).toMatchObject({ hookSpecificOutput: { decision: { behavior: 'allow', updatedInput: toolInput } } });
  });

  it('never answers in hang mode and logs when the client gives up', async () => {
    writeFileSync(join(dir, 'mode'), 'hang');
    const server = await start(dir);
    child = server.child;

    await expect(post(server.url, hookPayload('ls'), AbortSignal.timeout(300))).rejects.toThrow();

    await expect.poll(() => logOf(dir).find((e) => e['event'] === 'client-closed')).toMatchObject({ answered: false });
    expect(logOf(dir).find((e) => e['event'] === 'request')).toMatchObject({ mode: 'hang', tool_name: 'Bash' });
  });
});
