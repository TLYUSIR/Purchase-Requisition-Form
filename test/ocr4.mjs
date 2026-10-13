import { createWorker, PSM } from 'tesseract.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.js';
import { imageRects } from './imgrects.mjs';
import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';
const [,, pdf, dir, scale, pageNo] = process.argv;
const S = +scale;
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdf)) }).promise;
const page = await doc.getPage(+pageNo);
const vp = page.getViewport({ scale: S });
const rects = (await imageRects(page)).map(r => {
  const [x0,y0] = pdfjs.Util.applyTransform([r.x, r.y], vp.transform);
  const [x1,y1] = pdfjs.Util.applyTransform([r.x+r.w, r.y+r.h], vp.transform);
  return { left: Math.round(Math.min(x0,x1)), top: Math.round(Math.min(y0,y1)), width: Math.round(Math.abs(x1-x0)), height: Math.round(Math.abs(y1-y0)) };
}).sort((a,b) => (Math.abs(a.top-b.top) > 0.3*a.height ? a.top-b.top : a.left-b.left));
const img = `${dir}/page${pageNo}.png`;
const png = PNG.sync.read(fs.readFileSync(img));
const chi = await createWorker('chi_sim', 1, { langPath: path.resolve('vendor'), cacheMethod: 'none' });
const eng = await createWorker('eng', 1, { langPath: path.resolve('vendor'), cacheMethod: 'none' });
await chi.setParameters({ preserve_interword_spaces: '1' });
function crop(x, y, w, h) {
  const out = new PNG({ width: w, height: h });
  for (let j=0;j<h;j++) for (let i=0;i<w;i++) { const p=((y+j)*png.width+(x+i))*4, q=(j*w+i)*4; out.data[q]=png.data[p]; out.data[q+1]=png.data[p+1]; out.data[q+2]=png.data[p+2]; out.data[q+3]=255; }
  return PNG.sync.write(out);
}
const t0 = Date.now();
for (const rect of rects) {
  const { data } = await chi.recognize(img, { rectangle: rect }, { tsv: true });
  const rows = data.tsv.trim().split('\n').slice(1).map(r => r.split('\t'));
  const lines = new Map();
  for (const r of rows) { if (r[0] !== '5' || !(r[11]||'').trim()) continue; const key = `${r[2]}-${r[3]}-${r[4]}`; if (!lines.has(key)) lines.set(key, []); lines.get(key).push({ left:+r[6], top:+r[7], width:+r[8], height:+r[9], text:r[11] }); }
  const zone = rect.left + 0.22*rect.width;
  console.log(`--- screenshot @${rect.left},${rect.top} ${rect.width}x${rect.height}`);
  for (const [k, words] of lines) {
    const text = words.map(w=>w.text).join(' ');
    const isPrice = /券 ?后|[¥￥Yy*#半]\s?\d/.test(text) && !/HKD/.test(text);
    const isTitle = /[xX×]\s?[0-9lI]+\s*$/.test(text);
    if (!isPrice && !isTitle) continue;
    const ws = words.filter(w => w.left >= zone);
    if (!ws.length) continue;
    const l=Math.min(...ws.map(w=>w.left)), t=Math.min(...ws.map(w=>w.top)), r=Math.max(...ws.map(w=>w.left+w.width)), b=Math.max(...ws.map(w=>w.top+w.height));
    if (isTitle) { console.log(`TITLE: ${ws.map(w=>w.text).join(' ')}`); continue; }
    const pad=Math.round(2*S); const buf = crop(Math.max(0,l-pad), Math.max(0,t-pad), r-l+2*pad, b-t+2*pad);
    await chi.setParameters({ tessedit_char_whitelist: '0123456789.¥ ', tessedit_pageseg_mode: PSM.SINGLE_LINE });
    const c1 = (await chi.recognize(buf, {}, { text: true })).data.text.trim();
    await chi.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: PSM.AUTO });
    await eng.setParameters({ tessedit_char_whitelist: '0123456789.¥ ', tessedit_pageseg_mode: PSM.SINGLE_LINE });
    const e1 = (await eng.recognize(buf, {}, { text: true })).data.text.trim();
    await eng.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: PSM.SINGLE_LINE });
    const e2 = (await eng.recognize(buf, {}, { text: true })).data.text.trim();
    console.log(`PRICE first=[${ws.map(w=>w.text).join(' ')}] chiW=[${c1}] engW=[${e1}] eng=[${e2}]`);
  }
}
console.log('ms', Date.now()-t0);
await chi.terminate(); await eng.terminate();
