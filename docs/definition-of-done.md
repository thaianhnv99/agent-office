# Definition of Done

A task, whatever its size, is done only when every check below holds (plan v3, §11.1). The task's
own acceptance criteria come on top of this list.

| Check | How to verify in this repo |
|---|---|
| Related tests pass and nothing regresses | `./scripts/pnpm test` runs the full suite, not only the new tests |
| Lint, typecheck and build are clean | `./scripts/pnpm typecheck`. Lint and build arrive with the monorepo in M1 |
| It was actually run, not only compiled | Run it for real: a CLI on real input, a hook in the sandbox, the UI in a browser |
| No TODO or FIXME about security or data is left | `git grep -nE 'TODO\|FIXME'` over the files the task touched |
| Docs and ADRs are updated when behavior or a decision changes | `README.md`, `docs/`, `docs/adr/` |
| The commit holds no raw data or secrets | The pre-commit guard passes (a commit made with `--no-verify` does not count) and CI `secret-scan` is green |
