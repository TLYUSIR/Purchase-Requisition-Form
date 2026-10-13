import { PNG } from 'pngjs'; import fs from 'fs';
const [,, src, out, x, y, w, h] = process.argv;
const png = PNG.sync.read(fs.readFileSync(src));
const o = new PNG({ width: +w, height: +h });
for (let j = 0; j < +h; j++) for (let i = 0; i < +w; i++) { const p = ((+y + j) * png.width + (+x + i)) * 4, q = (j * +w + i) * 4; o.data[q] = png.data[p]; o.data[q+1] = png.data[p+1]; o.data[q+2] = png.data[p+2]; o.data[q+3] = 255; }
fs.writeFileSync(out, PNG.sync.write(o));
