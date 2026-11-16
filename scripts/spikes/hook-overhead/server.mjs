// S6 test HTTP server on 127.0.0.1. Modes: ok (200, empty body) or hang (accepts, never answers).
import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';
const [mode = 'ok', port = '47321', log] = process.argv.slice(2);
createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    let ev = '?'; try { ev = JSON.parse(body).hook_event_name; } catch {}
    if (log) appendFileSync(log, JSON.stringify({ t: Date.now(), ev, bytes: body.length }) + '\n');
    if (mode === 'ok') { res.writeHead(200); res.end(); }
  });
}).listen(Number(port), '127.0.0.1');
