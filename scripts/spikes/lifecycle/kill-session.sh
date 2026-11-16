#!/bin/bash
# Spike S9: starts a sandbox claude session, sends it a signal, and records what each liveness source
# shows before and after: hooks (SessionEnd?), the MCP server (stdin end, signal), the session file
# ~/.claude/sessions/<pid>.json (read only) and `claude agents --json`.
#
#   scripts/spikes/lifecycle/kill-session.sh <SIGNAL> [idle|busy]
#
#   idle  an interactive session (in a pty made by script(1)) waiting at the prompt
#   busy  a `claude -p` session running a long Bash command (ping), to see what happens to its child
#
# Needs the S9 sandbox config (hooks tagged s9/hooks, ao-channel logging to .dev-raw/s9).
# Output: .dev-raw/s9/kill-<SIGNAL>-<mode>/ (raw data, never committed).
set -u
sig=${1:?usage: kill-session.sh <SIGNAL> [idle|busy]}
mode=${2:-idle}
repo=$(cd "$(dirname "$0")/../../.." && pwd)
raw="$repo/.dev-raw/s9"
out="$raw/kill-$sig-$mode"
hooks="$raw/hooks.jsonl"
rm -rf "$out" && mkdir -p "$out"
touch "$hooks"
start_line=$(wc -l < "$hooks")
new_hooks() { tail -n +"$((start_line + 1))" "$hooks"; }

cd "$HOME/agent-office-sandbox" || exit 1
# Started from inside another Claude Code session, claude inherits markers that make it a child
# session (no transcript, no ~/.claude/sessions file). Drop them so it behaves like a user's session.
clean_env=(env -u CLAUDECODE -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ID -u CLAUDE_PID
  -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_EXECPATH -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_CODE_SSE_PORT
  -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_EFFORT -u AI_AGENT)
if [ "$mode" = idle ]; then
  # tail keeps the pty's input open without typing anything.
  : > "$out/stdin"
  tail -f "$out/stdin" | "${clean_env[@]}" script -q "$out/tty.log" claude --model haiku --setting-sources project,local > /dev/null 2>&1 &
  ready='"SessionStart"'
else
  # The prompt goes first: --allowedTools takes several values and would swallow it.
  "${clean_env[@]}" claude -p '[s9-busy] Run this bash command and wait for it: ping -c 120 127.0.0.1' \
    --model haiku --setting-sources project,local --allowedTools 'Bash(ping:*)' > "$out/claude.out" 2>&1 &
  ready='"PreToolUse"'
fi

# Wait (up to 60 s) for the hook that says the session is ready, and take the claude pid from its ppid.
pid=''
for _ in $(seq 120); do
  pid=$(new_hooks | grep "$ready" | head -n 1 | jq -r '.ppid' 2>/dev/null)
  [ -n "$pid" ] && break
  sleep 0.5
done
[ -n "$pid" ] || { echo "no session started" >&2; exit 1; }
sid=$(new_hooks | grep '"SessionStart"' | head -n 1 | jq -r '.payload.session_id')
sleep 3   # let the session register itself (and ping start, in busy mode)

snapshot() {
  { [ -f "$HOME/.claude/sessions/$pid.json" ] && echo present || echo absent; } > "$out/session-file.$1"
  claude agents --json > "$out/agents.$1.json" 2>/dev/null
  pgrep -f 'ping -c 120 127.0.0.1' > "$out/ping.$1" || true
}
snapshot before
sent_at=$(node -e 'console.log(Date.now())')
kill -s "$sig" "$pid"

gone=no
for _ in $(seq 40); do
  kill -0 "$pid" 2>/dev/null || { gone=yes; break; }
  sleep 0.25
done
sleep 3   # late hooks and MCP logs
snapshot after

server=$(jq -r --argjson p "$pid" 'select(.event=="listening" and .ppid==$p) | .pid' "$raw/channel.jsonl" 2>/dev/null | head -n 1)
jq -n \
  --arg sig "$sig" --arg mode "$mode" --arg pid "$pid" --arg sid "$sid" --arg gone "$gone" --argjson sentAt "$sent_at" \
  --argjson hooks "$(new_hooks | jq -s '[.[] | {event: .payload.hook_event_name, reason: .payload.reason, receivedAt}]')" \
  --argjson sync "$(touch "$raw/hooks-sync.jsonl"; jq -s --arg sid "$sid" '[.[] | select(.payload.session_id==$sid) | {event: .payload.hook_event_name, reason: .payload.reason}]' "$raw/hooks-sync.jsonl")" \
  --argjson server "$(touch "$raw/channel.jsonl"; jq -s --arg s "${server:-0}" '[.[] | select((.pid|tostring)==$s and (.event=="stdin-end" or .event=="signal")) | {event, signal, t}]' "$raw/channel.jsonl")" \
  --arg fileBefore "$(cat "$out/session-file.before")" --arg fileAfter "$(cat "$out/session-file.after")" \
  --argjson agentsBefore "$(grep -c "$sid" "$out/agents.before.json" || true)" --argjson agentsAfter "$(grep -c "$sid" "$out/agents.after.json" || true)" \
  --arg pingBefore "$(tr '\n' ' ' < "$out/ping.before")" --arg pingAfter "$(tr '\n' ' ' < "$out/ping.after")" \
  '{sig: $sig, mode: $mode, pid: $pid, sessionId: $sid, processGone: $gone, sentAt: $sentAt, hooks: $hooks,
    syncSessionEnd: $sync, mcpServer: $server, sessionFile: {before: $fileBefore, after: $fileAfter},
    agentsJsonMentions: {before: $agentsBefore, after: $agentsAfter}, ping: {before: $pingBefore, after: $pingAfter}}' \
  | tee "$out/result.json"

# Clean up whatever is left: the pty's tail and an orphaned ping.
pkill -f "tail -f $out/stdin" 2>/dev/null
pkill -f 'ping -c 120 127.0.0.1' 2>/dev/null
exit 0
