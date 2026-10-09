// js/core/resource-lock.js
// Ogólna blokada "ten zasób jest edytowany gdzie indziej", wspólna dla
// całego projektu (edytor gry, ustawienia, ankieta, logo, baza pytań,
// rozgrywka) — jeden mechanizm zamiast osobnej implementacji per strona.
// Overlay skopiowany ze sprawdzonego wzorca device-guard.js/guest-mode.js,
// ale z treścią/przyciskami parametryzowanymi per wywołanie (patrz
// docs/plan-testy-i-poprawki.md, sekcja "Warstwa 1").
import { applyTranslations, t, withLangParam } from "../../translation/translation.js?v=v2026-10-09T17412";
import { sb, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase.js?v=v2026-10-09T17412";
import { rt } from "./realtime.js?v=v2026-10-09T17412";

const TAB_ID_KEY = "familiada:tabId";
const HEARTBEAT_MS = 8000; // znacznie poniżej TTL (120 s, edit_lock_ttl() w bazie)
const RETRY_POLL_MS = 5000; // dopóki zablokowani: fallback niezależny od broadcastu
const LOCK_TTL_MS = 120000; // musi być zgodne z edit_lock_ttl() w bazie (migracja 316)

function randomId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getTabId() {
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

async function acquireOnce(resourceType, resourceId, context, mode = "exclusive") {
  void refreshAccessToken();
  const { data, error } = await sb().rpc("acquire_edit_lock_mode", {
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_tab_id: getTabId(),
    p_context: context ?? null,
    p_mode: mode,
  });
  if (error) throw error;
  return data;
}

// Ostatni znany token sesji — pagehide nie może czekać na async getSession().
let lastAccessToken = null;
async function refreshAccessToken() {
  try {
    const { data } = await sb().auth.getSession();
    lastAccessToken = data?.session?.access_token || lastAccessToken;
  } catch {}
}

// Zwolnienie przy zamykaniu karty: fetch z keepalive przeglądarka dokańcza
// po zamknięciu strony (zwykłe sb().rpc bywa ubijane) — bez tego blokada
// wisiała do wygaśnięcia TTL (120 s).
function releaseRowKeepalive(resourceType, resourceId) {
  if (!lastAccessToken) return false;
  try {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/release_edit_lock`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${lastAccessToken}`,
      },
      body: JSON.stringify({ p_resource_type: resourceType, p_resource_id: resourceId, p_tab_id: getTabId() }),
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

async function releaseRow(resourceType, resourceId) {
  try {
    await sb().rpc("release_edit_lock", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_tab_id: getTabId(),
    });
  } catch {}
}

async function releaseOnce(resourceType, resourceId) {
  await releaseRow(resourceType, resourceId);
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
    if (backHref) { location.href = withLangParam(backHref); return; }
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
 * Ten sam pełnoekranowy overlay dla innych twardych blokad niż "ktoś to
 * edytuje" -- np. baza odrzuciła zapis, bo ankieta gry właśnie się otworzyła
 * (reguły gry, migracja 274). Jeden wygląd dla "tego nie możesz teraz
 * edytować", bez wpisu w edit_locks.
 */
export function showBlockingOverlay({ title, message, backHref }) {
  showOverlay({ title, message, backHref });
}

/**
 * Blokada wejścia na stronę, która trzyma JEDEN albo KILKA zasobów naraz
 * (docs/blokady-zasobow.md, sekcja 6) — wołać PO auth, PRZED wyrenderowaniem
 * edytowalnej treści.
 *
 *   opcje: { title, backHref, context, forbiddenTitle, forbiddenMessage }
 *   resources: [{ type, id, mode, message, title?, context? }]
 *     mode    — "exclusive" (domyślnie) albo "shared" (wiele kart naraz;
 *               wyklucza tylko trzymanie wyłączne, patrz „Zgodność zasobów”)
 *     message — komunikat, gdy TEN zasób jest zajęty (tekst albo funkcja
 *               (odpowiedź_bazy) => tekst, np. gdy powód zależy od tego, kto
 *               trzyma)
 *
 * Zasoby są zajmowane po kolei, w podanej kolejności: pierwsza przeszkoda
 * zatrzymuje i jej komunikat trafia na overlay — wszystko albo nic (to, co
 * już zajęte, jest oddawane). Zajęte → overlay, sprawdzanie co ~5 s + sygnał
 * RELEASED; gdy da się zająć całość, strona wczytuje się sama.
 *
 * Zwraca { ok: true, release } albo { ok: false } (overlay już pokazany,
 * wywołujący robi return i nic więcej nie renderuje).
 *
 * Dopóki karta żyje, blokady są odnawiane co ~8 s oraz od razu po powrocie
 * karty na wierzch (przeglądarka zwalnia liczniki ukrytych kart). Gdy
 * odnowienie zwróci `locked` (blokadę w międzyczasie ktoś wziął — uśpiony
 * laptop, wygasły TTL), strona blokuje się w całości. Zwalnianie tylko
 * przy faktycznym zamknięciu / nawigacji (pagehide) — NIE przy schowaniu
 * karty, bo alt-tab podczas edycji nie powinien oddawać blokady.
 */
export async function guardResourceLocks(resources, { title, backHref, context = null, forbiddenTitle, forbiddenMessage } = {}) {
  const items = (resources || []).filter((r) => r?.type && r?.id).map((r) => ({
    type: r.type,
    id: r.id,
    mode: r.mode || "exclusive",
    message: r.message,
    title: r.title ?? title,
    context: r.context ?? context,
  }));

  let released = false;
  let lost = false;
  let renewing = false;
  let heartbeatTimer = null;
  let retryTimer = null;

  function showGoneOverlay() {
    showOverlay({
      title: t("resourceLock.goneTitle"),
      message: t("resourceLock.goneMessage"),
      backHref,
    });
  }

  function showForbiddenOverlay() {
    showOverlay({
      title: forbiddenTitle || t("resourceLock.forbiddenTitle"),
      message: forbiddenMessage || t("resourceLock.forbiddenMessage"),
      backHref,
    });
  }

  function showLostOverlay() {
    showOverlay({
      title: t("resourceLock.lostTitle"),
      message: t("resourceLock.lostMessage"),
      backHref,
    });
  }

  // Wszystko albo nic: pierwsza przeszkoda przerywa, zajęte wcześniej oddajemy
  // (bez broadcastu — to nie jest prawdziwe zwolnienie, tylko wycofanie próby).
  async function tryAcquireAll() {
    const got = [];
    for (const item of items) {
      const res = await acquireOnce(item.type, item.id, item.context, item.mode);
      if (!res?.ok) {
        for (const g of got.reverse()) await releaseRow(g.type, g.id);
        return { ok: false, item, res };
      }
      got.push(item);
    }
    return { ok: true };
  }

  const first = await tryAcquireAll();

  if (!first.ok) {
    const { item, res } = first;

    if (res?.error === "gone") {
      // Zasób usunięty gdzie indziej, zanim zdążyliśmy wejść — inny
      // komunikat niż "zajęte przez kogoś" i bez pollingu odzyskania (to
      // się nigdy nie "zwolni").
      showGoneOverlay();
      return { ok: false, gone: true };
    }
    if (res?.error === "forbidden") {
      showForbiddenOverlay();
      return { ok: false, forbidden: true };
    }

    const message = typeof item.message === "function" ? item.message(res) : item.message;
    showOverlay({ title: item.title, message, backHref });

    // Gdy zasoby się zwolnią, NIE chowamy tu tylko overlayu — strona już raz
    // przerwała renderowanie edytowalnej treści przy pierwszej porażce
    // (wywołujący dostaje { ok:false } i robi return), więc samo schowanie
    // overlayu zostawiłoby pustą, niewyrenderowaną stronę pod spodem.
    // Przeładowanie od zera jest proste i niezawodne: świeży boot() strony
    // przejdzie normalnie przez guardResourceLocks i realnie wyrenderuje
    // treść, zamiast próbować "wznowić" stan w locie.
    async function recheckAndReload() {
      if (released) return;
      const again = await tryAcquireAll().catch(() => null);
      if (again?.ok) {
        clearInterval(retryTimer);
        // Zajęte na czas próby zostaje trzymane — przeładowana strona odnowi je
        // tą samą kartą; pagehide zwolni, gdyby przeładowanie się nie udało.
        location.reload();
      } else if (again?.res?.error === "gone") {
        // Zniknęło całkiem, zanim zwolniła je karta, na którą czekaliśmy —
        // dalsze odpytywanie nic już nie zmieni.
        clearInterval(retryTimer);
        showGoneOverlay();
      } else if (again?.res?.error === "forbidden") {
        clearInterval(retryTimer);
        showForbiddenOverlay();
      }
    }

    // Broadcast "RELEASED" (natychmiastowe, ale best-effort — wysyłane na
    // pagehide, przeglądarka może ubić żądanie w trakcie nawigacji) +
    // niezależny polling co ~5 s jako fallback (obejmuje też zasoby powiązane
    // innym kluczem, np. logos ↔ logo:L), żeby karta bez broadcastu i tak
    // weszła najpóźniej po wygaśnięciu TTL po stronie serwera.
    for (const it of items) lockChannel(it.type, it.id).onBroadcast("RELEASED", recheckAndReload);
    retryTimer = setInterval(recheckAndReload, RETRY_POLL_MS);

    return { ok: false };
  }

  async function renewAll() {
    if (released || lost || renewing) return;
    renewing = true;
    try {
      for (const item of items) {
        const res = await acquireOnce(item.type, item.id, item.context, item.mode).catch((e) => {
          console.warn("[resource-lock] heartbeat failed:", e);
          return null;
        });
        if (released || lost) return;
        if (res?.error === "gone") {
          // Zasób zniknął w trakcie edycji (usunięty gdzie indziej, np. przez
          // Warstwę 2 krzyżowych blokad albo mimo niej). Overlay na wierzchu
          // już wyrenderowanej treści blokuje dalszą interakcję — nie trzeba
          // nic chować/przerenderowywać pod spodem.
          lost = true;
          clearInterval(heartbeatTimer);
          showGoneOverlay();
          return;
        }
        if (res?.error === "forbidden") {
          // Utrata prawa edycji w trakcie sesji (np. rola współdzielenia
          // zdegradowana albo odebrany dostęp do bazy). Ten sam wzorzec co
          // "gone" -- overlay na wierzchu, bez pollingu odzyskania.
          lost = true;
          clearInterval(heartbeatTimer);
          showForbiddenOverlay();
          return;
        }
        if (res && res.ok === false && res.error === "locked") {
          // Blokadę w międzyczasie przejęła inna karta (nasza wygasła —
          // uśpiony komputer, spowolnione liczniki w tle). Pełna blokada
          // strony; reszty nie trzymamy, skoro nic tu już nie wolno.
          lost = true;
          clearInterval(heartbeatTimer);
          showLostOverlay();
          for (const other of items) if (other !== item) void releaseRow(other.type, other.id);
          return;
        }
      }
    } finally {
      renewing = false;
    }
  }

  heartbeatTimer = setInterval(renewAll, HEARTBEAT_MS);

  // Powrót karty na wierzch: odnów od razu, nie czekaj na wolny licznik.
  const onVisible = () => {
    if (document.visibilityState === "visible") void renewAll();
  };
  document.addEventListener("visibilitychange", onVisible);

  // Zwraca Promise zwolnienia: strona, która wychodzi własnym przyciskiem
  // (np. „Wstecz” edytora logo), czeka na nie przed nawigacją -- przy samym
  // pagehide przeglądarka potrafi ubić żądanie w trakcie przejścia i blokada
  // wisiałaby do wygaśnięcia TTL.
  const release = () => {
    if (released) return Promise.resolve();
    released = true;
    clearInterval(heartbeatTimer);
    clearInterval(retryTimer);
    document.removeEventListener("visibilitychange", onVisible);
    return Promise.all(items.map((it) => releaseOnce(it.type, it.id)));
  };

  // Zamknięcie karty: najpierw keepalive (przeżywa zamknięcie), potem zwykła
  // ścieżka z broadcastem RELEASED dla czekających kart.
  const releaseOnHide = () => {
    if (released) return;
    for (const it of items) releaseRowKeepalive(it.type, it.id);
    void release();
  };
  window.addEventListener("pagehide", releaseOnHide);

  return { ok: true, release };
}

/**
 * Jedna blokada strony — skrót do guardResourceLocks() z jednym zasobem.
 */
export function guardResourceLock({ resourceType, resourceId, mode, message, title, backHref, context }) {
  return guardResourceLocks(
    [{ type: resourceType, id: resourceId, mode, message }],
    { title, backHref, context }
  );
}

/**
 * Zajmuje blokadę bez pełnoekranowego guarda. Ten wariant służy elementom
 * edytowanym wewnątrz większego ekranu (pytanie/folder/tag w bazie pytań).
 * Wywołujący sam decyduje, jak pokazać konflikt i MUSI wywołać release().
 *
 * Zwrócony lease ma mutowalne `ok`/`reason` -- gdy heartbeat wykryje że
 * zasób zniknął (`gone`) albo wywołujący stracił prawo edycji (`forbidden`,
 * np. rola współdzielenia zdegradowana w trakcie sesji), `ok` przechodzi
 * na `false`. Sesje dłuższe niż jeden zapis (otwarty modal pytania/tagów)
 * MUSZĄ sprawdzić `lease.ok` tuż przed realnym zapisem i przerwać z
 * komunikatem zamiast próbować zapisać -- RLS i tak zablokuje sam zapis,
 * to tylko zamienia generyczny błąd Supabase na jasny komunikat.
 */
export async function acquireResourceLock({ resourceType, resourceId, context = null, mode = "exclusive" } = {}) {
  if (!resourceType || !resourceId) return { ok: false, error: "missing_resource" };

  let released = false;
  let heartbeatTimer = null;
  const first = await acquireOnce(resourceType, resourceId, context, mode);
  if (!first?.ok) return first || { ok: false, error: "locked" };

  const lease = { ok: true, reason: null };

  heartbeatTimer = setInterval(async () => {
    const result = await acquireOnce(resourceType, resourceId, context, mode).catch((error) => {
      console.warn("[resource-lock] scoped heartbeat failed:", error);
      return null;
    });
    if (result?.error === "gone" || result?.error === "forbidden" || result?.error === "locked") {
      lease.ok = false;
      lease.reason = result.error;
      clearInterval(heartbeatTimer);
    }
  }, HEARTBEAT_MS);

  const release = () => {
    if (released) return;
    released = true;
    clearInterval(heartbeatTimer);
    window.removeEventListener("pagehide", releaseOnHide);
    void releaseOnce(resourceType, resourceId);
  };
  const releaseOnHide = () => {
    if (!released) releaseRowKeepalive(resourceType, resourceId);
    release();
  };
  window.addEventListener("pagehide", releaseOnHide);
  lease.release = release;
  return lease;
}

/**
 * Atomowo z perspektywy klienta zajmuje uporządkowany zestaw blokad. Stała
 * kolejność usuwa deadlock dwóch kart; porażka zwalnia wszystko już zajęte.
 * `ok`/`reason` na zwróconym lease agregują stan wszystkich trzymanych
 * blokad składowych (patrz `acquireResourceLock`).
 */
export async function acquireResourceLocks(resources, { context = null } = {}) {
  const unique = new Map();
  for (const item of (resources || [])) {
    if (!item?.resourceType || !item?.resourceId) continue;
    unique.set(`${item.resourceType}:${item.resourceId}`, item);
  }
  const ordered = Array.from(unique.values()).sort((a, b) =>
    `${a.resourceType}:${a.resourceId}`.localeCompare(`${b.resourceType}:${b.resourceId}`)
  );
  const leases = [];
  for (const item of ordered) {
    let lease;
    try {
      lease = await acquireResourceLock({ ...item, context: item.context ?? context });
    } catch (error) {
      for (const held of leases.reverse()) held.release();
      throw error;
    }
    if (!lease?.ok) {
      for (const held of leases.reverse()) held.release();
      return lease || { ok: false, error: "locked" };
    }
    leases.push(lease);
  }
  return {
    get ok() {
      return leases.every((l) => l.ok);
    },
    get reason() {
      const lost = leases.find((l) => !l.ok);
      return lost ? lost.reason : null;
    },
    release() {
      for (const lease of leases.reverse()) lease.release();
    },
  };
}

/**
 * Sprawdza, czy zasób ma teraz aktywną blokadę gdzie indziej — BEZ jej
 * zajmowania. Do jednorazowych akcji spoza "wyłącznego edytora" (np.
 * `games.js`'s rename/reset), które nie otwierają własnej sesji, ale
 * piszą do tych samych danych — patrz docs/plan-testy-i-poprawki.md,
 * sekcja "Model: zasób ma stan busy/free".
 */
export async function isResourceBusy(resourceType, resourceId) {
  // limit(1) zamiast maybeSingle(): zasób trzymany współdzielenie ma kilka wierszy.
  const { data, error } = await sb()
    .from("edit_locks")
    .select("resource_type")
    .eq("resource_type", resourceType)
    .eq("resource_id", resourceId)
    .gt("heartbeat_at", new Date(Date.now() - LOCK_TTL_MS).toISOString())
    .limit(1);
  if (error) throw error;
  return !!data?.length;
}
