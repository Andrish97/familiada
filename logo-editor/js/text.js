// familiada/logo-editor/js/text.js
// Tryb: TEXT (font_3x10) => zapis jako GLYPH_30x10.
// - walidacja dozwolonych znakow
// - pomiar szerokosci (glify moga byc wezsze niz 3)
// - centrowanie
// - zawsze 1 kolumna przerwy miedzy glifami (zgodnie z Twoja decyzja)

export function createTextEditor(ctx) {
  const { show, markDirty } = ctx;
  const { paneText, textValue, textWarn, textMeasure, btnCharsToggle, charsList } = ctx.el;

  function open() {
    show(paneText, true);

    // podpięcie input
    textValue?.addEventListener("input", onInput);
    btnCharsToggle?.addEventListener("click", onToggleChars);

    // start
    onInput();
  }

  function close() {
    textValue?.removeEventListener("input", onInput);
    btnCharsToggle?.removeEventListener("click", onToggleChars);
    show(paneText, false);
  }

  function onToggleChars() {
    const on = charsList && (charsList.style.display === "none" || charsList.style.display === "");
    show(charsList, on);
    if (btnCharsToggle) btnCharsToggle.textContent = on ? "Ukryj" : "Pokaż";
  }

  function onInput() {
    if (ctx.getMode() !== "TEXT") return;
    markDirty();

    // UWAGA: tu wołasz funkcje kompilacji z main, albo masz lokalne.
    // Najprościej: jeśli w text.js masz własne compileTextToRows30x10, zostaw.
    // Jeśli nie – musisz ją importować albo przekazać w ctx.util.
  }

  return { open, close };
}


export function initTextEditor(ctx) {
  const {
    TYPE_GLYPH,
    paneText,
    textValue,
    textWarn,
    textMeasure,
    btnCharsToggle,
    charsList,
    markDirty,
    clearDirty,
    setEditorMsg,
    show,
    updatePreviewRows30x10,
    clamp,
    getFont3x10,
  } = ctx;

  let lastCompiled = null;

  function esc(s){
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeInputText(raw) {
    return String(raw ?? "");
  }

  function isLitChar(ch) {
    return ch !== " " && ch !== "\u00A0";
  }

  function measureGlyphTight3x10(rows10) {
    // rows10: 10 wierszy, kazdy dlugosci 3
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
    return { left, w: right - left + 1 };
  }

  function compileTextToRows30x10(raw) {
    const FONT_3x10 = getFont3x10();
    const text = normalizeInputText(raw);

    // docelowe 30x10
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

    // szerokosc: spacja=1; miedzy glifami zawsze +1 (gdy glif obok glifu)
    let usedW = 0;
    let prevWasGlyph = false;
    for (const g of glyphs) {
      if (g.space) { usedW += 1; prevWasGlyph = false; continue; }
      if (prevWasGlyph) usedW += 1;
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

  function updateAllowedCharsList() {
    const FONT_3x10 = getFont3x10();
    if (!charsList) return;
    const keys = Object.keys(FONT_3x10 || {});
    charsList.innerHTML = esc("␠" + keys.join("\u2009"));
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

    const okStr = compiled.fit ? "mieści się" : "nie mieści się";
    textMeasure.textContent = `Szerokość: ${compiled.usedW}/30 (${okStr}).`;
  }

  function recompileFromInput() {
    setEditorMsg("");
    const compiled = compileTextToRows30x10(textValue?.value || "");
    lastCompiled = compiled;
    updateWarnings(compiled);
    updatePreviewRows30x10(compiled.rows);
  }

  // ===== public API dla main.js =====
  const api = {
    mode: "TEXT",
    open() {
      show(paneText, true);
      updateAllowedCharsList();
      show(textWarn, false);
      if (textMeasure) textMeasure.textContent = "—";
      if (textValue) textValue.value = "";
      lastCompiled = null;
      clearDirty();
      recompileFromInput();
    },
    close() {
      show(paneText, false);
    },
    isDirty() {
      return ctx.isDirty();
    },
    getCreatePayload() {
      const compiled = lastCompiled || compileTextToRows30x10(textValue?.value || "");
      lastCompiled = compiled;
      updateWarnings(compiled);

      if (compiled.invalid.length) {
        return { ok: false, msg: "Popraw niedozwolone znaki." };
      }
      if (!compiled.fit) {
        return { ok: false, msg: "Napis się nie mieści — skróć tekst." };
      }

      return {
        ok: true,
        type: TYPE_GLYPH,
        payload: { layers: [{ color: "main", rows: compiled.rows }] },
      };
    },
  };

  // ===== events =====
  textValue?.addEventListener("input", () => {
    if (ctx.getMode() !== "TEXT") return;
    markDirty();
    recompileFromInput();
  });

  btnCharsToggle?.addEventListener("click", () => {
    const on = charsList?.style.display === "none";
    show(charsList, on);
    if (btnCharsToggle) btnCharsToggle.textContent = on ? "Ukryj" : "Pokaż";
  });

  return api;
}
