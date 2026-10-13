/*
 * OCR engine glue. Runs inside a Blob worker (or on the main thread as a fallback)
 * after pako and the Tesseract core (tesseract-core-*.wasm.js) have been evaluated.
 * Exposes `TaobaoOcrEngine` with `init(langs)` and `recognize(req)`.
 */
var TaobaoOcrEngine = (function () {
  'use strict';
  var Module = null;
  var apis = {};

  function inflateIfGzip(data) {
    if (data[0] === 31 && data[1] === 139) return pako.inflate(data);
    return data;
  }

  async function init(langs) {
    if (!Module) {
      Module = await TesseractCore({ TesseractProgress: function () {} });
    }
    for (var lang in langs) {
      if (apis[lang]) continue;
      var data = inflateIfGzip(new Uint8Array(langs[lang]));
      Module.FS.writeFile('/' + lang + '.traineddata', data);
      var api = new Module.TessBaseAPI();
      var status = api.Init(null, lang, 1);
      if (status === -1) throw new Error('Tesseract init failed for ' + lang);
      api.SetVariable('preserve_interword_spaces', '1');
      apis[lang] = api;
    }
    return true;
  }

  function recognize(req) {
    var api = apis[req.lang];
    if (!api) throw new Error('language not loaded: ' + req.lang);
    api.SetVariable('tessedit_pageseg_mode', String(req.psm || 6));
    api.SetVariable('tessedit_char_whitelist', req.whitelist || '');
    Module.FS.writeFile('/input', new Uint8Array(req.png));
    var bad = api.SetImageFile(1, 0);
    if (bad === 1) throw new Error('Could not read image');
    if (req.rect) api.SetRectangle(req.rect.left, req.rect.top, req.rect.width, req.rect.height);
    api.Recognize(null);
    var out = { text: api.GetUTF8Text() };
    if (req.tsv) out.tsv = api.GetTSVText();
    return out;
  }

  return { init: init, recognize: recognize };
})();

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = async function (e) {
    var msg = e.data;
    try {
      if (msg.type === 'init') {
        await TaobaoOcrEngine.init(msg.langs);
        self.postMessage({ id: msg.id, ok: true });
      } else if (msg.type === 'recognize') {
        var res = TaobaoOcrEngine.recognize(msg);
        self.postMessage({ id: msg.id, ok: true, result: res });
      }
    } catch (err) {
      self.postMessage({ id: msg.id, ok: false, error: String(err && err.message || err) });
    }
  };
}
