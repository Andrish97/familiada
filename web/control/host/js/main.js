// control/host/js/main.js
// Napisane od zera (nie kopia js/pages/host.js) — mniej tu do zrobienia niż
// w Display, bo Host nie ma własnego silnika rysowania: to render.js robi
// operacje DOM wprost na podstawie wiersza game_state. Gest przesunięcia
// (peek na pasmo 2) zostaje jako czysto lokalna wygoda — patrz komentarz w
// render.js — nie próbowaliśmy tu odtwarzać dokładnej matematyki CSS
// snap-to-grid z dzisiejszego host.js (kosmetyka do dostrojenia wizualnie
// później, nie architektura).

import { initI18n, setUiLang } from "../../../shared/translation/translation.js?v=v2026-10-09T19290";
import { startKeepAlive } from "../../../shared/js/core/keep-alive.js?v=v2026-10-09T19290";
import { sb } from "../../../shared/js/core/supabase.js?v=v2026-10-09T19290";
import { createSubscription } from "../../../shared/js/core/game-state-subscribe.js?v=v2026-10-09T19290";
import { createHostRenderer } from "./render.js?v=v2026-10-09T19290";
import { createCoverLogoRenderer } from "./coverLogo.js?v=v2026-10-09T19290";
import { createHostThemeApplier } from "./hostThemeManager.js?v=v2026-10-09T19290";
import { icon } from "../../../shared/js/core/icons.js?v=v2026-10-09T19290";

function parseParams() {
  const u = new URL(location.href);
  return { gameId: u.searchParams.get("id") || "", key: u.searchParams.get("key") || "", preview: u.searchParams.get("preview") === "1" };
}

function startPresenceHeartbeat({ gameId, key }, pingMs = 3000) {
  const DEVICE_ID_KEY = "familiada:deviceId:host";
  let deviceId = localStorage.getItem(DEVICE_ID_KEY) || null;
  const ping = async () => {
    const { data, error } = await sb().rpc("device_ping", {
      p_game_id: gameId, p_device_type: "host", p_key: key, p_device_id: deviceId, p_meta: {},
    });
    if (!error && data?.device_id && !deviceId) {
      deviceId = data.device_id;
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
  };
  ping();
  setInterval(ping, pingMs);
}

// css/host.css pozycjonuje .text (paperText1/2) jako position:absolute, a
// jego left/right SĄ ZDEFINIOWANE WYŁĄCZNIE pod selektorami
// `html.portrait .pane1 .text`/`html.landscape .pane1 .text` — bez tej
// klasy na <html> tekst nie ma żadnego left/right w ogóle. To nie kosmetyka
// do dostrojenia później, tylko wymóg funkcjonalny, żeby cokolwiek się
// wyświetliło (znalezione przez pierwszy przebieg control2-pairing.spec.js
// na żywo: #paperText1 istniał w DOM, ale toBeVisible() padało — zero
// wymiarów bez tej klasy).
function setupOrientationClass() {
  function apply() {
    const portrait = window.innerHeight >= window.innerWidth;
    document.documentElement.classList.toggle("portrait", portrait);
    document.documentElement.classList.toggle("landscape", !portrait);

    // html.landscape .pane1 .text czyta --outer-left/--outer-right (patrz
    // css/host.css) — bez nich left/right w landscape jest niepoprawnym
    // calc() i cała reguła pozycjonująca zostaje zignorowana.
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const safeL = parseFloat(cs.getPropertyValue("--safe-left")) || 0;
    const safeR = parseFloat(cs.getPropertyValue("--safe-right")) || 0;
    if (!portrait) {
      root.style.setProperty("--outer-left", `${safeL}px`);
      root.style.setProperty("--outer-right", `${safeR}px`);
    } else {
      root.style.setProperty("--outer-left", "0px");
      root.style.setProperty("--outer-right", "0px");
    }
  }
  apply();
  window.addEventListener("resize", apply);
}

function isIOSSafari() {
  const ua = navigator.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function isStandalone() {
  return !!(navigator.standalone || window.matchMedia?.("(display-mode: standalone)").matches);
}

function setupFullscreenButton() {
  const btn = document.getElementById("btnFS");
  const hint = document.getElementById("hostA2HS");
  const close = document.getElementById("hostA2HSClose");
  const ico = document.getElementById("fsIco");
  let pseudoFS = false;
  function syncIcon() { if (ico) ico.innerHTML = icon((document.fullscreenElement || pseudoFS) ? "fullscreen-exit" : "fullscreen-enter"); }
  function closeHint() {
    document.documentElement.classList.remove("showA2HS");
    hint?.setAttribute("aria-hidden", "true");
    btn?.focus();
  }
  function openHint() {
    document.documentElement.classList.add("showA2HS");
    hint?.setAttribute("aria-hidden", "false");
    close?.focus();
  }
  close?.addEventListener("click", closeHint);
  hint?.addEventListener("click", (event) => { if (event.target === hint) closeHint(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.documentElement.classList.contains("showA2HS")) closeHint();
  });
  btn?.addEventListener("click", async () => {
    if (isIOSSafari() && !isStandalone()) { openHint(); return; }
    try {
      if (document.fullscreenElement) await document.exitFullscreen?.();
      else if (pseudoFS) {
        pseudoFS = false;
        document.documentElement.classList.remove("pseudoFS");
      } else {
        const request = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
        if (!request) throw new Error("Fullscreen API unavailable");
        await request.call(document.documentElement, { navigationUI: "hide" });
      }
    } catch {
      pseudoFS = !pseudoFS;
      document.documentElement.classList.toggle("pseudoFS", pseudoFS);
      if (pseudoFS) setTimeout(() => window.scrollTo(0, 1), 50);
    }
    syncIcon();
  });
  document.addEventListener("fullscreenchange", syncIcon);
}

function setupResponsivePaper() {
  const root = document.documentElement;
  const panes = [
    [document.querySelector(".pane1"), document.getElementById("lineGrid1")],
    [document.querySelector(".pane2"), document.getElementById("lineGrid2")],
  ].filter(([pane, grid]) => pane && grid);
  const renderedCounts = new WeakMap();
  const scrollBound = new WeakSet();

  function update() {
    // Ta sama bazowa wysokość wiersza dla obu orientacji; na małym ekranie
    // ogranicza ją krótszy bok i pionowa przestrzeń, a na tablecie rośnie.
    const line = Math.max(15, Math.min(34, window.innerWidth * 0.042, window.innerHeight / 24));
    root.style.setProperty("--line", `${line}px`);
    // Tekst zaczyna się na granicy wiersza siatki. Linie same pozostają
    // rozciągnięte od krawędzi do krawędzi, także przez safe area.
    for (const [id, property] of [
      ["paperText1", "--host-text-top-1"],
      ["paperText2", "--host-text-top-2"],
    ]) {
      const el = document.getElementById(id);
      if (!el) continue;
      root.style.removeProperty(property);
      const computedTop = parseFloat(getComputedStyle(el).top);
      if (!Number.isFinite(computedTop)) continue;
      root.style.setProperty(property, `${Math.ceil(computedTop / line) * line}px`);
    }
    for (const [pane, grid] of panes) {
      const rows = Math.ceil(pane.clientHeight / line) + 1;
      if (renderedCounts.get(grid) !== rows) {
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < rows; i++) fragment.appendChild(document.createElement("span"));
        grid.replaceChildren(fragment);
        renderedCounts.set(grid, rows);
      }
      const text = pane.querySelector(".text");
      if (text) {
        const syncScroll = () => {
          const activeLine = parseFloat(getComputedStyle(root).getPropertyValue("--line")) || line;
          grid.style.transform = `translateY(-${text.scrollTop % activeLine}px)`;
        };
        if (!scrollBound.has(text)) {
          text.addEventListener("scroll", syncScroll, { passive: true });
          scrollBound.add(text);
        }
        syncScroll();
      }
    }
  }

  update();
  const observer = new ResizeObserver(update);
  panes.forEach(([pane]) => observer.observe(pane));
  window.addEventListener("resize", update, { passive: true });
  window.visualViewport?.addEventListener("resize", update, { passive: true });
}

// ZGŁOSZONY, REALNY BUG (nie tylko test): było `renderer.setPeek(!renderer.isCovered())`.
// isCovered() = authoritativeCovered && !peeked -- na starcie gestu, gdy
// zasłona jest aktywna i peeked=false, isCovered() JUŻ zwraca true, więc
// !isCovered() dawało false -> setPeek(false) -> peeked zostawało false,
// BEZ ŻADNEJ ZMIANY. Gest nigdy nie mógł zadziałać za pierwszym razem w
// dokładnie tej sytuacji, w której operator chce go użyć (zakryte, chce
// odkryć). Poprawka: przełączaj WŁASNY stan peeked (isPeeked()), nie
// wypadkową authoritativeCovered+peeked.
function setupPeekSwipe(renderer) {
  let sx = 0, sy = 0, active = false;
  const MIN = 60;
  document.addEventListener("pointerdown", (e) => {
    const inText = e.target.closest?.(".text");
    if (inText && document.documentElement.classList.contains("portrait")) { active = false; return; }
    sx = e.clientX; sy = e.clientY; active = true;
  }, { passive: true });
  document.addEventListener("pointerup", (e) => {
    if (!active) return;
    active = false;
    if (!renderer.isCoverableAtAll()) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.hypot(dx, dy) < MIN) return;
    renderer.setPeek(!renderer.isPeeked());
  }, { passive: true });
  document.addEventListener("pointercancel", () => { active = false; }, { passive: true });
}

async function main() {
  await initI18n({ withSwitcher: false });
  setupFullscreenButton();
  setupOrientationClass();
  setupResponsivePaper();
  document.documentElement.classList.remove("page-loading");

  const { gameId, key, preview } = parseParams();
  if (preview) {
    const renderer = createHostRenderer();
    const coverLogo = createCoverLogoRenderer({ gameId, key });
    const hostTheme = await createHostThemeApplier();
    window.addEventListener("message", async event => {
      if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== "familiada:preview-row") return;
      const row = event.data.row;
      if (!row?.detail?.display) return;
      await hostTheme.apply(row);
      renderer.render(row);
      await coverLogo.apply(row);
    });
    if (window.parent !== window) window.parent.postMessage({ type: "familiada:host-preview-ready" }, location.origin);
    return;
  }

  if (!gameId || !key) return;

  // Wszystkie trzy urządzenia utrzymują ekran aktywny przez Wake Lock
  // oraz zapasowy, wyciszony strumień wideo. Podgląd w ustawieniach nie.
  startKeepAlive();
  startPresenceHeartbeat({ gameId, key });
  const renderer = createHostRenderer();
  // Zmiana orientacji w locie (obrót tabletu) ma przeliczyć podpowiedź
  // przesunięcia (portrait/landscape mają inny kierunek) -- dokładnie jak
  // stare js/pages/host.js's window.addEventListener("resize", ...).
  // setupOrientationClass() (niżej) już nasłuchuje na resize dla samego
  // --outer-left/--outer-right; ten listener jest celowo osobny, bo
  // renderer jeszcze nie istnieje w momencie jej wywołania.
  window.addEventListener("resize", () => renderer.updateSwipeHint());
  window.addEventListener("i18n:lang", () => renderer.updateSwipeHint());
  const coverLogo = createCoverLogoRenderer({ gameId, key });
  coverLogo.apply({ step:null, detail:{} });
  const hostTheme = await createHostThemeApplier();
  setupPeekSwipe(renderer);

  let appliedLang = null;
  const subscription = createSubscription({
    gameId, deviceType: "host", key,
    onRow: async (row) => {
      // Język idzie za operatorem w Control (patrz control/display/js/main.js —
      // ta sama zasada). render.js's pasmo 1/2 JEST tłumaczone przez t()
      // (roundTitle()/renderFinalMapping() używają rh()/fh()) — ale
      // setUiLang() ładuje słownik asynchronicznie, więc bez await
      // renderer.render(row) niżej potrafił wystartować PRZED podmianą
      // słownika i namalować tytuł jeszcze starym językiem (zauważone na
      // żywo: zmiana na "en" nie zmieniała od razu treści paperText1).
      const lang = row.detail?.settings?.uiLang;
      if (lang && lang !== appliedLang) {
        // appliedLang ustawiane DOPIERO po sukcesie -- jeśli setUiLang()
        // rzuci (np. przejściowy błąd sieci przy dynamicznym imporcie
        // słownika), appliedLang zostaje niezmienione, więc kolejny wiersz
        // z tym samym lang spróbuje ponownie zamiast utknąć na zawsze w
        // starym języku (wcześniej appliedLang=lang szło PRZED await, a
        // .catch(()=>{}) po cichu połykał błąd bez retry).
        try {
          await setUiLang(lang, { persist: true, updateUrl: true, apply: true });
          appliedLang = lang;
        } catch (e) {
          console.warn("[host2] setUiLang nie powiodło się, spróbuję ponownie przy kolejnym wierszu:", e);
        }
      }
      await hostTheme.apply(row);
      renderer.render(row);
      coverLogo.apply(row);
    },
    onError: (error) => console.warn("[host2] game_state_get failed:", error),
  });
  await subscription.start();
}

main();
