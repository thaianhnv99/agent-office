import { describe, expect, it } from 'vitest';
import { createScrubContext, findLeaks, scrubJsonl, scrubText, scrubValue } from './scrub.ts';

const HOME = '/Users/alice';

// Fake credentials are assembled at runtime so this file never contains a literal token.
const fake = {
  anthropic: 'sk-ant-api03-' + 'Ab3dEf6hIj9lMn2pQr5tUv8xYz1bCd4fGh7jKl0nOp3r',
  github: 'ghp_' + 'x9K2mQ7vL4pR8sT1wY6zB3nC5dF0gH2jK4lM',
  slack: 'xoxb-' + '123456789012-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx',
  aws: 'AKIA' + 'Q3EXAMPLE7TESTAB', // AKIA + exactly 16 characters
  jwt: 'eyJ' + 'hbGciOiJIUzI1NiJ9.' + 'eyJ' + 'zdWIiOiIxMjM0NTY3ODkwIn0.' + 'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  privateKey: '-----BEGIN ' + 'RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA1b2c3d4e5f6\n-----END ' + 'RSA PRIVATE KEY-----',
  bearer: 'Bearer ' + 'abcDEF123456ghiJKL789012',
  urlPassword: 'hunter2' + 'Secret9',
  assigned: 'q8W2e4R6t8Y0' + 'u2I4o6P8',
};

describe('scrubText', () => {
  const ctx = createScrubContext([], { homeDir: HOME, terms: ['Acme'] });

  it('replaces the home directory in absolute paths', () => {
    expect(scrubText('cat /Users/alice/notes/todo.md', ctx)).toBe('cat /Users/user/notes/todo.md');
  });

  it('replaces the Claude Code project-folder encoding of the home directory', () => {
    expect(scrubText('~/.claude/projects/-Users-alice-notes/s.jsonl', ctx)).toBe('~/.claude/projects/-Users-user-notes/s.jsonl');
  });

  it('replaces explicit terms case-insensitively, as whole words only', () => {
    expect(scrubText('ACME rocket for acme-corp, not Acmeville', ctx)).toBe('term-1 rocket for term-1-corp, not Acmeville');
  });

  it.each([
    ['an Anthropic API key', `key ${fake.anthropic} end`, fake.anthropic],
    ['a GitHub token', `git push https://${fake.github}@github.com/x`, fake.github],
    ['a Slack token', `SLACK=${fake.slack}`, fake.slack],
    ['an AWS access key id', `id ${fake.aws} end`, fake.aws],
    ['a JWT', `cookie ${fake.jwt}`, fake.jwt],
    ['a private key block', `before\n${fake.privateKey}\nafter`, 'MIIEpAIBAAKCAQEA1b2c3d4e5f6'],
    ['a bearer token', `curl -H "Authorization: ${fake.bearer}"`, fake.bearer.slice('Bearer '.length)],
    ['a password inside a URL', `postgres://app:${fake.urlPassword}@db.local/x`, fake.urlPassword],
    ['a value assigned to a secret-named variable', `export MY_API_KEY=${fake.assigned}`, fake.assigned],
  ])('redacts %s', (_name, input, secret) => {
    const out = scrubText(input, ctx);

    expect(out).not.toContain(secret);
    expect(out).toContain('[REDACTED:');
  });

  it('keeps numbers that follow secret-like names, such as token limits', () => {
    expect(scrubText('{"max_token":123456789,"page_token": 9876543210}', ctx)).toBe(
      '{"max_token":123456789,"page_token": 9876543210}',
    );
  });

  it('replaces email addresses', () => {
    expect(scrubText('mail jane.doe+x@corp.io now', ctx)).toBe('mail user@example.com now');
  });
});

describe('scrubValue', () => {
  it('discovers project folders from cwd and replaces their names everywhere', () => {
    const record = {
      cwd: '/Users/alice/work/client-x',
      transcript_path: '/Users/alice/.claude/projects/-Users-alice-work-client-x/abc.jsonl',
      prompt: 'fix the Client-X login',
    };
    const ctx = createScrubContext([record], { homeDir: HOME });

    expect(scrubValue(record, ctx)).toEqual({
      cwd: '/Users/user/work/project-1',
      transcript_path: '/Users/user/.claude/projects/-Users-user-work-project-1/abc.jsonl',
      prompt: 'fix the project-1 login',
    });
  });

  it('numbers projects by first appearance and keeps subfolders under their project', () => {
    const records = [{ cwd: '/Users/alice/beta' }, { cwd: '/Users/alice/beta/pkg' }, { cwd: '/Users/alice/alpha' }];
    const ctx = createScrubContext(records, { homeDir: HOME });

    expect(records.map((r) => scrubValue(r, ctx))).toEqual([
      { cwd: '/Users/user/project-1' },
      { cwd: '/Users/user/project-1/pkg' },
      { cwd: '/Users/user/project-2' },
    ]);
  });

  it('replaces account and organization ids with stable placeholders, also inside text', () => {
    const owner = {
      type: 'session-owner',
      accountUuid: '3f2b8c1e-9d4a-4b7e-8f6a-1c2d3e4f5a6b',
      organizationUuid: '7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d',
    };
    const mention = { text: 'org 7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d' };
    const ctx = createScrubContext([owner, mention], { homeDir: HOME });

    expect(scrubValue(owner, ctx)).toEqual({
      type: 'session-owner',
      accountUuid: '00000000-0000-4000-8000-000000000001',
      organizationUuid: '00000000-0000-4000-8000-000000000002',
    });
    expect(scrubValue(mention, ctx)).toEqual({ text: 'org 00000000-0000-4000-8000-000000000002' });
  });

  it('redacts values of secret-named keys but keeps token counts', () => {
    const record = {
      apiKey: 'plain-value-1',
      access_token: 'plain-value-2',
      password: 'plain-value-3',
      headers: { Authorization: 'plain-value-4' },
      usage: { input_tokens: 120, output_tokens: 45 },
    };
    const ctx = createScrubContext([record], { homeDir: HOME });

    expect(scrubValue(record, ctx)).toEqual({
      apiKey: '[REDACTED:secret]',
      access_token: '[REDACTED:secret]',
      password: '[REDACTED:secret]',
      headers: { Authorization: '[REDACTED:secret]' },
      usage: { input_tokens: 120, output_tokens: 45 },
    });
  });

  it('redacts hook tool output but keeps its shape and flags', () => {
    const record = {
      hook_event_name: 'PostToolUse',
      tool_use_id: 'toolu_01',
      tool_response: { stdout: 'contents of a private file', stderr: '', interrupted: true, exitCode: 130 },
    };
    const ctx = createScrubContext([record], { homeDir: HOME });

    expect(scrubValue(record, ctx)).toEqual({
      hook_event_name: 'PostToolUse',
      tool_use_id: 'toolu_01',
      tool_response: { stdout: '[REDACTED]', stderr: '[REDACTED]', interrupted: true, exitCode: 130 },
    });
  });

  it('redacts transcript tool results but keeps ids and block types', () => {
    const record = {
      type: 'user',
      toolUseResult: { stdout: 'secret output', interrupted: false },
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_02', content: [{ type: 'text', text: 'secret output' }] },
          { type: 'text', text: 'thanks' },
        ],
      },
    };
    const ctx = createScrubContext([record], { homeDir: HOME });

    expect(scrubValue(record, ctx)).toEqual({
      type: 'user',
      toolUseResult: { stdout: '[REDACTED]', interrupted: false },
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_02', content: [{ type: 'text', text: '[REDACTED]' }] },
          { type: 'text', text: 'thanks' },
        ],
      },
    });
  });

  it('redacts attachment payloads except their type', () => {
    const record = { type: 'attachment', attachment: { type: 'credential_org', name: 'Some Org', seats: 3 } };
    const ctx = createScrubContext([record], { homeDir: HOME });

    expect(scrubValue(record, ctx)).toEqual({
      type: 'attachment',
      attachment: { type: 'credential_org', name: '[REDACTED]', seats: 3 },
    });
  });

  it('redacts api-request records except their identifiers', () => {
    const record = {
      type: 'api-request-blob',
      sessionId: 's-1',
      hash: 'h-1',
      message: { role: 'user', content: 'whole system prompt and CLAUDE.md' },
    };
    const ctx = createScrubContext([record], { homeDir: HOME });

    expect(scrubValue(record, ctx)).toEqual({ type: 'api-request-blob', sessionId: 's-1', hash: 'h-1', message: '[REDACTED]' });
  });

  it('scrubs object keys, such as file paths used as keys', () => {
    const record = { trackedFileBackups: { '/Users/alice/app/src/a.ts': { version: 1 } } };
    const ctx = createScrubContext([record], { homeDir: HOME });

    expect(scrubValue(record, ctx)).toEqual({ trackedFileBackups: { '/Users/user/app/src/a.ts': { version: 1 } } });
  });
});

describe('scrubJsonl', () => {
  it('scrubs each line and keeps the line layout', () => {
    const input = '{"cwd":"/Users/alice/app"}\n{"n":1}\n';
    const ctx = createScrubContext([{ cwd: '/Users/alice/app' }], { homeDir: HOME });

    expect(scrubJsonl(input, ctx)).toBe('{"cwd":"/Users/user/project-1"}\n{"n":1}\n');
  });

  it('replaces a line that is not valid JSON as a whole', () => {
    const ctx = createScrubContext([], { homeDir: HOME });

    expect(scrubJsonl('{"ok":true}\n{"partial": "/Users/alice/x\n', ctx)).toBe('{"ok":true}\n"[REDACTED:unparseable-line]"\n');
  });

  it('is idempotent: scrubbing its own output changes nothing', () => {
    const input = [
      JSON.stringify({ cwd: '/Users/alice/app', prompt: `use ${fake.github}`, email: 'a@b.io' }),
      JSON.stringify({ type: 'session-owner', accountUuid: '3f2b8c1e-9d4a-4b7e-8f6a-1c2d3e4f5a6b' }),
    ].join('\n');
    const records = input.split('\n').map((line) => JSON.parse(line) as unknown);
    const once = scrubJsonl(input, createScrubContext(records, { homeDir: HOME }));
    const onceRecords = once.split('\n').map((line) => JSON.parse(line) as unknown);

    expect(scrubJsonl(once, createScrubContext(onceRecords, { homeDir: HOME }))).toBe(once);
  });
});

describe('findLeaks', () => {
  it('reports the line and rule of anything sensitive, without echoing the value', () => {
    const ctx = createScrubContext([{ cwd: '/Users/alice/client-x', accountUuid: '3f2b8c1e-9d4a-4b7e-8f6a-1c2d3e4f5a6b' }], {
      homeDir: HOME,
      terms: ['Acme'],
    });
    const text = [
      'clean line',
      'path /Users/alice/x',
      'term acme',
      'project client-x',
      'id 3f2b8c1e-9d4a-4b7e-8f6a-1c2d3e4f5a6b',
      'mail jane@corp.io',
      `token ${fake.github}`,
    ].join('\n');

    const leaks = findLeaks(text, ctx);

    expect(leaks.map((leak) => leak.line)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(JSON.stringify(leaks)).not.toContain(fake.github);
    expect(JSON.stringify(leaks)).not.toContain('client-x');
  });

  it('finds nothing in scrubbed output', () => {
    const record = {
      cwd: '/Users/alice/client-x',
      transcript_path: '/Users/alice/.claude/projects/-Users-alice-client-x/s.jsonl',
      accountUuid: '3f2b8c1e-9d4a-4b7e-8f6a-1c2d3e4f5a6b',
      prompt: `Acme deploy with ${fake.anthropic} for jane@corp.io`,
    };
    const ctx = createScrubContext([record], { homeDir: HOME, terms: ['Acme'] });

    expect(findLeaks(scrubJsonl(JSON.stringify(record), ctx), ctx)).toEqual([]);
  });
});
