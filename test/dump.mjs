import { createWorker, PSM } from 'tesseract.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.js';
import { imageRects } from './imgrects.mjs';
import fs from 'fs';
import path from 'path';
const [,, pdf, dir, scale, pageNo, psm] = process.argv;
const S = +scale;
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdf)) }).promise;
const page = await doc.getPage(+pageNo);
const vp = page.getViewport({ scale: S });
const rects = (await imageRects(page)).map(r => {
  const [x0,y0] = pdfjs.Util.applyTransform([r.x, r.y], vp.transform);
  const [x1,y1] = pdfjs.Util.applyTransform([r.x+r.w, r.y+r.h], vp.transform);
  return { left: Math.round(Math.min(x0,x1)), top: Math.round(Math.min(y0,y1)), width: Math.round(Math.abs(x1-x0)), height: Math.round(Math.abs(y1-y0)) };
}).sort((a,b) => (Math.abs(a.top-b.top) > 0.3*a.height ? a.top-b.top : a.left-b.left));
const chi = await createWorker('chi_sim', 1, { langPath: path.resolve('vendor'), cacheMethod: 'none' });
await chi.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: psm || '6' });
for (const rect of rects) {
  const { data } = await chi.recognize(`${dir}/page${pageNo}.png`, { rectangle: rect }, { tsv: true });
  const rows = data.tsv.trim().split('\n').slice(1).map(r => r.split('\t'));
  const lines = new Map();
  for (const r of rows) { if (r[0] !== '5' || !(r[11]||'').trim()) continue; const key = `${r[2]}-${r[3]}-${r[4]}`; if (!lines.has(key)) lines.set(key, []); lines.get(key).push({ left:+r[6]-rect.left, top:+r[7]-rect.top, width:+r[8], height:+r[9], conf:+r[10], text:r[11] }); }
  console.log(`--- screenshot ${rect.width}x${rect.height}`);
  for (const [k, words] of lines) console.log(String(Math.min(...words.map(w=>w.left))).padStart(5), String(Math.min(...words.map(w=>w.top))).padStart(5), words.map(w=>w.text).join(' '));
}
await chi.terminate();
