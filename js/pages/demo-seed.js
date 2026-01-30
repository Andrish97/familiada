import { getUserDemoFlag, setUserDemoFlag } from "../core/user-flags.js";

import { importPollFromUrl, importGame } from "./builder-import-export.js";
import { sb } from "../core/supabase.js";

/**
 * WYMAGANE z Twojej strony:
 * - bases.js ma eksportować: importBaseFromUrl(url)
 * - logo-editor/js/main.js ma eksportować: demoImport4Logos(url1,url2,url3,url4)
 */
import { importBaseFromUrl } from "./bases.js";
import { demoImport4Logos } from "../logo-editor/js/main.js";

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

/**
 * Seed demo uruchamia się MAKSYMALNIE raz per user (flaga w DB).
 * Ścieżki są względem /familiada/js/pages/builder.js -> ../../demo/...
 */
export async function seedDemoOnceIfNeeded(userId) {
  const uid = userId || await currentUserId();
  const isDemo = await getUserDemoFlag(uid);
  if (!isDemo) return { ran: false };

  // Jeśli cokolwiek padnie, NIE ustawiamy flagi na false (żeby można było spróbować ponownie).
  // Jeśli chcesz "fail-fast i disable", to powiedz.
  try {
    // 1) baza pytań
    await importBaseFromUrl("../../demo/base.json");

    // 2) 4 loga (pojedyncze pliki)
    await demoImport4Logos(
      "../../demo/logo_text.json",
      "../../demo/logo_text-pix.json",
      "../../demo/logo_draw.json",
      "../../demo/logo_image.json"
    );

    // 3) gry sondażowe (open/closed) – korzystamy z importPollFromUrl (już masz)  [oai_citation:0‡builder-import-export.js](sediment://file_000000006f5c722fb6f360db7f2d2493)
    await importPollFromUrl("../../demo/poll_text_open.json");
    await importPollFromUrl("../../demo/poll_text_closed.json");
    await importPollFromUrl("../../demo/poll_points_open.json");
    await importPollFromUrl("../../demo/poll_points_closed.json");

    // 4) szkice (3 pliki) – zwykły importGame (draft)
    const ownerId = uid;

    const prepared = await fetchJson("../../demo/prepared.json");
    const pollPtsDraft = await fetchJson("../../demo/poll_points_draft.json");
    const pollTxtDraft = await fetchJson("../../demo/poll_text_draft.json");

    await importGame(prepared, ownerId);
    await importGame(pollPtsDraft, ownerId);
    await importGame(pollTxtDraft, ownerId);

    // 5) OFF: już nigdy nie seeduj ponownie
    await setUserDemoFlag(uid, false);

    return { ran: true };
  } catch (e) {
    console.error("[DEMO] seed failed:", e);
    throw e;
  }
}
