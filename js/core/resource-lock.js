// js/core/resource-lock.js
// Ogólna blokada "ten zasób jest edytowany gdzie indziej", wspólna dla
// całego projektu (edytor gry, ustawienia, ankieta, logo, baza pytań,
// rozgrywka) — jeden mechanizm zamiast osobnej implementacji per strona.
// Overlay skopiowany ze sprawdzonego wzorca device-guard.js/guest-mode.js,
// ale z treścią/przyciskami parametryzowanymi per wywołanie (patrz
// docs/plan-testy-i-poprawki.md, sekcja "Warstwa 1").
import { applyTranslations, t } from "../../translation/translation.js?v=v2026-08-28T14094";
import { sb } from "./supabase.js?v=v2026-08-28T14094";
import { rt } from "./realtime.js?v=v2026-08-28T14094";

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

  const initial = await acquireOnce(resourceType, resourceId);

  if (!initial?.ok) {
    showOverlay({ title, message, backHref });

    // Gdy zasób się zwolni, NIE chowamy tu tylko overlayu — strona już raz
    // przerwała renderowanie edytowalnej treści przy pierwszej porażce
    // (wywołujący dostaje { ok:false } i robi return), więc samo schowanie
    // overlayu zostawiłoby pustą, niewyrenderowaną stronę pod spodem.
    // Przeładowanie od zera jest proste i niezawodne: świeży boot() strony
    // przejdzie normalnie przez guardResourceLock i realnie wyrenderuje
    // treść, zamiast próbować "wznowić" stan w locie.
    async function recheckAndReload() {
      if (released) return;
      const res = await acquireOnce(resourceType, resourceId).catch(() => null);
      if (res?.ok) {
        clearInterval(retryTimer);
        location.reload();
      }
    }

    // Broadcast "RELEASED" (natychmiastowe, ale best-effort — wysyłane na
    // pagehide, przeglądarka może ubić żądanie w trakcie nawigacji) +
    // niezależny polling co ~5s jako fallback, żeby karta bez broadcastu
    // i tak weszła najpóźniej po wygaśnięciu TTL (25s) po stronie serwera.
    lockChannel(resourceType, resourceId).onBroadcast("RELEASED", recheckAndReload);
    retryTimer = setInterval(recheckAndReload, RETRY_POLL_MS);

    return { ok: false };
  }

  heartbeatTimer = setInterval(() => {
    acquireOnce(resourceType, resourceId).catch((e) => console.warn("[resource-lock] heartbeat failed:", e));
  }, HEARTBEAT_MS);

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
