// js/pages/demo-seed.js
// Seed DEMO uruchamia się TYLKO raz na użytkownika (flaga) i jest odporny na
// wielokrotne wywołania (guard w pamięci) + równoległe karty (lock localStorage).

import { getUserDemoFlag, setUserDemoFlag } from "../core/user-flags.js";
import { sb } from "../core/supabase.js";

import { importBaseFromUrl } from "./bases-import.js";
import { importPollFromUrl, importGame } from "./builder-import-export.js";

/* =========================================================
   Stała ścieżka repo (GitHub Pages)
========================================================= */
const BASE = "/familiada";

/* =========================================================
   Dynamiczny import logo-editora (bez psucia jego ścieżek)
========================================================= */
async function loadLogoEditor() {
  return await import(`${BASE}/logo-editor/js/demo-import.js`);
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
   Guards / Lock
========================================================= */

// 1) Guard w pamięci modułu (żeby init strony nie odpalił 10x)
let __seedRunning = false;
let __seedPromise = null;

// 2) Lock między kartami / reloadami (żeby 2 karty nie seedowały naraz)
function seedLockKey(uid) {
  return `familiada_demo_seed_lock_${uid}`;
}

function tryLock(uid) {
  const key = seedLockKey(uid);
  const now = Date.now();
  const ttlMs = 2 * 60 * 1000; // 2 min

  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      const t = Number(parsed?.t || 0);
      if (t && (now - t) < ttlMs) return false; // ktoś już seeduje
    }
    localStorage.setItem(key, JSON.stringify({ t: now }));
    return true;
  } catch {
    // jeśli localStorage niedostępny, i tak pozwól (guard modułu nadal działa)
    return true;
  }
}

function unlock(uid) {
  try {
    localStorage.removeItem(seedLockKey(uid));
  } catch {}
}

/* =========================================================
   Główna logika demo seeda
========================================================= */

export async function seedDemoOnceIfNeeded(userId) {
  const uid = userId || await currentUserId();

  // Guard: jeśli już seedujesz w tej stronie, zwróć ten sam promise
  if (__seedRunning) return __seedPromise || { ran: false };

  // Guard: jeśli inna karta już seeduje, nie rób nic
  if (!tryLock(uid)) return { ran: false };

  __seedRunning = true;

  __seedPromise = (async () => {
    // 0) Sprawdź flagę DEMO
    const isDemo = await getUserDemoFlag(uid);
    if (!isDemo) return { ran: false };

    // WAŻNE: wyłączamy flagę od razu, żeby równoległe wywołania nie weszły.
    // Jeśli seed się wysypie, możemy ją przywrócić w catch (poniżej).
    await setUserDemoFlag(uid, false);

    try {
      /* ===============================
         1) Baza pytań
      =============================== */
      await importBaseFromUrl(`${BASE}/demo/base.json`);

      /* ===============================
         2) Loga (4 szt.)
      =============================== */
      const { demoImport4Logos } = await loadLogoEditor();

      await demoImport4Logos(
        `${BASE}/demo/logo_text.json`,
        `${BASE}/demo/logo_text-pix.json`,
        `${BASE}/demo/logo_draw.json`,
        `${BASE}/demo/logo_image.json`
      );

      /* ===============================
         3) Gry sondażowe
      =============================== */
      await importPollFromUrl(`${BASE}/demo/poll_text_open.json`);
      await importPollFromUrl(`${BASE}/demo/poll_text_closed.json`);
      await importPollFromUrl(`${BASE}/demo/poll_points_open.json`);
      await importPollFromUrl(`${BASE}/demo/poll_points_closed.json`);

      /* ===============================
         4) Szkice (drafty)
      =============================== */
      const prepared = await fetchJson(`${BASE}/demo/prepared.json`);
      const pollPtsDraft = await fetchJson(`${BASE}/demo/poll_points_draft.json`);
      const pollTxtDraft = await fetchJson(`${BASE}/demo/poll_text_draft.json`);

      await importGame(prepared, uid);
      await importGame(pollPtsDraft, uid);
      await importGame(pollTxtDraft, uid);

      return { ran: true };
    } catch (e) {
      console.error("[DEMO] seed failed:", e);

      // Jeśli chcesz: przy błędzie przywróć flagę, żeby użytkownik mógł spróbować ponownie.
      // (Ja bym to zostawił WŁĄCZONE — bo inaczej demo “znika” mimo błędu)
      await setUserDemoFlag(uid, true);

      throw e;
    } finally {
      unlock(uid);
      __seedRunning = false;
    }
  })();

  return await __seedPromise;
}
