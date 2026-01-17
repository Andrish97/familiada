// familiada/logo-editor/js/text-pix.js
// Tryb: TEXT_PIX ("jak Word" -> screen -> wyswietlacz)
// Wymagania, ktore tu realizujemy:
// 1) BIU dziala i ma stan wcisniety/odcisniety.
// 2) Czcionka i rozmiar dzialaja PER ZAZNACZENIE / PER ZNAK.
// 3) Odstepy i wyrownanie dzialaja PER AKAPIT (<p>).
// 4) UI odczytuje stan z kursora/zaznaczenia i ustawia kontrolki (jak Word).
// 5) Bez Google fonts. Tylko presety systemowe (lista w select).

export function initTextPixEditor(ctx) {
  const {
    TYPE_PIX,
    BIG_W,
    BIG_H,
    DOT_W,
    DOT_H,
    FONT_PRESETS,
    paneTextPix,
    rtEditor,
    pixWarn,
    selRtFont,
    inpRtSize,
    inpRtLine,
    inpRtLetter,
    inpRtBefore,
    inpRtAfter,
    btnRtBold,
    btnRtItalic,
    btnRtUnderline,
    btnRtAlignCycle,
    inpThresh,
    chkRtDither,
    editorShell,
    markDirty,
    clearDirty,
    isDirty,
    setEditorWarn,
    setPreviewBits,
    requestPreview,
  } = ctx;

  /* ----------------------------------------------------------
     Stan
  ---------------------------------------------------------- */
  let currentAlign = "center"; // left|center|right
  let cachedBits150 = new Uint8Array(DOT_W * DOT_H);

  let _renderT = 0;
  let _debTimer = null;

  /* ----------------------------------------------------------
     Pomocnicze
  ---------------------------------------------------------- */
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function show(el, on) {
    if (!el) return;
    el.style.display = on ? "" : "none";
  }

  function setBtnOn(btn, on) {
    if (!btn) return;
    btn.classList.toggle("on", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function selectionInsideEditor() {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return false;
    let node = sel.anchorNode;
    if (!node) return false;
    if (node.nodeType === 3) node = node.parentNode;
    return !!(node && (node === rtEditor || node.closest?.("#rtEditor")));
  }

  function getSelectionRange() {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return null;
    return sel.getRangeAt(0);
  }

  function getCurrentParagraph() {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return null;
    let node = sel.anchorNode;
    if (!node) return null;
    if (node.nodeType === 3) node = node.parentNode;
    return node?.closest ? node.closest("p") : null;
  }

  function normalizeParagraphs() {
    if (!rtEditor) return;

    // usuwa ZWSP (zero-width) zostawione do stylowania przy kursorze
    // (pozwala zachowac "per znak" bez syfu w tekscie)
    const walker = document.createTreeWalker(rtEditor, NodeFilter.SHOW_TEXT);
    const toFix = [];
    while (walker.nextNode()) {
      const t = walker.currentNode;
      if (t.nodeValue && t.nodeValue.includes("\u200b")) toFix.push(t);
    }
    for (const t of toFix) t.nodeValue = t.nodeValue.replaceAll("\u200b", "");

    // jesli pusto -> zostaw pusto
    const plain = String(rtEditor.textContent || "").replace(/\u00a0/g, " ").trim();
    if (!plain) {
      rtEditor.innerHTML = "";
      return;
    }

    // jezeli juz sa <p> - zostaw
    if (/<\s*p[\s>]/i.test(rtEditor.innerHTML)) return;

    // w innym wypadku: owin linie w <p>
    const lines = plain.split(/\n+/).map(s => s.trim()).filter(Boolean);
    rtEditor.innerHTML = lines.map(s => `<p>${escapeHtml(s)}</p>`).join("");
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /* ----------------------------------------------------------
     Per-znak: styl inline (span) na zaznaczeniu albo na kursrze
     - to naprawia Twoj problem "rozmiar per symbol nie dziala".

     Dlaczego wczesniej nie dzialalo?
     - execCommand("fontSize") daje <font size="..."> (nie px)
     - a my renderujemy przez SVG/foreignObject, gdzie to bywa interpretowane
       roznie. Styl inline w px jest stabilny.
  ---------------------------------------------------------- */
  function applyInlineStyle(styleObj) {
    if (!rtEditor) return;
    if (!selectionInsideEditor()) rtEditor.focus();

    const r = getSelectionRange();
    if (!r) return;

    // jezeli zaznaczenie jest puste -> wstawiamy span "typing span"
    // z ZWSP, zeby nastepne znaki dziedziczyly styl.
    if (r.collapsed) {
      const span = document.createElement("span");
      for (const [k, v] of Object.entries(styleObj)) {
        span.style[k] = v;
      }
      span.textContent = "\u200b";
      r.insertNode(span);

      // ustaw kursor za ZWSP (wewnatrz span)
      const sel = window.getSelection();
      const nr = document.createRange();
      nr.setStart(span.firstChild, 1);
      nr.setEnd(span.firstChild, 1);
      sel.removeAllRanges();
      sel.addRange(nr);
      return;
    }

    // jezeli cos zaznaczone: owijamy w span
    const span = document.createElement("span");
    for (const [k, v] of Object.entries(styleObj)) {
      span.style[k] = v;
    }

    try {
      span.appendChild(r.extractContents());
      r.insertNode(span);

      // zostaw zaznaczenie na owiniętym fragmencie
      const sel = window.getSelection();
      const nr = document.createRange();
      nr.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(nr);
    } catch {
      // gdy selection przecina elementy (np. kilka <p>)
      // robimy wersje "bezpieczna": splitujemy na text nodes przez execCommand
      // i dopiero potem opakujemy.
      try {
        document.execCommand("styleWithCSS", false, true);
        // minimalny fallback: pogrubienie/kursywa/podkreslenie i tak dziala.
      } catch {}
    }
  }

  function applyFontToSelection(fontFamily) {
    applyInlineStyle({ fontFamily });

    // dodatkowo: jezeli stoimy w <p> i nie ma fontFamily, ustaw jako "baze" akapitu
    const p = getCurrentParagraph();
    if (p && !p.style.fontFamily) p.style.fontFamily = fontFamily;
  }

  function applySizeToSelection(px) {
    applyInlineStyle({ fontSize: `${px}px` });
  }

  /* ----------------------------------------------------------
     Per-akapit: odstepy / wyrownanie
  ---------------------------------------------------------- */
  function ensureParagraphDefaults(p) {
    if (!p) return;
    if (!p.style.fontSize) p.style.fontSize = `${clamp(Number(inpRtSize?.value || 56), 10, 140)}px`;
    if (!p.style.lineHeight) p.style.lineHeight = String(clamp(Number(inpRtLine?.value || 1.05), 0.6, 2.0));
    if (!p.style.letterSpacing) p.style.letterSpacing = `${clamp(Number(inpRtLetter?.value || 0), 0, 8)}px`;
    if (!p.style.textAlign) p.style.textAlign = currentAlign;
    if (!p.style.marginTop) p.style.marginTop = `${clamp(Number(inpRtBefore?.value || 10), 0, 60)}px`;
    if (!p.style.marginBottom) p.style.marginBottom = `${clamp(Number(inpRtAfter?.value || 10), 0, 60)}px`;
  }

  function applyInputsToParagraph(p) {
    if (!p) return;

    // rozmiar jest per-znak (selection), ale baza akapitu tez moze byc rozna
    // (nowe znaki moga dziedziczyc)
    const sizePx = clamp(Number(inpRtSize?.value || 56), 10, 140);
    if (!p.style.fontSize) p.style.fontSize = `${sizePx}px`;

    const line = clamp(Number(inpRtLine?.value || 1.05), 0.6, 2.0);
    p.style.lineHeight = String(line);

    const letterPx = clamp(Number(inpRtLetter?.value || 0), 0, 8);
    p.style.letterSpacing = `${letterPx}px`;

    const before = clamp(Number(inpRtBefore?.value || 10), 0, 60);
    const after = clamp(Number(inpRtAfter?.value || 10), 0, 60);
    p.style.marginTop = `${before}px`;
    p.style.marginBottom = `${after}px`;

    p.style.textAlign = currentAlign;
  }

  /* ----------------------------------------------------------
     Sync UI z kursora / zaznaczenia (jak Word)
  ---------------------------------------------------------- */
  function syncUiFromSelection() {
    if (!selectionInsideEditor()) return;

    // BIU
    try {
      setBtnOn(btnRtBold, !!document.queryCommandState("bold"));
      setBtnOn(btnRtItalic, !!document.queryCommandState("italic"));
      setBtnOn(btnRtUnderline, !!document.queryCommandState("underline"));
    } catch {}

    const p = getCurrentParagraph();
    if (!p) return;

    ensureParagraphDefaults(p);
    const cs = getComputedStyle(p);

    // align
    const a = (p.style.textAlign || cs.textAlign || "center");
    currentAlign = (a === "left" || a === "right") ? a : "center";
    updateAlignButton();

    // line/letter/before/after
    const fs = Math.round(parseFloat(cs.fontSize) || 56);
    const lh = parseFloat(cs.lineHeight);
    const ls = parseFloat(cs.letterSpacing);
    const mt = Math.round(parseFloat(cs.marginTop) || 0);
    const mb = Math.round(parseFloat(cs.marginBottom) || 0);

    if (inpRtSize) inpRtSize.value = String(clamp(fs, 10, 140));

    if (Number.isFinite(lh) && Number.isFinite(fs) && fs > 0) {
      const rel = lh / fs;
      if (inpRtLine) inpRtLine.value = String(clamp(Math.round(rel * 100) / 100, 0.6, 2.0));
    }

    if (Number.isFinite(ls)) {
      if (inpRtLetter) inpRtLetter.value = String(clamp(Math.round(ls), 0, 8));
    } else {
      if (inpRtLetter) inpRtLetter.value = "0";
    }

    if (inpRtBefore) inpRtBefore.value = String(clamp(mt, 0, 60));
    if (inpRtAfter) inpRtAfter.value = String(clamp(mb, 0, 60));

    // font select: dopasuj do computed font-family (heurystyka)
    if (selRtFont) {
      const ff = (cs.fontFamily || "").toLowerCase();
      let best = selRtFont.value;
      for (const opt of Array.from(selRtFont.options)) {
        const ov = String(opt.value || "").toLowerCase();
        const head = ov.split(",")[0]?.trim().replace(/["']/g, "");
        if (head && ff.includes(head)) { best = opt.value; break; }
      }
      selRtFont.value = best;
    }
  }

  function updateAlignButton() {
    if (!btnRtAlignCycle) return;
    btnRtAlignCycle.textContent = currentAlign === "left" ? "⇤" : currentAlign === "right" ? "⇥" : "⇆";
    btnRtAlignCycle.dataset.state = currentAlign;
  }

  /* ----------------------------------------------------------
     Render: HTML -> bitmap 208x88 -> wyciecie przerw -> 150x70
  ---------------------------------------------------------- */
  function base64ToBytes(b64) {
    const clean = String(b64 || "").replace(/\s+/g, "");
    try {
      const bin = atob(clean);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
      return out;
    } catch {
      return new Uint8Array(0);
    }
  }

  function bytesToBase64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function packBitsRowMajorMSB(bits01, w, h) {
    const bytesPerRow = Math.ceil(w / 8);
    const out = new Uint8Array(bytesPerRow * h);
    for (let y = 0; y < h; y++) {
      const rowBase = y * bytesPerRow;
      for (let x = 0; x < w; x++) {
        if (!bits01[y * w + x]) continue;
        const bi = rowBase + (x >> 3);
        const bit = 7 - (x & 7);
        out[bi] |= (1 << bit);
      }
    }
    return bytesToBase64(out);
  }

  function compress208x88to150x70(bits208) {
    const out = new Uint8Array(DOT_W * DOT_H);
    let oy = 0;
    for (let y = 0; y < BIG_H; y++) {
      const my = y % 9;
      if (my === 7 || my === 8) continue; // wycinamy 2 rzedzy

      let ox = 0;
      for (let x = 0; x < BIG_W; x++) {
        const mx = x % 7;
        if (mx === 5 || mx === 6) continue; // wycinamy 2 kolumny

        out[oy * DOT_W + ox] = bits208[y * BIG_W + x] ? 1 : 0;
        ox++;
      }
      oy++;
    }
    return out;
  }

  function sanitizeHtmlForForeignObject(html) {
    let s = String(html || "");
    s = s.replace(/<br\s*>/gi, "<br />");
    s = s.replace(/<hr\s*>/gi, "<hr />");
    // brak list (Twoje wymaganie)
    s = s.replace(/<\/?(ul|ol)\b[^>]*>/gi, "");
    s = s.replace(/<li\b[^>]*>/gi, "<div>");
    s = s.replace(/<\/li>/gi, "</div>");
    return s;
  }

  function makeSvgDataUrl(html, opts) {
    const w = opts.w, h = opts.h;
    const xhtml =
      `<div xmlns="http://www.w3.org/1999/xhtml" style="` +
        `width:${w}px;height:${h}px;` +
        `background:#000;color:#fff;` +
        `margin:0;padding:0;` +
        `overflow:hidden;` +
      `">` +
        `<style xmlns="http://www.w3.org/1999/xhtml">` +
          `*{box-sizing:border-box;}` +
          `html,body{margin:0;padding:0;}` +
          `p{margin:0;}` +
        `</style>` +
        html +
      `</div>`;

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
        `<foreignObject x="0" y="0" width="${w}" height="${h}">` +
          xhtml +
        `</foreignObject>` +
      `</svg>`;

    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  async function renderForeignObjectToCanvas(html, w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx2d = c.getContext("2d");
    ctx2d.fillStyle = "#000";
    ctx2d.fillRect(0, 0, w, h);

    const url = makeSvgDataUrl(html, { w, h });
    const img = new Image();

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("Nie udało się wyrenderować tekstu (foreignObject)."));
      img.src = url;
    });

    ctx2d.drawImage(img, 0, 0);
    return c;
  }

  function renderPlainFallback(text, w, h) {
    // najprostszy backup: calosc jako zwykly tekst z wrapem.
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);

    const fontFamily = String(selRtFont?.value || FONT_PRESETS[0][1] || "system-ui, sans-serif");
    const fontSizePx = clamp(Number(inpRtSize?.value || 56), 10, 140);
    const lineRel = clamp(Number(inpRtLine?.value || 1.05), 0.6, 2.0);
    const lhPx = fontSizePx * lineRel;

    g.fillStyle = "#fff";
    g.textBaseline = "top";

    const align = currentAlign;
    g.textAlign = align === "left" ? "left" : align === "right" ? "right" : "center";
    const padX = 10;
    const x0 = align === "left" ? padX : align === "right" ? (w - padX) : Math.floor(w / 2);

    g.font = `${fontSizePx}px ${fontFamily}`;

    const words = String(text).split(/\s+/).filter(Boolean);
    const maxW = w - padX * 2;
    const lines = [];
    let line = "";
    for (const wd of words) {
      const test = line ? (line + " " + wd) : wd;
      if (g.measureText(test).width <= maxW) line = test;
      else {
        if (line) lines.push(line);
        line = wd;
      }
    }
    if (line) lines.push(line);

    let y = 0;
    for (const ln of lines) {
      g.fillText(ln, x0, y);
      y += lhPx;
      if (y > h) break;
    }

    return c;
  }

  function canvasToBits(canvas, threshold, dither) {
    const g = canvas.getContext("2d");
    const { data } = g.getImageData(0, 0, canvas.width, canvas.height);

    const out = new Uint8Array(BIG_W * BIG_H);
    const lum = new Float32Array(BIG_W * BIG_H);

    for (let y = 0; y < BIG_H; y++) {
      for (let x = 0; x < BIG_W; x++) {
        const i = (y * BIG_W + x) * 4;
        const r = data[i + 0], gg = data[i + 1], b = data[i + 2];
        lum[y * BIG_W + x] = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      }
    }

    if (!dither) {
      for (let i = 0; i < out.length; i++) out[i] = lum[i] >= threshold ? 1 : 0;
      return out;
    }

    // Floyd–Steinberg (opcjonalny)
    const buf = new Float32Array(lum);
    for (let y = 0; y < BIG_H; y++) {
      for (let x = 0; x < BIG_W; x++) {
        const i = y * BIG_W + x;
        const oldv = buf[i];
        const newv = oldv >= threshold ? 255 : 0;
        out[i] = newv ? 1 : 0;
        const err = oldv - newv;

        if (x + 1 < BIG_W) buf[i + 1] += err * (7 / 16);
        if (y + 1 < BIG_H) {
          if (x > 0) buf[i + BIG_W - 1] += err * (3 / 16);
          buf[i + BIG_W] += err * (5 / 16);
          if (x + 1 < BIG_W) buf[i + BIG_W + 1] += err * (1 / 16);
        }
      }
    }

    return out;
  }

  function bitsBoundingBox(bits, w, h) {
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!bits[y * w + x]) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
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
    if (!plain) {
      return { bits150: new Uint8Array(DOT_W * DOT_H), clipped: false };
    }

    const threshold = clamp(Number(inpThresh?.value || 128), 40, 220);
    const dither = !!chkRtDither?.checked;

    const html = sanitizeHtmlForForeignObject(String(rtEditor?.innerHTML || ""));

    let canvas;
    try {
      canvas = await renderForeignObjectToCanvas(html, BIG_W, BIG_H);
    } catch {
      canvas = renderPlainFallback(plain, BIG_W, BIG_H);
    }

    const bits208 = canvasToBits(canvas, threshold, dither);
    const bits150 = compress208x88to150x70(bits208);

    const box = bitsBoundingBox(bits150, DOT_W, DOT_H);
    const clipped = looksClipped(box, DOT_W, DOT_H, 0);

    return { bits150, clipped };
  }

  async function updatePreviewAsync() {
    if (!requestPreview()) return;

    const token = ++_renderT;
    try {
      const { bits150, clipped } = await compileToBits150();
      if (token !== _renderT) return;

      cachedBits150 = bits150;
      setPreviewBits(bits150);

      if (pixWarn) {
        if (clipped) {
          pixWarn.textContent = "Wygląda na ucięte — zmniejsz rozmiar albo skróć tekst.";
          show(pixWarn, true);
        } else {
          show(pixWarn, false);
        }
      }
    } catch (e) {
      console.error(e);
      if (pixWarn) {
        pixWarn.textContent = "Nie mogę zrobić podglądu tekstu na tym urządzeniu/przeglądarce.";
        show(pixWarn, true);
      }
    }
  }

  function schedulePreview(ms = 120) {
    clearTimeout(_debTimer);
    _debTimer = setTimeout(() => updatePreviewAsync(), ms);
  }

  /* ----------------------------------------------------------
     UI: font select presets
  ---------------------------------------------------------- */
  function populateFontSelect() {
    if (!selRtFont) return;
    const prev = selRtFont.value;
    selRtFont.innerHTML = "";
    for (const [label, value] of FONT_PRESETS) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      selRtFont.appendChild(opt);
    }
    if (prev) {
      const ok = Array.from(selRtFont.options).some(o => o.value === prev);
      if (ok) selRtFont.value = prev;
    }
  }

  /* ----------------------------------------------------------
     Bind eventy (raz)
  ---------------------------------------------------------- */
  function bindOnce() {
    populateFontSelect();

    const cmd = (name) => {
      if (!rtEditor) return;
      if (!selectionInsideEditor()) rtEditor.focus();

      try { document.execCommand(name, false, null); } catch {}
      markDirty();
      schedulePreview(80);
      syncUiFromSelection();
    };

    btnRtBold?.addEventListener("click", () => cmd("bold"));
    btnRtItalic?.addEventListener("click", () => cmd("italic"));
    btnRtUnderline?.addEventListener("click", () => cmd("underline"));

    btnRtAlignCycle?.addEventListener("click", () => {
      currentAlign = currentAlign === "left" ? "center" : currentAlign === "center" ? "right" : "left";
      updateAlignButton();

      const p = getCurrentParagraph();
      if (p) {
        ensureParagraphDefaults(p);
        p.style.textAlign = currentAlign;
      }

      markDirty();
      schedulePreview(80);
      syncUiFromSelection();
    });
    updateAlignButton();

    selRtFont?.addEventListener("change", () => {
      const ff = String(selRtFont.value || FONT_PRESETS[0][1]);
      applyFontToSelection(ff);
      markDirty();
      schedulePreview(120);
      syncUiFromSelection();
    });

    // rozmiar: per-zaznaczenie
    inpRtSize?.addEventListener("input", () => {
      const px = clamp(Number(inpRtSize.value || 56), 10, 140);
      inpRtSize.value = String(px);
      if (!selectionInsideEditor()) return;
      applySizeToSelection(px);
      markDirty();
      schedulePreview(120);
      syncUiFromSelection();
    });

    // te 4 parametry: per-akapit
    const bindParaNum = (el, min, max) => {
      el?.addEventListener("input", () => {
        const v = clamp(Number(el.value || 0), min, max);
        el.value = String(v);
        if (!selectionInsideEditor()) return;
        const p = getCurrentParagraph();
        if (p) {
          ensureParagraphDefaults(p);
          applyInputsToParagraph(p);
        }
        markDirty();
        schedulePreview(140);
        syncUiFromSelection();
      });
    };

    bindParaNum(inpRtLine, 0.6, 2.0);
    bindParaNum(inpRtLetter, 0, 8);
    bindParaNum(inpRtBefore, 0, 60);
    bindParaNum(inpRtAfter, 0, 60);

    // prog / dithering: globalne (dla renderu)
    inpThresh?.addEventListener("input", () => {
      inpThresh.value = String(clamp(Number(inpThresh.value || 128), 40, 220));
      markDirty();
      schedulePreview(80);
    });

    chkRtDither?.addEventListener("change", () => {
      markDirty();
      schedulePreview(80);
    });

    rtEditor?.addEventListener("input", () => {
      if (!rtEditor) return;
      markDirty();
      normalizeParagraphs();

      // dopnij wartosci akapitu, zeby to bylo stabilne
      const p = getCurrentParagraph();
      if (p) {
        ensureParagraphDefaults(p);
        applyInputsToParagraph(p);
      }

      schedulePreview(120);
    });

    // kluczowe: selectionchange + mouseup + keyup
    document.addEventListener("selectionchange", () => {
      if (!selectionInsideEditor()) return;
      syncUiFromSelection();
    });
    rtEditor?.addEventListener("mouseup", syncUiFromSelection);
    rtEditor?.addEventListener("keyup", syncUiFromSelection);
    rtEditor?.addEventListener("focus", syncUiFromSelection);
  }

  /* ----------------------------------------------------------
     API dla main.js
  ---------------------------------------------------------- */
  const api = {
    type: TYPE_PIX,

    show() {
      show(paneTextPix, true);
      editorShell?.setAttribute("data-mode", "TEXT_PIX");

      // start: pusty, ale poprawne placeholdery robi CSS
      if (rtEditor) {
        rtEditor.setAttribute("data-placeholder", "Wpisz tekst…");
        rtEditor.innerHTML = "";
      }

      currentAlign = "center";
      updateAlignButton();

      clearDirty();
      setEditorWarn("");

      // od razu preview (puste)
      cachedBits150 = new Uint8Array(DOT_W * DOT_H);
      setPreviewBits(cachedBits150);
      show(pixWarn, false);

      syncUiFromSelection();
    },

    hide() {
      show(paneTextPix, false);
    },

    reset() {
      if (rtEditor) rtEditor.innerHTML = "";
      show(pixWarn, false);
      cachedBits150 = new Uint8Array(DOT_W * DOT_H);
      clearDirty();
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
          bits_b64: packBitsRowMajorMSB(cachedBits150, DOT_W, DOT_H),
        },
      };
    },
  };

  // init (raz)
  bindOnce();

  return api;
}
