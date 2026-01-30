import { getUserDemoFlag, setUserDemoFlag } from "../core/user-flags.js";
import { sb } from "../core/supabase.js";

import { importBaseFromUrl } from "./bases-import.js";
import { importPollFromUrl, importGame } from "./builder-import-export.js";
import { demoImport4Logos } from "../../logo-editor/js/demo-import.js";

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
  const uid = userId || await currentUserId();

  const isDemo = await getUserDemoFlag(uid);
  if (!isDemo) return { ran: false };

  try {

    /* ===============================
       1) Baza pytań
    =============================== */

    await importBaseFromUrl("../demo/base.json");

    /* ===============================
       2) Loga
    =============================== */

    await demoImport4Logos(
      "../demo/logo_text.json",
      "../demo/logo_text-pix.json",
      "../demo/logo_draw.json",
      "../demo/logo_image.json"
    );

    /* ===============================
       3) Gry sondażowe
    =============================== */

    await importPollFromUrl("../demo/poll_text_open.json");
    await importPollFromUrl("../demo/poll_text_closed.json");
    await importPollFromUrl("../demo/poll_points_open.json");
    await importPollFromUrl("../demo/poll_points_closed.json");

    /* ===============================
       4) Szkice
    =============================== */

    const prepared = await fetchJson("../demo/prepared.json");
    const pollPtsDraft = await fetchJson("../demo/poll_points_draft.json");
    const pollTxtDraft = await fetchJson("../demo/poll_text_draft.json");

    await importGame(prepared, uid);
    await importGame(pollPtsDraft, uid);
    await importGame(pollTxtDraft, uid);

    /* ===============================
       5) OFF
    =============================== */

    await setUserDemoFlag(uid, false);

    return { ran: true };

  } catch (e) {
    console.error("[DEMO] seed failed:", e);
    throw e;
  }
}
