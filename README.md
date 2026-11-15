# Agent Office

A pixel-art office for watching local coding agents (Claude Code first). Early development: nothing
runs yet.

## Development

Requirements: Node 22 (see `.nvmrc`) and git. Nothing else is installed system-wide.

```sh
./scripts/pnpm install     # pinned pnpm via corepack; also enables the pre-commit guard
./scripts/pnpm test
./scripts/pnpm typecheck
```

`scripts/pnpm` runs `corepack pnpm` (never `corepack enable`) and keeps the pnpm store, caches and
corepack downloads in `.cache/`, so development does not write to tool directories shared with
other projects.

Every task follows the [Definition of Done](docs/definition-of-done.md). Work is tracked on the
[project board](https://github.com/users/thaianhnv99/projects/1).

> **Never put hooks in the global Claude Code config (`~/.claude/settings.json`) while developing.**
> A broken global hook affects every session of every project on the machine.

### Data hygiene

This repository is public, and git history cannot be cleaned after a push.

- Raw captures from real Claude Code sessions go in `.dev-raw/`, which git ignores. They are never
  committed.
- Commit only scrubbed or synthetic fixtures. Scrub raw captures into `fixtures/`:

  ```sh
  ./scripts/pnpm scrub .dev-raw/s1/*.jsonl --out fixtures/s1 [--term NAME]...
  ```

  The scrubber replaces the home directory, project names (found in `cwd` fields), account and
  organization ids, emails, secrets, tool output and API request payloads. Names it cannot discover,
  such as people or other projects mentioned in prompts, go in `.dev-raw/scrub-terms.txt` (one per
  line) or `--term`. Nothing is written if a leak survives. Review the diff before committing.
- The pre-commit guard checks the staged content and blocks raw or dev data, this machine's home
  path, and secrets (secretlint).
- CI runs gitleaks over the whole history. Run the same scan locally before the first public push:

  ```sh
  ./scripts/gitleaks git --redact --verbose .
  ```

## License

[MIT](LICENSE). Art assets will carry their own licenses, listed in `assets/CREDITS.md`.
