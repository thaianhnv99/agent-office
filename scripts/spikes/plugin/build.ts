// Spike S8: builds a prototype plugin that loads with `claude --plugin-dir <outDir>`.
// The hook entry (src/hook.ts) and its zod dependency are bundled by esbuild into one file,
// dist/hook.mjs, so the plugin ships no node_modules and needs no install step.
//
//   node scripts/spikes/plugin/build.ts [outDir] [rawDir]
//   (defaults: .dev-data/s8/plugin and .dev-raw/s8; the log dir is baked into the bundle)
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '../../..');

type Hook = Record<string, unknown>;

const command = (hook: Hook = {}): Hook => ({ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/dist/hook.mjs"', async: true, timeout: 10, ...hook });

export async function buildPlugin({ outDir, rawDir, minify = false }: { outDir: string; rawDir: string; minify?: boolean }) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, '.claude-plugin'), { recursive: true });
  mkdirSync(join(outDir, 'hooks'), { recursive: true });

  await build({
    entryPoints: [join(import.meta.dirname, 'src/hook.ts')],
    outfile: join(outDir, 'dist/hook.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    minify,
    define: { __RAW_DIR__: JSON.stringify(rawDir) },
    logLevel: 'silent',
  });

  const manifest = { name: 'agent-office-s8', version: '0.0.1', description: 'Agent Office spike S8: packaging prototype' };
  const hooks = {
    hooks: {
      SessionStart: [{ hooks: [command()] }],
      UserPromptSubmit: [{ hooks: [command()] }],
      PreToolUse: [{ hooks: [command()] }],
      // Exec form: no shell between Claude Code and node (hooks docs, "exec form").
      PostToolUse: [{ hooks: [command({ command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/dist/hook.mjs'] })] }],
      Stop: [{ hooks: [command()] }],
    },
  };
  writeFileSync(join(outDir, '.claude-plugin/plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(outDir, 'hooks/hooks.json'), `${JSON.stringify(hooks, null, 2)}\n`);
  return { bundleBytes: statSync(join(outDir, 'dist/hook.mjs')).size };
}

if (import.meta.main) {
  const [outDir = join(root, '.dev-data/s8/plugin'), rawDir = join(root, '.dev-raw/s8')] = process.argv.slice(2);
  const { bundleBytes } = await buildPlugin({ outDir: resolve(outDir), rawDir: resolve(rawDir) });
  console.log(`built ${outDir} (dist/hook.mjs: ${bundleBytes} bytes)`);
}
