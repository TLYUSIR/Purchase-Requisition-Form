import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const P = require('../src/parser.js');
const dbg = JSON.parse(fs.readFileSync('test/out/debug.json', 'utf8'));
for (const idx of process.argv.slice(2).map(Number)) {
  const d = dbg[idx];
  const lines = P.tsvToLines(d.tsv);
  // replicate zoneEnd computation
  const xs = [];
  for (const line of lines) for (const w of line.words) { if (/^(颜色|商品规格|规格|包邮|券后)/.test(w.text)) { xs.push(w.left + ':' + w.text); break; } }
  console.log(`== ${d.label} width=${d.width} colwords=${xs.join(' ')}`);
  for (const line of lines) {
    const t = line.text;
    if (/[xX×]\s*[xXfl]?\s*\d?\s*$/.test(t) || /券|后/.test(t)) console.log('   ', line.words.map(w => `${w.text}[${w.left}-${w.left + w.width}]`).join(' '));
  }
}
