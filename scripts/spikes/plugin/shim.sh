#!/bin/sh
# Spike S8: prototype of the stable shim (plan §9.2, ADR-007). It lives outside the plugin directory,
# so its path survives plugin updates, and starts the current entry with the node path recorded at
# install time. The node path can contain a version number (nvm), so when it is gone the shim falls
# back to node on PATH, and when there is no node at all it logs the problem and exits 0: a hook must
# never disturb the agent.
#
# shim.conf next to the shim, read as data (never sourced):
#   node=/absolute/path/to/node
#   entry=/absolute/path/to/entry.mjs
# Errors go to shim.log next to the shim.
dir=$(dirname "$0")
conf="$dir/shim.conf"
log="$dir/shim.log"

say() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$log" 2>/dev/null
}

node=$(sed -n 's/^node=//p' "$conf" 2>/dev/null | head -n 1)
entry=$(sed -n 's/^entry=//p' "$conf" 2>/dev/null | head -n 1)

if [ ! -x "$node" ]; then
  found=$(command -v node 2>/dev/null)
  if [ -n "$found" ]; then
    say "configured node not found: $node; using $found (fix: agent-office doctor --fix-node)"
    node=$found
  else
    say "no node found (configured: $node, none on PATH); skipped: $*"
    exit 0
  fi
fi

if [ ! -f "$entry" ]; then
  say "entry not found: $entry; skipped: $*"
  exit 0
fi

exec "$node" "$entry" "$@"
