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
   Progress modal (overlay jak w builderze)
========================================================= */

function ensureDemoOverlay() {
  let ov = document.getElementById("demoOverlay");
  if (ov) return ov;

  ov = document.createElement("div");
  ov.id = "demoOverlay";
  ov.className = "overlay"; // ważne: korzysta z Twoich styli overlay/modal
  ov.style.display = "none";
  ov.innerHTML = `
    <div class="modal" style="width:min(720px,94vw)">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:12px;height:12px;border-radius:999px;background:rgba(255,255,255,.35)"></div>
        <div style="font-weight:900;letter-spacing:.06em;text-transform:uppercase">
          Przywracanie DEMO…
        </div>
      </div>

      <div id="demoProgText" style="margin-top:10px;opacity:.9">
        Start…
      </div>

      <div style="margin-top:12px">
        <div style="height:10px;border-radius:999px;background:rgba(255,255,255,.10);overflow:hidden">
          <div id="demoProgBar" style="height:100%;width:0%;background:rgba(255,255,255,.65)"></div>
        </div>
        <div id="demoProgMeta" style="margin-top:8px;opacity:.75;font-size:12px">
          0%
        </div>
      </div>

      <div id="demoProgList" style="margin-top:12px;display:grid;gap:6px;font-size:14px;opacity:.92"></div>

      <div style="margin-top:14px;opacity:.65;font-size:12px">
        Nie zamykaj strony. To okno blokuje interfejs do czasu zakończenia.
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  return ov;
}

function demoProgress() {
  const ov = ensureDemoOverlay();
  const $t = ov.querySelector("#demoProgText");
  const $bar = ov.querySelector("#demoProgBar");
  const $meta = ov.querySelector("#demoProgMeta");
  const $list = ov.querySelector("#demoProgList");

  const steps = [];
  let total = 1;

  function show(on) {
    ov.style.display = on ? "grid" : "none";
  }

  function setTotal(n) {
    total = Math.max(1, Number(n) || 1);
  }

  function render() {
    const done = steps.filter(s => s.state === "done").length;
    const pct = Math.round((done / total) * 100);

    if ($bar) $bar.style.width = `${pct}%`;
    if ($meta) $meta.textContent = `${pct}% (${done}/${total})`;

    if ($list) {
      $list.innerHTML = steps
        .map(s => {
          const icon = s.state === "done" ? "✓" : (s.state === "err" ? "✕" : "…");
          const op = s.state === "done" ? 1 : 0.85;
          return `<div style="display:flex;gap:10px;opacity:${op}">
            <div style="width:18px;text-align:center">${icon}</div>
            <div>${escapeHtml(s.label)}</div>
          </div>`;
        })
        .join("");
    }
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function step(label, fn) {
    const item = { label, state: "work" };
    steps.push(item);
    if ($t) $t.textContent = label;
    render();

    try {
      const out = await fn();
      item.state = "done";
      render();
      return out;
    } catch (e) {
      item.state = "err";
      render();
      throw e;
    }
  }

  return { show, setTotal, step };
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

  // twardy guard na wielokrotne wywołania w tej samej karcie
  if (window.__DEMO_SEED_RUNNING) return { ran: false, reason: "already-running" };

  const isDemo = await getUserDemoFlag(uid);
  if (!isDemo) return { ran: false };

  window.__DEMO_SEED_RUNNING = true;

  const prog = demoProgress();
  prog.show(true);

  try {
    // GASIMY FLAGĘ OD RAZU -> koniec dubli (a jak coś padnie, przywrócimy)
    console.log("[DEMO] flag before:", isDemo);
    await setUserDemoFlag(uid, false);
    console.log("[DEMO] flag after OFF:", await getUserDemoFlag(uid));

    prog.setTotal(1 + 1 + 4 + 3 + 1); // base + logos + 4 polls + 3 drafts + finish

    await prog.step("1/?? Import bazy pytań", async () => {
      await importBaseFromUrl(`${DEMO}/base.json`);
    });

    await prog.step("2/?? Import 4 logotypów", async () => {
      await demoImport4Logos(
        `${DEMO}/logo_text.json`,
        `${DEMO}/logo_text-pix.json`,
        `${DEMO}/logo_draw.json`,
        `${DEMO}/logo_image.json`
      );
    });

    await prog.step("3/?? Import poll_text OPEN", async () => {
      await importPollFromUrl(`${DEMO}/poll_text_open.json`);
    });
    await prog.step("4/?? Import poll_text CLOSED", async () => {
      await importPollFromUrl(`${DEMO}/poll_text_closed.json`);
    });
    await prog.step("5/?? Import poll_points OPEN", async () => {
      await importPollFromUrl(`${DEMO}/poll_points_open.json`);
    });
    await prog.step("6/?? Import poll_points CLOSED", async () => {
      await importPollFromUrl(`${DEMO}/poll_points_closed.json`);
    });

    await prog.step("7/?? Import draft prepared", async () => {
      const prepared = await fetchJson(`${DEMO}/prepared.json`);
      await importGame(prepared, uid);
    });
    await prog.step("8/?? Import draft poll_points", async () => {
      const pollPtsDraft = await fetchJson(`${DEMO}/poll_points_draft.json`);
      await importGame(pollPtsDraft, uid);
    });
    await prog.step("9/?? Import draft poll_text", async () => {
      const pollTxtDraft = await fetchJson(`${DEMO}/poll_text_draft.json`);
      await importGame(pollTxtDraft, uid);
    });

    await prog.step("10/?? Zakończono", async () => {});

    prog.show(false);
    window.__DEMO_SEED_RUNNING = false;
    return { ran: true };

  } catch (e) {
    console.error("[DEMO] seed failed:", e);

    // jak coś padło -> PRZYWRÓĆ flagę, żeby user mógł spróbować jeszcze raz
    try {
      await setUserDemoFlag(uid, true);
      console.warn("[DEMO] flag restored to true after failure");
    } catch {}

    prog.show(false);
    window.__DEMO_SEED_RUNNING = false;
    throw e;
  }
}
