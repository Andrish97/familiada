// familiada/logo-editor2/js/text.js
// Tryb TEXT: napis fontem 3x10 -> GLYPH_30x10 (30 kolumn x 10 wierszy znaków
// fontu 5x7). Glify przycięte do szerokości, stała 1 kolumna przerwy,
// napis wyśrodkowany.

import { t, getUiLang } from "../../translation/translation.js?v=v2026-09-26T05304";
import { TILES_X, TILES_Y, TYPE_GLYPH } from "./render.js?v=v2026-09-26T05304";

const GLYPH_W = 3;

// Cyrylica jest w foncie, ale na liście „dozwolonych znaków” pokazujemy ją
// tylko w interfejsie ukraińskim (kompilacja przyjmuje ją zawsze, żeby logo
// zrobione po ukraińsku dało się edytować w innym języku).
const CYRILLIC_UK = new Set("АБВГҐДЕЄЖЗИІЙКЛМНОПРСТУФХЦЧШЩЬЮЯЇ");

const isLit = (ch) => ch !== " " && ch !== " ";

/** Przycina glif 3x10 do zapalonych kolumn. */
function cropGlyph(rows) {
  let left = GLYPH_W, right = -1;
  for (let x = 0; x < GLYPH_W; x++) {
    if (rows.some((r) => isLit(r[x] ?? " "))) { left = Math.min(left, x); right = x; }
  }
  if (right < left) return { rows: rows.map(() => ""), w: 0 };
  return { rows: rows.map((r) => r.slice(left, right + 1)), w: right - left + 1 };
}

/** Kompiluje napis. Zwraca { rows[10], usedW, fit, invalid[] }. */
export function compileText(text, font) {
  const glyphs = [];
  const invalid = new Set();
  for (const ch of Array.from(String(text ?? ""))) {
    if (ch === " ") { glyphs.push(null); continue; }
    const g = font?.[ch] ?? font?.[ch.toUpperCase()];
    if (!g || /[\n\r\t]/.test(ch)) { invalid.add(ch); continue; }
    glyphs.push(cropGlyph(Array.from({ length: TILES_Y }, (_, i) => String(g[i] ?? "").padEnd(GLYPH_W, " ").slice(0, GLYPH_W))));
  }

  // szerokość: spacja = 1 kolumna, między dwoma glifami 1 kolumna przerwy
  const layout = [];
  let x = 0, prevGlyph = false;
  for (const g of glyphs) {
    if (!g) { x += 1; prevGlyph = false; continue; }
    if (prevGlyph) x += 1;
    layout.push({ g, x });
    x += g.w;
    prevGlyph = true;
  }
  const usedW = x;
  const fit = usedW <= TILES_X;
  const offset = fit ? Math.floor((TILES_X - usedW) / 2) : 0;

  const grid = Array.from({ length: TILES_Y }, () => Array(TILES_X).fill(" "));
  for (const { g, x: gx } of layout) {
    for (let y = 0; y < TILES_Y; y++) {
      for (let cx = 0; cx < g.w; cx++) {
        const outX = offset + gx + cx;
        const c = g.rows[y][cx] ?? " ";
        if (outX < TILES_X && c !== " ") grid[y][outX] = c;
      }
    }
  }
  return { rows: grid.map((r) => r.join("")), usedW, fit, invalid: [...invalid] };
}

export function initTextEditor(ctx) {
  const $ = (id) => document.getElementById(id);
  const paneText = $("paneText");
  const textValue = $("textValue");
  const textWarn = $("textWarn");
  const textMeasure = $("textMeasure");
  const btnCharsToggle = $("btnCharsToggle");
  const charsInline = $("charsInline");
  const charsList = $("charsList");

  const show = (el, on) => { if (el) el.style.display = on ? "" : "none"; };
  const isShown = (el) => !!el && getComputedStyle(el).display !== "none";
  const font = () => ctx.getFont3x10?.() || {};

  let lastCompiled = null;

  function renderAllowedChars() {
    if (!charsList) return;
    const keys = Object.keys(font()).filter((k) => getUiLang() === "uk" || !CYRILLIC_UK.has(k));
    charsList.textContent = "␠" + keys.join(" ");
  }

  function updateCharsToggleLabel() {
    if (btnCharsToggle) {
      btnCharsToggle.textContent = isShown(charsList) ? t("logoEditor.text.allowedCharsHide") : t("logoEditor.text.allowedChars");
    }
  }

  function updateWarnings(c) {
    const parts = [];
    if (c.invalid.length) parts.push(t("logoEditor.text.invalidChars", { chars: c.invalid.join(" ") }));
    if (!c.fit) parts.push(t("logoEditor.text.tooWide", { width: c.usedW }));
    if (textWarn) textWarn.textContent = parts.join("\n");
    show(textWarn, parts.length > 0);
    if (textMeasure) {
      textMeasure.textContent = t("logoEditor.text.widthStatus", {
        width: c.usedW,
        status: c.fit ? t("logoEditor.text.fits") : t("logoEditor.text.notFits"),
      });
    }
  }

  function recompile() {
    lastCompiled = compileText(textValue?.value || "", font());
    updateWarnings(lastCompiled);
    ctx.onPreview?.({ kind: "GLYPH", rows: lastCompiled.rows });
  }

  textValue?.addEventListener("input", () => {
    if (ctx.getMode?.() !== "TEXT") return;
    ctx.setEditorMsg?.("");
    ctx.markDirty?.();
    recompile();
  });

  btnCharsToggle?.addEventListener("click", () => {
    const open = !isShown(charsList);
    show(charsInline, true);
    show(charsList, open);
    updateCharsToggleLabel();
  });

  window.addEventListener("i18n:lang", () => {
    renderAllowedChars();
    updateCharsToggleLabel();
    if (lastCompiled) updateWarnings(lastCompiled);
  });

  return {
    open(payload = null) {
      show(paneText, true);
      if (textValue) textValue.value = String(payload?.source?.text ?? "");
      renderAllowedChars();
      // Pasek z pomiarem szerokości zawsze widoczny; lista znaków na żądanie.
      show(charsInline, true);
      show(charsList, false);
      updateCharsToggleLabel();
      recompile();
      ctx.clearDirty?.();
    },

    close() {
      show(paneText, false);
    },

    getCreatePayload() {
      recompile();
      if (lastCompiled.invalid.length) return { ok: false, msg: t("logoEditor.text.fixInvalidChars") };
      if (!lastCompiled.fit) return { ok: false, msg: t("logoEditor.text.fixTooWide") };
      return {
        ok: true,
        type: TYPE_GLYPH,
        payload: {
          layers: [{ color: "main", rows: lastCompiled.rows }],
          source: { mode: "TEXT", text: textValue?.value || "" },
        },
      };
    },
  };
}
