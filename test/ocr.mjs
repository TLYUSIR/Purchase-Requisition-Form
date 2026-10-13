import { createWorker, PSM } from 'tesseract.js';
import path from 'path';
const [,, img, langs, dataDir, psm] = process.argv;
const t0 = Date.now();
const worker = await createWorker(langs, 1, { langPath: path.resolve(dataDir), cacheMethod: 'none', gzip: dataDir.includes('fastdir') ? false : true });
if (psm) await worker.setParameters({ tessedit_pageseg_mode: psm });
await worker.setParameters({ preserve_interword_spaces: '1' });
const quads = [[0,0],[1,0],[0,1],[1,1]];
for (const [qx,qy] of quads) {
  const t1 = Date.now();
  const { data } = await worker.recognize(img, { rectangle: { left: qx*810, top: qy*1170, width: 810, height: 1170 } });
  console.log(`===== quadrant ${qx},${qy} (${Date.now()-t1}ms) conf=${data.confidence}`);
  console.log(data.text);
}
console.log('total ms', Date.now()-t0);
await worker.terminate();
