import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPlugin } from './build.ts';

describe('spike plugin build', () => {
  let dir: string;

  beforeEach(() => {
    // Outside the repo, so the bundle cannot fall back to the repo's node_modules.
    dir = mkdtempSync(join(tmpdir(), 'agent-office-s8-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes a plugin whose hooks call the bundle through ${CLAUDE_PLUGIN_ROOT}', async () => {
    await buildPlugin({ outDir: join(dir, 'plugin'), rawDir: join(dir, 'raw') });

    const manifest = JSON.parse(readFileSync(join(dir, 'plugin/.claude-plugin/plugin.json'), 'utf8'));
    const hooks = JSON.parse(readFileSync(join(dir, 'plugin/hooks/hooks.json'), 'utf8'));

    expect(manifest.name).toBe('agent-office-s8');
    expect(hooks.hooks.SessionStart[0].hooks[0]).toMatchObject({
      type: 'command',
      command: 'node "${CLAUDE_PLUGIN_ROOT}/dist/hook.mjs"',
      async: true,
    });
    expect(existsSync(join(dir, 'plugin/node_modules'))).toBe(false);
  });

  it('bundles zod in, so the hook runs with no node_modules and records a valid payload', async () => {
    await buildPlugin({ outDir: join(dir, 'plugin'), rawDir: join(dir, 'raw') });
    const payload = { session_id: '00000000-0000-4000-8000-000000000001', hook_event_name: 'SessionStart' };

    const run = spawnSync('node', [join(dir, 'plugin/dist/hook.mjs')], { input: JSON.stringify(payload), cwd: dir });

    expect(run.status).toBe(0);
    expect(run.stdout.toString()).toBe('');
    const record = JSON.parse(readFileSync(join(dir, 'raw/hook.jsonl'), 'utf8').trim());
    expect(record).toMatchObject({ event: 'SessionStart', valid: true, sessionId: payload.session_id });
  });

  it('exits 0 and records an invalid payload instead of throwing', async () => {
    await buildPlugin({ outDir: join(dir, 'plugin'), rawDir: join(dir, 'raw') });

    const run = spawnSync('node', [join(dir, 'plugin/dist/hook.mjs')], { input: 'not json', cwd: dir });

    expect(run.status).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, 'raw/hook.jsonl'), 'utf8').trim())).toMatchObject({ valid: false });
  });
});
