// Prefix every stdin line with its arrival time: {"t": ms, "e": <parsed line>}.
import { createInterface } from 'node:readline';
for await (const line of createInterface({ input: process.stdin })) {
  let e; try { e = JSON.parse(line); } catch { e = { raw: line }; }
  process.stdout.write(JSON.stringify({ t: Date.now(), e }) + '\n');
}
