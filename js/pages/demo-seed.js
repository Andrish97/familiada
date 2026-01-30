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
   Progress Modal (blokuje UI, styl jak import buildera)
========================================================= */
function ensureProgressModal() {
  let ov = document.getElementById("demoSeedOverlay");
  if (ov) return ov;

  ov = document.createElement("div");
  ov.id = "demoSeedOverlay";
  ov.className = "overlay";
  ov.style.display = "none";

  ov.innerHTML = `
    <div class="modal" style="width:min(640px,94vw)">
      <div class="mTitle">PRZYWRACANIE DEMO…</div>
      <div class="mSub" id="demoSeedSub">Nie zamykaj strony. To okno blokuje interfejs do czasu zakończenia.</div>

      <div style="margin-top:12px;display:grid;gap:10px">
        <div class="importRow" style="align-items:center">
          <div id="demoSeedStep" style="font-weight:800;letter-spacing:.04em">—</div>
          <div id="demoSeedCount" style="margin-left:auto;opacity:.8">0/0</div>
        </div>

        <div style="height:10px;border-radius:999px;background:rgba(255,255,255,.10);overflow:hidden">
          <div id="demoSeedBar" style="height:100%;width:0%;background:rgba(255,255,255,.85)"></div>
        </div>

        <div class="importMsg" id="demoSeedMsg" style="min-height:18px"></div>
      </div>
    </div>
  `;

  document.body.appendChild(ov);

  // blok klików w tło
  ov.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
  });

  return ov;
}

function showProgress(on) {
  const ov = ensureProgressModal();
  ov.style.display = on ? "" : "none";
}

function setProgress({ step, i, n, msg, isError } = {}) {
  const stepEl = document.getElementById("demoSeedStep");
  const countEl = document.getElementById("demoSeedCount");
  const barEl = document.getElementById("demoSeedBar");
  const msgEl = document.getElementById("demoSeedMsg");

  if (stepEl && step) stepEl.textContent = step;
  if (countEl) countEl.textContent = `${i}/${n}`;

  const pct = n > 0 ? Math.round((i / n) * 100) : 0;
  if (barEl) barEl.style.width = `${pct}%`;

  if (msgEl) {
    msgEl.textContent = msg || "";
    msgEl.style.opacity = isError ? "1" : ".85";
  }
}

/* =========================================================
   Utils
========================================================= */
async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`DEMO: nie udało się pobrać ${url} (HTTP ${res.status})`);
  }
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
   Główna logika demo seeda
========================================================= */
export async function seedDemoOnceIfNeeded(userId) {
  // guard przeciw równoległym odpaleniom (duplikaty!)
  if (window.__demoSeedRunning) return { ran: false, running: true };
  window.__demoSeedRunning = true;

  const uid = userId || (await currentUserId());
  const isDemo = await getUserDemoFlag(uid);

  if (!isDemo) {
    window.__demoSeedRunning = false;
    return { ran: false };
  }

  // Kroki (bez "??")
  const steps = [
    { label: "Import bazy pytań", fn: async () => importBaseFromUrl(`${DEMO}/base.json`) },
    {
      label: "Import log 4/4 (jedna operacja)",
      fn: async () =>
        demoImport4Logos(
          `${DEMO}/logo_text.json`,
          `${DEMO}/logo_text-pix.json`,
          `${DEMO}/logo_draw.json`,
          `${DEMO}/logo_image.json`
        ),
    },
    { label: "Import sondażu 1/4 (poll_text_open)", fn: async () => importPollFromUrl(`${DEMO}/poll_text_open.json`) },
    { label: "Import sondażu 2/4 (poll_text_closed)", fn: async () => importPollFromUrl(`${DEMO}/poll_text_closed.json`) },
    { label: "Import sondażu 3/4 (poll_points_open)", fn: async () => importPollFromUrl(`${DEMO}/poll_points_open.json`) },
    { label: "Import sondażu 4/4 (poll_points_closed)", fn: async () => importPollFromUrl(`${DEMO}/poll_points_closed.json`) },
    {
      label: "Import szkicu 1/3 (prepared)",
      fn: async () => {
        const prepared = await fetchJson(`${DEMO}/prepared.json`);
        await importGame(prepared, uid);
      },
    },
    {
      label: "Import szkicu 2/3 (poll_points_draft)",
      fn: async () => {
        const pollPtsDraft = await fetchJson(`${DEMO}/poll_points_draft.json`);
        await importGame(pollPtsDraft, uid);
      },
    },
    {
      label: "Import szkicu 3/3 (poll_text_draft)",
      fn: async () => {
        const pollTxtDraft = await fetchJson(`${DEMO}/poll_text_draft.json`);
        await importGame(pollTxtDraft, uid);
      },
    },
  ];

  try {
    showProgress(true);
    setProgress({ step: "Start…", i: 0, n: steps.length, msg: "" });

    for (let idx = 0; idx < steps.length; idx++) {
      const s = steps[idx];
      setProgress({ step: s.label, i: idx, n: steps.length, msg: "" });
      await s.fn();
      setProgress({ step: s.label, i: idx + 1, n: steps.length, msg: "OK" });
    }

    // OFF dopiero po pełnym sukcesie
    await setUserDemoFlag(uid, false);

    setProgress({
      step: "Gotowe ✅",
      i: steps.length,
      n: steps.length,
      msg: "Demo zostało przywrócone. Możesz korzystać normalnie.",
    });

    // zostaw na chwilę, ale nie blokuj w nieskończoność
    setTimeout(() => showProgress(false), 700);

    return { ran: true };
  } catch (e) {
    console.error("[DEMO] seed failed:", e);

    // przy błędzie: przywróć flagę na TRUE (żeby można powtórzyć)
    try {
      await setUserDemoFlag(uid, true);
      console.warn("[DEMO] flag restored to true after failure");
    } catch (e2) {
      console.warn("[DEMO] failed to restore flag:", e2);
    }

    setProgress({
      step: "Błąd ❌",
      i: 0,
      n: steps.length,
      msg: `Błąd: ${e?.message || String(e)}`,
      isError: true,
    });

    throw e;
  } finally {
    window.__demoSeedRunning = false;
  }
}
