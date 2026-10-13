// Headless Chrome end-to-end test: load the built file from file://, upload the sample PDF,
// dump the extracted items, screenshot the editor, and print the form pages to PDF.
import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const html = path.join(root, 'dist', '購物申請表產生器.html');
const pdf = process.argv[2] || path.join(process.env.HOME, 'Downloads', '附件1.pdf');
const outDir = path.join(root, 'test', 'out');
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--allow-file-access-from-files', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 1400 });
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('[console.' + m.type() + ']', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const t0 = Date.now();
await page.goto('file://' + html + (process.env.HASH || ''), { waitUntil: 'load' });
console.log('loaded in', Date.now() - t0, 'ms');
const input = await page.$('#file');
await input.uploadFile(pdf);
await page.waitForFunction(() => !document.getElementById('editor').hidden || /失敗/.test(document.getElementById('status').textContent), { timeout: 240000, polling: 500 });
console.log('processed in', Date.now() - t0, 'ms');
console.log('status:', await page.$eval('#status', (e) => e.textContent));
const items = await page.evaluate(() => window.__app.state.items.map((it) => ({ title: it.title, unit: it.unit, qty: it.qty, remark: it.remark, unc: it.unc, raw: it.raw && it.raw.price })));
const summary = await page.evaluate(() => window.__app.state.summary);
console.log('inline engine:', await page.evaluate(() => !!window.TaobaoOcrEngine));
console.table(items.map((it) => ({ title: it.title.slice(0, 28), unit: it.unit, qty: it.qty, remark: it.remark, unc: Object.entries(it.unc).filter(([, v]) => v).map(([k]) => k).join(','), raw: (it.raw || '').slice(0, 40) })));
console.log('summary:', summary);
console.log('check:', await page.$eval('#check', (e) => e.textContent));
fs.writeFileSync(path.join(outDir, 'items.json'), JSON.stringify({ items, summary }, null, 2));
fs.writeFileSync(path.join(outDir, 'debug.json'), JSON.stringify(await page.evaluate(() => window.__app.state.debug)));
fs.writeFileSync(path.join(outDir, 'raw.txt'), await page.evaluate(() => window.__app.state.rawTexts.join('\n\n')));
await page.screenshot({ path: path.join(outDir, 'editor.png'), fullPage: false });
await page.pdf({ path: path.join(outDir, 'form.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
console.log('wrote test/out/form.pdf');
await browser.close();
