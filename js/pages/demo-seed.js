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
   Anti-double-run guard (localStorage + in-memory)
========================================================= */

const LOCK_TTL_MS = 3 * 60 * 1000; // 3 min
const lockKey = (uid) => `familiada_demo_seed_lock_${uid}`;

let running = null; // in-memory guard (ten sam tab)

function nowMs() {
  return Date.now();
}

function readLock(uid) {
  try {
    const raw = localStorage.getItem(lockKey(uid));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.ts) return null;
    return obj;
  } catch {
    return null;
  }
}

function writeLock(uid) {
  try {
    localStorage.setItem(lockKey(uid), JSON.stringify({ ts: nowMs() }));
  } catch {
    // ignore
  }
}

function clearLock(uid) {
  try {
    localStorage.removeItem(lockKey(uid));
  } catch {
    // ignore
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
  // guard: jeśli już leci w tej samej karcie
  if (running) return await running;

  running = (async () => {
    const uid = userId || (await currentUserId());

    // guard: jeśli jest świeży lock z innej karty/odświeżenia → nie odpalaj ponownie
    const lk = readLock(uid);
    if (lk && nowMs() - Number(lk.ts) < LOCK_TTL_MS) {
      return { ran: false, skipped: "lock" };
    }

    const isDemo = await getUserDemoFlag(uid);
    if (!isDemo) return { ran: false };

    // ustaw lock natychmiast (żeby kolejne wejścia nie odpalały równolegle)
    writeLock(uid);

    // 🔒 super ważne: ustawiamy demo=false OD RAZU (optymistycznie),
    // żeby równoległe inicjalizacje nie robiły duplikatów.
    // Jeśli seed padnie — przywrócimy true.
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

      clearLock(uid);
      return { ran: true };
    } catch (e) {
      console.error("[DEMO] seed failed:", e);

      // przywróć flagę demo=true, bo seed nie dokończony
      try {
        await setUserDemoFlag(uid, true);
        console.warn("[DEMO] flag restored to true after failure");
      } catch (e2) {
        console.warn("[DEMO] failed to restore demo flag:", e2);
      }

      clearLock(uid);
      throw e;
    }
  })();

  try {
    return await running;
  } finally {
    running = null;
  }
}
