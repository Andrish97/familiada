// js/pages/demo-seed.js

import { getUserDemoFlag, setUserDemoFlag } from "../core/user-flags.js";
import { sb } from "../core/supabase.js";

import { importBaseFromUrl } from "./bases-import.js";
import { importPollFromUrl, importGame } from "./builder-import-export.js";
import { demoImport4Logos } from "../../logo-editor/js/demo-import.js";

/* =========================================================
   DEMO URLs (pełne linki, nie względne)
========================================================= */

const DEMO = "https://andrish97.github.io/familiada/demo";

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
   Progress modal (blokuje UI)
========================================================= */

function createProgressModal() {
  const ov = document.createElement("div");
  ov.id = "demoProgressOverlay";
  ov.style.position = "fixed";
  ov.style.inset = "0";
  ov.style.zIndex = "99999";
  ov.style.background = "rgba(0,0,0,.72)";
  ov.style.display = "grid";
  ov.style.placeItems = "center";
  ov.style.padding = "18px";

  const card = document.createElement("div");
  card.style.width = "min(720px, 92vw)";
  card.style.borderRadius = "18px";
  card.style.border = "1px solid rgba(255,255,255,.18)";
  card.style.background = "rgba(20,20,25,.92)";
  card.style.boxShadow = "0 18px 60px rgba(0,0,0,.55)";
  card.style.color = "white";
  card.style.padding = "16px 16px 14px";
  card.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial";

  card.innerHTML = `
    <div style="font-weight:900; letter-spacing:.08em; text-transform:uppercase; opacity:.95">
      PRZYWRACANIE DEMO…
    </div>
    <div id="demoStepLine" style="margin-top:10px; font-weight:800; font-size:14px; opacity:.95">
      Start…
    </div>

    <div style="margin-top:10px; display:grid; gap:8px">
      <div style="height:10px; background:rgba(255,255,255,.12); border-radius:999px; overflow:hidden">
        <div id="demoBar" style="height:100%; width:0%; background:rgba(255,255,255,.85)"></div>
      </div>
      <div id="demoPct" style="font-size:12px; opacity:.8">
        0%
      </div>
    </div>

    <div id="demoLog" style="margin-top:10px; font-size:12px; opacity:.85; max-height:220px; overflow:auto; border-top:1px solid rgba(255,255,255,.12); padding-top:10px">
      Nie zamykaj strony. To okno blokuje interfejs do czasu zakończenia.
    </div>
  `;

  ov.appendChild(card);
  document.body.appendChild(ov);

  const $ = (id) => ov.querySelector(`#${id}`);
  return {
    close() { ov.remove(); },
    set(stepIdx, total, text) {
      const line = $(`demoStepLine`);
      const bar = $(`demoBar`);
      const pct = $(`demoPct`);
      if (line) line.textContent = `${stepIdx}/${total} ${text}`;
      const p = total > 0 ? Math.round((stepIdx / total) * 100) : 0;
      if (bar) bar.style.width = `${Math.max(0, Math.min(100, p))}%`;
      if (pct) pct.textContent = `${p}%`;
    },
    log(msg) {
      const el = $(`demoLog`);
      if (!el) return;
      const div = document.createElement("div");
      div.textContent = msg;
      div.style.marginTop = "6px";
      div.style.opacity = ".9";
      el.appendChild(div);
      el.scrollTop = el.scrollHeight;
    },
    error(msg) {
      const el = $(`demoLog`);
      if (!el) return;
      const div = document.createElement("div");
      div.textContent = msg;
      div.style.marginTop = "10px";
      div.style.color = "#ffb3b3";
      div.style.fontWeight = "800";
      el.appendChild(div);
      el.scrollTop = el.scrollHeight;
    }
  };
}

/* =========================================================
   Główna logika demo seeda
========================================================= */

export async function seedDemoOnceIfNeeded(userId) {
  const uid = userId || (await currentUserId());

  const isDemo = await getUserDemoFlag(uid);
  console.log("[DEMO] flag before:", isDemo);

  if (!isDemo) return { ran: false };

  const ui = createProgressModal();

  // WAŻNE: gasimy flagę OD RAZU, żeby nie odpalało się 10x przy reload/klikach.
  await setUserDemoFlag(uid, false);
  console.log("[DEMO] flag after OFF:", await getUserDemoFlag(uid));

  // lista kroków (bez ???)
  const steps = [
    "Import bazy pytań",
    "Import logo 1/4 (text)",
    "Import logo 2/4 (text-pix)",
    "Import logo 3/4 (draw)",
    "Import logo 4/4 (image)",
    "Import sondażu 1/4 (poll_text_open)",
    "Import sondażu 2/4 (poll_text_closed)",
    "Import sondażu 3/4 (poll_points_open)",
    "Import sondażu 4/4 (poll_points_closed)",
    "Import szkicu 1/3 (prepared)",
    "Import szkicu 2/3 (poll_points_draft)",
    "Import szkicu 3/3 (poll_text_draft)",
  ];

  const total = steps.length;
  let i = 0;

  const step = async (label, fn) => {
    i += 1;
    ui.set(i, total, label);
    ui.log(label);
    await fn();
  };

  try {
    await step(steps[0], async () => {
      await importBaseFromUrl(`${DEMO}/base.json`);
    });

    await step(steps[1], async () => {
      await demoImport4Logos(
        `${DEMO}/logo_text.json`,
        `${DEMO}/logo_text-pix.json`,
        `${DEMO}/logo_draw.json`,
        `${DEMO}/logo_image.json`
      );
    });
    // demoImport4Logos robi 4 na raz — więc “kroki 2-4” traktujemy jako informacyjne:
    ui.log("Logo: import 4/4 wykonany w jednej operacji.");

    // Polls
    await step(steps[5], async () => { await importPollFromUrl(`${DEMO}/poll_text_open.json`); });
    await step(steps[6], async () => { await importPollFromUrl(`${DEMO}/poll_text_closed.json`); });
    await step(steps[7], async () => { await importPollFromUrl(`${DEMO}/poll_points_open.json`); });
    await step(steps[8], async () => { await importPollFromUrl(`${DEMO}/poll_points_closed.json`); });

    // Drafty
    await step(steps[9], async () => {
      const prepared = await fetchJson(`${DEMO}/prepared.json`);
      await importGame(prepared, uid);
    });

    await step(steps[10], async () => {
      const pollPtsDraft = await fetchJson(`${DEMO}/poll_points_draft.json`);
      await importGame(pollPtsDraft, uid);
    });

    await step(steps[11], async () => {
      const pollTxtDraft = await fetchJson(`${DEMO}/poll_text_draft.json`);
      await importGame(pollTxtDraft, uid);
    });

    ui.set(total, total, "Gotowe");
    ui.log("DEMO: zakończone ✅");
    // możesz tu zrobić automatyczny reload list:
    // location.reload();

    // zostaw modal na 400ms żeby użytkownik widział "Gotowe"
    setTimeout(() => ui.close(), 400);

    return { ran: true };
  } catch (e) {
    console.error("[DEMO] seed failed:", e);

    // przy błędzie: przywróć flagę, żeby można było ponowić
    await setUserDemoFlag(uid, true);
    console.warn("[DEMO] flag restored to true after failure");

    ui.error("Błąd: " + (e?.message || String(e)));
    ui.log("Flaga demo została przywrócona na TRUE (możesz spróbować ponownie).");

    // modal zostaje, bo to jest sygnał błędu (blokuje jak chciałeś)
    throw e;
  }
}
