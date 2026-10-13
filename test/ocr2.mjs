import { createWorker, PSM } from 'tesseract.js';
import path from 'path';
const [,, img, scale, langs, hiImg, hiScale] = process.argv;
const S = +scale, HS = +hiScale;
const t0 = Date.now();
const worker = await createWorker(langs, 1, { langPath: path.resolve('vendor'), cacheMethod: 'none' });
await worker.setParameters({ preserve_interword_spaces: '1' });
const W = 270*S, H = 390*S;
const quads = [[0,0],[1,0],[0,1],[1,1]];
for (const [qx,qy] of quads) {
  const t1 = Date.now();
  const rect = { left: qx*W, top: qy*H, width: W, height: H };
  const { data } = await worker.recognize(img, { rectangle: rect }, { tsv: true, text: true });
  // parse tsv into lines
  const rows = data.tsv.trim().split('\n').slice(1).map(r => r.split('\t'));
  const lines = new Map();
  for (const r of rows) {
    if (r[0] !== '5') continue;
    const key = `${r[2]}-${r[3]}-${r[4]}`;
    const w = { left: +r[6] - rect.left, top: +r[7] - rect.top, width: +r[8], height: +r[9], conf: +r[10], text: r[11] };
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push(w);
  }
  console.log(`===== quadrant ${qx},${qy} (${Date.now()-t1}ms)`);
  for (const [k, words] of lines) {
    const text = words.map(w => w.text).join(' ');
    const l = Math.min(...words.map(w=>w.left)), t = Math.min(...words.map(w=>w.top));
    const r = Math.max(...words.map(w=>w.left+w.width)), b = Math.max(...words.map(w=>w.top+w.height));
    let extra = '';
    if (/券后|[¥￥Y]\s?\d/.test(text)) {
      // second pass on hi-res image
      await worker.setParameters({ tessedit_char_whitelist: '0123456789.¥', tessedit_pageseg_mode: PSM.SINGLE_LINE });
      const pad = 4*S;
      const hr = { left: Math.round((rect.left + l - pad)*HS/S), top: Math.round((rect.top + t - pad)*HS/S), width: Math.round((r-l+2*pad)*HS/S), height: Math.round((b-t+2*pad)*HS/S) };
      const res = await worker.recognize(hiImg, { rectangle: hr }, { text: true });
      await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: PSM.AUTO });
      extra = `   ==> [${res.data.text.trim()}]`;
    }
    console.log(`${String(l).padStart(5)} ${String(t).padStart(5)}  ${text}${extra}`);
  }
}
console.log('total ms', Date.now()-t0);
await worker.terminate();
