import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SHIM = resolve(import.meta.dirname, 'shim.sh');
// A PATH with sh, sed and date but no node.
const NO_NODE_PATH = '/usr/bin:/bin';

describe('spike stable shim', () => {
  let dir: string;
  let shim: string;
  let entry: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agent-office-shim-'));
    shim = join(dir, 'agent-office');
    copyFileSync(SHIM, shim);
    entry = join(dir, 'entry.mjs');
    // Prints what it was started with, so the test can see args, stdin and the parent pid.
    writeFileSync(
      entry,
      "let input = ''; for await (const c of process.stdin) input += c;\n" +
        'console.log(JSON.stringify({ ppid: process.ppid, args: process.argv.slice(2), input }));\n',
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const configure = (node: string, entryPath = entry) => writeFileSync(join(dir, 'shim.conf'), `node=${node}\nentry=${entryPath}\n`);
  const run = (env: NodeJS.ProcessEnv = process.env) => spawnSync('/bin/sh', [shim, 'hook', 'PreToolUse'], { input: '{"a":1}', env });
  const log = () => (existsSync(join(dir, 'shim.log')) ? readFileSync(join(dir, 'shim.log'), 'utf8') : '');

  it('execs the configured node with the entry, the args and stdin, keeping the caller as parent', () => {
    configure(process.execPath);

    const result = run();

    expect(result.status).toBe(0);
    const started = JSON.parse(result.stdout.toString());
    expect(started).toMatchObject({ args: ['hook', 'PreToolUse'], input: '{"a":1}' });
    // exec replaces the sh process, so node's parent is whoever started the shim: Claude Code, in a hook.
    expect(started.ppid).toBe(process.pid);
  });

  it('falls back to node on PATH when the configured one is gone, and logs it', () => {
    configure('/nonexistent/.nvm/versions/node/v20.0.0/bin/node');

    const result = run();

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.toString())).toMatchObject({ args: ['hook', 'PreToolUse'] });
    expect(log()).toContain('configured node not found: /nonexistent/.nvm/versions/node/v20.0.0/bin/node');
  });

  it('exits 0 without output and logs an error when no node can be found', () => {
    configure('/nonexistent/node');

    const result = run({ PATH: NO_NODE_PATH });

    expect(result.status).toBe(0);
    expect(result.stdout.toString()).toBe('');
    expect(log()).toContain('no node found');
  });

  it('exits 0 and logs an error when the entry is missing', () => {
    configure(process.execPath, join(dir, 'missing.mjs'));

    const result = run();

    expect(result.status).toBe(0);
    expect(result.stdout.toString()).toBe('');
    expect(log()).toContain('entry not found');
  });
});
