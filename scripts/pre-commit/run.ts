// Entry point for .githooks/pre-commit. git runs hooks from the top of the work tree.
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { checkStaged, createSecretScanner, readStagedFiles } from './guard.ts';

const toolRoot = resolve(import.meta.dirname, '../..');

try {
  const files = readStagedFiles(process.cwd());
  const problems =
    files.length === 0
      ? []
      : await checkStaged(files, { homeDir: homedir(), scanSecrets: await createSecretScanner(toolRoot) });
  if (problems.length > 0) {
    console.error(['pre-commit: commit blocked by the data-hygiene guard:', ...problems.map((p) => `  ${p}`)].join('\n'));
    process.exitCode = 1;
  }
} catch (error) {
  // Fail closed: an unchecked commit could publish data that can never be removed from history.
  console.error('pre-commit: the data-hygiene guard could not run, so the commit was blocked.');
  console.error('  Run ./scripts/pnpm install, then commit again.');
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
