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
   Progress modal (blokujący, w stylu buildera — bez HTML zmian)
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
  ov.style.background = "rgba(0,0,0,.72)";
  ov.style.backdropFilter = "blur(2px)";
  ov.style.padding = "18px";
  ov.style.alignItems = "center";
  ov.style.justifyContent = "center";

  ov.innerHTML = `
    <div style="
      width:min(760px, 94vw);
      background:rgba(20,20,28,.96);
      border:1px solid rgba(255,255,255,.14);
      border-radius:18px;
      padding:16px 16px 14px;
      box-shadow:0 20px 60px rgba(0,0,0,.45);
      color:#fff;
      font-family:system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    ">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div style="font-weight:900;letter-spacing:.06em;text-transform:uppercase;opacity:.95">
          PRZYWRACANIE DEMO…
        </div>
        <button id="demoProgressCloseBtn" type="button" style="
          display:none;
          border:1px solid rgba(255,255,255,.22);
          background:rgba(255,255,255,.08);
          color:#fff;
          border-radius:12px;
          padding:8px 10px;
          font-weight:800;
          cursor:pointer;
        ">Zamknij</button>
      </div>

      <div id="demoProgressStep" style="margin-top:10px;font-weight:800;opacity:.95">—</div>
      <div id="demoProgressSub" style="margin-top:6px;opacity:.85">Nie zamykaj strony. To okno blokuje interfejs do czasu zakończenia.</div>

      <div style="margin-top:12px;border:1px solid rgba(255,255,255,.16);border-radius:999px;overflow:hidden;background:rgba(255,255,255,.06)">
        <div id="demoProgressBar" style="height:10px;width:0%;background:rgba(120,180,255,.9)"></div>
      </div>
      <div id="demoProgressPct" style="margin-top:8px;font-size:13px;opacity:.85">0%</div>

      <div id="demoProgressLog" style="
        margin-top:12px;
        max-height:240px;
        overflow:auto;
        padding:10px;
        border-radius:14px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(0,0,0,.25);
        font-size:13px;
        line-height:1.35;
        white-space:pre-wrap;
      "></div>
    </div>
  `;

  document.body.appendChild(ov);
  return ov;
}

function progressApi() {
  const ov = ensureProgressModal();
  const stepEl = document.getElementById("demoProgressStep");
  const subEl = document.getElementById("demoProgressSub");
  const barEl = document.getElementById("demoProgressBar");
  const pctEl = document.getElementById("demoProgressPct");
  const logEl = document.getElementById("demoProgressLog");
  const closeBtn = document.getElementById("demoProgressCloseBtn");

  function show() {
    ov.style.display = "flex";
    closeBtn.style.display = "none";
    logEl.textContent = "";
  }

  function hide() {
    ov.style.display = "none";
  }

  function setStep(text) {
    if (stepEl) stepEl.textContent = text || "—";
  }

  function setSub(text) {
    if (subEl) subEl.textContent = text || "";
  }

  function setPct(p) {
    const x = Math.max(0, Math.min(100, Math.floor(Number(p) || 0)));
    if (barEl) barEl.style.width = `${x}%`;
    if (pctEl) pctEl.textContent = `${x}%`;
  }

  function log(line) {
    if (!logEl) return;
    logEl.textContent += (logEl.textContent ? "\n" : "") + String(line || "");
    logEl.scrollTop = logEl.scrollHeight;
  }

  function showClose(onClose) {
    if (!closeBtn) return;
    closeBtn.style.display = "";
    closeBtn.onclick = () => onClose?.();
  }

  return { show, hide, setStep, setSub, setPct, log, showClose };
}

/* =========================================================
   Główna logika demo seeda (z mutexem)
========================================================= */

export async function seedDemoOnceIfNeeded(userId) {
  // mutex — żeby seed nie odpalał 5x równolegle
  if (window.__demoSeedPromise) return await window.__demoSeedPromise;

  window.__demoSeedPromise = (async () => {
    const ui = progressApi();
    const uid = userId || (await currentUserId());

    const isDemo = await getUserDemoFlag(uid);
    console.log("[DEMO] flag before:", isDemo);

    if (!isDemo) return { ran: false };

    const beforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };

    const steps = [
      { label: "Import bazy pytań", run: async () => importBaseFromUrl(`${DEMO}/base.json`) },

      {
        label: "Import log 4/4 (jedna operacja)",
        run: async () =>
          demoImport4Logos(
            `${DEMO}/logo_text.json`,
            `${DEMO}/logo_text-pix.json`,
            `${DEMO}/logo_draw.json`,
            `${DEMO}/logo_image.json`
          ),
      },

      { label: "Import sondażu 1/4 (poll_text_open)", run: async () => importPollFromUrl(`${DEMO}/poll_text_open.json`) },
      { label: "Import sondażu 2/4 (poll_text_closed)", run: async () => importPollFromUrl(`${DEMO}/poll_text_closed.json`) },
      { label: "Import sondażu 3/4 (poll_points_open)", run: async () => importPollFromUrl(`${DEMO}/poll_points_open.json`) },
      { label: "Import sondażu 4/4 (poll_points_closed)", run: async () => importPollFromUrl(`${DEMO}/poll_points_closed.json`) },

      {
        label: "Import szkicu 1/3 (prepared)",
        run: async () => {
          const prepared = await fetchJson(`${DEMO}/prepared.json`);
          await importGame(prepared, uid);
        },
      },
      {
        label: "Import szkicu 2/3 (poll_points_draft)",
        run: async () => {
          const pollPtsDraft = await fetchJson(`${DEMO}/poll_points_draft.json`);
          await importGame(pollPtsDraft, uid);
        },
      },
      {
        label: "Import szkicu 3/3 (poll_text_draft)",
        run: async () => {
          const pollTxtDraft = await fetchJson(`${DEMO}/poll_text_draft.json`);
          await importGame(pollTxtDraft, uid);
        },
      },
    ];

    const total = steps.length;

    ui.show();
    ui.setSub("Nie zamykaj strony. To okno blokuje interfejs do czasu zakończenia.");
    ui.setPct(0);
    window.addEventListener("beforeunload", beforeUnload);

    try {
      for (let i = 0; i < total; i++) {
        ui.setStep(`${i + 1}/${total} ${steps[i].label}`);
        ui.log(steps[i].label);

        // prosty progres: krok i/total
        ui.setPct(Math.floor((i / total) * 100));

        await steps[i].run();

        ui.setPct(Math.floor(((i + 1) / total) * 100));
      }

      await setUserDemoFlag(uid, false);
      console.log("[DEMO] flag after OFF: false");

      ui.log("OK ✅ Demo zostało przywrócone.");
      ui.setStep(`${total}/${total} Zakończono`);
      ui.setPct(100);

      // zdejmij blokadę
      window.removeEventListener("beforeunload", beforeUnload);
      ui.showClose(() => ui.hide());

      return { ran: true };
    } catch (e) {
      console.error("[DEMO] seed failed:", e);

      // jeśli coś padło — przywracamy flagę, żeby można było ponowić
      try {
        await setUserDemoFlag(uid, true);
        console.warn("[DEMO] flag restored to true after failure");
      } catch (e2) {
        console.warn("[DEMO] flag restore failed:", e2);
      }

      ui.log(`Błąd: ${e?.message || String(e)}`);
      ui.log("Flaga demo została przywrócona na TRUE (możesz spróbować ponownie).");

      window.removeEventListener("beforeunload", beforeUnload);
      ui.showClose(() => ui.hide());

      throw e;
    } finally {
      // zwolnij mutex po zakończeniu
      window.__demoSeedPromise = null;
    }
  })();

  return await window.__demoSeedPromise;
}
