// js/pages/logo-editor.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";

/* =========================================================
   CONSTS
========================================================= */
const TYPE_GLYPH = "GLYPH_30x10";
const TYPE_PIX = "PIX_150x70";

const W = 150;
const H = 70;
const PW = 208; // fizyczny raster z przerwami
const PH = 88;

/* =========================================================
   DOM
========================================================= */
const who = document.getElementById("who");
const msg = document.getElementById("msg");
const grid = document.getElementById("grid");

const btnBack = document.getElementById("btnBack");
const btnLogout = document.getElementById("btnLogout");
const btnClearActive = document.getElementById("btnClearActive");

// modal
const createOverlay = document.getElementById("createOverlay");
const mTitle = document.getElementById("mTitle");
const mSub = document.getElementById("mSub");
const mMsg = document.getElementById("mMsg");

const modePick = document.getElementById("modePick");
const stepCommon = document.getElementById("stepCommon");
const stepText = document.getElementById("stepText");
const stepDraw = document.getElementById("stepDraw");
const stepImage = document.getElementById("stepImage");

const pickText = document.getElementById("pickText");
const pickDraw = document.getElementById("pickDraw");
const pickImage = document.getElementById("pickImage");

const logoName = document.getElementById("logoName");
const modeHint = document.getElementById("modeHint");

const textValue = document.getElementById("textValue");
const prevGlyph = document.getElementById("prevGlyph");

const drawCanvas = document.getElementById("drawCanvas");
const btnBrush = document.getElementById("btnBrush");
const btnEraser = document.getElementById("btnEraser");
const btnClear = document.getElementById("btnClear");
const chkPreviewPhysical = document.getElementById("chkPreviewPhysical");

const imgFile = document.getElementById("imgFile");
const imgCanvas = document.getElementById("imgCanvas");
const chkImgContain = document.getElementById("chkImgContain");
const chkImgDither = document.getElementById("chkImgDither");

const btnCreate = document.getElementById("btnCreate");
const btnCancel = document.getElementById("btnCancel");

/* =========================================================
   STATE
========================================================= */
let currentUser = null;
let logos = [];

let createMode = null; // 'TEXT' | 'DRAW' | 'IMAGE'

// DRAW buffer
let drawBits = new Uint8Array(W * H); // 0/1
let drawTool = "BRUSH"; // BRUSH | ERASER

// IMAGE buffer
let imgBits = new Uint8Array(W * H);

/* =========================================================
   HELPERS
========================================================= */
function setMsg(t) { if (msg) msg.textContent = t || ""; }
function setMMsg(t) { if (mMsg) mMsg.textContent = t || ""; }
function show(el, on) { if (!el) return; el.style.display = on ? "" : "none"; }

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("pl-PL", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================================================
   BITPACK (MSB-first, row-major)
========================================================= */
function bitsToB64(bits01, w, h) {
  const n = w * h;
  const bytes = new Uint8Array(Math.ceil(n / 8));
  for (let i = 0; i < n; i++) {
    if (bits01[i]) {
      const bi = i >> 3;
      const b = 7 - (i & 7);
      bytes[bi] |= (1 << b);
    }
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBits(b64, w, h) {
  const n = w * h;
  const bin = atob(String(b64 || ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;

  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const bi = i >> 3;
    const b = 7 - (i & 7);
    out[i] = (bytes[bi] >> b) & 1;
  }
  return out;
}

/* =========================================================
   PRZERWY 5x7 (30x10)
   - 150x70 <-> 208x88
========================================================= */
function expandToPhysical(bits150) {
  const out = new Uint8Array(PW * PH);

  // x: 0..149 -> 0..207 (po każdych 5 kolumnach +2 przerwy)
  // y: 0..69  -> 0..87  (po każdych 7 wierszach +2 przerwy)
  for (let y = 0; y < H; y++) {
    const py = y + Math.floor(y / 7) * 2;
    for (let x = 0; x < W; x++) {
      const px = x + Math.floor(x / 5) * 2;
      out[py * PW + px] = bits150[y * W + x];
    }
  }
  return out;
}

function compressFromPhysical(bits208) {
  const out = new Uint8Array(W * H);
  // wycinamy kolumny gdzie (x % 7) in {5,6} i wiersze gdzie (y % 9) in {7,8}
  let oy = 0;
  for (let y = 0; y < PH; y++) {
    const ry = y % 9;
    if (ry === 7 || ry === 8) continue;
    let ox = 0;
    for (let x = 0; x < PW; x++) {
      const rx = x % 7;
      if (rx === 5 || rx === 6) continue;
      out[oy * W + ox] = bits208[y * PW + x];
      ox++;
    }
    oy++;
  }
  return out;
}

/* =========================================================
   CANVAS RENDER
========================================================= */
function drawBitsToCanvas(bits01, w, h, canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = bits01[i] ? 255 : 0;
    img.data[i * 4 + 0] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function clearCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/* =========================================================
   DB
========================================================= */
async function listLogos() {
  const { data, error } = await sb()
    .from("user_logos")
    .select("id,name,type,is_active,updated_at,payload")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function createLogo(row) {
  const { error } = await sb().from("user_logos").insert(row);
  if (error) throw error;
}

async function deleteLogo(id) {
  const { error } = await sb().from("user_logos").delete().eq("id", id);
  if (error) throw error;
}

async function setActive(id) {
  const { error } = await sb().rpc("user_logo_set_active", { p_logo_id: id });
  if (error) throw error;
}

async function clearActive() {
  const { error } = await sb().rpc("user_logo_clear_active");
  if (error) throw error;
}

/* =========================================================
   UI: LIST
========================================================= */
function buildPreviewCanvasForLogo(logo) {
  const c = document.createElement("canvas");
  c.width = 300;
  c.height = 140;
  c.style.imageRendering = "pixelated";

  try {
    if (logo.type === TYPE_GLYPH) {
      const rows = logo?.payload?.layers?.[0]?.rows || [];
      const w = 30;
      const h = 10;
      const bits = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        const line = String(rows[y] || "").padEnd(30, " ").slice(0, 30);
        for (let x = 0; x < w; x++) {
          bits[y * w + x] = line[x] !== " " ? 1 : 0;
        }
      }

      const tmp = document.createElement("canvas");
      tmp.width = w;
      tmp.height = h;
      drawBitsToCanvas(bits, w, h, tmp);

      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(tmp, 0, 0, c.width, c.height);
      return c;
    }

    if (logo.type === TYPE_PIX) {
      const p = logo.payload || {};
      const w = Number(p.w) || W;
      const h = Number(p.h) || H;
      const bits = b64ToBits(p.bits_b64 || "", w, h);

      // rysujemy jako 150x70, ale w preview z opcją przerw (zawsze fizyczny wygląda lepiej)
      const phys = (w === W && h === H) ? expandToPhysical(bits) : bits;
      const dw = (w === W && h === H) ? PW : w;
      const dh = (w === W && h === H) ? PH : h;

      const tmp = document.createElement("canvas");
      tmp.width = dw;
      tmp.height = dh;
      drawBitsToCanvas(phys, dw, dh, tmp);

      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(tmp, 0, 0, c.width, c.height);
      return c;
    }
  } catch (e) {
    console.warn("[logo-editor] preview error", e);
  }

  // fallback
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(255,255,255,.12)";
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

function render() {
  if (!grid) return;

  grid.innerHTML = "";

  // add tile
  {
    const add = document.createElement("div");
    add.className = "card add";
    add.innerHTML = "＋ Nowe logo";
    add.addEventListener("click", openCreateModal);
    grid.appendChild(add);
  }

  for (const l of logos) {
    const el = document.createElement("div");
    el.className = "card";

    const activeBadge = l.is_active ? `<div class="badgeActive">Aktywne</div>` : "";

    el.innerHTML = `
      <div class="cardTop">
        <div>
          <div class="name">${esc(l.name || "(bez nazwy)")}</div>
          <div class="meta">${esc(l.type)} · ${esc(fmtDate(l.updated_at) || "")}</div>
        </div>
        ${activeBadge}
      </div>
      <div class="preview"></div>
      <div class="actions"></div>
    `;

    const prevWrap = el.querySelector(".preview");
    prevWrap.appendChild(buildPreviewCanvasForLogo(l));

    const actions = el.querySelector(".actions");

    const btnAct = document.createElement("button");
    btnAct.className = "btn sm gold";
    btnAct.type = "button";
    btnAct.textContent = l.is_active ? "Aktywne" : "Ustaw aktywne";
    btnAct.disabled = !!l.is_active;
    btnAct.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      setMsg("Przełączam aktywne…");
      try {
        await setActive(l.id);
        await refresh();
        setMsg("Aktywne logo ustawione.");
      } catch (e) {
        console.error(e);
        alert("Nie udało się ustawić aktywnego (sprawdź RPC i indeks).\n\n" + (e?.message || e));
        setMsg("");
      }
    });

    const btnDel = document.createElement("button");
    btnDel.className = "btn sm";
    btnDel.type = "button";
    btnDel.textContent = "Usuń";
    btnDel.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const ok = confirm(`Usunąć logo „${l.name || "(bez nazwy)"}”?`);
      if (!ok) return;
      setMsg("Usuwam…");
      try {
        await deleteLogo(l.id);
        await refresh();
        setMsg("Usunięto.");
      } catch (e) {
        console.error(e);
        alert("Nie udało się usunąć.\n\n" + (e?.message || e));
        setMsg("");
      }
    });

    actions.appendChild(btnAct);
    actions.appendChild(btnDel);

    grid.appendChild(el);
  }
}

async function refresh() {
  logos = await listLogos();
  render();
}

/* =========================================================
   CREATE MODAL
========================================================= */
function openCreateModal() {
  createMode = null;
  setMMsg("");
  mTitle.textContent = "Nowe logo";
  mSub.textContent = "Wybierz tryb tworzenia.";

  logoName.value = "";
  textValue.value = "";

  drawBits.fill(0);
  imgBits.fill(0);

  clearCanvas(prevGlyph);
  clearCanvas(drawCanvas);
  clearCanvas(imgCanvas);

  show(modePick, true);
  show(stepCommon, false);
  show(stepText, false);
  show(stepDraw, false);
  show(stepImage, false);
  show(btnCreate, false);

  show(createOverlay, true);
}

function closeCreateModal() {
  show(createOverlay, false);
}

function setCreateStep(mode) {
  createMode = mode;
  setMMsg("");

  show(modePick, false);
  show(stepCommon, true);
  show(stepText, mode === "TEXT");
  show(stepDraw, mode === "DRAW");
  show(stepImage, mode === "IMAGE");
  show(btnCreate, true);

  if (mode === "TEXT") modeHint.textContent = "Tryb: Napis (30×10).";
  if (mode === "DRAW") modeHint.textContent = "Tryb: Rysunek (150×70).";
  if (mode === "IMAGE") modeHint.textContent = "Tryb: Obraz (150×70).";

  // default name
  if (!logoName.value.trim()) {
    if (mode === "TEXT") logoName.value = "Napis";
    if (mode === "DRAW") logoName.value = "Rysunek";
    if (mode === "IMAGE") logoName.value = "Obraz";
  }

  if (mode === "TEXT") renderGlyphPreview();
  if (mode === "DRAW") renderDrawCanvas();
  if (mode === "IMAGE") renderImgCanvas();
}

/* ===== TEXT (GLYPH) ===== */
function makeGlyphRowsFromText(t) {
  const rows = Array.from({ length: 10 }, () => " ".repeat(30));
  const text = String(t || "").toUpperCase().slice(0, 30);
  const x0 = Math.max(0, Math.floor((30 - text.length) / 2));
  const y = 4; // środek
  const line = rows[y].split("");
  for (let i = 0; i < text.length; i++) line[x0 + i] = text[i] === " " ? " " : "█";
  rows[y] = line.join("");

  // lekka ramka, żeby było "logo-like"
  rows[0] = "█".repeat(30);
  rows[9] = "█".repeat(30);
  for (let yy = 1; yy <= 8; yy++) {
    const a = rows[yy].split("");
    a[0] = "█";
    a[29] = "█";
    rows[yy] = a.join("");
  }

  return rows;
}

function renderGlyphPreview() {
  const rows = makeGlyphRowsFromText(textValue.value);

  const w = 30;
  const h = 10;
  const bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const line = rows[y];
    for (let x = 0; x < w; x++) bits[y * w + x] = line[x] !== " " ? 1 : 0;
  }

  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  drawBitsToCanvas(bits, w, h, tmp);

  const ctx = prevGlyph.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, prevGlyph.width, prevGlyph.height);
  ctx.drawImage(tmp, 0, 0, prevGlyph.width, prevGlyph.height);
}

/* ===== DRAW (PIX) ===== */
function renderDrawCanvas() {
  if (!drawCanvas) return;
  const ctx = drawCanvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const bits = chkPreviewPhysical?.checked ? expandToPhysical(drawBits) : drawBits;
  const dw = chkPreviewPhysical?.checked ? PW : W;
  const dh = chkPreviewPhysical?.checked ? PH : H;

  // rysujemy do tymczasowego canvas w rozdzielczości docelowej
  const tmp = document.createElement("canvas");
  tmp.width = dw;
  tmp.height = dh;
  drawBitsToCanvas(bits, dw, dh, tmp);

  // a potem skalujemy do drawCanvas (który ma 150x70 w atrybutach) – ale wyświetlenie robi CSS
  drawCanvas.width = dw;
  drawCanvas.height = dh;
  const dctx = drawCanvas.getContext("2d");
  dctx.imageSmoothingEnabled = false;
  dctx.clearRect(0, 0, dw, dh);
  dctx.drawImage(tmp, 0, 0);
}

function setDrawPixel(x, y, val) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  drawBits[y * W + x] = val ? 1 : 0;
}

function pointerToLogicalXY(ev, canvas) {
  const rect = canvas.getBoundingClientRect();
  const cx = (ev.clientX - rect.left) / rect.width;
  const cy = (ev.clientY - rect.top) / rect.height;

  // jeśli renderujemy fizyczny, mapujemy z powrotem: (px,py) -> (x,y)
  if (chkPreviewPhysical?.checked) {
    const px = Math.floor(cx * PW);
    const py = Math.floor(cy * PH);
    const phys = new Uint8Array(PW * PH);
    // tylko do mapowania: kompresja z maski gdzie 1 w klikniętym pikselu
    phys[py * PW + px] = 1;
    const comp = compressFromPhysical(phys);
    // znajdź jedynkę
    for (let i = 0; i < comp.length; i++) {
      if (comp[i]) return { x: i % W, y: Math.floor(i / W) };
    }
    return null;
  }

  return { x: Math.floor(cx * W), y: Math.floor(cy * H) };
}

function installDrawHandlers() {
  if (!drawCanvas) return;

  let down = false;

  const paint = (ev) => {
    const p = pointerToLogicalXY(ev, drawCanvas);
    if (!p) return;

    const val = drawTool === "BRUSH" ? 1 : 0;

    // mały "okrągły" pędzel 2x2
    for (let dy = -1; dy <= 0; dy++) {
      for (let dx = -1; dx <= 0; dx++) {
        setDrawPixel(p.x + dx, p.y + dy, val);
      }
    }

    renderDrawCanvas();
  };

  drawCanvas.addEventListener("pointerdown", (ev) => {
    down = true;
    drawCanvas.setPointerCapture(ev.pointerId);
    paint(ev);
  });

  drawCanvas.addEventListener("pointermove", (ev) => {
    if (!down) return;
    paint(ev);
  });

  drawCanvas.addEventListener("pointerup", () => { down = false; });
  drawCanvas.addEventListener("pointercancel", () => { down = false; });
}

/* ===== IMAGE (PIX) ===== */
function renderImgCanvas() {
  drawBitsToCanvas(imgBits, W, H, imgCanvas);
}

function imageDataToBits(imgData, dither) {
  const out = new Uint8Array(W * H);

  // prosty Floyd–Steinberg (opcjonalnie)
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = imgData.data[i * 4 + 0];
    const g = imgData.data[i * 4 + 1];
    const b = imgData.data[i * 4 + 2];
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  if (!dither) {
    for (let i = 0; i < W * H; i++) out[i] = lum[i] >= 128 ? 1 : 0;
    return out;
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const oldv = lum[i];
      const newv = oldv >= 128 ? 255 : 0;
      out[i] = newv ? 1 : 0;
      const err = oldv - newv;

      if (x + 1 < W) lum[i + 1] += err * (7 / 16);
      if (y + 1 < H) {
        if (x > 0) lum[i + W - 1] += err * (3 / 16);
        lum[i + W] += err * (5 / 16);
        if (x + 1 < W) lum[i + W + 1] += err * (1 / 16);
      }
    }
  }

  return out;
}

async function loadImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("Nie udało się wczytać obrazu."));
      img.src = url;
    });

    const tmp = document.createElement("canvas");
    tmp.width = W;
    tmp.height = H;
    const ctx = tmp.getContext("2d");

    const contain = !!chkImgContain?.checked;
    const sx = img.width;
    const sy = img.height;

    let dw = W;
    let dh = H;
    let dx = 0;
    let dy = 0;

    if (contain) {
      const s = Math.min(W / sx, H / sy);
      dw = Math.max(1, Math.round(sx * s));
      dh = Math.max(1, Math.round(sy * s));
      dx = Math.floor((W - dw) / 2);
      dy = Math.floor((H - dh) / 2);
    } else {
      const s = Math.max(W / sx, H / sy);
      dw = Math.max(1, Math.round(sx * s));
      dh = Math.max(1, Math.round(sy * s));
      dx = Math.floor((W - dw) / 2);
      dy = Math.floor((H - dh) / 2);
    }

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, dx, dy, dw, dh);

    const data = ctx.getImageData(0, 0, W, H);
    imgBits = imageDataToBits(data, !!chkImgDither?.checked);
    renderImgCanvas();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* =========================================================
   CREATE -> INSERT
========================================================= */
async function handleCreate() {
  const name = String(logoName.value || "").trim() || "Logo";

  try {
    setMMsg("Zapisuję…");

    if (createMode === "TEXT") {
      const rows = makeGlyphRowsFromText(textValue.value);
      const payload = { layers: [{ color: "main", rows }] };
      await createLogo({
        user_id: currentUser.id,
        name,
        type: TYPE_GLYPH,
        is_active: false,
        payload,
      });
      setMMsg("Zapisano.");
      closeCreateModal();
      await refresh();
      return;
    }

    if (createMode === "DRAW") {
      const payload = {
        w: W,
        h: H,
        format: "BITPACK_MSB_FIRST_ROW_MAJOR",
        bits_b64: bitsToB64(drawBits, W, H),
      };
      await createLogo({
        user_id: currentUser.id,
        name,
        type: TYPE_PIX,
        is_active: false,
        payload,
      });
      setMMsg("Zapisano.");
      closeCreateModal();
      await refresh();
      return;
    }

    if (createMode === "IMAGE") {
      const payload = {
        w: W,
        h: H,
        format: "BITPACK_MSB_FIRST_ROW_MAJOR",
        bits_b64: bitsToB64(imgBits, W, H),
      };
      await createLogo({
        user_id: currentUser.id,
        name,
        type: TYPE_PIX,
        is_active: false,
        payload,
      });
      setMMsg("Zapisano.");
      closeCreateModal();
      await refresh();
      return;
    }

    setMMsg("Wybierz tryb.");
  } catch (e) {
    console.error(e);
    setMMsg("Błąd: " + (e?.message || e));
    alert("Nie udało się zapisać.\n\n" + (e?.message || e));
  }
}

/* =========================================================
   EVENTS
========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await requireAuth("index.html");
  who.textContent = currentUser?.email || "—";

  btnBack?.addEventListener("click", () => { location.href = "builder.html"; });

  btnLogout?.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  btnClearActive?.addEventListener("click", async () => {
    const ok = confirm("Wyłączyć aktywne logo? (użytkownik będzie mieć 0 aktywnych)");
    if (!ok) return;
    setMsg("Wyłączam…");
    try {
      await clearActive();
      await refresh();
      setMsg("Aktywne wyłączone.");
    } catch (e) {
      console.error(e);
      alert("Nie udało się.\n\n" + (e?.message || e));
      setMsg("");
    }
  });

  // modal: pick
  pickText?.addEventListener("click", () => setCreateStep("TEXT"));
  pickDraw?.addEventListener("click", () => setCreateStep("DRAW"));
  pickImage?.addEventListener("click", () => setCreateStep("IMAGE"));

  btnCancel?.addEventListener("click", closeCreateModal);
  createOverlay?.addEventListener("click", (ev) => {
    if (ev.target === createOverlay) closeCreateModal();
  });

  btnCreate?.addEventListener("click", handleCreate);

  // text
  textValue?.addEventListener("input", renderGlyphPreview);

  // draw
  btnBrush?.addEventListener("click", () => { drawTool = "BRUSH"; btnBrush.classList.add("gold"); btnEraser.classList.remove("gold"); });
  btnEraser?.addEventListener("click", () => { drawTool = "ERASER"; btnEraser.classList.add("gold"); btnBrush.classList.remove("gold"); });
  btnClear?.addEventListener("click", () => { drawBits.fill(0); renderDrawCanvas(); });
  chkPreviewPhysical?.addEventListener("change", renderDrawCanvas);
  installDrawHandlers();

  // image
  imgFile?.addEventListener("change", async () => {
    const f = imgFile.files?.[0];
    if (!f) return;
    try {
      await loadImageFile(f);
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    }
  });
  chkImgContain?.addEventListener("change", async () => {
    const f = imgFile.files?.[0];
    if (f) await loadImageFile(f);
  });
  chkImgDither?.addEventListener("change", async () => {
    const f = imgFile.files?.[0];
    if (f) await loadImageFile(f);
  });

  // defaults
  btnBrush?.classList.add("gold");

  await refresh();
});
