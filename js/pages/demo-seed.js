// js/pages/demo-seed.js

import { getUserDemoFlag, setUserDemoFlag } from "../core/user-flags.js";
import { sb } from "../core/supabase.js";

import { importBaseFromUrl } from "./bases-import.js";
import { importPollFromUrl, importGame } from "./builder-import-export.js";
import { demoImport4Logos } from "../../logo-editor/js/demo-import.js";

import { createDemoProgressModal } from "./demo-progress-modal.js";

/* =========================================================
   DEMO URLs (pełne linki)
========================================================= */
const DEMO = "https://andrish97.github.io/familiada/demo";

/* =========================================================
   Anti-double-run locks
========================================================= */
function lockKey(uid) {
  return `familiada_demo_seed_lock_${uid}`;
}

function acquireLock(uid) {
  if (window.__DEMO_SEED_RUNNING) return false;
  window.__DEMO_SEED_RUNNING = true;

  const k = lockKey(uid);
  const now = Date.now();
  const existing = Number(localStorage.getItem(k) || 0);

  if (existing && now - existing < 120_000) {
    window.__DEMO_SEED_RUNNING = false;
    return false;
  }

  localStorage.setItem(k, String(now));
  return true;
}

function releaseLock(uid) {
  window.__DEMO_SEED_RUNNING = false;
  localStorage.removeItem(lockKey(uid));
}

function setExitBlock(on) {
  if (on) {
    window.onbeforeunload = () => "Trwa wgrywanie demo — nie zamykaj strony.";
  } else {
    window.onbeforeunload = null;
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
   Główna logika demo seeda
========================================================= */
export async function seedDemoOnceIfNeeded(userId) {
  const uid = userId || (await currentUserId());

  if (!acquireLock(uid)) {
    return { ran: false, skipped: true, reason: "locked" };
  }

  // Sprawdź flagę. Jeśli false, nic nie pokazujemy.
  const isDemo = await getUserDemoFlag(uid);
  if (!isDemo) {
    releaseLock(uid);
    return { ran: false };
  }

  // Modal postępu: pokazujemy TYLKO gdy flaga true
  const modal = createDemoProgressModal();
  modal.show();
  setExitBlock(true);

  const TOTAL = 5;
  let step = 0;

  const tick = (label, hint = "") => {
    step += 1;
    modal.setProgress({ step, total: TOTAL, label, hint });
    modal.log(`• ${label}${hint ? " — " + hint : ""}`);
  };

  // Ustaw OFF od razu (żeby żaden inny init nie odpalił seeda równolegle)
  console.log("[DEMO] flag before:", isDemo);
  await setUserDemoFlag(uid, false);
  console.log("[DEMO] flag after OFF:", false);

  try {
    tick("1/5 Baza pytań", "import base.json");
    await importBaseFromUrl(`${DEMO}/base.json`);

    tick("2/5 Loga", "import 4 szt.");
    await demoImport4Logos(
      `${DEMO}/logo_text.json`,
      `${DEMO}/logo_text-pix.json`,
      `${DEMO}/logo_draw.json`,
      `${DEMO}/logo_image.json`
    );

    tick("3/5 Sondaże", "poll_text/poll_points open/closed");
    await importPollFromUrl(`${DEMO}/poll_text_open.json`);
    await importPollFromUrl(`${DEMO}/poll_text_closed.json`);
    await importPollFromUrl(`${DEMO}/poll_points_open.json`);
    await importPollFromUrl(`${DEMO}/poll_points_closed.json`);

    tick("4/5 Szkice", "prepared + drafty");
    const prepared = await fetchJson(`${DEMO}/prepared.json`);
    const pollPtsDraft = await fetchJson(`${DEMO}/poll_points_draft.json`);
    const pollTxtDraft = await fetchJson(`${DEMO}/poll_text_draft.json`);

    await importGame(prepared, uid);
    await importGame(pollPtsDraft, uid);
    await importGame(pollTxtDraft, uid);

    tick("5/5 Zakończono", "demo gotowe ✅");

    // Zostaw modal na sekundę, żeby użytkownik zobaczył koniec
    await new Promise((r) => setTimeout(r, 700));

    modal.hide();
    setExitBlock(false);
    releaseLock(uid);

    return { ran: true };
  } catch (e) {
    console.error("[DEMO] seed failed:", e);

    modal.setError(
      (e && (e.message || e.msg)) ? String(e.message || e.msg) : "Nieznany błąd."
    );
    modal.log(`! ERROR: ${String(e?.message || e)}`);

    // przywróć flagę żeby można było spróbować ponownie
    try {
      await setUserDemoFlag(uid, true);
      console.warn("[DEMO] flag restored to true after failure");
    } catch (e2) {
      console.warn("[DEMO] flag restore failed:", e2);
    }

    // modal zostaje widoczny (żeby user widział błąd),
    // ale odblokowujemy "beforeunload", żeby mógł ewentualnie odświeżyć.
    setExitBlock(false);
    releaseLock(uid);

    throw e;
  }
}
