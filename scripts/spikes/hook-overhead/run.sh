#!/usr/bin/env bash
# Spike S6: one headless `claude -p` run in the sandbox with the given hook settings. The
# stream-json output is timestamped line by line, so analyze.mjs can measure how long each
# hook blocks (hook_started -> hook_response) and the PreToolUse -> PostToolUse interval.
#
#   scripts/spikes/hook-overhead/run.sh <name> <settings.json>   # writes .dev-raw/s6/<name>.jsonl
#
# It overwrites ~/agent-office-sandbox/.claude/settings.local.json; restore it afterwards.
# Uses haiku and 15 trivial Bash calls, so each run costs little quota.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
name="${1:?usage: run.sh <name> <settings.json>}"
cfg="${2:?usage: run.sh <name> <settings.json>}"
sandbox="$HOME/agent-office-sandbox"
out="$root/.dev-raw/s6/$name.jsonl"
mkdir -p "$(dirname "$out")"
cp "$cfg" "$sandbox/.claude/settings.local.json"

claude_bin="$(command -v claude)"
cd "$sandbox" && env -i HOME="$HOME" USER="$USER" LOGNAME="$USER" SHELL=/bin/zsh TERM=xterm-256color \
  TMPDIR="${TMPDIR:-/tmp}" LANG=en_US.UTF-8 \
  PATH="$(dirname "$(command -v node)"):$(dirname "$claude_bin"):/usr/bin:/bin:/usr/sbin:/sbin" \
  "$claude_bin" -p --model haiku --setting-sources project,local --allowedTools "Bash(true)" \
  --output-format stream-json --verbose --include-hook-events \
  "[s6-$name] Run the bash command true 15 times, one call per message, strictly one after another (never in parallel). Then reply with: done." \
  < /dev/null 2> "$out.stderr" | node "$here/stamp.mjs" > "$out"
echo "$name: lines=$(wc -l < "$out" | tr -d ' ') result=$(jq -r 'select(.e.type=="result") | .e.subtype + " is_error=" + (.e.is_error|tostring)' "$out")"
