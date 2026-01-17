// familiada/logo-editor/js/text-pix.js
// Tryb: TEXT_PIX (contenteditable -> "screen" -> 150x70 bits)

export function initTextPixEditor(ctx) {
  const TYPE_PIX = "PIX_150x70";

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

  const inpThresh = document.getElementById("inpThresh");
  const chkRtDither = document.getElementById("chkRtDither");

  const DOT_W = ctx.DOT_W;
  const DOT_H = ctx.DOT_H;
  const BIG_W = ctx.BIG_W || 208;
  const BIG_H = ctx.BIG_H || 88;

  const show = (el, on) => { if (!el) return; el.style.display = on ? "" : "none"; };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  let currentAlign = "center";
  let cachedBits150 = new Uint8Array(DOT_W * DOT_H);
  let _deb = null;
  let _token = 0;

  // ---- selection helpers
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

  function setBtnOn(btn, on) {
    if (!btn) return;
    btn.classList.toggle("on", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  // ---- normalize <p>
  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeParagraphs() {
    if (!rtEditor) return;

    // usuń ZWSP
    const walker = document.createTreeWalker(rtEditor, NodeFilter.SHOW_TEXT);
    const fix = [];
    while (walker.nextNode()) {
      const t = walker.currentNode;
      if (t.nodeValue && t.nodeValue.includes("\u200b")) fix.push(t);
    }
    for (const t of fix) t.nodeValue = t.nodeValue.replaceAll("\u200b", "");

    const plain = String(rtEditor.textContent || "").replace(/\u00a0/g, " ").trim();
    if (!plain) { rtEditor.innerHTML = ""; return; }
    if (/<\s*p[\s>]/i.test(rtEditor.innerHTML)) return;

    const lines = plain.split(/\n+/).map(s => s.trim()).filter(Boolean);
    rtEditor.innerHTML = lines.map(s => `<p>${esc(s)}</p>`).join("");
  }

  // ---- per-symbol style: apply span or typing-span
  function applyInlineStyle(styleObj) {
    if (!rtEditor) return;
    if (!selectionInside()) rtEditor.focus();

    const r = getRange();
    if (!r) return;

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

  function applyFontToSelection(fontFamily) {
    applyInlineStyle({ fontFamily });
    const p = getCurrentP();
    if (p && !p.style.fontFamily) p.style.fontFamily = fontFamily;
  }

  function applySizeToSelection(px) {
    applyInlineStyle({ fontSize: `${px}px` });
  }

  // ---- per-paragraph styles
  function ensurePDefaults(p) {
    if (!p) return;
    if (!p.style.lineHeight) p.style.lineHeight = String(clamp(Number(inpRtLine?.value || 1.05), 0.6, 2.0));
    if (!p.style.letterSpacing) p.style.letterSpacing = `${clamp(Number(inpRtLetter?.value || 0), 0, 8)}px`;
    if (!p.style.textAlign) p.style.textAlign = currentAlign;
    if (!p.style.marginTop) p.style.marginTop = `${clamp(Number(inpRtPadTop?.value || 10), 0, 60)}px`;
    if (!p.style.marginBottom) p.style.marginBottom = `${clamp(Number(inpRtPadBot?.value || 10), 0, 60)}px`;
  }

  function applyInputsToP(p) {
    if (!p) return;
    ensurePDefaults(p);

    p.style.lineHeight = String(clamp(Number(inpRtLine?.value || 1.05), 0.6, 2.0));
    p.style.letterSpacing = `${clamp(Number(inpRtLetter?.value || 0), 0, 8)}px`;
    p.style.marginTop = `${clamp(Number(inpRtPadTop?.value || 10), 0, 60)}px`;
    p.style.marginBottom = `${clamp(Number(inpRtPadBot?.value || 10), 0, 60)}px`;
    p.style.textAlign = currentAlign;
  }

  // ---- toolbar sync (jak Word)
  function syncUiFromSelection() {
    if (!selectionInside()) return;

    try {
      setBtnOn(btnRtBold, !!document.queryCommandState("bold"));
      setBtnOn(btnRtItalic, !!document.queryCommandState("italic"));
      setBtnOn(btnRtUnderline, !!document.queryCommandState("underline"));
    } catch {}

    const p = getCurrentP();
    if (!p) return;

    ensurePDefaults(p);
    const cs = getComputedStyle(p);

    // align
    const a = (p.style.textAlign || cs.textAlign || "center");
    currentAlign = (a === "left" || a === "right") ? a : "center";
    updateAlignButton();

    // font heuristic -> select
    if (selRtFont) {
      const ff = (cs.fontFamily || "").toLowerCase();
      let best = selRtFont.value;
      for (const opt of Array.from(selRtFont.options)) {
        const head = String(opt.value || "").toLowerCase().split(",")[0].trim().replace(/["']/g, "");
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

  // ---- render pipeline: html -> canvas -> bits208 -> compress -> bits150
  function sanitizeHtmlForForeignObject(html) {
    let s = String(html || "");
    s = s.replace(/<br\s*>/gi, "<br />");
    s = s.replace(/<hr\s*>/gi, "<hr />");
    s = s.replace(/<\/?(ul|ol)\b[^>]*>/gi, "");
    s = s.replace(/<li\b[^>]*>/gi, "<div>");
    s = s.replace(/<\/li>/gi, "</div>");
    return s;
  }

  function makeSvgDataUrl(html, w, h) {
    const xhtml =
      `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;background:#000;color:#fff;margin:0;padding:0;overflow:hidden;">` +
        `<style xmlns="http://www.w3.org/1999/xhtml">*{box-sizing:border-box;}html,body{margin:0;padding:0;}p{margin:0;}</style>` +
        html +
      `</div>`;

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
        `<foreignObject x="0" y="0" width="${w}" height="${h}">${xhtml}</foreignObject>` +
      `</svg>`;

    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  async function renderForeignObjectToCanvas(html, w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);

    const url = makeSvgDataUrl(html, w, h);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("foreignObject fail"));
      img.src = url;
    });

    g.drawImage(img, 0, 0);
    return c;
  }

  function canvasToBits(canvas, threshold, dither) {
    const g = canvas.getContext("2d");
    const { data } = g.getImageData(0, 0, canvas.width, canvas.height);

    const out = new Uint8Array(BIG_W * BIG_H);
    const lum = new Float32Array(BIG_W * BIG_H);

    for (let y = 0; y < BIG_H; y++) for (let x = 0; x < BIG_W; x++) {
      const i = (y * BIG_W + x) * 4;
      const r = data[i + 0], gg = data[i + 1], b = data[i + 2];
      lum[y * BIG_W + x] = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    }

    if (!dither) {
      for (let i = 0; i < out.length; i++) out[i] = lum[i] >= threshold ? 1 : 0;
      return out;
    }

    const buf = new Float32Array(lum);
    for (let y = 0; y < BIG_H; y++) for (let x = 0; x < BIG_W; x++) {
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
      if (!bits[y*w+x]) continue;
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
    const html = sanitizeHtmlForForeignObject(String(rtEditor?.innerHTML || ""));

    let canvas;
    try {
      canvas = await renderForeignObjectToCanvas(html, BIG_W, BIG_H);
    } catch {
      // jeśli foreignObject padnie, to nie wywalaj całego edytora:
      // pokaż ostrzeżenie i zwróć puste
      return { bits150: new Uint8Array(DOT_W * DOT_H), clipped: false, failed: true };
    }

    const bits208 = canvasToBits(canvas, threshold, dither);
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
        pixWarn.textContent = "Nie udało się wyrenderować (foreignObject). Ta przeglądarka może tego nie wspierać.";
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

  // ---- bind events (raz)
  function bindOnce() {
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

    selRtFont?.addEventListener("change", () => {
      const ff = String(selRtFont.value || "system-ui, sans-serif");
      applyFontToSelection(ff);
      ctx.markDirty?.();
      schedulePreview(120);
      syncUiFromSelection();
    });

    inpRtSize?.addEventListener("input", () => {
      const px = clamp(Number(inpRtSize.value || 56), 10, 140);
      inpRtSize.value = String(px);
      if (!selectionInside()) return;
      applySizeToSelection(px);
      ctx.markDirty?.();
      schedulePreview(120);
      syncUiFromSelection();
    });

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
    bindPara(inpRtLetter, 0, 8);
    bindPara(inpRtPadTop, 0, 60);
    bindPara(inpRtPadBot, 0, 60);

    inpThresh?.addEventListener("input", () => {
      inpThresh.value = String(clamp(Number(inpThresh.value || 128), 40, 220));
      ctx.markDirty?.();
      schedulePreview(80);
    });

    chkRtDither?.addEventListener("change", () => {
      ctx.markDirty?.();
      schedulePreview(80);
    });

    rtEditor?.addEventListener("input", () => {
      ctx.markDirty?.();
      normalizeParagraphs();
      const p = getCurrentP();
      if (p) applyInputsToP(p);
      schedulePreview(120);
    });

    document.addEventListener("selectionchange", () => {
      if (!selectionInside()) return;
      syncUiFromSelection();
    });

    rtEditor?.addEventListener("mouseup", syncUiFromSelection);
    rtEditor?.addEventListener("keyup", syncUiFromSelection);
    rtEditor?.addEventListener("focus", syncUiFromSelection);
  }

  bindOnce();

  // ---- API
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

      // od razu zsynchronizuj toolbar (kursor jeszcze nie jest w edytorze)
      setBtnOn(btnRtBold, false);
      setBtnOn(btnRtItalic, false);
      setBtnOn(btnRtUnderline, false);
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
