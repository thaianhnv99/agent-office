#!/usr/bin/env bash
# Writes the five S6 hook configurations into .dev-data/s6/: sync and async command hooks
# (the spike logger) and http hooks to 127.0.0.1:<port> with a 5 s or 2 s timeout.
#   scripts/spikes/hook-overhead/make-configs.sh [port]   # default 47391 (47321 is taken by VS Code here)
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
port="${1:-47391}"; out="$root/.dev-data/s6"; mkdir -p "$out"
log="node $root/scripts/spikes/log-event.ts s6/hooks"
events='["UserPromptSubmit","PreToolUse","PostToolUse","PostToolBatch","Stop"]'
cmd() { jq -n --arg l "$log" --argjson ev "$events" --argjson async "$1" \
  '{hooks: ($ev | map({key: ., value: [{hooks: [({type: "command", command: $l, timeout: 10} + (if $async then {async: true} else {} end))]}]}) | from_entries)}'; }
http() { jq -n --argjson ev "$events" --arg url "http://127.0.0.1:$port/hook" --argjson to "$1" \
  '{hooks: ($ev | map({key: ., value: [{hooks: [{type: "http", url: $url, timeout: $to}]}]}) | from_entries)}'; }
cmd false > "$out/c1-sync.json"; cmd true > "$out/c2-async.json"
http 5 > "$out/c3-http-up.json"; http 5 > "$out/c4-http-down.json"; http 2 > "$out/c5-http-hang.json"
ls "$out"
