// control/host/js/coverLogo.js
//
// Rysuje logo gry na okładce pasma 2 (#cover2Logo), w dwóch wariantach
// zależnie od tego, czy gra ma logo domyślne czy niestandardowe (zgłoszone
// wprost, nie zgadywane):
//
// - Logo DOMYŚLNE (brak logoId): napis FAMILIADA z silnika Unbounded/3D.
//
// - Logo NIESTANDARDOWE (jest logoId): zamiast oryginalnych kolorów/
//   przerw logo, rysujemy siatkę PEŁNYCH kwadratów bez przerw (w
//   odróżnieniu od kropek z realną przerwą na planszy LED) w jednolitym
//   kolorze DOT dla każdego zapalonego piksela, i NIC (przezroczyście) dla
//   zgaszonego — ten sam styl co wektor "Familiada" powyżej, tylko
//   zastosowany do treści właściwego logo gry. Wymaga pobrania
//   prawdziwego payloadu logo przez RPC display_logo_get_public (migracja
//   262 dopuściła też share_key_host, wcześniej tylko share_key_display).
//
// settings.display.colors.A/B/BACKGROUND nie mają tu wpływu.

import { sb } from "../../../shared/js/core/supabase.js?v=v2026-10-10T06103";
import { loadFont5x7, logoToBits150 } from "../../../shared/js/core/logo-preview.js?v=v2026-10-10T06103";
import { renderLogoSource, renderTextLogo } from "./sourceLogo.js?v=v2026-10-10T06103";

const DOT_W = 150, DOT_H = 70;
const DEFAULT_DOT_COLOR = "#d7ff3d"; // web/js/gameplay/gameStateShape.js's default
const DEFAULT_LOGO_FACE = "#fc0";
async function renderDefaultLogo(el, dotColor, shouldPaint = () => true) {
  const wordmark = await renderTextLogo("FAMILIADA", dotColor);
  if (!shouldPaint()) return;
  wordmark.setAttribute("aria-label", "FAMILIADA");
  wordmark.style.cssText = "width:100%;height:100%;object-fit:contain;display:block";
  el.replaceChildren(wordmark);
}

// ===== Logo niestandardowe: siatka litych kwadratów bez przerw =====

let _glyphsPromise = null;
function glyphsOnce() {
  if (!_glyphsPromise) _glyphsPromise = loadFont5x7().catch(() => null);
  return _glyphsPromise;
}

function logoBounds(bits) {
  let left = DOT_W, top = DOT_H, right = -1, bottom = -1;
  for (let y = 0; y < DOT_H; y++) for (let x = 0; x < DOT_W; x++) {
    if (!bits[y * DOT_W + x]) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return right < 0 ? { left: 0, top: 0, width: DOT_W, height: DOT_H }
    : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function drawSolidGrid(canvas, bits150, colorHex, bounds) {
  const ctx = canvas.getContext("2d");
  const scaleX = canvas.width / bounds.width;
  const scaleY = canvas.height / bounds.height;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = colorHex;
  for (let y = 0; y < DOT_H; y++) {
    for (let x = 0; x < DOT_W; x++) {
      if (bits150[y * DOT_W + x]) {
        ctx.fillRect((x - bounds.left) * scaleX, (y - bounds.top) * scaleY, scaleX + 1, scaleY + 1);
      }
    }
  }
}

async function renderCustomLogo(el, logo, dotColor, shouldPaint = () => true, mode = "pixel") {
  // The default DOT sentinel is a setting default, not the visible logo color.
  // Keep the logo gold until a player changes DOT explicitly.
  const logoDot = String(dotColor).toLowerCase() === DEFAULT_DOT_COLOR ? DEFAULT_LOGO_FACE : dotColor;
  if (mode === "source") {
    const sourceRender = await renderLogoSource(logo, dotColor);
    if (!shouldPaint()) return;
    if (sourceRender) {
      el.replaceChildren(sourceRender);
      sourceRender.style.cssText = "width:100%;height:100%;object-fit:contain;display:block";
      if (logo.payload.source?.mode === "TEXT") {
        sourceRender.style.transform = "scaleY(1.35)";
        sourceRender.style.transformOrigin = "center";
      }
    } else {
      el.replaceChildren();
    }
    return;
  }
  const glyphs = logo?.type === "GLYPH_30x10" ? await glyphsOnce() : null;
  if (!shouldPaint()) return;
  const bits150 = logoToBits150(logo, glyphs);
  const canvas = document.createElement("canvas");
  const bounds = logoBounds(bits150);
  canvas.width = bounds.width * 6;
  canvas.height = bounds.height * 6;
  drawSolidGrid(canvas, bits150, logoDot, bounds);
  el.innerHTML = "";
  canvas.style.cssText = "width:100%;height:100%;object-fit:contain;display:block";
  el.appendChild(canvas);
}

// ===== Publiczny wejściowy punkt: wywoływany przy każdym wierszu =====

export function createCoverLogoRenderer({ gameId, key }) {
  const el = document.getElementById("cover2Logo");
  let lastDot = null;
  let lastLogoId;
  let lastMode;
  let lastStep;
  let lastSummaryRev;
  let awaitingSummary = false;
  let fetchSeq = 0;

  function setCoverAccent(color) {
    document.documentElement.style.setProperty("--host-cover-accent", color);
  }

  async function apply(row) {
    if (!el) return;
    const dot = row.detail?.display?.colors?.DOT || DEFAULT_DOT_COLOR;
    const logoId = row.detail?.display?.logoId ?? null;
    const logoMode = row.detail?.display?.hostLogoMode === "source" ? "source" : "pixel";
    const hasPreviewLogo = row.detail?.display && Object.hasOwn(row.detail.display, "logoPreview");
    const previewLogo = row.detail?.display?.logoPreview;
    setCoverAccent(dot);
    const summary = row.step === "setup_finish";
    const refreshSummary = summary && (lastStep !== "setup_finish" || lastSummaryRev !== row.rev);
    lastStep = row.step;
    if (summary) lastSummaryRev = row.rev;
    if (!refreshSummary && dot === lastDot && logoId === lastLogoId && logoMode === lastMode && el.childElementCount) return;
    lastDot = dot;
    lastLogoId = logoId;
    lastMode = logoMode;
    const seq = ++fetchSeq;
    const current = () => seq === fetchSeq;
    if (hasPreviewLogo) {
      if (previewLogo?.type && previewLogo?.payload) await renderCustomLogo(el, previewLogo, dot, current, logoMode);
      else await renderDefaultLogo(el, dot, current);
      return;
    }
    if (awaitingSummary && !summary) {
      await renderDefaultLogo(el, dot, current);
      return;
    }
    // A Host opened before Control has no game_state yet. Still resolve the
    // selected game logo; show the default while checking its editing lock.
    if (!el.childElementCount) await renderDefaultLogo(el, dot, current);
    try {
      const { data, error } = await sb().rpc("host2_logo_get_public", { p_game_id:gameId, p_key:key });
      if (!current()) return;
      if (error) throw error;
      if (data?.busy) {
        awaitingSummary = true;
        await renderDefaultLogo(el, dot, current);
        return;
      }
      awaitingSummary = false;
      const logo = data?.logo;
      if (logo?.type && logo?.payload) await renderCustomLogo(el, logo, dot, current, logoMode);
      else await renderDefaultLogo(el, dot, current);
    } catch {
      if (!current()) return;
      lastLogoId = undefined;
      await renderDefaultLogo(el, dot, current);
    }
  }

  return { apply };
}
