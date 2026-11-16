#!/bin/bash
# Spike S5: does a plugin's MCP server outlive /clear, which gives the session a new session_id?
# Starts an interactive sandbox session in a pty (script(1)) with the S5 plugin, types /clear, then
# /exit, and prints the MCP server's lifecycle events next to the hook events.
#
#   scripts/spikes/lifecycle/clear-session.sh
#
# Needs .dev-data/s5/plugin (MCP server ao-s5 logging to .dev-raw/s5, hooks tagged s5/hooks).
# Output: .dev-raw/s5/clear/ (raw data, never committed).
set -u
repo=$(cd "$(dirname "$0")/../../.." && pwd)
raw="$repo/.dev-raw/s5"
out="$raw/clear"
hooks="$raw/hooks.jsonl"
channel="$raw/channel.jsonl"
rm -rf "$out" && mkdir -p "$out"
touch "$hooks" "$channel"
hooks_from=$(wc -l < "$hooks")
channel_from=$(wc -l < "$channel")
new_hooks() { tail -n +"$((hooks_from + 1))" "$hooks"; }
type_keys() { printf '%s' "$1" >> "$out/stdin"; }
wait_for() { # <count> <pattern>: wait up to 60 s until the new hook lines match <pattern> <count> times
  for _ in $(seq 120); do
    [ "$(new_hooks | grep -c "$2")" -ge "$1" ] && return 0
    sleep 0.5
  done
  echo "timed out waiting for $2" >&2
  return 1
}

cd "$HOME/agent-office-sandbox" || exit 1
: > "$out/stdin"
# Same clean environment as kill-session.sh, so this is not a child session.
tail -f "$out/stdin" | env -u CLAUDECODE -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ID -u CLAUDE_PID \
  -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_EXECPATH -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_CODE_SSE_PORT \
  -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_EFFORT -u AI_AGENT \
  script -q "$out/tty.log" claude --model haiku --setting-sources project,local --plugin-dir "$repo/.dev-data/s5/plugin" \
  > /dev/null 2>&1 &

wait_for 1 '"SessionStart"' && sleep 3
type_keys '/clear'; sleep 1; type_keys $'\r'
wait_for 2 '"SessionStart"' && sleep 3
type_keys '/exit'; sleep 1; type_keys $'\r'
wait_for 2 '"SessionEnd"'; sleep 2

echo '--- hooks'
new_hooks | jq -c '{t: .receivedAt, event: .payload.hook_event_name, source: .payload.source, reason: .payload.reason, session: .payload.session_id, ppid}'
echo '--- MCP server ao-s5'
tail -n +"$((channel_from + 1))" "$channel" | jq -c 'select(.event != "recv") | {t, pid, ppid, event, signal, session: .env.CLAUDE_CODE_SESSION_ID}'

pkill -f "tail -f $out/stdin" 2>/dev/null
exit 0
