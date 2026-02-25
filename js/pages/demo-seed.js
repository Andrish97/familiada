// js/pages/demo-seed.js

import { getUserDemoFlag, setUserDemoFlag } from "../core/user-flags.js";
import { sb } from "../core/supabase.js";

import { importBaseFromUrl } from "./bases-import.js";
import { importPollFromUrl, importGame } from "./builder-import-export.js";
import { demoImport4Logos } from "../../logo-editorjs/demo-import.js";
import { t, getI18nSection, getUiLang } from "../../translation/translation.js";

/* =========================================================
   DEMO URLs (domain-agnostic, language-aware)
========================================================= */
function getDemoConfig() {
  const demo = getI18nSection("demo") || {};
  const lang = (document.documentElement.lang || "").toLowerCase() || getUiLang() || "pl";

  const basePath = String(demo.baseUrl || "").trim() || `/demo/${lang}`;
  const baseAbs = new URL(
    basePath.startsWith("http") ? basePath : (basePath.startsWith("/") ? basePath : `/${basePath}`),
    location.origin
  ).toString().replace(/\/$/, "");

  return { baseAbs, files: demo.files || {} };
}

function demoFileUrl(key, fallbackName) {
  const { baseAbs, files } = getDemoConfig();
  const name = String((files && files[key]) || fallbackName || "").trim();
  if (!name) throw new Error(`Missing demo file name for key=${key}`);
  return new URL(name, baseAbs + "/").toString();
}

/* =========================================================
   Progress Modal (blokuje UI, styl jak import buildera)
========================================================= */
function ensureProgressModal() {
  let ov = document.getElementById("demoSeedOverlay");
  if (ov) return ov;

  ov = document.createElement("div");
  ov.id = "demoSeedOverlay";
  ov.className = "overlay";
  ov.style.display = "none";

  ov.innerHTML = `
    <div class="modal" style="width:min(640px,94vw)">
      <div class="mTitle">${t("demo.modalTitle")}</div>
      <div class="mSub" id="demoSeedSub">${t("demo.modalSub")}</div>

      <div style="margin-top:12px;display:grid;gap:10px">
        <div class="importRow" style="align-items:center">
          <div id="demoSeedStep" style="font-weight:800;letter-spacing:.04em">—</div>
          <div id="demoSeedCount" style="margin-left:auto;opacity:.8">0/0</div>
        </div>

        <div style="height:10px;border-radius:999px;background:rgba(255,255,255,.10);overflow:hidden">
          <div id="demoSeedBar" style="height:100%;width:0%;background:rgba(255,255,255,.85)"></div>
        </div>

        <div class="importMsg" id="demoSeedMsg" style="min-height:18px"></div>
      </div>
    </div>
  `;

  document.body.appendChild(ov);

  // blok klików w tło
  ov.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
  });

  return ov;
}

function showProgress(on) {
  const ov = ensureProgressModal();
  ov.style.display = on ? "" : "none";
}

function setProgress({ step, i, n, msg, isError } = {}) {
  const stepEl = document.getElementById("demoSeedStep");
  const countEl = document.getElementById("demoSeedCount");
  const barEl = document.getElementById("demoSeedBar");
  const msgEl = document.getElementById("demoSeedMsg");

  if (stepEl && step) stepEl.textContent = step;
  if (countEl) countEl.textContent = `${i}/${n}`;

  const pct = n > 0 ? Math.round((i / n) * 100) : 0;
  if (barEl) barEl.style.width = `${pct}%`;

  if (msgEl) {
    msgEl.textContent = msg || "";
    msgEl.style.opacity = isError ? "1" : ".85";
  }
}

/* =========================================================
   Utils
========================================================= */
async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(t("demo.fetchFailed", { url, status: res.status }));
  }
  return await res.json();
}

async function currentUserId() {
  const { data, error } = await sb().auth.getUser();
  if (error) throw error;

  const uid = data?.user?.id;
  if (!uid) throw new Error(t("demo.noUser"));
  return uid;
}

/* =========================================================
   Główna logika demo seeda
========================================================= */
export async function seedDemoOnceIfNeeded(userId) {
  // guard przeciw równoległym odpaleniom (duplikaty!)
  if (window.__demoSeedRunning) return { ran: false, running: true };
  window.__demoSeedRunning = true;

  const uid = userId || (await currentUserId());
  const isDemo = await getUserDemoFlag(uid);

  if (!isDemo) {
    window.__demoSeedRunning = false;
    return { ran: false };
  }

  // Kroki (bez "??")
  const steps = [
    { label: t("demo.stepImportBase"), fn: async () => importBaseFromUrl(demoFileUrl("base","base.json")) },
    {
      label: t("demo.stepImportLogos"),
      fn: async () =>
        demoImport4Logos(
          demoFileUrl("logoText","logo_text.json"),
          demoFileUrl("logoTextPix","logo_text-pix.json"),
          demoFileUrl("logoDraw","logo_draw.json"),
          demoFileUrl("logoImage","logo_image.json")
        ),
    },
    { label: t("demo.stepImportPoll1"), fn: async () => importPollFromUrl(demoFileUrl("pollTextOpen","poll_text_open.json")) },
    { label: t("demo.stepImportPoll2"), fn: async () => importPollFromUrl(demoFileUrl("pollTextClosed","poll_text_closed.json")) },
    { label: t("demo.stepImportPoll3"), fn: async () => importPollFromUrl(demoFileUrl("pollPointsOpen","poll_points_open.json")) },
    { label: t("demo.stepImportPoll4"), fn: async () => importPollFromUrl(demoFileUrl("pollPointsClosed","poll_points_closed.json")) },
    {
      label: t("demo.stepImportDraft1"),
      fn: async () => {
        const prepared = await fetchJson(demoFileUrl("prepared","prepared.json"));
        await importGame(prepared, uid);
      },
    },
    {
      label: t("demo.stepImportDraft2"),
      fn: async () => {
        const pollPtsDraft = await fetchJson(demoFileUrl("pollPointsDraft","poll_points_draft.json"));
        await importGame(pollPtsDraft, uid);
      },
    },
    {
      label: t("demo.stepImportDraft3"),
      fn: async () => {
        const pollTxtDraft = await fetchJson(demoFileUrl("pollTextDraft","poll_text_draft.json"));
        await importGame(pollTxtDraft, uid);
      },
    },
  ];

  try {
    showProgress(true);
    setProgress({ step: t("demo.progressStart"), i: 0, n: steps.length, msg: "" });

    for (let idx = 0; idx < steps.length; idx++) {
      const s = steps[idx];
      setProgress({ step: s.label, i: idx, n: steps.length, msg: "" });
      await s.fn();
      setProgress({ step: s.label, i: idx + 1, n: steps.length, msg: t("demo.progressOk") });
    }

    // OFF dopiero po pełnym sukcesie
    await setUserDemoFlag(uid, false);

    setProgress({
      step: t("demo.progressDone"),
      i: steps.length,
      n: steps.length,
      msg: t("demo.progressDoneMsg"),
    });

    // zostaw na chwilę, ale nie blokuj w nieskończoność
    setTimeout(() => showProgress(false), 700);

    return { ran: true };
  } catch (e) {
    console.error("[DEMO] seed failed:", e);

    // przy błędzie: przywróć flagę na TRUE (żeby można powtórzyć)
    try {
      await setUserDemoFlag(uid, true);
      console.warn("[DEMO] flag restored to true after failure");
    } catch (e2) {
      console.warn("[DEMO] failed to restore flag:", e2);
    }

    setProgress({
      step: t("demo.progressError"),
      i: 0,
      n: steps.length,
      msg: t("demo.progressErrorMsg", { error: e?.message || String(e) }),
      isError: true,
    });

    throw e;
  } finally {
    window.__demoSeedRunning = false;
  }
}
