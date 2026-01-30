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
   Anti-double-run locks
========================================================= */

function lockKey(uid) {
  return `familiada_demo_seed_lock_${uid}`;
}

function acquireLock(uid) {
  // 1) lock w RAM (jedna karta)
  if (window.__DEMO_SEED_RUNNING) return false;
  window.__DEMO_SEED_RUNNING = true;

  // 2) lock w localStorage (na wypadek kilku initów / kilku miejsc)
  const k = lockKey(uid);
  const now = Date.now();
  const existing = Number(localStorage.getItem(k) || 0);

  // jeśli lock jest świeży (< 2 min), nie odpalaj drugi raz
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
  const uid = userId || (await currentUserId());

  // lock (żeby nie odpaliło się 10×)
  if (!acquireLock(uid)) {
    return { ran: false, skipped: true, reason: "locked" };
  }

  setExitBlock(true);

  // ważne: czytaj flagę dopiero po locku
  const isDemo = await getUserDemoFlag(uid);
  if (!isDemo) {
    setExitBlock(false);
    releaseLock(uid);
    return { ran: false };
  }

  // ustaw OFF od razu (żeby równoległe starty nie robiły importów),
  // a przy błędzie przywrócimy.
  console.log("[DEMO] flag before:", isDemo);
  await setUserDemoFlag(uid, false);
  console.log("[DEMO] flag after OFF:", false);

  try {
    /* ===============================
       1) Baza pytań
    =============================== */
    await importBaseFromUrl(`${DEMO}/base.json`);

    /* ===============================
       2) Loga
    =============================== */
    await demoImport4Logos(
      `${DEMO}/logo_text.json`,
      `${DEMO}/logo_text-pix.json`,
      `${DEMO}/logo_draw.json`,
      `${DEMO}/logo_image.json`
    );

    /* ===============================
       3) Gry sondażowe
    =============================== */
    await importPollFromUrl(`${DEMO}/poll_text_open.json`);
    await importPollFromUrl(`${DEMO}/poll_text_closed.json`);
    await importPollFromUrl(`${DEMO}/poll_points_open.json`);
    await importPollFromUrl(`${DEMO}/poll_points_closed.json`);

    /* ===============================
       4) Szkice (drafty)
    =============================== */
    const prepared = await fetchJson(`${DEMO}/prepared.json`);
    const pollPtsDraft = await fetchJson(`${DEMO}/poll_points_draft.json`);
    const pollTxtDraft = await fetchJson(`${DEMO}/poll_text_draft.json`);

    await importGame(prepared, uid);
    await importGame(pollPtsDraft, uid);
    await importGame(pollTxtDraft, uid);

    setExitBlock(false);
    releaseLock(uid);

    return { ran: true };
  } catch (e) {
    console.error("[DEMO] seed failed:", e);

    // przywróć flagę (żeby user mógł spróbować ponownie)
    try {
      await setUserDemoFlag(uid, true);
      console.warn("[DEMO] flag restored to true after failure");
    } catch (e2) {
      console.warn("[DEMO] flag restore failed:", e2);
    }

    setExitBlock(false);
    releaseLock(uid);

    throw e;
  }
}
