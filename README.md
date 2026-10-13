# 淘寶訂單截圖 → 購物申請表產生器

單一 HTML 檔、完全離線的小工具：上載淘寶「確認訂單」截圖 PDF（或 PNG/JPG），
在瀏覽器內以 Tesseract OCR 辨識每個採購項目，填入匡智會 Annex 3D 購物申請表的
項目 1–12 表格，可微調後列印或匯出 PDF。不經任何 API，不上傳資料。

## 使用

1. 開啟 `dist/購物申請表產生器.html`（Chrome / Edge / Safari / Firefox，雙擊即可）。
2. 拖放或選擇淘寶截圖 PDF。每張截圖約 1 秒，第一次載入引擎約 2–3 秒。
3. 在表格內修改名稱、單價（券前人民幣價）、數量、備註；黃色欄位表示辨識不確定。
   工具會把「商品總價」截圖的件數與金額和列表核對，相符會顯示 ✓。
4. 幣別可選人民幣原價或按匯率換算港幣；總額可選「每頁小計」或「全部合計」。
5. 按「列印」或「匯出 PDF」（在列印視窗選「另存為 PDF」）。每頁 12 項，超過自動分頁。

## 開發

```
npm install            # pdfjs-dist 3.11、tesseract.js-core、pako、puppeteer-core（測試用）
node build.mjs         # 把 src/ + vendor/ 內嵌成 dist/購物申請表產生器.html（約 18 MB）
node test/browser.mjs [檔案]   # 用本機 Chrome 無頭模式跑整個流程，輸出 test/out/
HASH='#inline' node test/browser.mjs   # 測試無 Web Worker 的主執行緒後備模式
```

- `src/app.html`：介面、PDF 讀取（pdf.js，以 fake worker 內嵌執行）、OCR 流程、表單版面、列印 CSS。
- `src/parser.js`：把 Tesseract TSV 轉成行，辨識店舖／標題／價格行，第二次辨識價格並投票。
  可在 Node 直接 require 做單元測試。
- `src/engine.js`：在 Blob worker 內載入 tesseract core 與 traineddata（chi_sim + eng，best_int）。
- `vendor/`：pako inflate UMD、traineddata.gz。

辨識策略：以 PDF 內嵌圖片的位置切出每張截圖，渲染至約原生 2 倍解析度，
chi_sim psm 6 做第一次辨識取得文字與座標；店舖行後的第一行是標題，
標題後第一個含「券后」或 ¥ 的行是價格行；價格行再裁切後用 eng/chi_sim
的數字白名單（psm 7）辨識數次，取合理（券前 ≥ 券後 且 ≤ 2.5 倍）且多數一致的值。
