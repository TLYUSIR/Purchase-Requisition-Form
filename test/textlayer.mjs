import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.js';
import fs from 'fs';
const data = new Uint8Array(fs.readFileSync(process.argv[2]));
const doc = await pdfjs.getDocument({ data }).promise;
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  const ops = await page.getOperatorList();
  const imgs = ops.fnArray.filter(f => f === pdfjs.OPS.paintImageXObject).length;
  console.log(`page ${i}: textItems=${tc.items.length} images=${imgs} chars=${tc.items.map(t=>t.str).join('').length}`);
}
