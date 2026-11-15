import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main } from './cli.ts';

describe('scrub CLI', () => {
  let root: string;
  let errors: string[];

  const run = (...argv: string[]) =>
    main(argv, { cwd: root, root, homeDir: '/Users/alice', log: () => {}, error: (line) => errors.push(line) });
  const raw = (path: string, content: string) => writeFileSync(join(root, '.dev-raw', path), content);
  const read = (path: string) => readFileSync(join(root, path), 'utf8');

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'agent-office-scrub-'));
    mkdirSync(join(root, '.dev-raw', 's1'), { recursive: true });
    errors = [];
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('writes scrubbed copies of JSONL and JSON inputs into fixtures/, sharing names across files', () => {
    raw('s1/hooks.jsonl', '{"cwd":"/Users/alice/client-x","prompt":"hi"}\n');
    raw('s1/agents.json', JSON.stringify([{ cwd: '/Users/alice/client-x', status: 'busy' }]));

    const code = run('.dev-raw/s1/hooks.jsonl', '.dev-raw/s1/agents.json', '--out', 'fixtures/s1');

    expect(code).toBe(0);
    expect(read('fixtures/s1/hooks.jsonl')).toBe('{"cwd":"/Users/user/project-1","prompt":"hi"}\n');
    expect(JSON.parse(read('fixtures/s1/agents.json'))).toEqual([{ cwd: '/Users/user/project-1', status: 'busy' }]);
  });

  it('applies terms from --term and from .dev-raw/scrub-terms.txt', () => {
    raw('scrub-terms.txt', '# people and companies\nAcme\n\n');
    raw('s1/t.jsonl', '{"text":"Acme and Globex"}\n');

    const code = run('--term', 'Globex', '.dev-raw/s1/t.jsonl', '--out', 'fixtures/s1');

    expect(code).toBe(0);
    expect(read('fixtures/s1/t.jsonl')).toBe('{"text":"term-2 and term-1"}\n');
  });

  it('scrubs output file names too', () => {
    raw('s1/client-x-session.jsonl', '{"cwd":"/Users/alice/client-x"}\n');

    run('.dev-raw/s1/client-x-session.jsonl', '--out', 'fixtures/s1');

    expect(readdirSync(join(root, 'fixtures/s1'))).toEqual(['project-1-session.jsonl']);
  });

  it('refuses an output directory outside fixtures/', () => {
    raw('s1/h.jsonl', '{}\n');

    expect(run('.dev-raw/s1/h.jsonl', '--out', '.dev-raw/s1')).toBe(2);
    expect(run('.dev-raw/s1/h.jsonl', '--out', 'fixtures/../docs')).toBe(2);
    expect(existsSync(join(root, 'docs'))).toBe(false);
    expect(errors.join('\n')).toContain('fixtures/');
  });

  it('refuses file types it cannot parse', () => {
    raw('s1/notes.txt', 'free text');

    expect(run('.dev-raw/s1/notes.txt', '--out', 'fixtures/s1')).toBe(2);
    expect(existsSync(join(root, 'fixtures'))).toBe(false);
  });

  it('refuses two inputs that would write the same output file', () => {
    mkdirSync(join(root, '.dev-raw', 's2'));
    raw('s1/h.jsonl', '{}\n');
    raw('s2/h.jsonl', '{}\n');

    expect(run('.dev-raw/s1/h.jsonl', '.dev-raw/s2/h.jsonl', '--out', 'fixtures/x')).toBe(2);
    expect(existsSync(join(root, 'fixtures'))).toBe(false);
  });

  it('prints usage when inputs or --out are missing', () => {
    expect(run('--out', 'fixtures/x')).toBe(2);
    expect(run('.dev-raw/s1/h.jsonl')).toBe(2);
    expect(errors.join('\n')).toContain('usage:');
  });
});
