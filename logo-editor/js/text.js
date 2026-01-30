// familiada/logo-editor/js/text.js
// Tryb: TEXT (font_3x10) -> zapis GLYPH_30x10
// Stała 1 kolumna przerwy miedzy glifami.

export function initTextEditor(ctx) {
  const paneText = document.getElementById("paneText");
  const textValue = document.getElementById("textValue");
  const textWarn = document.getElementById("textWarn");
  const textMeasure = document.getElementById("textMeasure");
  const btnCharsToggle = document.getElementById("btnCharsToggle");
  const charsList = document.getElementById("charsList");

  const TYPE_GLYPH = "GLYPH_30x10";

  const show = (el, on) => { if (!el) return; el.style.display = on ? "" : "none"; };

  let lastCompiled = null;

  function isLitChar(ch) {
    return ch !== " " && ch !== "\u00A0";
  }

  function measureGlyphTight3x10(rows10) {
    const W = 3;
    let left = W;
    let right = -1;

    for (let x = 0; x < W; x++) {
      let any = false;
      for (let y = 0; y < 10; y++) {
        const ch = (rows10[y] || "")[x] ?? " ";
        if (isLitChar(ch)) { any = true; break; }
      }
      if (any) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }

    if (right < left) return { left: 0, w: 0 };
    return suggestedWidthFix(left, right);

    function suggestedWidthFix(l, r){
      return { left: l, w: r - l + 1 };
    }
  }

  function normalizeInputText(raw) {
    return String(raw ?? "");
  }

  function compileTextToRows30x10(raw) {
    const FONT_3x10 = ctx.getFont3x10?.() || null;
    const text = normalizeInputText(raw);

    const rows = Array.from({ length: 10 }, () => Array.from({ length: 30 }, () => " "));
    const invalid = [];
    const chars = Array.from(text);

    /** @type {Array<{space:true} | {rows10:string[], w:number}>} */
    const glyphs = [];

    for (const ch0 of chars) {
      if (ch0 === "\n" || ch0 === "\r" || ch0 === "\t") { invalid.push(ch0); continue; }
      if (ch0 === " ") { glyphs.push({ space: true }); continue; }

      const glyph = FONT_3x10?.[ch0] ?? FONT_3x10?.[ch0.toUpperCase()] ?? null;
      if (!glyph) { invalid.push(ch0); continue; }

      const gRows = Array.from({ length: 10 }, (_, i) => String(glyph[i] ?? "").padEnd(3, " ").slice(0, 3));
      const { left, w } = measureGlyphTight3x10(gRows);
      const cropped = Array.from({ length: 10 }, (_, i) => gRows[i].slice(left, left + w));
      glyphs.push({ rows10: cropped, w });
    }

    let usedW = 0;
    let prevWasGlyph = false;
    for (const g of glyphs) {
      if (g.space) { usedW += 1; prevWasGlyph = false; continue; }
      if (prevWasGlyph) usedW += 1; // stała przerwa 1
      usedW += g.w;
      prevWasGlyph = true;
    }

    const fit = usedW <= 30;
    const startX = fit ? Math.floor((30 - usedW) / 2) : 0;

    let cursor = startX;
    prevWasGlyph = false;

    for (const g of glyphs) {
      if (g.space) { cursor += 1; prevWasGlyph = false; continue; }
      if (prevWasGlyph) cursor += 1;

      for (let y = 0; y < 10; y++) {
        const line = g.rows10[y] || "";
        for (let x = 0; x < g.w; x++) {
          const outX = cursor + x;
          if (outX < 0 || outX >= 30) continue;
          const c = line[x] ?? " ";
          if (c !== " ") rows[y][outX] = c;
        }
      }

      cursor += g.w;
      prevWasGlyph = true;
    }

    return {
      rows: rows.map(r => r.join("")),
      usedW,
      fit,
      invalid: Array.from(new Set(invalid)),
    };
  }

  function renderAllowedCharsList() {
    const FONT_3x10 = ctx.getFont3x10?.() || {};
    if (!charsList) return;
    const keys = Object.keys(FONT_3x10 || {});
    charsList.textContent = "␠" + keys.join("\u2009");
  }

  function updateWarnings(compiled) {
    if (!textWarn || !textMeasure) return;

    const parts = [];
    if (compiled.invalid.length) {
      parts.push(`Niedozwolone znaki: ${compiled.invalid.map(x => (x === " " ? "␠" : x)).join(" ")}`);
    }
    if (!compiled.fit) {
      parts.push(`Napis się nie mieści: szerokość ${compiled.usedW}/30.`);
    }

    if (parts.length) {
      textWarn.textContent = parts.join("\n");
      show(textWarn, true);
    } else {
      show(textWarn, false);
    }

    textMeasure.textContent = `Szerokość: ${compiled.usedW}/30 (${compiled.fit ? "mieści się" : "nie mieści się"}).`;
  }

  function recompile() {
    ctx.setEditorMsg?.("");
    const compiled = compileTextToRows30x10(textValue?.value || "");
    lastCompiled = compiled;
    updateWarnings(compiled);
    ctx.onPreview?.({ kind: "GLYPH", rows: compiled.rows });
  }

  // EVENTS
  textValue?.addEventListener("input", () => {
    if (ctx.getMode?.() !== "TEXT") return;
    ctx.markDirty?.();
    recompile();
  });

  btnCharsToggle?.addEventListener("click", () => {
    const wrap = document.getElementById("charsInline");
    if (wrap) wrap.style.display = on ? "block" : "none";
    if (btnCharsToggle) btnCharsToggle.textContent = on ? "Ukryj" : "Pokaż";
  });

  // API
  return {
    open() {
      show(paneText, true);
      if (textValue) textValue.value = "";
      if (textMeasure) textMeasure.textContent = "—";
      show(textWarn, false);
      renderAllowedCharsList();
      show(charsList, false);
      if (btnCharsToggle) btnCharsToggle.textContent = "Pokaż";

      lastCompiled = null;
      ctx.clearDirty?.();
      recompile();
    },

    close() {
      show(paneText, false);
    },

    getCreatePayload() {
      const compiled = lastCompiled || compileTextToRows30x10(textValue?.value || "");
      lastCompiled = compiled;
      updateWarnings(compiled);

      if (compiled.invalid.length) return { ok: false, msg: "Popraw niedozwolone znaki." };
      if (!compiled.fit) return { ok: false, msg: "Napis się nie mieści — skróć tekst." };

      return {
        ok: true,
        type: TYPE_GLYPH,
        payload: { layers: [{ color: "main", rows: compiled.rows }] },
      };
    },
  };
}
