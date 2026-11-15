import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkStaged,
  createSecretScanner,
  findForbiddenPaths,
  findHomeDirLeaks,
  readStagedFiles,
} from './guard.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const HOOKS_DIR = join(REPO_ROOT, '.githooks');

// Assembled at runtime so no literal token ever sits in this file (secret scanners would flag it).
const FAKE_GITHUB_TOKEN = 'ghp_' + 'x9K2mQ7vL4pR8sT1wY6zB3nC5dF0gH2jK4lM';

const text = (s: string) => Buffer.from(s, 'utf8');

describe('findForbiddenPaths', () => {
  it('flags raw captures, dev data and caches even when force-added', () => {
    const paths = ['.dev-raw/s1/hooks.jsonl', '.dev-data/agent-office.db', '.cache/x', 'fixtures/s1.jsonl'];

    expect(findForbiddenPaths(paths)).toEqual(['.dev-raw/s1/hooks.jsonl', '.dev-data/agent-office.db', '.cache/x']);
  });

  it('does not flag files whose names only resemble those directories', () => {
    expect(findForbiddenPaths(['docs/.dev-raw/notes.md', '.dev-raw-notes.md'])).toEqual([]);
  });
});

describe('findHomeDirLeaks', () => {
  const home = '/Users/alice';

  it('reports the line of an absolute path under the home directory', () => {
    const files = [{ path: 'fixtures/a.jsonl', content: text('{"ok":1}\n{"cwd":"/Users/alice/work/app"}\n') }];

    expect(findHomeDirLeaks(files, home)).toEqual([{ path: 'fixtures/a.jsonl', line: 2 }]);
  });

  it('reports the Claude Code project-folder encoding of the home directory', () => {
    const files = [{ path: 'a.json', content: text('{"p":"projects/-Users-alice-work-app/s.jsonl"}') }];

    expect(findHomeDirLeaks(files, home)).toEqual([{ path: 'a.json', line: 1 }]);
  });

  it('ignores binary files', () => {
    const files = [{ path: 'img.png', content: Buffer.concat([Buffer.from([0x89, 0x00]), text('/Users/alice')]) }];

    expect(findHomeDirLeaks(files, home)).toEqual([]);
  });

  it('returns nothing for text without the home directory', () => {
    const files = [{ path: 'a.json', content: text('{"cwd":"/Users/user/project-1"}') }];

    expect(findHomeDirLeaks(files, home)).toEqual([]);
  });
});

describe('staged content checks in a real git repository', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'agent-office-guard-'));
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('blocks a staged secret even after the working-tree copy was cleaned', async () => {
    writeFileSync(join(repo, 'config.ts'), `export const token = "${FAKE_GITHUB_TOKEN}";\n`);
    execFileSync('git', ['add', 'config.ts'], { cwd: repo });
    writeFileSync(join(repo, 'config.ts'), 'export const token = process.env.TOKEN;\n');

    const problems = await checkStaged(readStagedFiles(repo), {
      homeDir: '/Users/alice',
      scanSecrets: await createSecretScanner(REPO_ROOT),
    });

    expect(problems.join('\n')).toMatch(/config\.ts[\s\S]*GITHUB_TOKEN/);
  });

  it('reports nothing for clean staged files', async () => {
    writeFileSync(join(repo, 'README.md'), '# hello\n');
    execFileSync('git', ['add', 'README.md'], { cwd: repo });

    const problems = await checkStaged(readStagedFiles(repo), {
      homeDir: '/Users/alice',
      scanSecrets: await createSecretScanner(REPO_ROOT),
    });

    expect(problems).toEqual([]);
  });
});

describe('.githooks/pre-commit', () => {
  let sandbox: string;
  let repo: string;
  let fakeHome: string;

  const commit = () =>
    spawnSync(
      'git',
      [
        '-c', `core.hooksPath=${HOOKS_DIR}`,
        '-c', 'user.name=Test',
        '-c', 'user.email=test@example.com',
        '-c', 'commit.gpgsign=false',
        'commit', '-q', '-m', 'test',
      ],
      // HOME points at a throwaway dir: the hook reads it as the home to protect, and git skips ~/.gitconfig.
      { cwd: repo, env: { ...process.env, HOME: fakeHome }, encoding: 'utf8' },
    );

  const headExists = () => spawnSync('git', ['rev-parse', '--verify', '-q', 'HEAD'], { cwd: repo }).status === 0;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'agent-office-hook-'));
    repo = join(sandbox, 'repo');
    fakeHome = join(sandbox, 'home');
    mkdirSync(repo);
    mkdirSync(fakeHome);
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('aborts the commit when a staged file contains the home directory', () => {
    writeFileSync(join(repo, 'fixture.jsonl'), `{"cwd":"${fakeHome}/secret-project"}\n`);
    execFileSync('git', ['add', 'fixture.jsonl'], { cwd: repo });

    const result = commit();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('fixture.jsonl:1');
    expect(headExists()).toBe(false);
  });

  it('aborts the commit when raw capture data was force-added', () => {
    mkdirSync(join(repo, '.dev-raw'));
    writeFileSync(join(repo, '.dev-raw', 'hooks.jsonl'), '{}\n');
    execFileSync('git', ['add', '-f', '.dev-raw/hooks.jsonl'], { cwd: repo });

    const result = commit();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('.dev-raw/hooks.jsonl');
    expect(headExists()).toBe(false);
  });

  it('lets a clean commit through', () => {
    writeFileSync(join(repo, 'README.md'), '# hello\n');
    execFileSync('git', ['add', 'README.md'], { cwd: repo });

    const result = commit();

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(headExists()).toBe(true);
  });
});
