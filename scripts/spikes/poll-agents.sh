#!/usr/bin/env bash
# Spike S1/S2: polls `claude agents --json` and appends {"t": <ms>, "sessions": [...]} lines to
# .dev-raw/<tag>.jsonl until stopped (Ctrl+C or kill).
#
#   scripts/spikes/poll-agents.sh s1/agents [interval-seconds]
#
# The output lists every live session on this machine, other projects included, so it stays in
# .dev-raw/ (gitignored). Filter it to sandbox sessions before scrubbing it into fixtures/.
# In S1, `claude agents --json` took about 0.12 s and started no supervisor or other process.
set -euo pipefail

tag="${1:?usage: poll-agents.sh <tag> [interval-seconds]}"
interval="${2:-1}"
case "$tag" in *..*|/*) echo "poll-agents: bad tag" >&2; exit 2 ;; esac

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
out="$root/.dev-raw/$tag.jsonl"
mkdir -p "$(dirname "$out")"
claude_bin="$(command -v claude)"

while true; do
  t="$(perl -MTime::HiRes=time -e 'printf "%d", time * 1000')"
  # Clean environment, so the call never inherits the variables of a Claude Code session.
  sessions="$(env -i HOME="$HOME" USER="$USER" PATH="$(dirname "$claude_bin"):/usr/bin:/bin" \
    "$claude_bin" agents --json 2>/dev/null | jq -c . 2>/dev/null || true)"
  printf '{"t":%s,"sessions":%s}\n' "$t" "${sessions:-null}" >> "$out"
  sleep "$interval"
done
