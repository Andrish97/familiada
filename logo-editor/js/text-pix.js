// familiada/logo-editor/js/text-pix.js
// Tryb: TEXT_PIX (contenteditable -> "screen" screenshot z gory -> 208x88 -> 150x70 bits)
//
// ZAŁOŻENIA (zgodnie z ustaleniami):
// - Edytor działa "jak Word": BIU/font/rozmiar per znak (zaznaczenie albo kursor), a linia/odstępy/wyrównanie per akapit.
// - UI ma być aktualizowane na bieżąco z kursora/zaznaczenia.
// - Render: bierzemy SZEROKOŚĆ edytora (rtStage / rtEditor), wyliczamy WYSOKOŚĆ tak, by proporcja była 208x88,
//   robimy "screenshot" od GÓRY (bez scrollowania do góry na siłę), zamieniamy na 208x88, potem kompres 208x88 -> 150x70.
// - Kontrastu/progu NIE MA w UI (możesz później dodać inne "ustawienia screena").
// - Brak zewnętrznych bibliotek: używamy SVG foreignObject jako "screen".

export function initTextPixEditor(ctx) {
  const TYPE_PIX = "PIX_150x70";

  // DOM
  const paneTextPix = document.getElementById("paneTextPix");
  const rtEditor = document.getElementById("rtEditor");
  const pixWarn = document.getElementById("pixWarn");

  const selRtFont = document.getElementById("selRtFont");
  const inpRtSize = document.getElementById("inpRtSize");
  const inpRtLine = document.getElementById("inpRtLine");
  const inpRtLetter = document.getElementById("inpRtLetter");
  const inpRtPadTop = document.getElementById("inpRtPadTop");
  const inpRtPadBot = document.getElementById("inpRtPadBot");

  const btnRtBold = document.getElementById("btnRtBold");
  const btnRtItalic = document.getElementById("btnRtItalic");
  const btnRtUnderline = document.getElementById("btnRtUnderline");
  const btnRtAlignCycle = document.getElementById("btnRtAlignCycle");

  // wymiary docelowe (logo)
  const DOT_W = ctx.DOT_W; // 150
  const DOT_H = ctx.DOT_H; // 70
  const BIG_W = 208;
  const BIG_H = 88;

  // helpers
  const show = (el, on) => { if (el) el.style.display = on ? "" : "none"; };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function setBtnOn(btn, on) {
    if (!btn) return;
    btn.classList.toggle("on", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  // state
  let currentAlign = "center";
  let cachedBits150 = new Uint8Array(DOT_W * DOT_H);

  let _deb = null;
  let _token = 0;
  let _bound = false;

  // =============================
  // Selection utilities (Word-ish)
  // =============================
  function selectionInside() {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return false;
    let node = sel.anchorNode;
    if (!node) return false;
    if (node.nodeType === 3) node = node.parentNode;
    return !!(node && (node === rtEditor || node.closest?.("#rtEditor")));
  }

  function getRange() {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return null;
    return sel.getRangeAt(0);
  }

  function getSelectionElement() {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return null;
    let node = sel.anchorNode;
    if (!node) return null;
    if (node.nodeType === 3) node = node.parentNode;
    return node;
  }

  function getCurrentParagraph() {
    const el = getSelectionElement();
    if (!el) return null;
    // akapit = najbliższy <p> (albo wymuszony kontener w normalize)
    return el.closest ? el.closest("p") : null;
  }

  // =============================
  // DOM normalization (akapit jako <p>)
  // =============================
  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function removeZWSP(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const toFix = [];
    while (walker.nextNode()) {
      const t = walker.currentNode;
      if (t.nodeValue && t.nodeValue.includes("\u200b")) toFix.push(t);
    }
    for (const t of toFix) t.nodeValue = t.nodeValue.replaceAll("\u200b", "");
  }

  // Zamieniamy top-level dzieci na <p>, a <div> też na <p>.
  // Nie robimy tu "magii" ze stylami – style są inline na elementach, więc przetrwają.
  function normalizeParagraphs() {
    if (!rtEditor) return;

    removeZWSP(rtEditor);

    // jeśli pusto -> zostaw pusto
    const plain = String(rtEditor.textContent || "").replace(/\u00a0/g, " ").trim();
    if (!plain) { rtEditor.innerHTML = ""; return; }

    // Jeśli już są <p> jako dzieci, to tylko popraw <div> w środku.
    // Jeśli nie ma żadnego <p>, to owijamy linie w <p>.
    const hasP = /<\s*p[\s>]/i.test(rtEditor.innerHTML);
    if (!hasP) {
      const lines = plain.split(/\n+/).map(s => s.trim()).filter(Boolean);
      rtEditor.innerHTML = lines.map(s => `<p>${esc(s)}</p>`).join("");
      return;
    }

    // Konwersja: <div> top-level -> <p>
    const kids = Array.from(rtEditor.childNodes);
    for (const n of kids) {
      if (n.nodeType === 1) {
        const tag = n.tagName?.toLowerCase();
        if (tag === "div") {
          const p = document.createElement("p");
          // przenieś atrybuty stylu (inline)
          if (n.getAttribute("style")) p.setAttribute("style", n.getAttribute("style"));
          while (n.firstChild) p.appendChild(n.firstChild);
          rtEditor.replaceChild(p, n);
        }
      } else if (n.nodeType === 3) {
        // text node na top-level -> wrap w <p>
        const p = document.createElement("p");
        p.textContent = n.nodeValue || "";
        rtEditor.replaceChild(p, n);
      }
    }
  }

  // =============================
  // Inline style (per-znak) – bez google, bez "zgadywania"
  // =============================
  function applyInlineStyle(styleObj) {
    if (!rtEditor) return;
    if (!selectionInside()) rtEditor.focus();

    const r = getRange();
    if (!r) return;

    // jeśli zakres pusty (kursor) -> wstawiamy "caret span" z ZWSP,
    // żeby nowe znaki dziedziczyły styl
    if (r.collapsed) {
      const span = document.createElement("span");
      for (const [k, v] of Object.entries(styleObj)) span.style[k] = v;
      span.textContent = "\u200b";
      r.insertNode(span);

      // ustaw kursor ZA ZWSP wewnątrz spana
      const sel = window.getSelection();
      const nr = document.createRange();
      nr.setStart(span.firstChild, 1);
      nr.setEnd(span.firstChild, 1);
      sel.removeAllRanges();
      sel.addRange(nr);
      return;
    }

    // zakres zaznaczenia -> wrap w span
    const span = document.createElement("span");
    for (const [k, v] of Object.entries(styleObj)) span.style[k] = v;

    const frag = r.extractContents();
    span.appendChild(frag);
    r.insertNode(span);

    // zostaw zaznaczenie na tym spanie
    const sel = window.getSelection();
    const nr = document.createRange();
    nr.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(nr);
  }

  function applyFontToSelection(fontFamily) {
    applyInlineStyle({ fontFamily });
  }

  function applySizeToSelection(px) {
    applyInlineStyle({ fontSize: `${px}px` });
  }

  // =============================
  // Paragraph style (per-akapit)
  // =============================
  function ensurePDefaults(p) {
    if (!p) return;

    // UWAGA: tu nie narzucamy font/size – to jest per znak.
    if (!p.style.lineHeight) p.style.lineHeight = String(clamp(Number(inpRtLine?.value || 1.05), 0.6, 2.0));
    if (!p.style.letterSpacing) p.style.letterSpacing = `${clamp(Number(inpRtLetter?.value || 0), 0, 10)}px`;
    if (!p.style.textAlign) p.style.textAlign = currentAlign;
    if (!p.style.marginTop) p.style.marginTop = `${clamp(Number(inpRtPadTop?.value || 8), 0, 80)}px`;
    if (!p.style.marginBottom) p.style.marginBottom = `${clamp(Number(inpRtPadBot?.value || 8), 0, 80)}px`;
  }

  function applyInputsToParagraph(p) {
    if (!p) return;
    ensurePDefaults(p);

    p.style.lineHeight = String(clamp(Number(inpRtLine?.value || 1.05), 0.6, 2.0));
    p.style.letterSpacing = `${clamp(Number(inpRtLetter?.value || 0), 0, 10)}px`;
    p.style.marginTop = `${clamp(Number(inpRtPadTop?.value || 8), 0, 80)}px`;
    p.style.marginBottom = `${clamp(Number(inpRtPadBot?.value || 8), 0, 80)}px`;
    p.style.textAlign = currentAlign;
  }

  function updateAlignButton() {
    if (!btnRtAlignCycle) return;
    btnRtAlignCycle.textContent =
      currentAlign === "left" ? "⇤" :
      currentAlign === "right" ? "⇥" : "⇆";
    btnRtAlignCycle.dataset.state = currentAlign;
  }

  // =============================
  // Toolbar sync (kursor/zaznaczenie -> UI)
  // =============================
  function pickBestSelectFontFromComputed(fontFamilyComputed) {
    if (!selRtFont) return;
    const ff = String(fontFamilyComputed || "").toLowerCase();
    let best = selRtFont.value || "";
    for (const opt of Array.from(selRtFont.options)) {
      const ov = String(opt.value || "").toLowerCase();
      const head = ov.split(",")[0]?.trim().replace(/['"]/g, "");
      if (head && ff.includes(head)) { best = opt.value; break; }
    }
    if (best) selRtFont.value = best;
  }

  function syncUiFromSelection() {
    if (!selectionInside()) return;

    // BIU
    try {
      setBtnOn(btnRtBold, !!document.queryCommandState("bold"));
      setBtnOn(btnRtItalic, !!document.queryCommandState("italic"));
      setBtnOn(btnRtUnderline, !!document.queryCommandState("underline"));
    } catch {
      // execCommand bywa kapryśny w niektórych webview – wtedy zostawiamy.
    }

    // Rozmiar / font per znak: bierzemy computed z elementu przy kursorze
    const el = getSelectionElement();
    if (el) {
      const cs = getComputedStyle(el);
      const fs = Math.round(parseFloat(cs.fontSize) || 56);
      if (inpRtSize) inpRtSize.value = String(clamp(fs, 10, 140));
      pickBestSelectFontFromComputed(cs.fontFamily);
    }

    // Akapit
    const p = getCurrentParagraph();
    if (p) {
      ensurePDefaults(p);
      const cs = getComputedStyle(p);

      // align
      const a = (p.style.textAlign || cs.textAlign || "center");
      currentAlign = (a === "left" || a === "right") ? a : "center";
      updateAlignButton();

      // line-height: może być "normal"
      const lhPx = parseFloat(cs.lineHeight);
      const fsPx = parseFloat(cs.fontSize) || 56;
      if (Number.isFinite(lhPx) && Number.isFinite(fsPx) && fsPx > 0) {
        const rel = lhPx / fsPx;
        if (inpRtLine) inpRtLine.value = String(clamp(Math.round(rel * 100) / 100, 0.6, 2.0));
      }

      const ls = parseFloat(cs.letterSpacing);
      if (Number.isFinite(ls)) {
        if (inpRtLetter) inpRtLetter.value = String(clamp(Math.round(ls), 0, 10));
      }

      const mt = Math.round(parseFloat(cs.marginTop) || 0);
      const mb = Math.round(parseFloat(cs.marginBottom) || 0);
      if (inpRtPadTop) inpRtPadTop.value = String(clamp(mt, 0, 80));
      if (inpRtPadBot) inpRtPadBot.value = String(clamp(mb, 0, 80));
    }
  }

  // =============================
  // SCREENSHOT pipeline: editor -> 208x88 -> bits -> compress -> 150x70
  // =============================

  function sanitizeHtmlForForeignObject(html) {
    let s = String(html || "");
    s = s.replace(/<br\s*>/gi, "<br />");
    s = s.replace(/<hr\s*>/gi, "<hr />");
    // listy wycinamy – nie mamy UI do list (a i tak robią miny)
    s = s.replace(/<\/?(ul|ol)\b[^>]*>/gi, "");
    s = s.replace(/<li\b[^>]*>/gi, "<div>");
    s = s.replace(/<\/li>/gi, "</div>");
    return s;
  }

  function makeSvgDataUrlForScreen(htmlInner, w, h, scrollTopPx) {
    // "screen" = viewport o wysokości h, od góry (scrollTop)
    // Robimy wrapper z transform: translateY(-scrollTop), overflow hidden.
    // UWAGA: większość stylu jest inline w DOM (span/p), a resztę dopinamy minimalnym CSS resetem.
    const style =
      `<style xmlns="http://www.w3.org/1999/xhtml">` +
        `*{box-sizing:border-box;}` +
        `html,body{margin:0;padding:0;}` +
        `p{margin:0;}` +
        `div{margin:0;padding:0;}` +
      `</style>`;

    const xhtml =
      `<div xmlns="http://www.w3.org/1999/xhtml" style="` +
        `width:${w}px;height:${h}px;` +
        `background:#000;color:#fff;` +
        `overflow:hidden;` +
      `">` +
        style +
        `<div style="` +
          `transform:translateY(${-scrollTopPx}px);` +
          `padding:10px;` +               // to samo co w CSS edytora
          `white-space:pre-wrap;` +
          `word-break:break-word;` +
        `">` +
          htmlInner +
        `</div>` +
      `</div>`;

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
        `<foreignObject x="0" y="0" width="${w}" height="${h}">` +
          xhtml +
        `</foreignObject>` +
      `</svg>`;

    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  async function renderScreenToCanvas(htmlInner, w, h, scrollTopPx) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const g = canvas.getContext("2d");
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);

    const url = makeSvgDataUrlForScreen(htmlInner, w, h, scrollTopPx);

    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("Nie mogę zrobić screena (foreignObject)."));
      img.src = url;
    });

    g.drawImage(img, 0, 0);
    return canvas;
  }

  function drawScaledToBig(srcCanvas) {
    // Skaluje screenshot (w x h) do 208x88.
    // Celowo bez smoothing off: text jest antyaliasowany, potem i tak zrobimy binarkę.
    const c = document.createElement("canvas");
    c.width = BIG_W;
    c.height = BIG_H;
    const g = c.getContext("2d");
    g.fillStyle = "#000";
    g.fillRect(0, 0, BIG_W, BIG_H);
    g.drawImage(srcCanvas, 0, 0, BIG_W, BIG_H);
    return c;
  }

  // Otsu (auto próg) na 0..255
  function otsuThresholdFromLuma(lum) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < lum.length; i++) {
      const v = lum[i] | 0;
      hist[v < 0 ? 0 : v > 255 ? 255 : v] += 1;
    }

    const total = lum.length;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];

    let sumB = 0;
    let wB = 0;
    let wF = 0;

    let varMax = -1;
    let threshold = 128;

    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      wF = total - wB;
      if (wF === 0) break;

      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;

      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > varMax) {
        varMax = between;
        threshold = t;
      }
    }
    // dla białego tekstu na czarnym tle Otsu bywa zbyt nisko – podbijamy minimalnie
    return clamp(threshold + 10, 40, 220);
  }

  function canvasToBits208(canvas208) {
    const g = canvas208.getContext("2d");
    const { data } = g.getImageData(0, 0, BIG_W, BIG_H);

    const lum = new Uint8Array(BIG_W * BIG_H);
    for (let i = 0; i < BIG_W * BIG_H; i++) {
      const r = data[i * 4 + 0];
      const gg = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      lum[i] = (0.2126 * r + 0.7152 * gg + 0.0722 * b) | 0;
    }

    const thr = otsuThresholdFromLuma(lum);

    const out = new Uint8Array(BIG_W * BIG_H);
    for (let i = 0; i < out.length; i++) {
      // białe znaki => "1"
      out[i] = lum[i] >= thr ? 1 : 0;
    }
    return out;
  }

  function compress208x88to150x70(bits208) {
    // to jest 1:1 jak w Twoich wcześniejszych wersjach
    const out = new Uint8Array(DOT_W * DOT_H);
    let oy = 0;
    for (let y = 0; y < BIG_H; y++) {
      const my = y % 9;
      if (my === 7 || my === 8) continue; // wyrzucamy 2 rzędy "przerwy" na tile

      let ox = 0;
      for (let x = 0; x < BIG_W; x++) {
        const mx = x % 7;
        if (mx === 5 || mx === 6) continue; // wyrzucamy 2 kolumny przerwy na tile
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

  function getEditorScreenSize() {
    // bierzemy szerokość "ekranu" (rtStage) jeśli jest, inaczej samego edytora
    const stage = rtEditor?.closest?.(".rtStage");
    const w = Math.max(1, Math.floor((stage?.clientWidth || rtEditor?.clientWidth || 1)));
    const h = Math.max(1, Math.floor(w * (BIG_H / BIG_W)));
    return { w, h };
  }

  async function compileToBits150() {
    normalizeParagraphs();

    const plain = String(rtEditor?.textContent || "").replace(/\u00a0/g, " ").trim();
    if (!plain) return { bits150: new Uint8Array(DOT_W * DOT_H), clipped: false, empty: true };

    const html = sanitizeHtmlForForeignObject(String(rtEditor?.innerHTML || ""));

    // "screen" = od góry, tak jak użytkownik widzi (rtEditor.scrollTop)
    const { w, h } = getEditorScreenSize();
    const scrollTop = rtEditor ? (rtEditor.scrollTop || 0) : 0;

    // Dla lepszej jakości: renderujemy w 2x i potem skalujemy do 208x88
    // (to zastępuje dithering/threshold slider – efekt jest stabilniejszy)
    const hiW = w * 2;
    const hiH = h * 2;

    let screenCanvas;
    try {
      screenCanvas = await renderScreenToCanvas(html, hiW, hiH, scrollTop * 2);
    } catch (e) {
      return { bits150: new Uint8Array(DOT_W * DOT_H), clipped: false, failed: true, err: e };
    }

    const scaled = drawScaledToBig(screenCanvas);
    const bits208 = canvasToBits208(scaled);
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
        pixWarn.textContent =
          "Nie mogę zrobić screena tekstu w tej przeglądarce (foreignObject).";
        show(pixWarn, true);
      }
      return;
    }

    cachedBits150 = res.bits150;
    ctx.onPreview?.({ kind: "PIX", bits: cachedBits150 });

    if (pixWarn) {
      if (res.clipped) {
        pixWarn.textContent =
          "Wygląda na ucięte u góry/dole lub po bokach. Zmniejsz rozmiar albo skróć tekst (albo przewiń w edytorze).";
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

  // =============================
  // Binding (raz)
  // =============================
  function bindOnce() {
    if (_bound) return;
    _bound = true;

    // BIU: klasycznie execCommand (działa na zaznaczenie/kursor)
    const cmd = (name) => {
      if (!rtEditor) return;
      if (!selectionInside()) rtEditor.focus();
      try { document.execCommand(name, false, null); } catch {}
      ctx.markDirty?.();
      schedulePreview(80);
      syncUiFromSelection();
    };

    btnRtBold?.addEventListener("click", () => cmd("bold"));
    btnRtItalic?.addEventListener("click", () => cmd("italic"));
    btnRtUnderline?.addEventListener("click", () => cmd("underline"));

    // Align per akapit
    btnRtAlignCycle?.addEventListener("click", () => {
      currentAlign =
        currentAlign === "left" ? "center" :
        currentAlign === "center" ? "right" : "left";
      updateAlignButton();

      const p = getCurrentParagraph();
      if (p) p.style.textAlign = currentAlign;

      ctx.markDirty?.();
      schedulePreview(80);
      syncUiFromSelection();
    });

    // Font per zaznaczenie/kursor
    selRtFont?.addEventListener("change", () => {
      const ff = String(selRtFont.value || "system-ui, sans-serif");
      applyFontToSelection(ff);
      ctx.markDirty?.();
      schedulePreview(120);
      syncUiFromSelection();
    });

    // Size per zaznaczenie/kursor
    inpRtSize?.addEventListener("input", () => {
      const px = clamp(Number(inpRtSize.value || 56), 10, 140);
      inpRtSize.value = String(px);
      if (!selectionInside()) return;
      applySizeToSelection(px);
      ctx.markDirty?.();
      schedulePreview(120);
      syncUiFromSelection();
    });

    // Per paragraph inputs
    const bindPara = (el, min, max) => {
      el?.addEventListener("input", () => {
        const v = clamp(Number(el.value || 0), min, max);
        el.value = String(v);
        if (!selectionInside()) return;
        const p = getCurrentParagraph();
        if (p) applyInputsToParagraph(p);
        ctx.markDirty?.();
        schedulePreview(140);
        syncUiFromSelection();
      });
    };

    bindPara(inpRtLine, 0.6, 2.0);
    bindPara(inpRtLetter, 0, 10);
    bindPara(inpRtPadTop, 0, 80);
    bindPara(inpRtPadBot, 0, 80);

    // Edycja treści -> normalizacja -> dopnij style do bieżącego akapitu
    rtEditor?.addEventListener("input", () => {
      ctx.markDirty?.();
      normalizeParagraphs();
      const p = getCurrentParagraph();
      if (p) applyInputsToParagraph(p);
      schedulePreview(120);
      syncUiFromSelection();
    });

    // "Word": UI śledzi selekcję/kursor
    document.addEventListener("selectionchange", () => {
      if (!selectionInside()) return;
      syncUiFromSelection();
    });
    rtEditor?.addEventListener("mouseup", syncUiFromSelection);
    rtEditor?.addEventListener("keyup", syncUiFromSelection);
    rtEditor?.addEventListener("focus", syncUiFromSelection);

    // Scroll w edytorze wpływa na "screenshot od góry" (viewport)
    rtEditor?.addEventListener("scroll", () => {
      // nie markDirty, bo scroll nie zmienia treści — ale zmienia screen
      schedulePreview(60);
    });

    // Start align button
    updateAlignButton();
  }

  bindOnce();

  // =============================
  // Public API
  // =============================
  return {
    open() {
      show(paneTextPix, true);

      if (rtEditor) {
        rtEditor.innerHTML = "";
        rtEditor.scrollTop = 0;
      }

      currentAlign = "center";
      updateAlignButton();

      ctx.clearDirty?.();

      cachedBits150 = new Uint8Array(DOT_W * DOT_H);
      ctx.onPreview?.({ kind: "PIX", bits: cachedBits150 });
      show(pixWarn, false);

      // reset BIU UI
      setBtnOn(btnRtBold, false);
      setBtnOn(btnRtItalic, false);
      setBtnOn(btnRtUnderline, false);

      // pierwszy sync (na wypadek gdy focus już jest)
      syncUiFromSelection();

      // od razu podgląd pustego/początkowego
      schedulePreview(0);
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
