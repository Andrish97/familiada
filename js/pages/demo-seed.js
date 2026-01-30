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
   Lokalna blokada (anti-double-run)
========================================================= */
let _seedPromise = null;

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
  // 1) jeśli już się odpaliło w tej sesji strony → oddaj tę samą Promise
  if (_seedPromise) return _seedPromise;

  _seedPromise = (async () => {
    const uid = userId || (await currentUserId());

    // (debug) pokaż w konsoli, czy flaga jest true/false
    const isDemo = await getUserDemoFlag(uid);
    console.log("[DEMO] flag before:", isDemo);

    if (!isDemo) return { ran: false };

    // 2) USTAWIAMY FLAGĘ OFF OD RAZU (zamyka “okno wyścigu”)
    await setUserDemoFlag(uid, false);

    // (debug) potwierdź odczytem
    const afterOff = await getUserDemoFlag(uid);
    console.log("[DEMO] flag after OFF:", afterOff);

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
      // UWAGA: importPollFromUrl może próbować seedować głosy.
      // Jeśli poll_text seed wali na p_key → to naprawimy w builder-import-export.js (poniżej).
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

      console.log("[DEMO] seed OK ✅");
      return { ran: true };

    } catch (e) {
      console.error("[DEMO] seed failed:", e);

      // 3) jak padło — przywróć demo=true, żeby dało się spróbować ponownie
      try {
        await setUserDemoFlag(uid, true);
        console.warn("[DEMO] flag restored to true after failure");
      } catch (e2) {
        console.warn("[DEMO] failed to restore flag:", e2);
      }

      throw e;
    } finally {
      // 4) pozwól ewentualnie odpalić jeszcze raz (np. po refreshu)
      _seedPromise = null;
    }
  })();

  return _seedPromise;
}
