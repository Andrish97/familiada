// js/pages/demo-seed.js
//
// Seed demo (1 raz) na podstawie flagi w DB.
// - URL-e DEMO są pełne (GitHub Pages), żeby nie było problemów ze ścieżkami.
// - Importy modułów są względne (normalny bundling / Pages).
// - Dla OPEN sondaży: tworzymy sesje + seedujemy głosy bez RPC (bez poll key),
//   bezpośrednio do tabel poll_text_entries / poll_votes.
//
// Wymaganie UX: jeśli flaga=true, pokazujemy modal postępu i blokujemy UI.

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
   Progress modal (dynamiczny, styl jak builder import)
========================================================= */
function ensureProgressOverlay() {
  let ov = document.getElementById("demoSeedOverlay");
  if (ov) return ov;

  ov = document.createElement("div");
  ov.id = "demoSeedOverlay";
  ov.className = "overlay"; // jak w builderze
  ov.style.display = "none";

  ov.innerHTML = `
    <div class="modal" style="width:min(720px, 94vw);">
      <div class="mTitle">PRZYWRACANIE DEMO…</div>
      <div id="demoSeedStep" class="mSub" style="margin-top:6px; opacity:.95">—</div>

      <div style="margin-top:12px; display:grid; gap:8px">
        <div style="display:flex; align-items:center; gap:10px">
          <div id="demoSeedPct" class="chip" style="min-width:88px; justify-content:center">0%</div>
          <div style="flex:1">
            <div class="bar" style="height:10px">
              <div id="demoSeedBar" class="barIn" style="width:0%"></div>
            </div>
          </div>
          <div id="demoSeedCount" style="opacity:.8; font-variant-numeric:tabular-nums">0/0</div>
        </div>

        <div id="demoSeedLog" class="mNote" style="white-space:pre-wrap; max-height:220px; overflow:auto"></div>

        <div class="mNote" style="opacity:.85">
          Nie zamykaj strony. To okno blokuje interfejs do czasu zakończenia.
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(ov);
  return ov;
}

function createProgressUI(totalSteps) {
  const ov = ensureProgressOverlay();
  const $step = ov.querySelector("#demoSeedStep");
  const $pct = ov.querySelector("#demoSeedPct");
  const $bar = ov.querySelector("#demoSeedBar");
  const $count = ov.querySelector("#demoSeedCount");
  const $log = ov.querySelector("#demoSeedLog");

  function show() {
    ov.style.display = "";
    document.body.style.overflow = "hidden";
  }

  function setStepText(t) {
    if ($step) $step.textContent = t || "—";
  }

  function setLogLine(t) {
    if ($log) $log.textContent = String(t || "");
  }

  function setProgress(stepIdx, pct0to100) {
    const s = Math.max(0, Math.min(totalSteps, stepIdx));
    const p = Math.max(0, Math.min(100, Math.floor(pct0to100)));

    if ($pct) $pct.textContent = `${p}%`;
    if ($bar) $bar.style.width = `${p}%`;
    if ($count) $count.textContent = `${s}/${totalSteps}`;
  }

  function stepStart(stepIdx, title) {
    setStepText(title);
    setProgress(stepIdx - 1, Math.floor(((stepIdx - 1) / totalSteps) * 100));
  }

  function stepDone(stepIdx) {
    setProgress(stepIdx, Math.floor((stepIdx / totalSteps) * 100));
  }

  return { show, setStepText, setLogLine, setProgress, stepStart, stepDone };
}

/* =========================================================
   Seed (1 raz na flagę)
========================================================= */
export async function seedDemoOnceIfNeeded(userId) {
  // guard w obrębie jednej sesji przeglądarki (żeby nie odpaliło się 10x)
  if (globalThis.__demoSeedRunning) return { ran: false, skipped: true };
  globalThis.__demoSeedRunning = true;

  const uid = userId || (await currentUserId());

  const isDemo = await getUserDemoFlag(uid);
  if (!isDemo) {
    globalThis.__demoSeedRunning = false;
    return { ran: false };
  }

  // 9 kroków: baza(1) + loga(1) + 4 sondaże + 3 drafty
  const ui = createProgressUI(9);

  const beforeUnload = (e) => {
    e.preventDefault();
    e.returnValue = "";
    return "";
  };

  try {
    ui.show();
    globalThis.addEventListener("beforeunload", beforeUnload);

    // anti-double-run: zbijamy flagę OD RAZU
    await setUserDemoFlag(uid, false);

    let step = 1;

    ui.stepStart(step, `Import bazy pytań`);
    await importBaseFromUrl(`${DEMO}/base.json`);
    ui.stepDone(step);
    step++;

    ui.stepStart(step, `Import logo 4/4 (jedna operacja)`);
    await demoImport4Logos(
      `${DEMO}/logo_text.json`,
      `${DEMO}/logo_text-pix.json`,
      `${DEMO}/logo_draw.json`,
      `${DEMO}/logo_image.json`
    );
    ui.stepDone(step);
    step++;

    ui.stepStart(step, `Import sondażu 1/4 (poll_text_open)`);
    await importPollFromUrl(`${DEMO}/poll_text_open.json`);
    ui.stepDone(step);
    step++;

    ui.stepStart(step, `Import sondażu 2/4 (poll_text_closed)`);
    await importPollFromUrl(`${DEMO}/poll_text_closed.json`);
    ui.stepDone(step);
    step++;

    ui.stepStart(step, `Import sondażu 3/4 (poll_points_open)`);
    await importPollFromUrl(`${DEMO}/poll_points_open.json`);
    ui.stepDone(step);
    step++;

    ui.stepStart(step, `Import sondażu 4/4 (poll_points_closed)`);
    await importPollFromUrl(`${DEMO}/poll_points_closed.json`);
    ui.stepDone(step);
    step++;

    ui.stepStart(step, `Import szkicu 1/3 (prepared)`);
    await importGame(await fetchJson(`${DEMO}/prepared.json`), uid);
    ui.stepDone(step);
    step++;

    ui.stepStart(step, `Import szkicu 2/3 (poll_points_draft)`);
    await importGame(await fetchJson(`${DEMO}/poll_points_draft.json`), uid);
    ui.stepDone(step);
    step++;

    ui.stepStart(step, `Import szkicu 3/3 (poll_text_draft)`);
    await importGame(await fetchJson(`${DEMO}/poll_text_draft.json`), uid);
    ui.stepDone(step);

    ui.setLogLine("Gotowe ✅");
    ui.setProgress(9, 100);

    return { ran: true };
  } catch (e) {
    console.error("[DEMO] seed failed:", e);

    try {
      await setUserDemoFlag(uid, true);
      ui.setLogLine(
        "Błąd: " + (e?.message || String(e)) +
        "\n\nFlaga demo została przywrócona na TRUE (możesz spróbować ponownie)."
      );
    } catch (e2) {
      ui.setLogLine(
        "Błąd: " + (e?.message || String(e)) +
        "\n\nNie udało się przywrócić flagi demo."
      );
      console.warn("[DEMO] restore flag failed:", e2);
    }

    throw e;
  } finally {
    globalThis.removeEventListener("beforeunload", beforeUnload);
    globalThis.__demoSeedRunning = false;
  }
}
