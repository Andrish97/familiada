// js/pages/demo-seed.js

import { getUserDemoFlag, setUserDemoFlag } from "../core/user-flags.js";
import { sb } from "../core/supabase.js";

import { importBaseFromUrl } from "./bases-import.js";
import { importPollFromUrl, importGame } from "./builder-import-export.js";
import { demoImport4Logos } from "../../logo-editor/js/demo-import.js";

/* =========================================================
   DEMO URLs (pełne linki)
========================================================= */
const DEMO = "https://andrish97.github.io/familiada/demo";

/* =========================================================
   Simple global guard (żeby nie odpalało 10x)
========================================================= */
function isSeedRunning() {
  return !!window.__DEMO_SEED_RUNNING__;
}
function markSeedRunning(on) {
  window.__DEMO_SEED_RUNNING__ = !!on;
}

/* =========================================================
   Progress modal (blokuje UI)
   Styl: “jak modal importu” = overlay + panel + tekst + pasek
========================================================= */

function ensureProgressModal() {
  let ov = document.getElementById("demoProgressOverlay");
  if (ov) return ov;

  ov = document.createElement("div");
  ov.id = "demoProgressOverlay";
  ov.style.position = "fixed";
  ov.style.inset = "0";
  ov.style.zIndex = "99999";
  ov.style.display = "none";
  ov.style.placeItems = "center";
  ov.style.background = "rgba(0,0,0,.72)";
  ov.style.backdropFilter = "blur(6px)";
  ov.style.padding = "16px";

  ov.innerHTML = `
    <div class="card" style="width:min(720px, 96vw); padding:16px; display:grid; gap:10px;">
      <div style="font-weight:900; letter-spacing:.08em; text-transform:uppercase;">
        PRZYWRACANIE DEMO…
      </div>

      <div id="demoProgressStep" style="font-size:14px; opacity:.9;"></div>

      <div style="height:10px; background: rgba(255,255,255,.12); border-radius: 999px; overflow:hidden;">
        <div id="demoProgressBar" style="height:100%; width:0%; background: rgba(255,255,255,.75);"></div>
      </div>
      <div id="demoProgressPct" style="font-size:12px; opacity:.8;"></div>

      <div id="demoProgressHint" style="font-size:12px; opacity:.7;">
        Nie zamykaj strony. To okno blokuje interfejs do czasu zakończenia.
      </div>

      <div id="demoProgressErr" style="display:none; font-size:13px; color:#ffb3b3;"></div>
    </div>
  `;

  document.body.appendChild(ov);
  return ov;
}

function progressOpen() {
  const ov = ensureProgressModal();
  ov.style.display = "grid";
}

function progressClose() {
  const ov = document.getElementById("demoProgressOverlay");
  if (ov) ov.style.display = "none";
}

function progressSet(stepText, i, total) {
  const stepEl = document.getElementById("demoProgressStep");
  const barEl = document.getElementById("demoProgressBar");
  const pctEl = document.getElementById("demoProgressPct");
  const errEl = document.getElementById("demoProgressErr");

  if (errEl) {
    errEl.style.display = "none";
    errEl.textContent = "";
  }

  const safeTotal = Number(total) > 0 ? Number(total) : 1;
  const safeI = Math.max(0, Math.min(safeTotal, Number(i) || 0));
  const pct = Math.round((safeI / safeTotal) * 100);

  if (stepEl) stepEl.textContent = `${safeI}/${safeTotal} — ${stepText || ""}`;
  if (barEl) barEl.style.width = `${pct}%`;
  if (pctEl) pctEl.textContent = `${pct}%`;
}

function progressError(msg) {
  const errEl = document.getElementById("demoProgressErr");
  if (errEl) {
    errEl.style.display = "block";
    errEl.textContent = `Błąd: ${String(msg || "Nieznany błąd")}`;
  }
}

/* =========================================================
   Utils
========================================================= */

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`DEMO: nie udało się pobrać ${url} (HTTP ${res.status})`);
  return await res.json();
}

async function currentUserId() {
  const { data, error } = await sb().auth.getUser();
  if (error) throw error;

  const uid = data?.user?.id;
  if (!uid) throw new Error("DEMO: brak zalogowanego użytkownika.");

  return uid;
}

/* =========================================================
   Main seed
========================================================= */

export async function seedDemoOnceIfNeeded(userId) {
  if (isSeedRunning()) {
    // już trwa – nie odpalamy drugi raz
    return { ran: false, skipped: true };
  }

  markSeedRunning(true);

  const uid = userId || (await currentUserId());

  // FLAGA: tylko ona decyduje, czy seed w ogóle ma ruszyć
  const flagBefore = await getUserDemoFlag(uid);
  console.log("[DEMO] flag before:", flagBefore);

  if (!flagBefore) {
    markSeedRunning(false);
    return { ran: false };
  }

  // pokaż modal dopiero gdy faktycznie startujemy
  progressOpen();

  // policz kroki “na sztywno” (bez ??)
  const TOTAL = 1 /*base*/ + 1 /*logos*/ + 4 /*polls*/ + 3 /*drafts*/ + 1 /*flag off*/;
  let step = 0;

  try {
    /* ===============================
       1) Baza pytań
    =============================== */
    step++; progressSet("Import bazy pytań", step, TOTAL);
    await importBaseFromUrl(`${DEMO}/base.json`);

    /* ===============================
       2) Loga (jedna operacja)
    =============================== */
    step++; progressSet("Import log 4/4 (jedna operacja)", step, TOTAL);
    await demoImport4Logos(
      `${DEMO}/logo_text.json`,
      `${DEMO}/logo_text-pix.json`,
      `${DEMO}/logo_draw.json`,
      `${DEMO}/logo_image.json`
    );

    /* ===============================
       3) Gry sondażowe (open/closed)
       Uwaga:
         - open -> poll_open + poll_sessions is_open=true
         - closed -> ready + poll_sessions is_open=false
         - poll_text votes seeding OFF (requires p_key)
    =============================== */
    step++; progressSet("Import sondażu 1/4 (poll_text_open)", step, TOTAL);
    await importPollFromUrl(`${DEMO}/poll_text_open.json`);

    step++; progressSet("Import sondażu 2/4 (poll_text_closed)", step, TOTAL);
    await importPollFromUrl(`${DEMO}/poll_text_closed.json`);

    step++; progressSet("Import sondażu 3/4 (poll_points_open)", step, TOTAL);
    await importPollFromUrl(`${DEMO}/poll_points_open.json`);

    step++; progressSet("Import sondażu 4/4 (poll_points_closed)", step, TOTAL);
    await importPollFromUrl(`${DEMO}/poll_points_closed.json`);

    /* ===============================
       4) Szkice (drafty)
    =============================== */
    step++; progressSet("Import szkicu 1/3 (prepared)", step, TOTAL);
    await importGame(await fetchJson(`${DEMO}/prepared.json`), uid);

    step++; progressSet("Import szkicu 2/3 (poll_points_draft)", step, TOTAL);
    await importGame(await fetchJson(`${DEMO}/poll_points_draft.json`), uid);

    step++; progressSet("Import szkicu 3/3 (poll_text_draft)", step, TOTAL);
    await importGame(await fetchJson(`${DEMO}/poll_text_draft.json`), uid);

    /* ===============================
       5) OFF (tylko raz)
    =============================== */
    step++; progressSet("Zamykanie trybu demo", step, TOTAL);
    await setUserDemoFlag(uid, false);

    const flagAfter = await getUserDemoFlag(uid);
    console.log("[DEMO] flag after OFF:", flagAfter);

    progressSet("Gotowe ✅", TOTAL, TOTAL);
    setTimeout(() => progressClose(), 350);

    markSeedRunning(false);
    return { ran: true };

  } catch (e) {
    console.error("[DEMO] seed failed:", e);

    // pokaż błąd w modalu
    progressError(e?.message || e);

    // restore flag -> TRUE żeby można było spróbować ponownie
    try {
      await setUserDemoFlag(uid, true);
      console.warn("[DEMO] flag restored to true after failure");
    } catch (e2) {
      console.warn("[DEMO] failed to restore flag:", e2);
    }

    markSeedRunning(false);
    throw e;
  }
}
