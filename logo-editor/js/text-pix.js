// familiada/logo-editor/js/text-pix.js
// Tryb: TEXT_PIX
// - contenteditable działa jak Word
// - per-symbol: czcionka, rozmiar, odstęp liter, BIU
// - per-akapit: wyrównanie, interlinia, odstępy przed/po
// - podgląd/zapis: bierzemy SZEROKOŚĆ edytora, liczymy wysokość do proporcji 208:88,
//   robimy “screenshot” od góry (crop) i przeliczamy na 150x70 bits.

export function initTextPixEditor(ctx) {
  const TYPE_PIX = "PIX_150x70";

  // ---- DOM
  const paneTextPix = document.getElementById("paneTextPix");
  const rtEditor = document.getElementById("rtEditor");
  const pixWarn = document.getElementById("pixWarn");

  // per-symbol
  const selRtFont = document.getElementById("selRtFont");
  const inpRtSize = document.getElementById("inpRtSize");
  const inpRtLetter = document.getElementById("inpRtLetter");

  const btnRtBold = document.getElementById("btnRtBold");
  const btnRtItalic = document.getElementById("btnRtItalic");
  const btnRtUnderline = document.getElementById("btnRtUnderline");

  // per-paragraph
  const inpRtLine = document.getElementById("inpRtLine");
  const inpRtPadTop = document.getElementById("inpRtPadTop");
  const inpRtPadBot = document.getElementById("inpRtPadBot");
  const btnRtAlignCycle = document.getElementById("btnRtAlignCycle");

  // (opcjonalne – może zniknąć z UI)
  const inpThresh = document.getElementById("inpThresh");
  const chkRtDither = document.getElementById("chkRtDither");

  // ---- CONSTS
  const DOT_W = ctx.DOT_W;
  const DOT_H = ctx.DOT_H;
  const BIG_W = ctx.BIG_W || 208;
  const BIG_H = ctx.BIG_H || 88;

  const show = (el, on) => { if (!el) return; el.style.display = on ? "" : "none"; };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // ---- STATE
  let currentAlign = "center";
  let cachedBits150 = new Uint8Array(DOT_W * DOT_H);

  let _deb = null;
  let _token = 0;

  // =========================================================
  // 1) SELEKCJA / POMOCNICZE
  // =========================================================
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

  function getCurrentP() {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return null;
    let node = sel.anchorNode;
    if (!node) return null;
    if (node.nodeType === 3) node = node.parentNode;
    return node?.closest ? node.closest("p") : null;
  }

  function isCollapsedSelection() {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return true;
    return !!sel.getRangeAt(0).collapsed;
  }

  function setBtnState(btn, state /* "on" | "off" | "mixed" */) {
    if (!btn) return;
    btn.classList.toggle("on", state === "on");
    btn.classList.toggle("mixed", state === "mixed"); // jeśli nie masz stylu w CSS – nic nie popsuje
    btn.setAttribute("aria-pressed", state === "on" ? "true" : "false");
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // =========================================================
  // 2) NORMALIZACJA PARAGRAFÓW (żeby Enter = nowy <p>)
  // =========================================================
  function removeZWSP(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const list = [];
    while (walker.nextNode()) {
      const t = walker.currentNode;
      if (t.nodeValue && t.nodeValue.includes("\u200b")) list.push(t);
    }
    for (const t of list) t.nodeValue = t.nodeValue.replaceAll("\u200b", "");
  }

  function normalizeParagraphs() {
    if (!rtEditor) return;

    removeZWSP(rtEditor);

    const plain = String(rtEditor.textContent || "").replace(/\u00a0/g, " ").trim();
    if (!plain) { rtEditor.innerHTML = ""; return; }

    // jeśli są już <p> – zostaw
    if (/<\s*p[\s>]/i.test(rtEditor.innerHTML)) return;

    // jeśli przeglądarka robi <div> i <br> – zamieniamy na <p>
    const lines = plain.split(/\n+/).map(s => s.trim()).filter(Boolean);
    rtEditor.innerHTML = lines.map(s => `<p>${esc(s)}</p>`).join("");
  }

  // =========================================================
  // 3) PER-AKAPIT: domyślne i aplikacja wartości z UI
  // =========================================================
  function ensurePDefaults(p) {
    if (!p) return;

    if (!p.style.textAlign) p.style.textAlign = currentAlign;

    // interlinia
    if (!p.style.lineHeight) {
      const lh = clamp(Number(inpRtLine?.value || 1.05), 0.6, 2.0);
      p.style.lineHeight = String(lh);
    }

    // odstępy przed/po
    if (!p.style.marginTop) {
      const v = clamp(Number(inpRtPadTop?.value || 0), 0, 200);
      p.style.marginTop = `${v}px`;
    }
    if (!p.style.marginBottom) {
      const v = clamp(Number(inpRtPadBot?.value || 0), 0, 200);
      p.style.marginBottom = `${v}px`;
    }
  }

  function applyParaFromInputs(p) {
    if (!p) return;
    ensurePDefaults(p);

    const lh = clamp(Number(inpRtLine?.value || 1.05), 0.6, 2.0);
    p.style.lineHeight = String(lh);

    const mt = clamp(Number(inpRtPadTop?.value || 0), 0, 200);
    const mb = clamp(Number(inpRtPadBot?.value || 0), 0, 200);
    p.style.marginTop = `${mt}px`;
    p.style.marginBottom = `${mb}px`;

    p.style.textAlign = currentAlign;
  }

  function updateAlignButton() {
    if (!btnRtAlignCycle) return;
    btnRtAlignCycle.textContent =
      currentAlign === "left" ? "⇤" :
      currentAlign === "right" ? "⇥" :
      "⇆";
    btnRtAlignCycle.dataset.state = currentAlign;
  }

  // =========================================================
  // 4) PER-SYMBOL: nakładanie stylu na zaznaczenie / kursor
  //    - font + BIU: execCommand
  //    - size: execCommand(fontSize 1..7) + zamiana <font> na <span style=px>
  //    - letterSpacing(px): wrap w span (bo execCommand nie ma)
  // =========================================================
  function cmd(name, value = null) {
    if (!rtEditor) return;
    if (!selectionInside()) rtEditor.focus();
    try { document.execCommand(name, false, value); } catch {}
  }

  function pxToFontSizeLevel(px) {
    // najstabilniejsza mapka dla execCommand("fontSize")
    const map = [10, 13, 16, 18, 24, 32, 48];
    let best = 3, bestDiff = Infinity;
    for (let i = 0; i < map.length; i++) {
      const d = Math.abs(px - map[i]);
      if (d < bestDiff) { bestDiff = d; best = i + 1; }
    }
    return best; // 1..7
  }

  function replaceFontTagsWithSpans(root, px) {
    if (!root) return;
    const fonts = root.querySelectorAll("font[size]");
    for (const f of fonts) {
      const span = document.createElement("span");
      span.style.fontSize = `${px}px`;
      while (f.firstChild) span.appendChild(f.firstChild);
      f.parentNode.replaceChild(span, f);
    }
  }

  function applyInlineSpanStyle(styleObj) {
    if (!rtEditor) return;
    if (!selectionInside()) rtEditor.focus();

    const r = getRange();
    if (!r) return;

    // zaznaczenie
    if (!r.collapsed) {
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
      return;
    }

    // kursor: wstawiamy “typing span” z ZWSP i ustawiamy kursor za nim
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
  }

  function applyFontToSelection(fontValueFromSelect) {
    // select może mieć fallbacki "A, B, C" – execCommand lubi pierwszy
    const primary = String(fontValueFromSelect || "system-ui").split(",")[0].trim().replace(/^["']|["']$/g, "");
    cmd("fontName", primary);
  }

  function applySizeToSelection(px) {
    const level = pxToFontSizeLevel(px);
    cmd("fontSize", String(level));
    replaceFontTagsWithSpans(rtEditor, px);
  }

  function applyLetterSpacingToSelection(px) {
    applyInlineSpanStyle({ letterSpacing: `${px}px` });
  }

  // =========================================================
  // 5) “WORD”: wykrywanie stylu z kursora / zaznaczenia
  //    - jeśli miks -> pole puste
  // =========================================================
  function getSelectionTextNodesInEditor() {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return [];
    const r = sel.getRangeAt(0);
    if (r.collapsed) return [];
    if (!selectionInside()) return [];

    const nodes = [];
    const walker = document.createTreeWalker(rtEditor, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.nodeValue || !n.nodeValue.trim()) continue;

      // czy ten text-node nachodzi na range?
      const nr = document.createRange();
      nr.selectNodeContents(n);

      const endsBefore = nr.compareBoundaryPoints(Range.END_TO_START, r) <= 0;
      const startsAfter = nr.compareBoundaryPoints(Range.START_TO_END, r) >= 0;
      if (!endsBefore && !startsAfter) nodes.push(n);
    }
    return nodes;
  }

  function uniformComputed(nodes, prop) {
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

  function uniformFlag(nodes, fn) {
    if (!nodes.length) return { uniform: true, value: null };
    let first = null;
    for (const n of nodes) {
      const el = n.parentElement || n.parentNode;
      if (!el || el.nodeType !== 1) continue;
      const v = !!fn(getComputedStyle(el), el);
      if (first === null) first = v;
      else if (v !== first) return { uniform: false, value: null };
    }
    return { uniform: true, value: first };
  }

  function pickBestSelectFontFromComputed(computedFontFamily) {
    if (!selRtFont) return;
    const ff = String(computedFontFamily || "").toLowerCase();

    let best = selRtFont.value || "";
    for (const opt of Array.from(selRtFont.options)) {
      const raw = String(opt.value || "").toLowerCase();
      if (!raw) continue;
      const head = raw.split(",")[0].trim().replace(/["']/g, "");
      if (head && ff.includes(head)) { best = opt.value; break; }
    }
    selRtFont.value = best;
  }

  function syncUiFromSelection() {
    if (!selectionInside()) return;

    const sel = window.getSelection?.();
    const hasRange = !!(sel && sel.rangeCount > 0);
    const range = hasRange ? sel.getRangeAt(0) : null;
    const isMixedSelection = !!(range && !range.collapsed);

    // --- BIU (per-symbol)
    if (isMixedSelection) {
      const nodes = getSelectionTextNodesInEditor();

      const ub = uniformFlag(nodes, (cs) => (parseInt(cs.fontWeight, 10) || 400) >= 600 || cs.fontWeight === "bold");
      const ui = uniformFlag(nodes, (cs) => cs.fontStyle === "italic");
      const uu = uniformFlag(nodes, (cs) => String(cs.textDecorationLine || "").includes("underline"));

      setBtnState(btnRtBold, ub.uniform ? (ub.value ? "on" : "off") : "mixed");
      setBtnState(btnRtItalic, ui.uniform ? (ui.value ? "on" : "off") : "mixed");
      setBtnState(btnRtUnderline, uu.uniform ? (uu.value ? "on" : "off") : "mixed");

      // --- font / size / letterSpacing: puste jeśli miks
      const uf = uniformComputed(nodes, "fontFamily");
      const us = uniformComputed(nodes, "fontSize");
      const ul = uniformComputed(nodes, "letterSpacing");

      if (selRtFont) {
        if (!uf.uniform) selRtFont.value = "";
        else pickBestSelectFontFromComputed(uf.value);
      }

      if (inpRtSize) {
        if (!us.uniform) inpRtSize.value = "";
        else {
          const px = Math.round(parseFloat(us.value) || 56);
          inpRtSize.value = String(clamp(px, 10, 140));
        }
      }

      if (inpRtLetter) {
        if (!ul.uniform) inpRtLetter.value = "";
        else {
          const px = Math.round(parseFloat(ul.value) || 0);
          inpRtLetter.value = String(clamp(px, 0, 40));
        }
      }
    } else {
      // kursor: bierzemy computed z miejsca kursora
      let node = sel?.anchorNode || null;
      if (node && node.nodeType === 3) node = node.parentNode;
      const el = node && node.nodeType === 1 ? node : rtEditor;

      const cs = el ? getComputedStyle(el) : null;

      // BIU – queryCommandState działa najlepiej dla kursora
      try {
        setBtnState(btnRtBold, document.queryCommandState("bold") ? "on" : "off");
        setBtnState(btnRtItalic, document.queryCommandState("italic") ? "on" : "off");
        setBtnState(btnRtUnderline, document.queryCommandState("underline") ? "on" : "off");
      } catch {
        // fallback
        if (cs) {
          const b = (parseInt(cs.fontWeight, 10) || 400) >= 600 || cs.fontWeight === "bold";
          const i = cs.fontStyle === "italic";
          const u = String(cs.textDecorationLine || "").includes("underline");
          setBtnState(btnRtBold, b ? "on" : "off");
          setBtnState(btnRtItalic, i ? "on" : "off");
          setBtnState(btnRtUnderline, u ? "on" : "off");
        }
      }

      if (cs) {
        if (selRtFont) pickBestSelectFontFromComputed(cs.fontFamily);

        if (inpRtSize) {
          const px = Math.round(parseFloat(cs.fontSize) || 56);
          inpRtSize.value = String(clamp(px, 10, 140));
        }

        if (inpRtLetter) {
          const px = Math.round(parseFloat(cs.letterSpacing) || 0);
          inpRtLetter.value = String(clamp(px, 0, 40));
        }
      }
    }

    // --- per-paragraph: z aktualnego <p>
    const p = getCurrentP();
    if (p) {
      ensurePDefaults(p);
      const csP = getComputedStyle(p);

      const a = (p.style.textAlign || csP.textAlign || "center");
      currentAlign = (a === "left" || a === "right") ? a : "center";
      updateAlignButton();

      if (inpRtLine) {
        const lh = parseFloat(p.style.lineHeight || csP.lineHeight || "1.05");
        if (Number.isFinite(lh)) inpRtLine.value = String(clamp(lh, 0.6, 2.0));
      }
      if (inpRtPadTop) {
        const mt = parseFloat(p.style.marginTop || csP.marginTop || "0");
        if (Number.isFinite(mt)) inpRtPadTop.value = String(clamp(mt, 0, 200));
      }
      if (inpRtPadBot) {
        const mb = parseFloat(p.style.marginBottom || csP.marginBottom || "0");
        if (Number.isFinite(mb)) inpRtPadBot.value = String(clamp(mb, 0, 200));
      }
    }
  }

  // =========================================================
  // 6) “SCREENSHOT”: edytor -> (208x88) -> bits -> 150x70
  // =========================================================
  function sanitizeHtmlForForeignObject(html) {
    let s = String(html || "");
    s = s.replace(/<br\s*>/gi, "<br />");
    s = s.replace(/<hr\s*>/gi, "<hr />");
    // listy wycinamy (bez UI)
    s = s.replace(/<\/?(ul|ol)\b[^>]*>/gi, "");
    s = s.replace(/<li\b[^>]*>/gi, "<div>");
    s = s.replace(/<\/li>/gi, "</div>");
    return s;
  }

  function getStageWidthPx() {
    // Najważniejsze: “edytor ma jakąś szerokość” -> bierzemy rzeczywistą szerokość renderu.
    // rtEditor jest absolutem w rtStage, więc bierzemy jego parent.
    const stage = rtEditor?.parentElement;
    const w = stage?.clientWidth || rtEditor?.clientWidth || 520;
    return Math.max(120, Math.floor(w));
  }

  function makeSvgDataUrlFromEditor(html, stageW, cropH, outW, outH) {
    // Skala: “screenshot” ma brać stageW i cropH (proporcja 208/88),
    // a my renderujemy do outW/outH.
    const scale = outW / stageW;

    // WAŻNE: overflow hidden -> “od góry” i obcięcie do cropH
    const wrapper =
      `<div xmlns="http://www.w3.org/1999/xhtml" style="` +
        `width:${stageW}px;height:${cropH}px;` +
        `background:#000;color:#fff;` +
        `margin:0;padding:0;` +
        `overflow:hidden;` +
        `transform:scale(${scale});transform-origin:0 0;` +
      `">` +
        `<style xmlns="http://www.w3.org/1999/xhtml">` +
          `*{box-sizing:border-box;}` +
          `html,body{margin:0;padding:0;}` +
          // PARAGRAFY
          `p{margin:0;}` +
          // UWAGA: contenteditable ma padding w CSS; tu tego nie narzucamy.
          // Jeśli chcesz “safe margin”, ustawiasz to w CSS rtEditor.
        `</style>` +
        html +
      `</div>`;

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}">` +
        `<foreignObject x="0" y="0" width="${outW}" height="${outH}">` +
          wrapper +
        `</foreignObject>` +
      `</svg>`;

    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  async function renderEditorScreenshotToCanvas(outW, outH) {
    const c = document.createElement("canvas");
    c.width = outW;
    c.height = outH;
    const g = c.getContext("2d");

    g.fillStyle = "#000";
    g.fillRect(0, 0, outW, outH);

    const stageW = getStageWidthPx();
    const cropH = Math.max(40, Math.round(stageW * (BIG_H / BIG_W))); // proporcja 208:88

    const html = sanitizeHtmlForForeignObject(String(rtEditor?.innerHTML || ""));
    const url = makeSvgDataUrlFromEditor(html, stageW, cropH, outW, outH);

    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("Nie udało się zrobić screena (foreignObject)."));
      img.src = url;
    });

    g.drawImage(img, 0, 0);
    return c;
  }

  function downsample2xToLum(srcCanvas) {
    const sw = srcCanvas.width;
    const sh = srcCanvas.height;
    const tw = Math.floor(sw / 2);
    const th = Math.floor(sh / 2);

    const sctx = srcCanvas.getContext("2d");
    const img = sctx.getImageData(0, 0, sw, sh).data;

    const lum = new Float32Array(tw * th);
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        let acc = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const sx = x * 2 + dx;
            const sy = y * 2 + dy;
            const i = (sy * sw + sx) * 4;
            const r = img[i + 0], gg = img[i + 1], b = img[i + 2];
            acc += 0.2126 * r + 0.7152 * gg + 0.0722 * b;
          }
        }
        lum[y * tw + x] = acc / 4;
      }
    }
    return { lum, w: tw, h: th };
  }

  function lumToBits(lum, w, h, threshold, dither) {
    const out = new Uint8Array(w * h);

    if (!dither) {
      for (let i = 0; i < w * h; i++) out[i] = lum[i] >= threshold ? 1 : 0;
      return out;
    }

    // Floyd–Steinberg na jasności 0..255
    const buf = new Float32Array(lum);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
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
    }
    return out;
  }

  function compress208x88to150x70(bits208) {
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

    const threshold = clamp(Number(inpThresh?.value || 128), 40, 220);
    const dither = !!chkRtDither?.checked;

    // render 2x, potem downsample -> BIG_W x BIG_H
    let hi;
    try {
      hi = await renderEditorScreenshotToCanvas(BIG_W * 2, BIG_H * 2);
    } catch {
      return { bits150: new Uint8Array(DOT_W * DOT_H), clipped: false, failed: true };
    }

    const { lum, w, h } = downsample2xToLum(hi); // -> BIG_W x BIG_H
    const bits208 = lumToBits(lum, w, h, threshold, dither);
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
        pixWarn.textContent = "Nie mogę zrobić screena tekstu w tej przeglądarce (foreignObject).";
        show(pixWarn, true);
      }
      return;
    }

    cachedBits150 = res.bits150;
    ctx.onPreview?.({ kind: "PIX", bits: cachedBits150 });

    if (pixWarn) {
      if (res.clipped) {
        pixWarn.textContent = "Wygląda na ucięte — zmniejsz rozmiar albo skróć tekst.";
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

  // =========================================================
  // 7) BIND EVENTY (raz)
  // =========================================================
  function bindOnce() {
    // BIU
    btnRtBold?.addEventListener("click", () => {
      if (!rtEditor) return;
      if (!selectionInside()) rtEditor.focus();
      cmd("bold");
      ctx.markDirty?.();
      schedulePreview(80);
      syncUiFromSelection();
    });

    btnRtItalic?.addEventListener("click", () => {
      if (!rtEditor) return;
      if (!selectionInside()) rtEditor.focus();
      cmd("italic");
      ctx.markDirty?.();
      schedulePreview(80);
      syncUiFromSelection();
    });

    btnRtUnderline?.addEventListener("click", () => {
      if (!rtEditor) return;
      if (!selectionInside()) rtEditor.focus();
      cmd("underline");
      ctx.markDirty?.();
      schedulePreview(80);
      syncUiFromSelection();
    });

    // ALIGN (per akapit)
    btnRtAlignCycle?.addEventListener("click", () => {
      currentAlign = currentAlign === "left" ? "center" : currentAlign === "center" ? "right" : "left";
      updateAlignButton();

      const p = getCurrentP();
      if (p) {
        p.style.textAlign = currentAlign;
        ensurePDefaults(p);
      }

      ctx.markDirty?.();
      schedulePreview(90);
      syncUiFromSelection();
    });
    updateAlignButton();

    // FONT (per symbol)
    selRtFont?.addEventListener("change", () => {
      const v = String(selRtFont.value || "");
      if (!v) return; // wartość pusta = “mixed” -> nie aplikujemy
      applyFontToSelection(v);
      ctx.markDirty?.();
      schedulePreview(120);
      syncUiFromSelection();
    });

    // SIZE (per symbol)
    inpRtSize?.addEventListener("input", () => {
      const raw = String(inpRtSize.value || "").trim();
      if (!raw) return; // mixed: pusto
      const px = clamp(Number(raw), 10, 140);
      inpRtSize.value = String(px);
      if (!selectionInside()) return;
      applySizeToSelection(px);
      ctx.markDirty?.();
      schedulePreview(140);
      syncUiFromSelection();
    });

    // LETTER SPACING (per symbol)
    inpRtLetter?.addEventListener("input", () => {
      const raw = String(inpRtLetter.value || "").trim();
      if (!raw) return; // mixed: pusto
      const px = clamp(Number(raw), 0, 40);
      inpRtLetter.value = String(px);
      if (!selectionInside()) return;
      applyLetterSpacingToSelection(px);
      ctx.markDirty?.();
      schedulePreview(140);
      syncUiFromSelection();
    });

    // PARA INPUTS (per akapit)
    const bindPara = (el, min, max) => {
      el?.addEventListener("input", () => {
        const raw = String(el.value || "").trim();
        if (!raw) return;
        const v = clamp(Number(raw), min, max);
        el.value = String(v);
        if (!selectionInside()) return;

        const p = getCurrentP();
        if (p) applyParaFromInputs(p);

        ctx.markDirty?.();
        schedulePreview(140);
        syncUiFromSelection();
      });
    };

    bindPara(inpRtLine, 0.6, 2.0);
    bindPara(inpRtPadTop, 0, 200);
    bindPara(inpRtPadBot, 0, 200);

    // threshold/dither (opcjonalne)
    inpThresh?.addEventListener("input", () => {
      inpThresh.value = String(clamp(Number(inpThresh.value || 128), 40, 220));
      ctx.markDirty?.();
      schedulePreview(90);
    });

    chkRtDither?.addEventListener("change", () => {
      ctx.markDirty?.();
      schedulePreview(90);
    });

    // wpisywanie w edytorze
    rtEditor?.addEventListener("input", () => {
      ctx.markDirty?.();
      normalizeParagraphs();

      const p = getCurrentP();
      if (p) ensurePDefaults(p);

      schedulePreview(140);
      // sync po input (kursor może “wskoczyć” w nowe miejsce)
      syncUiFromSelection();
    });

    // Enter -> wymuś <p> (żeby nie robił <div>)
    rtEditor?.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      // Nie blokujemy Enter – tylko po fakcie normalize zrobi <p>,
      // ale tutaj zabezpieczamy się przed dziwnymi <div><br>.
      // Dodatkowo: Shift+Enter zostawiamy jako zwykłe złamanie (użytkownik może chcieć).
      if (ev.shiftKey) return;
      // nic więcej – input handler i normalize ogarną resztę
    });

    // “Word”: odczyt stylu z selekcji/kursora
    document.addEventListener("selectionchange", () => {
      if (!selectionInside()) return;
      syncUiFromSelection();
    });

    rtEditor?.addEventListener("mouseup", syncUiFromSelection);
    rtEditor?.addEventListener("keyup", syncUiFromSelection);
    rtEditor?.addEventListener("focus", syncUiFromSelection);
  }

  bindOnce();

  // =========================================================
  // 8) API
  // =========================================================
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

      // UI startowo: “brak zaznaczenia, brak stylu”
      setBtnState(btnRtBold, "off");
      setBtnState(btnRtItalic, "off");
      setBtnState(btnRtUnderline, "off");

      // UWAGA: wartości font/size/letter ustawiamy dopiero po focus/selection.
      if (selRtFont) selRtFont.value = "";
      if (inpRtSize) inpRtSize.value = "56";
      if (inpRtLetter) inpRtLetter.value = "0";
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
