import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(import.meta.dirname, 'log-event.ts');

describe('log-event (spike hook logger)', () => {
  let rawDir: string;

  const run = (args: string[], stdin: string, env: Record<string, string> = {}) =>
    spawnSync('node', [SCRIPT, ...args], {
      input: stdin,
      encoding: 'utf8',
      env: { ...process.env, AGENT_OFFICE_RAW_DIR: rawDir, ...env },
    });
  const lines = (file: string) =>
    readFileSync(join(rawDir, file), 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);

  beforeEach(() => {
    rawDir = mkdtempSync(join(tmpdir(), 'agent-office-log-event-'));
  });

  afterEach(() => {
    rmSync(rawDir, { recursive: true, force: true });
  });

  it('appends the hook payload under its tag, prints nothing and exits 0', () => {
    const result = run(['s0/project'], JSON.stringify({ hook_event_name: 'SessionStart', session_id: 's-1' }), {
      CLAUDE_PROJECT_DIR: '/tmp/sandbox',
    });
    run(['s0/project'], JSON.stringify({ hook_event_name: 'Stop', session_id: 's-1' }));

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    const [first, second] = lines('s0/project.jsonl');
    expect(first).toMatchObject({
      tag: 's0/project',
      payload: { hook_event_name: 'SessionStart', session_id: 's-1' },
      env: { CLAUDE_PROJECT_DIR: '/tmp/sandbox' },
    });
    expect(typeof first?.['receivedAt']).toBe('number');
    expect(typeof first?.['ppid']).toBe('number');
    expect(second).toMatchObject({ payload: { hook_event_name: 'Stop' } });
  });

  it('keeps input that is not JSON as a raw string', () => {
    const result = run(['s0/project'], 'not json');

    expect(result.status).toBe(0);
    expect(lines('s0/project.jsonl')[0]).toMatchObject({ raw: 'not json' });
  });

  it('prints the --print text, as a status line command must', () => {
    const result = run(['s0/statusline', '--print', 'agent-office S0'], '{}');

    expect(result.stdout).toBe('agent-office S0\n');
    expect(existsSync(join(rawDir, 's0/statusline.jsonl'))).toBe(true);
  });

  it('refuses a tag that would leave the raw directory, still exiting 0', () => {
    const result = run(['../escape'], '{}');

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(existsSync(join(rawDir, '..', 'escape.jsonl'))).toBe(false);
  });

  it('exits 0 silently when the raw directory cannot be written', () => {
    mkdirSync(join(rawDir, 's0'));
    writeFileSync(join(rawDir, 's0', 'project.jsonl'), '');
    chmodSync(join(rawDir, 's0', 'project.jsonl'), 0o444);

    const result = run(['s0/project'], '{}');

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });
});
