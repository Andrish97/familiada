// familiada/logo-editor/js/text-pix.js
// Tryb: TEXT_PIX (contenteditable -> "screenshot" od góry -> 208x88 -> 150x70 bits)

export function initTextPixEditor(ctx) {
  const TYPE_PIX = "PIX_150x70";

  // DOM
  const paneTextPix = document.getElementById("paneTextPix");
  const rtEditor = document.getElementById("rtEditor");
  const pixWarn = document.getElementById("pixWarn");

  // Inline (per symbol)
  const selRtFont = document.getElementById("selRtFont");
  const inpRtSize = document.getElementById("inpRtSize");
  const inpRtLetter = document.getElementById("inpRtLetter");
  const btnRtBold = document.getElementById("btnRtBold");
  const btnRtItalic = document.getElementById("btnRtItalic");
  const btnRtUnderline = document.getElementById("btnRtUnderline");

  // Paragraph (per akapit)
  const inpRtLine = document.getElementById("inpRtLine");
  const inpRtPadTop = document.getElementById("inpRtPadTop");
  const inpRtPadBot = document.getElementById("inpRtPadBot");
  const btnRtAlignCycle = document.getElementById("btnRtAlignCycle");

  // “Screenshot look” (zostawiamy jeśli masz w UI; jak usuniesz blok, to i tak działa bez tego)
  const inpThresh = document.getElementById("inpThresh");     // próg 0..255
  const chkRtDither = document.getElementById("chkRtDither"); // dithering

  // Sizes
  const DOT_W = ctx.DOT_W; // 150
  const DOT_H = ctx.DOT_H; // 70
  const BIG_W = ctx.BIG_W || 208;
  const BIG_H = ctx.BIG_H || 88;

  // Helpers
  const show = (el, on) => { if (!el) return; el.style.display = on ? "" : "none"; };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function setBtnOn(btn, on) {
    if (!btn) return;
    btn.classList.toggle("on", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  // State
  let currentAlign = "center"; // left|center|right
  let cachedBits150 = new Uint8Array(DOT_W * DOT_H);
  let _deb = null;
  let _token = 0;

  // ---------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------
  function selectionInside() {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return false;
    let n = sel.anchorNode;
    if (!n) return false;
    if (n.nodeType === 3) n = n.parentNode;
    return !!(n && (n === rtEditor || n.closest?.("#rtEditor")));
  }

  function getRange() {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return null;
    return sel.getRangeAt(0);
  }

  function getCurrentP() {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return null;
    let n = sel.anchorNode;
    if (!n) return null;
    if (n.nodeType === 3) n = n.parentNode;
    return n?.closest ? n.closest("p") : null;
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------------------------------------------------------
  // Normalize: <p> zamiast przypadkowych div/br + usuń ZWSP
  // ---------------------------------------------------------
  function normalizeParagraphs() {
    if (!rtEditor) return;

    // usuń ZWSP (zero-width space)
    const walker = document.createTreeWalker(rtEditor, NodeFilter.SHOW_TEXT);
    const toFix = [];
    while (walker.nextNode()) {
      const t = walker.currentNode;
      if (t.nodeValue && t.nodeValue.includes("\u200b")) toFix.push(t);
    }
    for (const t of toFix) t.nodeValue = t.nodeValue.replaceAll("\u200b", "");

    const plain = String(rtEditor.textContent || "").replace(/\u00a0/g, " ").trim();
    if (!plain) { rtEditor.innerHTML = ""; return; }

    // jeśli są <p> – zostaw
    if (/<\s*p[\s>]/i.test(rtEditor.innerHTML)) return;

    // inaczej: z plain zrób akapity
    const lines = plain.split(/\n+/).map(s => s.trim()).filter(Boolean);
    rtEditor.innerHTML = lines.map(s => `<p>${esc(s)}</p>`).join("");
  }

  // ---------------------------------------------------------
  // INLINE (per symbol): font/size/letter-spacing + BIU
  // - BIU, fontName i fontSize robimy execCommand (stabilniejsze)
  // - letterSpacing robimy span-wrap (bo execCommand tego nie umie)
  // ---------------------------------------------------------
  function cmd(name, value = null) {
    if (!rtEditor) return;
    if (!selectionInside()) rtEditor.focus();
    try { document.execCommand(name, false, value); } catch {}
    ctx.markDirty?.();
  }

  // fontSize: execCommand używa 1..7 -> zamieniamy na px w <span>
  function pxToFontSizeLevel(px) {
    const map = [10, 13, 16, 18, 24, 32, 48];
    let best = 3, bestDiff = Infinity;
    for (let i = 0; i < map.length; i++) {
      const d = Math.abs(px - map[i]);
      if (d < bestDiff) { bestDiff = d; best = i + 1; }
    }
    return best;
  }

  function replaceFontTagsWithSpans(root, px) {
    if (!root) return;
    const fonts = root.querySelectorAll('font[size]');
    for (const f of fonts) {
      const span = document.createElement("span");
      span.style.fontSize = `${px}px`;
      while (f.firstChild) span.appendChild(f.firstChild);
      f.parentNode.replaceChild(span, f);
    }
  }

  // Span-wrap dla letter-spacing (per symbol)
  function applyInlineStyleSpan(styleObj) {
    if (!rtEditor) return;
    if (!selectionInside()) rtEditor.focus();

    const r = getRange();
    if (!r) return;

    // brak zaznaczenia -> “styl na pisanie”: wstaw ZWSP w spanie i ustaw kursor w środku
    if (r.collapsed) {
      const span = document.createElement("span");
      for (const [k, v] of Object.entries(styleObj)) span.style[k] = v;
      span.textContent = "\u200b";
      r.insertNode(span);

      const sel = window.getSelection();
      const nr = document.createRange();
      nr.setStart(span.firstChild, 1);
      nr.setEnd(span.firstChild, 1);
      sel.removeAllRanges();
      sel.addRange(nr);
      return;
    }

    // zaznaczenie -> owiń fragment w span
    const span = document.createElement("span");
    for (const [k, v] of Object.entries(styleObj)) span.style[k] = v;

    const frag = r.extractContents();
    span.appendChild(frag);
    r.insertNode(span);

    const sel = window.getSelection();
    const nr = document.createRange();
    nr.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(nr);
  }

  // ---------------------------------------------------------
  // PARAGRAPH (per akapit): lineHeight/margins/align
  // ---------------------------------------------------------
  function ensurePDefaults(p) {
    if (!p) return;
    if (!p.style.lineHeight) p.style.lineHeight = String(clamp(Number(inpRtLine?.value || 1.05), 0.6, 2.0));
    if (!p.style.textAlign) p.style.textAlign = currentAlign;
    if (!p.style.marginTop) p.style.marginTop = `${clamp(Number(inpRtPadTop?.value || 8), 0, 80)}px`;
    if (!p.style.marginBottom) p.style.marginBottom = `${clamp(Number(inpRtPadBot?.value || 8), 0, 80)}px`;
  }

  function applyInputsToP(p) {
    if (!p) return;
    ensurePDefaults(p);
    p.style.lineHeight = String(clamp(Number(inpRtLine?.value || 1.05), 0.6, 2.0));
    p.style.marginTop = `${clamp(Number(inpRtPadTop?.value || 8), 0, 80)}px`;
    p.style.marginBottom = `${clamp(Number(inpRtPadBot?.value || 8), 0, 80)}px`;
    p.style.textAlign = currentAlign;
  }

  function updateAlignButton() {
    if (!btnRtAlignCycle) return;
    btnRtAlignCycle.textContent = currentAlign === "left" ? "⇤" : currentAlign === "right" ? "⇥" : "⇆";
    btnRtAlignCycle.dataset.state = currentAlign;
  }

  // ---------------------------------------------------------
  // Word-like “mixed selection”:
  // - jeśli zaznaczenie ma różne wartości -> UI pokazuje pusto
  // - przy zmianie -> całość dostaje nową wartość
  // ---------------------------------------------------------
  function getSelectionTextNodesInEditor() {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return [];
    const r = sel.getRangeAt(0);
    if (r.collapsed) return [];
    if (!selectionInside()) return [];

    const walker = document.createTreeWalker(rtEditor, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.nodeValue || !n.nodeValue.trim()) continue;

      const nr = document.createRange();
      nr.selectNodeContents(n);

      // overlap check
      const endsBefore = nr.compareBoundaryPoints(Range.END_TO_START, r) <= 0;
      const startsAfter = nr.compareBoundaryPoints(Range.START_TO_END, r) >= 0;
      if (!endsBefore && !startsAfter) nodes.push(n);
    }
    return nodes;
  }

  function getUniformComputed(nodes, prop) {
    if (!nodes.length) return { uniform: true, value: null };
    let first = null;
    for (const n of nodes) {
      const el = n.parentElement || n.parentNode;
      if (!el || el.nodeType !== 1) continue;
      const v = getComputedStyle(el)[prop];
      if (first === null) first = v;
      else if (v !== first) return { uniform: false, value: null };
    }
    return { uniform: true, value: first };
  }

  function pickBestSelectFontFromComputed(computedFontFamily) {
    if (!selRtFont) return;
    const ff = String(computedFontFamily || "").toLowerCase();
    let best = selRtFont.value || "";
    for (const opt of Array.from(selRtFont.options || [])) {
      const v = String(opt.value || "");
      if (!v) continue;
      const head = v.toLowerCase().split(",")[0].trim().replace(/["']/g, "");
      if (head && ff.includes(head)) { best = opt.value; break; }
    }
    selRtFont.value = best;
  }

  // ---------------------------------------------------------
  // Toolbar sync (kursor / zaznaczenie)
  // ---------------------------------------------------------
  function syncUiFromSelection() {
    if (!selectionInside()) return;

    // BIU (per selection/cursor)
    try {
      setBtnOn(btnRtBold, !!document.queryCommandState("bold"));
      setBtnOn(btnRtItalic, !!document.queryCommandState("italic"));
      setBtnOn(btnRtUnderline, !!document.queryCommandState("underline"));
    } catch {}

    const sel = window.getSelection?.();
    const hasRange = !!(sel && sel.rangeCount > 0);
    const r = hasRange ? sel.getRangeAt(0) : null;
    const isMixedSelection = !!(r && !r.collapsed);

    // Inline UI: font / size / letterSpacing
    if (isMixedSelection) {
      const nodes = getSelectionTextNodesInEditor();

      // font
      const uf = getUniformComputed(nodes, "fontFamily");
      if (selRtFont) {
        if (!uf.uniform) selRtFont.value = "";
        else pickBestSelectFontFromComputed(uf.value);
      }

      // size
      const us = getUniformComputed(nodes, "fontSize");
      if (inpRtSize) {
        if (!us.uniform) inpRtSize.value = "";
        else {
          const px = Math.round(parseFloat(us.value) || 56);
          inpRtSize.value = String(clamp(px, 10, 140));
        }
      }

      // letter spacing (inline)
      const ul = getUniformComputed(nodes, "letterSpacing");
      if (inpRtLetter) {
        if (!ul.uniform) inpRtLetter.value = "";
        else {
          const px = Math.round(parseFloat(ul.value) || 0);
          inpRtLetter.value = String(clamp(px, 0, 20));
        }
      }
    } else {
      // cursor: bierzemy computed z elementu pod kursorem
      const p = getCurrentP();
      if (p) {
        ensurePDefaults(p);
        const csP = getComputedStyle(p);

        // paragraph UI
        const a = (p.style.textAlign || csP.textAlign || "center");
        currentAlign = (a === "left" || a === "right") ? a : "center";
        updateAlignButton();

        if (inpRtLine) {
          const lh = parseFloat(csP.lineHeight);
          const fs = parseFloat(csP.fontSize) || 16;
          const ratio = (Number.isFinite(lh) && lh > 0) ? (lh / fs) : Number(inpRtLine.value || 1.05);
          inpRtLine.value = String(clamp(Math.round(ratio * 100) / 100, 0.6, 2.0));
        }
        if (inpRtPadTop) inpRtPadTop.value = String(clamp(Math.round(parseFloat(csP.marginTop) || 0), 0, 80));
        if (inpRtPadBot) inpRtPadBot.value = String(clamp(Math.round(parseFloat(csP.marginBottom) || 0), 0, 80));
      }

      // inline computed: weź z elementu kursora
      let node = sel?.anchorNode || null;
      if (node && node.nodeType === 3) node = node.parentNode;
      const el = (node && node.nodeType === 1) ? node : null;
      if (el) {
        const cs = getComputedStyle(el);

        if (selRtFont) pickBestSelectFontFromComputed(cs.fontFamily);

        if (inpRtSize) {
          const px = Math.round(parseFloat(cs.fontSize) || 56);
          inpRtSize.value = String(clamp(px, 10, 140));
        }

        if (inpRtLetter) {
          const px = Math.round(parseFloat(cs.letterSpacing) || 0);
          inpRtLetter.value = String(clamp(px, 0, 20));
        }
      }
    }
  }

  // ---------------------------------------------------------
  // "Screenshot" pipeline:
  // 1) bierzemy width edytora
  // 2) height = width * (88/208)
  // 3) render do canvas (foreignObject) z overflow hidden (od góry)
  // 4) skala do 208x88
  // 5) binarize (próg / dithering)
  // 6) compress 208x88 -> 150x70
  // ---------------------------------------------------------
  function sanitizeHtml(html) {
    let s = String(html || "");
    s = s.replace(/<br\s*>/gi, "<br />");
    s = s.replace(/<hr\s*>/gi, "<hr />");
    // listy wycinamy
    s = s.replace(/<\/?(ul|ol)\b[^>]*>/gi, "");
    s = s.replace(/<li\b[^>]*>/gi, "<div>");
    s = s.replace(/<\/li>/gi, "</div>");
    return s;
  }

  function makeSvgDataUrlFromEditor(html, w, h, extraCss) {
    const css =
      `<style xmlns="http://www.w3.org/1999/xhtml">
        *{box-sizing:border-box;}
        html,body{margin:0;padding:0;background:#000;}
        #cap{width:${w}px;height:${h}px;overflow:hidden;background:#000;color:#fff;}
        /* akapity */
        p{margin:0;padding:0;}
        ${extraCss || ""}
      </style>`;

    const xhtml =
      `<div xmlns="http://www.w3.org/1999/xhtml" id="cap">
        ${css}
        <div style="padding:10px;white-space:pre-wrap;word-break:break-word;">
          ${html}
        </div>
      </div>`;

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
        <foreignObject x="0" y="0" width="${w}" height="${h}">
          ${xhtml}
        </foreignObject>
      </svg>`;

    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  async function renderSvgToCanvas(dataUrl, w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");

    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);

    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("foreignObject fail"));
      img.src = dataUrl;
    });

    g.drawImage(img, 0, 0);
    return c;
  }

  function canvasToLum(canvas, w, h) {
    const g = canvas.getContext("2d");
    const { data } = g.getImageData(0, 0, w, h);
    const lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const r = data[i * 4 + 0];
      const gg = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      lum[i] = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    }
    return lum;
  }

  function lumToBits(lum, w, h, threshold, dither) {
    const out = new Uint8Array(w * h);

    if (!dither) {
      for (let i = 0; i < out.length; i++) out[i] = lum[i] >= threshold ? 1 : 0;
      return out;
    }

    const buf = new Float32Array(lum);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const oldv = buf[i];
      const newv = oldv >= threshold ? 255 : 0;
      out[i] = newv ? 1 : 0;
      const err = oldv - newv;

      if (x + 1 < w) buf[i + 1] += err * (7 / 16);
      if (y + 1 < h) {
        if (x > 0) buf[i + w - 1] += err * (3 / 16);
        buf[i + w] += err * (5 / 16);
        if (x + 1 < w) buf[i + w + 1] += err * (1 / 16);
      }
    }
    return out;
  }

  function compress208x88to150x70(bits208) {
    // usuwa “pasy” odpowiadające przerwom w symulacji kropek (jak wcześniej)
    const out = new Uint8Array(DOT_W * DOT_H);
    let oy = 0;
    for (let y = 0; y < BIG_H; y++) {
      const my = y % 9;
      if (my === 7 || my === 8) continue;

      let ox = 0;
      for (let x = 0; x < BIG_W; x++) {
        const mx = x % 7;
        if (mx === 5 || mx === 6) continue;

        out[oy * DOT_W + ox] = bits208[y * BIG_W + x] ? 1 : 0;
        ox++;
      }
      oy++;
    }
    return out;
  }

  function bitsBoundingBox(bits, w, h) {
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!bits[y * w + x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    if (maxX < 0) return null;
    return { minX, minY, maxX, maxY };
  }

  function looksClipped(box, w, h, pad = 0) {
    if (!box) return false;
    return box.minX <= pad || box.minY <= pad || box.maxX >= (w - 1 - pad) || box.maxY >= (h - 1 - pad);
  }

  async function compileToBits150() {
    normalizeParagraphs();

    const plain = String(rtEditor?.textContent || "").replace(/\u00a0/g, " ").trim();
    if (!plain) return { bits150: new Uint8Array(DOT_W * DOT_H), clipped: false };

    // 1) weź szerokość edytora i policz wysokość wg proporcji 208x88
    const wCss = Math.max(1, Math.floor(rtEditor?.clientWidth || 1));
    const hCss = Math.max(1, Math.floor(wCss * (BIG_H / BIG_W)));

    // 2) renderujemy w 2x dla jakości (a potem i tak zeskalujemy do 208x88)
    const W2 = wCss * 2;
    const H2 = hCss * 2;

    const html = sanitizeHtml(String(rtEditor?.innerHTML || ""));

    // CSS screenshotu: chcemy od góry, overflow hidden, padding jak w UI
    // Uwaga: sam tekst ma style inline i w <p>/<span>, więc nie potrzebujemy tu fontów bazowych
    const dataUrl = makeSvgDataUrlFromEditor(html, W2, H2, "");

    let capCanvas;
    try {
      capCanvas = await renderSvgToCanvas(dataUrl, W2, H2);
    } catch {
      return { bits150: new Uint8Array(DOT_W * DOT_H), clipped: false, failed: true };
    }

    // 3) normalizujemy do 208x88 (też w 2x -> potem dithering działa lepiej)
    const norm2 = document.createElement("canvas");
    norm2.width = BIG_W * 2;
    norm2.height = BIG_H * 2;
    const ng = norm2.getContext("2d");
    ng.imageSmoothingEnabled = true;
    ng.fillStyle = "#000";
    ng.fillRect(0, 0, norm2.width, norm2.height);
    ng.drawImage(capCanvas, 0, 0, norm2.width, norm2.height);

    // 4) downsample 2x -> 208x88 luminance
    const down = document.createElement("canvas");
    down.width = BIG_W;
    down.height = BIG_H;
    const dg = down.getContext("2d");
    dg.imageSmoothingEnabled = true;
    dg.drawImage(norm2, 0, 0, BIG_W, BIG_H);

    const lum = canvasToLum(down, BIG_W, BIG_H);

    // 5) próg / dithering (jeśli te kontrolki istnieją; jak nie ma, bierzemy sensowne domyślne)
    const threshold = inpThresh ? clamp(Number(inpThresh.value || 128), 0, 255) : 128;
    const dither = chkRtDither ? !!chkRtDither.checked : true;

    const bits208 = lumToBits(lum, BIG_W, BIG_H, threshold, dither);
    const bits150 = compress208x88to150x70(bits208);

    const box = bitsBoundingBox(bits150, DOT_W, DOT_H);
    const clipped = looksClipped(box, DOT_W, DOT_H, 0);

    return { bits150, clipped };
  }

  async function updatePreviewAsync() {
    const t = ++_token;
    const res = await compileToBits150();
    if (t !== _token) return;

    if (res.failed) {
      cachedBits150 = new Uint8Array(DOT_W * DOT_H);
      ctx.onPreview?.({ kind: "PIX", bits: cachedBits150 });
      if (pixWarn) {
        pixWarn.textContent = "Nie udało się zrobić screena (foreignObject). Ta przeglądarka może tego nie wspierać.";
        show(pixWarn, true);
      }
      return;
    }

    cachedBits150 = res.bits150;
    ctx.onPreview?.({ kind: "PIX", bits: cachedBits150 });

    if (pixWarn) {
      if (res.clipped) {
        pixWarn.textContent = "Wygląda na ucięte — zmniejsz rozmiar, skróć tekst albo zmień interlinię/odstępy.";
        show(pixWarn, true);
      } else {
        show(pixWarn, false);
      }
    }
  }

  function schedulePreview(ms = 120) {
    clearTimeout(_deb);
    _deb = setTimeout(() => updatePreviewAsync(), ms);
  }

  // ---------------------------------------------------------
  // EVENTS (jednorazowo)
  // ---------------------------------------------------------
  function bindOnce() {
    // BIU (toggle)
    btnRtBold?.addEventListener("click", () => { cmd("bold"); schedulePreview(80); syncUiFromSelection(); });
    btnRtItalic?.addEventListener("click", () => { cmd("italic"); schedulePreview(80); syncUiFromSelection(); });
    btnRtUnderline?.addEventListener("click", () => { cmd("underline"); schedulePreview(80); syncUiFromSelection(); });

    // Align (per paragraph)
    btnRtAlignCycle?.addEventListener("click", () => {
      currentAlign = currentAlign === "left" ? "center" : currentAlign === "center" ? "right" : "left";
      updateAlignButton();
      const p = getCurrentP();
      if (p) p.style.textAlign = currentAlign;
      ctx.markDirty?.();
      schedulePreview(80);
      syncUiFromSelection();
    });
    updateAlignButton();

    // Font (per symbol)
    selRtFont?.addEventListener("change", () => {
      // jeśli w UI masz opcję value="" (mixed) to tu też działa
      const ff = String(selRtFont.value || "");
      if (!ff) return; // mixed -> użytkownik musi wybrać konkretną
      const primary = ff.split(",")[0].trim().replace(/^["']|["']$/g, "");
      cmd("fontName", primary);
      schedulePreview(120);
      syncUiFromSelection();
    });

    // Size (per symbol)
    inpRtSize?.addEventListener("input", () => {
      const raw = String(inpRtSize.value || "");
      if (!raw.trim()) return; // mixed -> dopiero jak wpisze liczbę
      const px = clamp(Number(raw), 10, 140);
      inpRtSize.value = String(px);

      if (!selectionInside()) return;
      const level = pxToFontSizeLevel(px);
      cmd("fontSize", String(level));
      replaceFontTagsWithSpans(rtEditor, px);

      schedulePreview(120);
      syncUiFromSelection();
    });

    // Letter spacing (per symbol)
    inpRtLetter?.addEventListener("input", () => {
      const raw = String(inpRtLetter.value || "");
      if (!raw.trim()) return; // mixed
      const px = clamp(Number(raw), 0, 20);
      inpRtLetter.value = String(px);

      if (!selectionInside()) return;
      applyInlineStyleSpan({ letterSpacing: `${px}px` });
      ctx.markDirty?.();
      schedulePreview(120);
      syncUiFromSelection();
    });

    // Paragraph controls
    const bindPara = (el, min, max) => {
      el?.addEventListener("input", () => {
        const v = clamp(Number(el.value || 0), min, max);
        el.value = String(v);
        if (!selectionInside()) return;
        const p = getCurrentP();
        if (p) applyInputsToP(p);
        ctx.markDirty?.();
        schedulePreview(140);
        syncUiFromSelection();
      });
    };

    bindPara(inpRtLine, 0.6, 2.0);
    bindPara(inpRtPadTop, 0, 80);
    bindPara(inpRtPadBot, 0, 80);

    // “Screenshot look” (opcjonalne)
    inpThresh?.addEventListener("input", () => {
      inpThresh.value = String(clamp(Number(inpThresh.value || 128), 0, 255));
      ctx.markDirty?.();
      schedulePreview(80);
    });

    chkRtDither?.addEventListener("change", () => {
      ctx.markDirty?.();
      schedulePreview(80);
    });

    // Typing / content changes
    rtEditor?.addEventListener("input", () => {
      ctx.markDirty?.();
      normalizeParagraphs();
      // domyślnie dopnij paragrafowe style do akapitu kursora
      const p = getCurrentP();
      if (p) applyInputsToP(p);
      schedulePreview(120);
      syncUiFromSelection();
    });

    // UI sync on selection move
    document.addEventListener("selectionchange", () => {
      if (!selectionInside()) return;
      syncUiFromSelection();
    });
    rtEditor?.addEventListener("mouseup", syncUiFromSelection);
    rtEditor?.addEventListener("keyup", syncUiFromSelection);
    rtEditor?.addEventListener("focus", syncUiFromSelection);
  }

  bindOnce();

  // ---------------------------------------------------------
  // API
  // ---------------------------------------------------------
  return {
    open() {
      show(paneTextPix, true);

      if (rtEditor) rtEditor.innerHTML = "";
      currentAlign = "center";
      updateAlignButton();

      ctx.clearDirty?.();
      cachedBits150 = new Uint8Array(DOT_W * DOT_H);
      ctx.onPreview?.({ kind: "PIX", bits: cachedBits150 });

      show(pixWarn, false);

      // toolbar reset (na start bez zaznaczenia)
      setBtnOn(btnRtBold, false);
      setBtnOn(btnRtItalic, false);
      setBtnOn(btnRtUnderline, false);

      // mixed wartości na start: nie
      if (selRtFont && !selRtFont.value) {
        // nic
      }
      if (inpRtSize) inpRtSize.value = String(inpRtSize.value || 56);
      if (inpRtLetter) inpRtLetter.value = String(inpRtLetter.value || 0);

      schedulePreview(50);
    },

    close() {
      show(paneTextPix, false);
    },

    async getCreatePayload() {
      await updatePreviewAsync();
      return {
        ok: true,
        type: TYPE_PIX,
        payload: {
          w: DOT_W,
          h: DOT_H,
          format: "BITPACK_MSB_FIRST_ROW_MAJOR",
          bits_b64: ctx.packBitsRowMajorMSB(cachedBits150, DOT_W, DOT_H),
        },
      };
    },
  };
}
