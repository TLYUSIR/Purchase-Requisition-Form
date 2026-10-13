/*
 * Taobao order-confirmation screenshot parser.
 * Input: Tesseract TSV output for one screenshot. Output: purchase items.
 * Works in the browser (window.TaobaoParser) and in Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TaobaoParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Fraction of the screenshot width occupied by the product thumbnail column.
  const ZONE = 0.22;
  // Words that end left of ZONE_END are thumbnail junk too.
  const ZONE_END = 0.29;
  const CJK = /[⺀-鿿豈-﫿＀-￯]/;
  const LETTER = /[⺀-鿿豈-﫿A-Za-z0-9]/g;

  const RE_STORE = /^(天猫|天狂|天描|天貓|天宝|淘宝|淘寶|淘宝网)/;
  const RE_SKIP = /配送|发票|备注|送达|发货|快递|运费|立即支付|HKD|退货权益|取件|合计|手续费|优惠|礼金|总价|价格明细|确认订单|地址|明细|支付|官方|物流|预计|全部商品/;
  const RE_SPEC = /^(颜色|商品规格|规格|尺码|型号|款式|套餐|类型|尺寸|材质|品名)|分类[:：]|规格[:：]|型号[:：]|^[^:：]{0,8}[:：]/;
  const RE_TAG = /包邮|可退|无理由|赔四|赔十|退款|公益|HK|正品|极速|到港|退换/;
  const RE_QTY = /[xX×]\s*[xX]?\s*[fFIl|]?\s*(\d{1,3})\s*$/;
  const RE_QTY_FUZZY = /[xX×]\s*[fFlI|1]?\s*$/;
  // "券后" and its common OCR misreads, followed by a number within a few characters.
  const RE_COUPON = /[券劵关着天”"卷]?后[^\d]{0,4}\d/;
  const RE_YEN = /(^|[\s(])[¥￥YyＹ半光尖#*]\s?\d+(?:[.,]\d{1,2})?(?=\s|$|[^\d])/;
  const RE_BARE_NUMBER = /^\D?\d{1,6}(?:[.,]\d{1,2})?\D?$/;
  // Lines whose first word starts with one of these begin exactly at the text column of an item card.
  const RE_TEXT_COL = /^(颜色|商品规格|规格|包邮|券后)/;

  const compact = (s) => (s || '').replace(/\s+/g, '');
  const letters = (s) => ((s || '').match(LETTER) || []).length;

  // Join OCR words, dropping the spaces Tesseract inserts between CJK characters.
  function joinWords(words) {
    let s = '';
    for (const w of words) {
      const t = w.text;
      if (!t) continue;
      if (!s) { s = t; continue; }
      const a = s[s.length - 1];
      const b = t[0];
      s += (CJK.test(a) || CJK.test(b)) ? t : ' ' + t;
    }
    return s;
  }

  function bbox(words) {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const w of words) {
      l = Math.min(l, w.left); t = Math.min(t, w.top);
      r = Math.max(r, w.left + w.width); b = Math.max(b, w.top + w.height);
    }
    return { left: l, top: t, width: r - l, height: b - t };
  }

  // Tesseract TSV -> lines of words (in reading order). Coordinates are kept as given.
  function tsvToLines(tsv) {
    const lines = [];
    const map = new Map();
    for (const row of (tsv || '').split('\n')) {
      const c = row.split('\t');
      if (c.length < 12 || c[0] !== '5') continue;
      const text = c[11].trim();
      if (!text) continue;
      const key = c[2] + '-' + c[3] + '-' + c[4];
      let line = map.get(key);
      if (!line) { line = { words: [] }; map.set(key, line); lines.push(line); }
      line.words.push({ left: +c[6], top: +c[7], width: +c[8], height: +c[9], conf: +c[10], text });
    }
    for (const line of lines) {
      line.words.sort((a, b) => a.left - b.left);
      line.text = line.words.map((w) => w.text).join(' ');
      line.box = bbox(line.words);
    }
    return lines;
  }

  // Estimate where the text column of the item cards starts (right of the thumbnail).
  function textColumnLeft(lines, width) {
    const xs = [];
    for (const line of lines) {
      const ws = line.words;
      for (let i = 0; i < ws.length; i++) {
        if (ws[i].width < 4) continue;
        const rest = compact(ws.slice(i, i + 3).map((w) => w.text).join(''));
        if (RE_TEXT_COL.test(rest)) { xs.push(ws[i].left); break; }
      }
    }
    if (xs.length < 2) return ZONE_END * width;
    xs.sort((a, b) => a - b);
    const med = xs[Math.floor(xs.length / 4)];
    if (med < 0.1 * width || med > 0.5 * width) return ZONE_END * width;
    return med;
  }

  // Keep words right of the thumbnail: they must reach the text column (less a small tolerance),
  // and either start right of the thumbnail or clearly extend into the text column.
  function annotate(line, width, column) {
    const zoneX = ZONE * width;
    if (column == null) column = ZONE_END * width;
    const zoneEnd = column - 0.04 * width;
    line.zoneWords = line.words.filter((w) => {
      const r = w.left + w.width;
      return r >= zoneEnd && (w.left >= zoneX || r >= column);
    });
    line.inZone = line.words.length > 0 && line.words[0].left >= zoneX;
    line.conf = line.words.length ? line.words.reduce((a, w) => a + w.conf, 0) / line.words.length : 0;
    line.zoneText = line.zoneWords.map((w) => w.text).join(' ');
    line.zoneCompact = compact(line.zoneText);
    line.zoneTitle = joinWords(line.zoneWords);
    line.zoneBox = line.zoneWords.length ? bbox(line.zoneWords) : null;
  }

  function storeName(full) {
    const c = full.replace(/^[^一-鿿]+/, '');
    if (!RE_STORE.test(c)) return null;
    if (/官方|物流|直运|直運|运费|集运/.test(c)) return null;
    const m = c.match(RE_STORE);
    let platform = m[1];
    if (/^天/.test(platform)) platform = '天猫';
    else platform = '淘宝';
    const rest = c.slice(m[1].length).replace(/^[\s:：\-|]+/, '');
    return rest ? platform + ' ' + rest : platform;
  }

  function cleanTitle(zoneTitle) {
    let t = zoneTitle.replace(RE_QTY, '').replace(RE_QTY_FUZZY, '');
    // Drop the dropdown chevron and leading/trailing junk around the title.
    t = t.replace(/[^\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaffA-Za-z0-9】」）)%+]+$/, '');
    t = t.replace(/^[^\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaffA-Za-z0-9【「（(]+/, '');
    return t.trim();
  }

  function parseQty(zoneText) {
    const m = zoneText.match(RE_QTY);
    if (m) return { qty: parseInt(m[1], 10), found: true };
    if (RE_QTY_FUZZY.test(zoneText)) return { qty: 1, found: true, uncertain: true };
    return { qty: 1, found: false, uncertain: true };
  }

  function isPriceLine(line) {
    const z = line.zoneCompact;
    if (!z || !/\d/.test(z)) return false;
    if (RE_SKIP.test(z) || RE_SPEC.test(z) || RE_TAG.test(z)) return false;
    if (/cm|mm|kg|ml|gb|tb|%|斤|克|寸|米|[0-9][vVwW]\b/i.test(line.zoneText)) return false;
    if (RE_COUPON.test(z)) return true;
    if (RE_YEN.test(line.zoneText)) return true;
    if (RE_BARE_NUMBER.test(z) && !/[A-Za-z]/.test(z.replace(/^[YyＹ]/, ''))) return true;
    return false;
  }

  // Parse one screenshot (lines from tsvToLines, screenshot pixel width).
  function parseScreenshot(lines, width) {
    const items = [];
    const summary = {};
    let store = null;
    let cur = null;
    let mode = 'idle'; // 'title' (store just seen) | 'inItem' | 'afterPrice'
    let prevWasTitle = false;
    const column = textColumnLeft(lines, width);

    const newItem = (line, fromStore) => ({
      title: cleanTitle(line.zoneTitle),
      titleLine: line,
      titleRaw: line.text,
      qtyInfo: parseQty(line.zoneText),
      store,
      fromStore,
      priceLine: null,
    });
    const closeCur = () => {
      if (cur && (cur.qtyInfo.found || cur.fromStore) && letters(cur.title) >= 2) items.push(cur);
      cur = null;
    };

    for (const line of lines) {
      annotate(line, width, column);
      const full = compact(line.text);
      const z = line.zoneCompact;
      const wasTitle = prevWasTitle;
      prevWasTitle = false;

      if (/商品总价|商品總價|商品总[^\d]{0,2}价/.test(full)) {
        const m = full.match(/共(\d+)件/);
        summary.count = m ? parseInt(m[1], 10) : null;
        summary.line = line;
        closeCur();
        mode = 'idle';
        continue;
      }
      const sn = storeName(full);
      if (sn) { store = sn; closeCur(); mode = 'title'; continue; }
      if (!z) continue; // only thumbnail junk on this line

      if (cur && !cur.priceLine && isPriceLine(line)) {
        cur.priceLine = line;
        items.push(cur);
        cur = null;
        mode = 'afterPrice';
        continue;
      }
      if (!cur && isPriceLine(line) && (mode === 'title' || (mode === 'afterPrice' && hasCouponMark(line)))) {
        // Price found but the title line was lost: keep the item and flag it.
        items.push({ title: '', titleLine: null, titleRaw: '', qtyInfo: { qty: 1, found: false, uncertain: true },
          store, fromStore: mode === 'title', priceLine: line, titleMissing: true });
        mode = 'afterPrice';
        continue;
      }

      const qtyLike = RE_QTY.test(line.zoneText) || RE_QTY_FUZZY.test(line.zoneText);
      if (qtyLike && letters(z) >= 2 && !RE_SPEC.test(z) && !RE_SKIP.test(z)) {
        closeCur();
        cur = newItem(line, mode === 'title');
        mode = 'inItem';
        prevWasTitle = true;
        continue;
      }

      if (mode === 'title' || mode === 'afterPrice') {
        if (RE_SKIP.test(z)) { mode = 'idle'; continue; }
        if (RE_TAG.test(z) || RE_SPEC.test(z) || letters(z) < 3) continue;
        closeCur();
        cur = newItem(line, mode === 'title');
        mode = 'inItem';
        prevWasTitle = true;
        continue;
      }

      if (mode === 'inItem' && cur && wasTitle && cur.qtyInfo.found && line.inZone && line.conf >= 55
          && !RE_SPEC.test(z) && !RE_TAG.test(z) && !RE_SKIP.test(z) && !/[:：]/.test(z)
          && letters(z) >= 2 && /[一-鿿]/.test(z)) {
        // Wrapped second line of the title.
        cur.title = joinWords([{ text: cur.title }, { text: cleanTitle(line.zoneTitle) }]);
        cur.titleRaw += ' / ' + line.text;
        continue;
      }
    }
    closeCur();
    return { items, summary };
  }

  // Extract prices from one OCR reading of a price line.
  function parsePrice(text, hasCoupon) {
    if (!text) return null;
    let t = text.replace(/[￥Ұ¥]/g, '¥').replace(/(^|[\s(])[YyＹ半光尖#*]\s?(?=\d)/g, '$1¥');
    const tokens = t.split(/\s+/).filter(Boolean);
    const hasYen = tokens.some((tok) => tok.includes('¥'));
    const nums = [];
    let seenYen = false;
    for (const tok of tokens) {
      if (hasYen && !seenYen && !tok.includes('¥')) continue;
      if (tok.includes('¥')) seenYen = true;
      const s = tok.includes('¥') ? tok.slice(tok.lastIndexOf('¥') + 1) : tok;
      const m = s.match(/^(\d{1,6})(?:[.,](\d{1,2}))?(?![\d])/);
      if (m) nums.push(parseFloat(m[1] + (m[2] ? '.' + m[2] : '')));
    }
    if (!nums.length) return null;
    if (hasCoupon) {
      if (nums.length >= 2) {
        const coupon = nums[0], pre = nums[nums.length - 1];
        if (pre > coupon && pre <= coupon * 2.5) return { pre, coupon, strong: true };
        // Implausible pair: the pre-coupon figure was misread, fall back to the coupon price.
        return { pre: coupon, coupon: null, strong: false };
      }
      return { pre: nums[0], coupon: null, strong: false };
    }
    return { pre: nums[nums.length - 1], coupon: null, strong: nums.length === 1 && nums[0] > 0 };
  }

  // Choose the best price among several OCR readings (ordered by preference).
  function choosePrice(candidates) {
    const valid = candidates.filter(Boolean);
    const vote = (list) => {
      const counts = new Map();
      for (const c of list) counts.set(c.pre, (counts.get(c.pre) || 0) + 1);
      let best = null;
      for (const c of list) {
        if (!best || counts.get(c.pre) > counts.get(best.pre)) best = c;
      }
      return best;
    };
    const strong = valid.filter((c) => c.strong);
    if (strong.length) {
      const b = vote(strong);
      const agree = valid.filter((c) => c.pre === b.pre).length;
      return { pre: b.pre, coupon: b.coupon, uncertain: agree < 2 && valid.length > 1 && !(strong.length >= 1 && valid.length === 1) };
    }
    if (valid.length) {
      const b = vote(valid);
      return { pre: b.pre, coupon: b.coupon, uncertain: true };
    }
    return { pre: null, coupon: null, uncertain: true };
  }

  function hasCouponMark(line) {
    return RE_COUPON.test(line.zoneCompact) || /券/.test(line.zoneCompact);
  }

  return {
    ZONE, tsvToLines, annotate, parseScreenshot, parsePrice, choosePrice, hasCouponMark,
    cleanTitle, joinWords, bbox, compact, isPriceLine, storeName,
  };
});
