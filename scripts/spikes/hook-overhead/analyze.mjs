// Per run: blocking time of each hook (hook_started -> hook_response, same hook_id) by event,
// and PreToolUse-start -> PostToolUse-start per tool call (hook time + tool execution).
import { readFileSync } from 'node:fs';
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : NaN; };
const fmt = (a) => a.length ? `n=${a.length} p50=${pct(a, 0.5)} p95=${pct(a, 0.95)} max=${Math.max(...a)}` : 'n=0';
for (const file of process.argv.slice(2)) {
  const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const started = new Map(); const byEvent = {}; const outcomes = {};
  let lastPre = null; const prePost = [];
  for (const { t, e } of rows) {
    if (e.type !== 'system') continue;
    if (e.subtype === 'hook_started') { started.set(e.hook_id, { t, ev: e.hook_event });
      if (e.hook_event === 'PreToolUse') lastPre = t;
      if (e.hook_event === 'PostToolUse' && lastPre !== null) { prePost.push(t - lastPre); lastPre = null; } }
    if (e.subtype === 'hook_response') { const s = started.get(e.hook_id); if (!s) continue;
      (byEvent[s.ev] ??= []).push(t - s.t); const k = `${s.ev}:${e.outcome}`; outcomes[k] = (outcomes[k] ?? 0) + 1; }
  }
  const toolUses = rows.filter((r) => r.e.type === 'assistant').flatMap((r) => (r.e.message?.content ?? []).filter((c) => c.type === 'tool_use')).length;
  console.log(`== ${file.split('/').pop()}  tool_use=${toolUses}`);
  for (const [ev, a] of Object.entries(byEvent)) console.log(`  ${ev.padEnd(17)} blocking ms ${fmt(a)}`);
  console.log(`  Pre->Post (hook + tool) ms ${fmt(prePost)}`);
  console.log(`  outcomes ${JSON.stringify(outcomes)}`);
}
