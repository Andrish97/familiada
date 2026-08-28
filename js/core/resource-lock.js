// js/core/resource-lock.js
// Ogólna blokada "ten zasób jest edytowany gdzie indziej", wspólna dla
// całego projektu (edytor gry, ustawienia, ankieta, logo, baza pytań,
// rozgrywka) — jeden mechanizm zamiast osobnej implementacji per strona.
// Overlay skopiowany ze sprawdzonego wzorca device-guard.js/guest-mode.js,
// ale z treścią/przyciskami parametryzowanymi per wywołanie (patrz
// docs/plan-testy-i-poprawki.md, sekcja "Warstwa 1").
import { applyTranslations, t } from "../../translation/translation.js?v=v2026-08-28T12265";
import { sb } from "./supabase.js?v=v2026-08-28T12265";
import { rt } from "./realtime.js?v=v2026-08-28T12265";

const TAB_ID_KEY = "familiada:tabId";
const HEARTBEAT_MS = 8000; // znacznie poniżej TTL (25s) w acquire_edit_lock
const RETRY_POLL_MS = 5000; // dopóki zablokowani: fallback niezależny od broadcastu

function randomId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getTabId() {
  try {
    let id = sessionStorage.getItem(TAB_ID_KEY);
    if (!id) {
      id = randomId();
      sessionStorage.setItem(TAB_ID_KEY, id);
    }
    return id;
  } catch {
    // sessionStorage niedostępny (tryb prywatny itp.) — blokada nadal
    // działa, tylko każde odświeżenie tej karty liczy się jako nowa karta
    return randomId();
  }
}

function lockChannel(resourceType, resourceId) {
  return rt(`familiada-edit-lock:${resourceType}:${resourceId}`);
}

async function acquireOnce(resourceType, resourceId) {
  const { data, error } = await sb().rpc("acquire_edit_lock", {
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_tab_id: getTabId(),
  });
  if (error) throw error;
  return data;
}

async function releaseOnce(resourceType, resourceId) {
  try {
    await sb().rpc("release_edit_lock", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_tab_id: getTabId(),
    });
  } catch {}
  try {
    await lockChannel(resourceType, resourceId).sendBroadcast("RELEASED", {}, { mode: "http" });
  } catch {}
}

function ensureOverlay() {
  let overlay = document.getElementById("resourceLockGuard");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "resourceLockGuard";

  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    fontFamily: "system-ui,-apple-system,Segoe UI,sans-serif",
    background: "rgba(0,0,0,.78)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    color: "#fff",
    zIndex: "2147483647",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
    boxSizing: "border-box",
    overscrollBehavior: "none",
  });

  overlay.innerHTML = `
    <div style="
      width:100%;max-width:560px;box-sizing:border-box;
      background:rgba(255,255,255,.06);
      border:1px solid rgba(255,255,255,.18);
      border-radius:18px;
      padding:18px;
      text-align:left;
    ">
      <div id="resourceLockGuardTitle" data-i18n="resourceLock.title"
        style="font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px;"
      >${t("resourceLock.title")}</div>

      <div id="resourceLockGuardMsg" style="opacity:.9;line-height:1.4;word-wrap:break-word;"></div>

      <div style="margin-top:14px;display:flex;gap:10px;align-items:center;">
        <button id="resourceLockGuardBack" type="button" data-i18n="resourceLock.back" style="
          appearance:none;border:0;border-radius:12px;padding:10px 14px;
          font-weight:800;cursor:pointer;background:rgba(255,255,255,.14);color:#fff;
        ">${t("resourceLock.back")}</button>
      </div>
    </div>
  `;

  document.documentElement.appendChild(overlay);
  return overlay;
}

function showOverlay({ title, message, backHref }) {
  const overlay = ensureOverlay();
  applyTranslations(overlay);
  if (title) overlay.querySelector("#resourceLockGuardTitle").textContent = title;
  overlay.querySelector("#resourceLockGuardMsg").textContent = message || "";

  const backBtn = overlay.querySelector("#resourceLockGuardBack");
  backBtn.onclick = () => {
    if (backHref) { location.href = backHref; return; }
    try {
      if (window.history.length > 1) { history.back(); return; }
    } catch {}
    location.href = "/";
  };

  overlay.style.display = "flex";
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
}

function hideOverlay() {
  const overlay = document.getElementById("resourceLockGuard");
  if (!overlay || overlay.style.display === "none") return;
  overlay.style.display = "none";
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
}

/**
 * Blokada wejścia w edycję zasobu — wołać PO auth, PRZED wyrenderowaniem
 * edytowalnej treści.
 *
 * Zwraca { ok: true } jeśli blokadę udało się zająć — można renderować
 * dalej. Zwraca { ok: false } jeśli zasób jest zajęty gdzie indziej —
 * overlay jest już pokazany, wywołujący powinien przerwać (return) i nic
 * więcej nie renderować.
 *
 * Dopóki karta żyje, blokada jest odnawiana co ~8s (TTL po stronie serwera
 * to 25s — margines na chwilowe zerwanie sieci, nie na realne zniknięcie
 * karty). Zwalniana jest tylko przy faktycznym zamknięciu/nawigacji
 * (pagehide) — CELOWO NIE przy zwykłym schowaniu karty (visibilitychange),
 * bo alt-tab do innej aplikacji podczas edycji nie powinien oddawać
 * blokady komuś innemu.
 */
export async function guardResourceLock({ resourceType, resourceId, message, title, backHref }) {
  let released = false;
  let heartbeatTimer = null;
  let retryTimer = null;

  async function tryAcquire() {
    const res = await acquireOnce(resourceType, resourceId);
    if (res?.ok) {
      hideOverlay();
      return true;
    }
    showOverlay({ title, message, backHref });
    return false;
  }

  function startHeartbeat() {
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      tryAcquire().catch((e) => console.warn("[resource-lock] heartbeat failed:", e));
    }, HEARTBEAT_MS);
  }

  // Dopóki zablokowani: odpytuj niezależnie od broadcastu "RELEASED" — ten
  // ostatni jest wysyłany na beforeunload/pagehide, co jest z natury
  // best-effort (przeglądarka może ubić żądanie w trakcie nawigacji). Bez
  // tego pollingu karta, która nie dostała broadcastu, wisiałaby na
  // overlayu w nieskończoność, mimo że TTL po stronie serwera (25s) dawno
  // by pozwolił wejść.
  function startRetryPolling() {
    clearInterval(retryTimer);
    retryTimer = setInterval(async () => {
      const ok = await tryAcquire().catch(() => false);
      if (ok) {
        clearInterval(retryTimer);
        retryTimer = null;
        startHeartbeat();
      }
    }, RETRY_POLL_MS);
  }

  const ok = await tryAcquire();

  if (!ok) {
    lockChannel(resourceType, resourceId).onBroadcast("RELEASED", async () => {
      if (released) return;
      const gotIt = await tryAcquire().catch(() => false);
      if (gotIt) {
        clearInterval(retryTimer);
        retryTimer = null;
        startHeartbeat();
      }
    });
    startRetryPolling();
    return { ok: false };
  }

  startHeartbeat();

  const release = () => {
    if (released) return;
    released = true;
    clearInterval(heartbeatTimer);
    clearInterval(retryTimer);
    void releaseOnce(resourceType, resourceId);
  };

  window.addEventListener("pagehide", release);

  return { ok: true, release };
}
