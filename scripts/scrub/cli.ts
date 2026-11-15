// Scrubs raw captures (usually under .dev-raw/) into fixtures/ (plan M0, data hygiene):
//
//   ./scripts/pnpm scrub [--term NAME]... INPUT.jsonl|INPUT.json... --out fixtures/<dir>
//
// Extra terms (people, companies, anything not discoverable from cwd fields) are also read from
// .dev-raw/scrub-terms.txt, one per line, "#" for comments. That file stays out of git because
// the names in it are exactly what must not leak.
//
// All inputs share one context, so a project gets the same placeholder in every output file.
// Nothing is written unless every output passes the leak check.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { createScrubContext, findLeaks, parseJsonlRecords, scrubJsonl, scrubText, scrubValue } from './scrub.ts';

const USAGE = 'usage: ./scripts/pnpm scrub [--term NAME]... INPUT.jsonl|INPUT.json... --out fixtures/<dir>';

export type CliIo = {
  cwd: string;
  /** Repository root: the output must land inside <root>/fixtures. */
  root: string;
  homeDir: string;
  log: (line: string) => void;
  error: (line: string) => void;
};

type Input = { arg: string; path: string; kind: 'jsonl' | 'json'; text: string };

class UsageError extends Error {}

function isInsideOrSelf(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function readTermsFile(root: string): string[] {
  const path = join(root, '.dev-raw', 'scrub-terms.txt');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

function readInput(arg: string, cwd: string): Input {
  const path = resolve(cwd, arg);
  const ext = extname(path);
  if (ext !== '.jsonl' && ext !== '.json') throw new UsageError(`${arg}: only .jsonl and .json files are supported`);
  return { arg, path, kind: ext === '.jsonl' ? 'jsonl' : 'json', text: readFileSync(path, 'utf8') };
}

function parseJson(input: Input): unknown {
  try {
    return JSON.parse(input.text) as unknown;
  } catch {
    throw new UsageError(`${input.arg}: not valid JSON`);
  }
}

export function main(argv: readonly string[], io: CliIo): number {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      options: { term: { type: 'string', multiple: true }, out: { type: 'string' } },
      allowPositionals: true,
    });
    if (values.out === undefined || positionals.length === 0) throw new UsageError(USAGE);

    const outDir = resolve(io.cwd, values.out);
    if (!isInsideOrSelf(outDir, join(io.root, 'fixtures'))) {
      throw new UsageError(`--out ${values.out}: output must go inside fixtures/, the only place scrubbed files belong`);
    }

    const inputs = positionals.map((arg) => readInput(arg, io.cwd));
    const records = inputs.flatMap((input) => (input.kind === 'jsonl' ? parseJsonlRecords(input.text) : [parseJson(input)]));
    const ctx = createScrubContext(records, { homeDir: io.homeDir, terms: [...(values.term ?? []), ...readTermsFile(io.root)] });

    const outputs = inputs.map((input) => {
      const text =
        input.kind === 'jsonl' ? scrubJsonl(input.text, ctx) : `${JSON.stringify(scrubValue(parseJson(input), ctx), null, 2)}\n`;
      return { name: scrubText(basename(input.path), ctx), text, leaks: findLeaks(text, ctx) };
    });

    const names = outputs.map((output) => output.name);
    const duplicate = names.find((name, index) => names.indexOf(name) !== index);
    if (duplicate !== undefined) throw new UsageError(`two inputs would both write ${duplicate}; scrub them into different --out dirs`);

    const leaks = outputs.flatMap((output) => output.leaks.map((leak) => `${output.name}:${leak.line}: still matches ${leak.rules.join(', ')}`));
    if (leaks.length > 0) {
      for (const leak of leaks) io.error(leak);
      io.error('Nothing was written. Extend the rules in scripts/scrub/scrub.ts (with a test), then run again.');
      return 1;
    }

    mkdirSync(outDir, { recursive: true });
    for (const output of outputs) writeFileSync(join(outDir, output.name), output.text);
    io.log(`Scrubbed ${outputs.length} file(s) into ${relative(io.root, outDir) || '.'}/. Review the diff before committing.`);
    return 0;
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error));
    if (!(error instanceof UsageError)) io.error(USAGE);
    return 2;
  }
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2), {
    cwd: process.cwd(),
    root: resolve(import.meta.dirname, '../..'),
    homeDir: homedir(),
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  });
}
