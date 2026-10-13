import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.js';
import fs from 'fs';
export async function imageRects(page) {
  const ops = await page.getOperatorList();
  const O = pdfjs.OPS;
  const mul = (m, n) => [m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]];
  let ctm = [1,0,0,1,0,0]; const stack = []; const rects = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], a = ops.argsArray[i];
    if (fn === O.save) stack.push(ctm);
    else if (fn === O.restore) ctm = stack.pop() || ctm;
    else if (fn === O.transform) ctm = mul(ctm, a);
    else if (fn === O.paintFormXObjectBegin) { stack.push(ctm); if (a[0]) ctm = mul(ctm, a[0]); }
    else if (fn === O.paintFormXObjectEnd) ctm = stack.pop() || ctm;
    else if (fn === O.paintImageXObject || fn === O.paintJpegXObject || fn === O.paintImageXObjectRepeat) {
      const xs = [ctm[4], ctm[0]+ctm[4], ctm[2]+ctm[4], ctm[0]+ctm[2]+ctm[4]];
      const ys = [ctm[5], ctm[1]+ctm[5], ctm[3]+ctm[5], ctm[1]+ctm[3]+ctm[5]];
      rects.push({ name: a[0], x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs)-Math.min(...xs), h: Math.max(...ys)-Math.min(...ys) });
    }
  }
  return rects;
}
if (process.argv[1].endsWith('imgrects.mjs')) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(process.argv[2])) }).promise;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    console.log(`page ${i} ${vp.width}x${vp.height} rotation=${vp.rotation}`);
    for (const r of await imageRects(page)) {
      let dims = '';
      try { const o = page.objs.get(r.name); dims = `${o.width}x${o.height}`; } catch (e) { dims = 'n/a'; }
      console.log('  ', JSON.stringify(r), 'native', dims);
    }
  }
}
