// host2/js/coverLogo.js
//
// Rysuje logo gry na okładce pasma 2 (#cover2Logo), w dwóch wariantach
// zależnie od tego, czy gra ma logo domyślne czy niestandardowe (zgłoszone
// wprost, nie zgadywane):
//
// - Logo DOMYŚLNE (brak logoId): zostaje ten sam wektor "Familiada"
//   (img/logo.svg — dwie ścieżki: jasna "zapalona" i przyciemniona "tło"),
//   ale zamiast zaszytego na sztywno żółtego, jasna ścieżka dostaje gradient
//   liniowy w dwie strony (jaśniej ↔ ciemniej), gdzie SKONFIGUROWANY kolor
//   "DOT" (ten sam, który steruje kolorem zapalonych kropek na całej
//   planszy LED — patrz display2/js/scene.js's color.set("DOT",...)) jest
//   dokładnie środkowym/uśrednionym kolorem tego gradientu — nie jednym z
//   jego końców. Przyciemniona ścieżka zostaje płaskim, ciemniejszym
//   wariantem tego samego koloru DOT (ta sama proporcja jasności co
//   oryginalne #a80 wobec #fc0 — ok. 66.7%).
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
// Kolor DOT jest jedynym wejściem do obu wariantów — celowo, żeby podgląd
// odzwierciedlał TYLKO to, czym faktycznie świecą kropki na prawdziwym
// Wyświetlaczu (settings.display.colors.A/B/BACKGROUND nie mają tu wpływu).

import { sb } from "../../js/core/supabase.js?v=v2026-09-10T23140";
import { v as cacheBust } from "../../js/core/cache-bust.js?v=v2026-09-10T23140";
import { loadFont5x7, logoToBits150 } from "../../js/core/logo-preview.js?v=v2026-09-10T23140";

const DOT_W = 150, DOT_H = 70;
const DEFAULT_DOT_COLOR = "#d7ff3d"; // shared/gameStateShape.js's default
const GRADIENT_SPREAD_L = 22; // punkty procentowe jasności HSL w każdą stronę

// ===== Kolor: hex <-> HSL, ciemniejszy wariant o stałej proporcji =====

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { r1 = c; g1 = x; }
  else if (h < 120) { r1 = x; g1 = c; }
  else if (h < 180) { g1 = c; b1 = x; }
  else if (h < 240) { g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

function withLightness(hex, lPercent) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const { h, s } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const l = Math.max(0, Math.min(100, lPercent));
  const out = hslToRgb(h, s, l);
  return rgbToHex(out.r, out.g, out.b);
}

// Symetryczny gradient wokół koloru DOT: jaśniejszy i ciemniejszy koniec w
// tej samej odległości jasności HSL od środka — DOT jest więc naprawdę
// uśrednionym kolorem gradientu, nie jednym z jego brzegów.
function gradientStopsAroundDot(dotHex) {
  const rgb = hexToRgb(dotHex) || hexToRgb(DEFAULT_DOT_COLOR);
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const lightL = Math.min(96, l + GRADIENT_SPREAD_L);
  const darkL = Math.max(4, l - GRADIENT_SPREAD_L);
  const toHex = (ll) => rgbToHex(...Object.values(hslToRgb(h, s, ll)));
  return { light: toHex(lightL), mid: dotHex, dark: toHex(darkL) };
}

// #a80 wobec #fc0 w oryginalnym img/logo.svg to dokładnie skalowanie
// każdego kanału RGB razy ~0.667 — ta sama proporcja, tylko wychodząca z
// aktualnego koloru DOT zamiast zaszytego na sztywno żółtego.
function dimVariant(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const f = 0.667;
  return rgbToHex(rgb.r * f, rgb.g * f, rgb.b * f);
}

// ===== Wektor "Familiada" (img/logo.svg) — wczytany raz, ścieżki cache'owane =====

let _svgPathsPromise = null;
async function loadWordmarkPaths() {
  if (_svgPathsPromise) return _svgPathsPromise;
  _svgPathsPromise = (async () => {
    try {
      const res = await fetch(await cacheBust("/img/logo.svg"));
      const text = await res.text();
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      const paths = [...doc.querySelectorAll("path")];
      const bright = paths.find((p) => p.getAttribute("fill") === "#fc0")?.getAttribute("d") || "";
      const dim = paths.find((p) => p.getAttribute("fill") === "#a80")?.getAttribute("d") || "";
      const g = doc.querySelector("g");
      const transform = g?.getAttribute("transform") || "";
      const viewBox = doc.querySelector("svg")?.getAttribute("viewBox") || "0 0 1280 720";
      return { bright, dim, transform, viewBox };
    } catch (e) {
      console.warn("[host2] wczytanie img/logo.svg nie powiodło się:", e);
      return { bright: "", dim: "", transform: "", viewBox: "0 0 1280 720" };
    }
  })();
  return _svgPathsPromise;
}

async function renderDefaultLogo(el, dotColor) {
  const { bright, dim, transform, viewBox } = await loadWordmarkPaths();
  if (!bright) return; // wczytanie się nie powiodło — zostaw poprzednią zawartość
  const { light, mid, dark } = gradientStopsAroundDot(dotColor);
  const gradId = "cover2LogoGrad";
  el.innerHTML = `
    <svg viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" width="100%" height="100%">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${light}"/>
          <stop offset="50%" stop-color="${mid}"/>
          <stop offset="100%" stop-color="${dark}"/>
        </linearGradient>
      </defs>
      <g transform="${transform}">
        <path fill="${dimVariant(dotColor)}" d="${dim}"/>
        <path fill="url(#${gradId})" d="${bright}"/>
      </g>
    </svg>`;
}

// ===== Logo niestandardowe: siatka litych kwadratów bez przerw =====

let _glyphsPromise = null;
function glyphsOnce() {
  if (!_glyphsPromise) _glyphsPromise = loadFont5x7().catch(() => null);
  return _glyphsPromise;
}

function drawSolidGrid(canvas, bits150, colorHex) {
  const ctx = canvas.getContext("2d");
  const cw = canvas.width, ch = canvas.height;
  const scale = Math.min(cw / DOT_W, ch / DOT_H);
  const ox = Math.floor((cw - DOT_W * scale) / 2);
  const oy = Math.floor((ch - DOT_H * scale) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = colorHex;
  for (let y = 0; y < DOT_H; y++) {
    for (let x = 0; x < DOT_W; x++) {
      if (!bits150[y * DOT_W + x]) continue;
      // +1px zapasu na krawędziach — bez tego zaokrąglenia skali potrafią
      // zostawić jednopikselowe przerwy między sąsiednimi kwadratami
      // (zgłoszony wymóg: "siatka bez przerw").
      ctx.fillRect(ox + x * scale, oy + y * scale, scale + 1, scale + 1);
    }
  }
}

async function renderCustomLogo(el, logo, dotColor) {
  const glyphs = logo?.type === "GLYPH_30x10" ? await glyphsOnce() : null;
  const bits150 = logoToBits150(logo, glyphs);
  const canvas = document.createElement("canvas");
  canvas.width = DOT_W * 6;
  canvas.height = DOT_H * 6;
  drawSolidGrid(canvas, bits150, dotColor);
  el.innerHTML = "";
  canvas.style.cssText = "width:100%;height:100%;object-fit:contain;display:block";
  el.appendChild(canvas);
}

// ===== Publiczny wejściowy punkt: wywoływany przy każdym wierszu =====

export function createCoverLogoRenderer({ gameId, key }) {
  const el = document.getElementById("cover2Logo");
  let lastDot = null;
  let lastLogoId; // undefined != null -> pierwsze wywołanie zawsze maluje
  let fetchSeq = 0;

  function apply(row) {
    if (!el) return;
    const dot = row.detail?.display?.colors?.DOT || DEFAULT_DOT_COLOR;
    const logoId = row.detail?.display?.logoId ?? null;
    if (dot === lastDot && logoId === lastLogoId) return;
    lastDot = dot;
    lastLogoId = logoId;

    if (!logoId) {
      renderDefaultLogo(el, dot);
      return;
    }

    const seq = ++fetchSeq;
    sb().rpc("display_logo_get_public", { p_game_id: gameId, p_key: key })
      .then(({ data, error }) => {
        if (error || seq !== fetchSeq) return;
        if (data?.type && data?.payload) renderCustomLogo(el, data, dot);
        else renderDefaultLogo(el, dot); // logo zniknęło/niedostępne -> fallback
      })
      .catch(() => {});
  }

  return { apply };
}
