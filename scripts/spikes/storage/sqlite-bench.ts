// Spike for ADR-005: can the built-in node:sqlite carry the event log? Measures, in a temp directory:
// ingest as the server would do it (one INSERT per event, autocommit, WAL, synchronous=NORMAL),
// a replay read by seq, the DB size, and whether the module loads without flags.
//
//   node scripts/spikes/storage/sqlite-bench.ts [events=50000]
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const count = Number(process.argv[2] ?? 50_000);
const dir = mkdtempSync(join(tmpdir(), 'agent-office-sqlite-'));
const file = join(dir, 'events.db');
const db = new DatabaseSync(file);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE events (
    seq INTEGER PRIMARY KEY,           -- server receive order, also the SSE Last-Event-ID
    source TEXT NOT NULL,
    source_key TEXT NOT NULL,          -- NormalizedEvent.id: dedupe within one source
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,
    ts INTEGER NOT NULL,
    schema_version INTEGER NOT NULL,
    body TEXT NOT NULL,                -- the normalized event as JSON
    UNIQUE (source, source_key)
  );
  CREATE INDEX events_session ON events (session_id, seq);
`);

// A payload of about 600 bytes, the size of a trimmed hook event.
const body = JSON.stringify({ tool: { name: 'Bash', target: 'x'.repeat(400) }, cwd: '/Users/user/project-1' });
const insert = db.prepare('INSERT OR IGNORE INTO events (source, source_key, session_id, type, ts, schema_version, body) VALUES (?, ?, ?, ?, ?, 1, ?)');

let start = performance.now();
for (let i = 0; i < count; i++) {
  insert.run('hook', `k${i}`, `s${i % 20}`, i % 3 ? 'tool_start' : 'tool_end', Date.now(), body);
}
const ingestMs = performance.now() - start;
const duplicate = insert.run('hook', 'k1', 's1', 'tool_end', Date.now(), body);

start = performance.now();
let read = 0;
for (const row of db.prepare('SELECT seq, body FROM events WHERE seq > ? ORDER BY seq').iterate(0)) {
  read += (row as { body: string }).body.length > 0 ? 1 : 0;
}
const replayMs = performance.now() - start;

start = performance.now();
const one = db.prepare('SELECT count(*) AS n FROM events WHERE session_id = ? AND seq > ?').get('s7', count - 1000);
const sessionQueryMs = performance.now() - start;

db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
db.close();
const sizeMb = statSync(file).size / 1024 / 1024;
rmSync(dir, { recursive: true, force: true });

console.log(JSON.stringify({
  node: process.version,
  events: count,
  ingestPerEventUs: Math.round((ingestMs / count) * 1000),
  ingestTotalMs: Math.round(ingestMs),
  duplicateIgnored: duplicate.changes === 0,
  replayAllMs: Math.round(replayMs),
  replayRows: read,
  sessionQueryMs: Number(sessionQueryMs.toFixed(2)),
  sessionQueryRows: (one as { n: number }).n,
  dbSizeMb: Number(sizeMb.toFixed(1)),
  bytesPerEvent: Math.round((sizeMb * 1024 * 1024) / count),
}, null, 2));
