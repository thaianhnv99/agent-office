// Data-hygiene guard run before every commit (plan M0). The repository is public, and git
// history cannot be cleaned after a push, so this blocks commits that would add raw capture
// data, this machine's home directory path, or secrets. It reads the staged blobs, not the
// working tree, so a secret that was staged and then deleted from the file is still caught.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export type StagedFile = { path: string; content: Buffer };
export type SecretScanner = (file: { path: string; content: string }) => Promise<{ ok: boolean; output: string }>;

// Gitignored in plan §9.2; also refused here in case someone runs `git add -f`.
const FORBIDDEN_DIRS = ['.dev-raw/', '.dev-data/', '.cache/'];

const GITLINK_MODE = '160000';

export function findForbiddenPaths(paths: readonly string[]): string[] {
  return paths.filter((path) => FORBIDDEN_DIRS.some((dir) => path.startsWith(dir)));
}

/** Claude Code names a project folder after its cwd, with each non-alphanumeric character replaced by "-". */
export function encodeProjectDir(path: string): string {
  return path.replace(/[^A-Za-z0-9]/g, '-');
}

const isBinary = (content: Buffer) => content.includes(0);

export function findHomeDirLeaks(files: readonly StagedFile[], homeDir: string): Array<{ path: string; line: number }> {
  if (homeDir.length < 2) return []; // "" or "/" would match every line
  const needles = [homeDir, encodeProjectDir(homeDir)];
  const leaks: Array<{ path: string; line: number }> = [];
  for (const file of files) {
    if (isBinary(file.content)) continue;
    file.content
      .toString('utf8')
      .split('\n')
      .forEach((line, index) => {
        if (needles.some((needle) => line.includes(needle))) leaks.push({ path: file.path, line: index + 1 });
      });
  }
  return leaks;
}

/** Reads the index version of every added, copied, modified or type-changed path. */
export function readStagedFiles(repoDir: string): StagedFile[] {
  const raw = execFileSync(
    'git',
    ['diff', '--cached', '--raw', '-z', '--no-abbrev', '--no-renames', '--diff-filter=ACMT'],
    { cwd: repoDir },
  ).toString('utf8');
  // -z output alternates ":<old mode> <new mode> <old sha> <new sha> <status>" and "<path>".
  const parts = raw.split('\0').filter(Boolean);
  const files: StagedFile[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const [, newMode, , newSha] = (parts[i] ?? '').split(' ');
    const path = parts[i + 1] ?? '';
    if (!newSha || newMode === GITLINK_MODE) continue; // submodule entries have no blob
    const content = execFileSync('git', ['cat-file', 'blob', newSha], { cwd: repoDir, maxBuffer: 512 * 1024 * 1024 });
    files.push({ path, content });
  }
  return files;
}

export async function createSecretScanner(configDir: string): Promise<SecretScanner> {
  const { createEngine } = await import('@secretlint/node');
  const engine = await createEngine({
    cwd: configDir,
    configFilePath: join(configDir, '.secretlintrc.json'),
    formatter: 'stylish',
    color: false,
    maskSecrets: true,
  });
  return ({ path, content }) => engine.executeOnContent({ content, filePath: path });
}

const MAX_LEAK_LINES_PER_FILE = 5;

/** Returns one human-readable problem per finding; an empty list means the commit may proceed. */
export async function checkStaged(
  files: readonly StagedFile[],
  options: { homeDir: string; scanSecrets: SecretScanner },
): Promise<string[]> {
  const problems: string[] = [];

  for (const path of findForbiddenPaths(files.map((file) => file.path))) {
    problems.push(`${path}: raw or dev data must never be committed (plan §9.2)`);
  }

  const leaksByFile = Map.groupBy(findHomeDirLeaks(files, options.homeDir), (leak) => leak.path);
  for (const [path, leaks] of leaksByFile) {
    const shown = leaks.slice(0, MAX_LEAK_LINES_PER_FILE).map((leak) => `${path}:${leak.line}`);
    const more = leaks.length > shown.length ? ` (+${leaks.length - shown.length} more lines)` : '';
    problems.push(`${shown.join(', ')}${more}: contains this machine's home directory; scrub it or use a placeholder`);
  }

  for (const file of files) {
    if (isBinary(file.content)) continue;
    const result = await options.scanSecrets({ path: file.path, content: file.content.toString('utf8') });
    if (!result.ok) problems.push(result.output.trim());
  }

  return problems;
}
