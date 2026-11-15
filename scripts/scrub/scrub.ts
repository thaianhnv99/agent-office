// Turns raw Claude Code captures (hook payloads, transcripts, CLI output) into fixtures that are
// safe to commit to a public repository (plan M0, data hygiene). Pure functions: the CLI in
// cli.ts does the file I/O.
//
// What gets replaced:
// - the home directory, raw and in Claude Code's project-folder encoding (-Users-name-...);
// - project names, discovered from every `cwd` field, plus explicit terms (people, companies);
// - account/organization/user ids and emails;
// - secrets: known token formats, credentials in URLs, values assigned to secret-like names,
//   and values of secret-named keys;
// - tool output (`tool_response`, `toolUseResult`, `tool_result` blocks) and attachments, keeping
//   their shape, booleans and numbers so parsers can still be tested against them;
// - api-request records, which hold whole API payloads (system prompt, CLAUDE.md, memory).

export const HOME_PLACEHOLDER = '/Users/user';
export const REDACTED = '[REDACTED]';
const PLACEHOLDER_EMAIL = 'user@example.com';
const UNPARSEABLE_LINE = '[REDACTED:unparseable-line]';

export type ScrubOptions = {
  homeDir: string;
  /** Extra names to replace, such as people or companies. Matched case-insensitively, whole words only. */
  terms?: readonly string[];
};

type Rule = { rule: string; apply: (text: string) => string };

export type ScrubContext = {
  rules: readonly Rule[];
  identities: ReadonlyMap<string, string>;
};

export type Leak = { line: number; rules: string[] };

const SECRET_PATTERNS: ReadonlyArray<{ rule: string; pattern: RegExp; replacement?: string }> = [
  { rule: 'private-key', pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g },
  { rule: 'anthropic-key', pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}/g },
  { rule: 'openai-key', pattern: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { rule: 'github-token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})/g },
  { rule: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { rule: 'slack-token', pattern: /\bxox[abeoprs]-[A-Za-z0-9-]{10,}/g },
  { rule: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}/g },
  { rule: 'stripe-key', pattern: /\b[rs]k_(?:live|test)_[0-9A-Za-z]{16,}/g },
  { rule: 'npm-token', pattern: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { rule: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { rule: 'bearer-token', pattern: /(\bBearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, replacement: '$1[REDACTED:bearer-token]' },
  {
    rule: 'url-credentials',
    pattern: /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]+@/gi,
    replacement: '$1[REDACTED:url-credentials]@',
  },
  {
    rule: 'assigned-secret',
    pattern: /(\b[A-Za-z0-9_]*(?:api[_-]?key|secret|token|passw(?:or)?d)["']?\s*[:=]\s*["']?)[^\s"',;]{8,}/gi,
    replacement: '$1[REDACTED:assigned-secret]',
  },
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACEHOLDER_UUID = /^00000000-0000-4000-8000-\d{12}$/;
const PLACEHOLDER_PROJECT = /^project-\d+$/;

// Keys are compared after normalizeKey (lowercase, no "_" or "-").
const IDENTITY_KEYS = new Set([
  'accountuuid', 'organizationuuid', 'orguuid', 'accountid', 'organizationid', 'orgid',
  'userid', 'email', 'emailaddress', 'useremail',
]);
const SECRET_KEY_SUFFIXES = [
  'token', 'secret', 'password', 'passwd', 'apikey', 'secretkey', 'privatekey', 'accesskey', 'authorization', 'cookie',
];
const CONTENT_KEYS = new Set(['toolresponse', 'tooluseresult', 'attachment']);
const API_REQUEST_TYPES = new Set(['api-request', 'api-request-blob']);
const API_REQUEST_KEPT_KEYS = new Set(['type', 'sessionId', 'session_id', 'id', 'uuid', 'timestamp', 'version', 'hash']);

const normalizeKey = (key: string) => key.toLowerCase().replace(/[_-]/g, '');
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Claude Code names a project folder after its cwd, with each non-alphanumeric character replaced by "-". */
export function encodeProjectDir(path: string): string {
  return path.replace(/[^A-Za-z0-9]/g, '-');
}

const literalRule = (rule: string, needle: string, replacement: string): Rule => {
  const pattern = new RegExp(escapeRegExp(needle), 'gi');
  return { rule, apply: (text) => text.replace(pattern, replacement) };
};

const wordRule = (rule: string, needle: string, replacement: string): Rule => {
  const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(needle)}(?![A-Za-z0-9])`, 'gi');
  return { rule, apply: (text) => text.replace(pattern, replacement) };
};

function walk(value: unknown, visit: (key: string, value: unknown) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
  } else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      visit(key, child);
      walk(child, visit);
    }
  }
}

const isPlaceholderIdentity = (value: string) =>
  PLACEHOLDER_UUID.test(value) || value === PLACEHOLDER_EMAIL || value.startsWith('[REDACTED');

/** Project roots: discovered cwds outside the home dir's ancestry, with nested cwds folded into their parent. */
function projectRoots(cwds: readonly string[], homeDir: string): string[] {
  const unique = [...new Set(cwds.map((cwd) => cwd.replace(/\/+$/, '')))].filter(
    (cwd) => cwd !== '' && !(homeDir === cwd || homeDir.startsWith(`${cwd}/`)),
  );
  return unique.filter((cwd) => !unique.some((other) => other !== cwd && cwd.startsWith(`${other}/`)));
}

/** Builds the replacement rules. Pass every record that will be scrubbed so names and ids are discovered. */
export function createScrubContext(records: readonly unknown[], options: ScrubOptions): ScrubContext {
  const homeDir = options.homeDir.replace(/\/+$/, '');
  const cwds: string[] = [];
  const identities = new Map<string, string>();
  let uuidCount = 0;

  for (const record of records) {
    walk(record, (key, value) => {
      if (typeof value !== 'string') return;
      const normalized = normalizeKey(key);
      if (normalized === 'cwd') cwds.push(value);
      if (IDENTITY_KEYS.has(normalized) && !identities.has(value) && !isPlaceholderIdentity(value)) {
        if (UUID.test(value)) {
          uuidCount += 1;
          identities.set(value, `00000000-0000-4000-8000-${String(uuidCount).padStart(12, '0')}`);
        } else {
          identities.set(value, value.includes('@') ? PLACEHOLDER_EMAIL : '[REDACTED:identity]');
        }
      }
    });
  }

  // Names to replace as whole words: discovered project folders first, then explicit terms.
  const names: Array<{ name: string; placeholder: string }> = [];
  const seen = new Set<string>();
  const addName = (name: string, placeholder: string) => {
    seen.add(name.toLowerCase());
    names.push({ name, placeholder });
  };
  let projectCount = 0;
  for (const root of projectRoots(cwds, homeDir)) {
    const base = root.slice(root.lastIndexOf('/') + 1);
    if (base.length < 3 || PLACEHOLDER_PROJECT.test(base) || seen.has(base.toLowerCase())) continue;
    projectCount += 1;
    addName(base, `project-${projectCount}`);
  }
  let termCount = 0;
  for (const term of options.terms ?? []) {
    if (term.trim() === '' || seen.has(term.toLowerCase())) continue;
    termCount += 1;
    addName(term, `term-${termCount}`);
  }
  const nameRules = names
    .flatMap(({ name, placeholder }) => [...new Set([name, encodeProjectDir(name)])].map((variant) => ({ variant, placeholder })))
    .sort((a, b) => b.variant.length - a.variant.length)
    .map(({ variant, placeholder }) => wordRule('term', variant, placeholder));

  const rules: Rule[] = [
    ...SECRET_PATTERNS.map(({ rule, pattern, replacement }) => ({
      rule,
      apply: (text: string) => text.replace(pattern, replacement ?? `[REDACTED:${rule}]`),
    })),
    {
      rule: 'email',
      apply: (text) => text.replace(EMAIL, (email) => (email.toLowerCase().endsWith('@example.com') ? email : PLACEHOLDER_EMAIL)),
    },
    // Short ids could collide with ordinary words, so only long ones are replaced inside free text.
    ...[...identities]
      .filter(([value]) => value.length >= 8)
      .map(([value, placeholder]) => literalRule('identity', value, placeholder)),
    ...(homeDir.length >= 2
      ? [
          literalRule('home-dir', homeDir, HOME_PLACEHOLDER),
          literalRule('home-dir', encodeProjectDir(homeDir), encodeProjectDir(HOME_PLACEHOLDER)),
        ]
      : []),
    ...nameRules,
  ];

  return { rules, identities };
}

export function scrubText(text: string, ctx: ScrubContext): string {
  return ctx.rules.reduce((current, { apply }) => apply(current), text);
}

/** Replaces every string inside tool output with REDACTED, keeping keys, `type` discriminators, numbers and booleans. */
function redactContent(value: unknown, ctx: ScrubContext, key?: string): unknown {
  if (typeof value === 'string') return key === 'type' ? scrubText(value, ctx) : REDACTED;
  if (Array.isArray(value)) return value.map((item) => redactContent(item, ctx));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [scrubText(k, ctx), redactContent(v, ctx, k)]));
  }
  return value;
}

function identityPlaceholder(value: string, ctx: ScrubContext): string {
  const known = ctx.identities.get(value);
  if (known !== undefined) return known;
  if (isPlaceholderIdentity(value)) return value;
  return value.includes('@') ? PLACEHOLDER_EMAIL : '[REDACTED:identity]';
}

function scrubEntry(key: string, value: unknown, objectType: string | undefined, ctx: ScrubContext): unknown {
  if (objectType !== undefined && API_REQUEST_TYPES.has(objectType) && !API_REQUEST_KEPT_KEYS.has(key)) return REDACTED;
  const normalized = normalizeKey(key);
  if (CONTENT_KEYS.has(normalized) || (objectType === 'tool_result' && key === 'content')) return redactContent(value, ctx);
  if (typeof value === 'string') {
    if (IDENTITY_KEYS.has(normalized)) return identityPlaceholder(value, ctx);
    if (SECRET_KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return '[REDACTED:secret]';
  }
  return scrubValue(value, ctx);
}

export function scrubValue(value: unknown, ctx: ScrubContext): unknown {
  if (typeof value === 'string') return scrubText(value, ctx);
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, ctx));
  if (isRecord(value)) {
    const objectType = typeof value['type'] === 'string' ? value['type'] : undefined;
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [scrubText(key, ctx), scrubEntry(key, child, objectType, ctx)]),
    );
  }
  return value;
}

function parseLine(line: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(line) as unknown };
  } catch {
    return { ok: false };
  }
}

/** The parseable records of a JSONL text, for createScrubContext. */
export function parseJsonlRecords(text: string): unknown[] {
  return text.split('\n').flatMap((line) => {
    if (line.trim() === '') return [];
    const parsed = parseLine(line);
    return parsed.ok ? [parsed.value] : [];
  });
}

/** Scrubs each JSONL line; a line that is not valid JSON (for example a half-written last line) is replaced whole. */
export function scrubJsonl(text: string, ctx: ScrubContext): string {
  return text
    .split('\n')
    .map((line) => {
      if (line.trim() === '') return line;
      const parsed = parseLine(line);
      return JSON.stringify(parsed.ok ? scrubValue(parsed.value, ctx) : UNPARSEABLE_LINE);
    })
    .join('\n');
}

/** Lines that scrubbing would still change, with the rule names only, never the matched values. */
export function findLeaks(text: string, ctx: ScrubContext): Leak[] {
  return text.split('\n').flatMap((line, index) => {
    const rules = [...new Set(ctx.rules.filter(({ apply }) => apply(line) !== line).map(({ rule }) => rule))];
    return rules.length > 0 ? [{ line: index + 1, rules }] : [];
  });
}
