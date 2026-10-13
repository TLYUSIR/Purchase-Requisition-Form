import fs from 'fs';
import path from 'path';

// 取得目前資料夾路徑，避免路徑寫死的問題
const baseDir = process.cwd();
const srcHtml = path.join(baseDir, 'src', 'app.html');
const distDir = path.join(baseDir, 'dist');
const distHtml = path.join(distDir, 'index.html');

// 確保 dist 資料夾存在
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 讀取 src/app.html 並寫入 dist/index.html
if (fs.existsSync(srcHtml)) {
  const content = fs.readFileSync(srcHtml, 'utf-8');
  fs.writeFileSync(distHtml, content, 'utf-8');
  console.log('✅ 打包成功！檔案已生成至 dist/index.html');
} else {
  console.error('❌ 找不到 src/app.html 檔案，請確認檔案位置。');
}