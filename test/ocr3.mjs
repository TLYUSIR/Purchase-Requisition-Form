import { createWorker, PSM } from 'tesseract.js';
import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';
const [,, img, scale] = process.argv;
const S = +scale;
const png = PNG.sync.read(fs.readFileSync(img));
const worker = await createWorker('chi_sim', 1, { langPath: path.resolve('vendor'), cacheMethod: 'none' });
await worker.setParameters({ preserve_interword_spaces: '1' });
const W = 270*S, H = 390*S;

function crop(x, y, w, h, up, removeStrike) {
  const out = new PNG({ width: w*up, height: h*up });
  // grayscale crop
  const g = new Float32Array(w*h);
  for (let j=0;j<h;j++) for (let i=0;i<w;i++) { const p=((y+j)*png.width+(x+i))*4; g[j*w+i]=(png.data[p]*0.299+png.data[p+1]*0.587+png.data[p+2]*0.114); }
  if (removeStrike) {
    // rows where dark run spans > 40% width -> strike line; clear pixels with white above/below
    const dark = v => v < 170;
    const rows = [];
    for (let j=0;j<h;j++){ let cnt=0; for(let i=0;i<w;i++) if(dark(g[j*w+i])) cnt++; rows.push(cnt/w); }
    for (let j=2;j<h-2;j++) if (rows[j] > 0.35) {
      for (let i=0;i<w;i++) { const a=g[(j-2)*w+i], b=g[(j+2)*w+i]; if(!dark(a)&&!dark(b)) g[j*w+i]=255; }
    }
  }
  for (let j=0;j<h*up;j++) for (let i=0;i<w*up;i++) {
    // bilinear
    const sx=i/up, sy=j/up; const x0=Math.min(w-1,Math.floor(sx)), y0=Math.min(h-1,Math.floor(sy)); const x1=Math.min(w-1,x0+1), y1=Math.min(h-1,y0+1);
    const fx=sx-x0, fy=sy-y0;
    const v = g[y0*w+x0]*(1-fx)*(1-fy)+g[y0*w+x1]*fx*(1-fy)+g[y1*w+x0]*(1-fx)*fy+g[y1*w+x1]*fx*fy;
    const p=(j*w*up+i)*4; out.data[p]=out.data[p+1]=out.data[p+2]=v; out.data[p+3]=255;
  }
  return PNG.sync.write(out);
}
let n=0;
for (const [qx,qy] of [[0,0],[1,0],[0,1],[1,1]]) {
  const rect = { left: qx*W, top: qy*H, width: W, height: H };
  const { data } = await worker.recognize(img, { rectangle: rect }, { tsv: true });
  const rows = data.tsv.trim().split('\n').slice(1).map(r => r.split('\t'));
  const lines = new Map();
  for (const r of rows) { if (r[0] !== '5') continue; const key = `${r[2]}-${r[3]}-${r[4]}`; if (!lines.has(key)) lines.set(key, []); lines.get(key).push({ left:+r[6], top:+r[7], width:+r[8], height:+r[9], text:r[11] }); }
  for (const [k, words] of lines) {
    const text = words.map(w=>w.text).join(' ');
    if (!/券 ?后|[¥￥Yy*#半]\s?\d/.test(text) || /HKD/.test(text)) continue;
    const l=Math.min(...words.map(w=>w.left)), t=Math.min(...words.map(w=>w.top)), r=Math.max(...words.map(w=>w.left+w.width)), b=Math.max(...words.map(w=>w.top+w.height));
    const pad=3*S; const cx=Math.max(0,l-pad), cy=Math.max(0,t-pad), cw=r-l+2*pad, ch=b-t+2*pad;
    const results = [];
    for (const [up, strike] of [[2,false],[2,true],[3,true]]) {
      const buf = crop(cx,cy,cw,ch,up,strike);
      fs.writeFileSync(`test/crops/p${n}_${up}_${strike}.png`, buf);
      for (const wl of ['', '0123456789.¥ ']) {
        await worker.setParameters({ tessedit_char_whitelist: wl, tessedit_pageseg_mode: PSM.SINGLE_LINE });
        const res = await worker.recognize(buf, {}, { text: true });
        results.push(`up${up}${strike?'S':''}${wl?'W':''}=[${res.data.text.trim()}]`);
      }
    }
    await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: PSM.AUTO });
    console.log(`first=[${text}]  ${results.join('  ')}`);
    n++;
  }
}
await worker.terminate();
