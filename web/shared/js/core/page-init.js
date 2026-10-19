// js/core/page-init.js
// Jedno wywołanie na starcie strony zamiast requireAuth + showGuestBlockedOverlay
// + guardViewportWidth + ręcznego podpinania #btnBack / #btnManual / konta.
// Wszystko wynika z wpisu strony w PAGES (nav-map.js):
//
//   1. urządzenie — blokada przed odsłonięciem strony i sprawdzaniem konta,
//   2. dostęp   public — bez wymuszania logowania (user albo null),
//               guest  — wymaga sesji (konto albo gość), inaczej loginUrl(),
//               user   — tylko konto; gość dostaje wspólną nakładkę (page-overlay.js),
//   3. topbar   #btnBack (etykieta + cel z backHref, najpierw handleSheetBack()),
//               #btnManual (linkTo("manual", { tab: wpis.manual })), konto, topbar-ready,
//   4. przyciski  PAGES[id].buttons: niedostępne dla roli (anon / gość / konto)
//               albo zbyt wąskiego viewportu są chowane i aktualizowane po obrocie,
//               pozostałe dostają przejście przez linkTo() — chyba że opis ma
//               custom: true (strona coś sprawdza przed przejściem; cel daje strona),
//   5. zwraca użytkownika (null dla niezalogowanego, zablokowanego albo przekierowanego).
//
// Odstępstwa strony przekazujemy przez opts, nie przez zapasowe ścieżki:
//   ready          Promise (np. initI18n), na który czekamy przed pokazaniem czegokolwiek;
//                  inicjalizacja może biec równolegle z guardem, auth dopiero po nim
//   back           id przycisku „Wstecz” (domyślnie "btnBack"); false — strona go nie ma
//   backLabel      false — etykietę ustawia sama strona
//   onBack         (href, ev) => … zamiast przejścia na href (np. zapis przed wyjściem);
//                  handleSheetBack() i tak idzie pierwsze
//   manual         id przycisku „Wskazówki” (domyślnie "btnManual"); false — strona go nie ma
//   onManual       (href, ev) => … zamiast przejścia na href
//   account        opcje setTopbarAccount (withAccountSettings, showAuthEntry, onLogout)
//   accountOnLang  true — odśwież menu konta po zmianie języka
//   deps           podmiana zależności (testy)

import { PAGES, backHref, buttonHref, buttonRoles, buttonVisible, buttonBlocked, linkTo, loginUrl, renderBackLabel, roleOf } from "./nav-map.js?v=v2026-10-19T12011";
import { isGuestUser } from "./guest-mode.js?v=v2026-10-19T12011";
import { showPageGuard } from "./page-overlay.js?v=v2026-10-19T12011";
import { setModalSheetPage } from "./modal-sheet.js?v=v2026-10-19T12011";

async function loadDeps() {
  const [auth, topbar, sheet, device] = await Promise.all([
    import("./auth.js?v=v2026-10-19T12011"),
    import("./topbar-controller.js?v=v2026-10-19T12011"),
    import("./modal-sheet.js?v=v2026-10-19T12011"),
    import("./device-guard.js?v=v2026-10-19T12011"),

  ]);
  return {
    getUser: auth.getUser,
    requireAuth: auth.requireAuth,
    setTopbarAccount: topbar.setTopbarAccount,
    handleSheetBack: sheet.handleSheetBack,
    guardViewportWidth: device.guardViewportWidth,
    getDeviceProfile: device.getDeviceProfile,
  };
}

function elementOf(ref, defaultId) {
  if (ref === false) return null;
  if (ref && typeof ref === "object") return ref;
  return document.getElementById(ref || defaultId);
}

function wireBack(id, user, opts, d) {
  const btn = elementOf(opts.back, "btnBack");
  if (!btn) return;
  const ctx = () => ({ anon: !user });
  btn.dataset.sheetBack = "1"; // znacznik dla contact-modal.js
  if (btn.tagName === "A") {
    const href = backHref(id, ctx());
    if (href) btn.setAttribute("href", href);
  }
  if (opts.backLabel !== false) renderBackLabel(btn, id, ctx);
  btn.addEventListener("click", async (ev) => {
    if (d.handleSheetBack()) return;
    const href = backHref(id, ctx());
    if (opts.onBack) { await opts.onBack(href, ev); return; }
    if (href) location.href = href;
  });
}

function wireManual(id, user, opts) {
  const btn = elementOf(opts.manual, "btnManual");
  if (!btn) return;
  const anchor = PAGES[id].manual;
  // Instrukcja jest dla konta albo gościa — niezalogowany nie ma po co jej szukać.
  if (!user && PAGES.manual.access !== "public") { btn.hidden = true; btn.style.display = "none"; return; }
  btn.addEventListener("click", async (ev) => {
    const href = linkTo("manual", { tab: anchor });
    if (opts.onManual) { await opts.onManual(href, ev); return; }
    location.href = href;
  });
}

function hideButton(btn) {
  btn.hidden = true;
  btn.style.display = "none";
  btn.dataset.navHidden = "true"; // przycisk poza rachunkiem „Więcej” w topbarze
}

// Przyciski z PAGES[id].buttons: chowa niedostępne dla roli i urządzenia,
// resztę podpina pod linkTo(). Przycisk, którego strona nie ma w HTML, pomijamy
// (jedna mapa opisuje też warianty strony); spójność mapy z HTML pilnuje test.
function wireButtons(id, user, d) {
  const buttons = PAGES[id].buttons;
  if (!buttons) return;
  const role = roleOf(user, isGuestUser(user));
  for (const [bid, spec] of Object.entries(buttons)) {
    const btn = document.getElementById(bid);
    if (!btn) continue;
    if (!buttonRoles(id, spec).includes(role)) { hideButton(btn); continue; }
    // Przyciski zależne od roli startują ukryte w HTML. Rola jest już
    // rozstrzygnięta, więc dopiero teraz oceniamy wymaganą szerokość.
    if (btn.dataset.navHidden === "true") {
      delete btn.dataset.navHidden;
      btn.hidden = false;
      btn.style.display = "";
    }
    const updateDeviceVisibility = () => {
      const visible = buttonVisible(id, spec, role, d.getDeviceProfile());
      const wasHidden = btn.dataset.navHidden === "true";
      if (visible === !wasHidden) return;
      if (!visible) hideButton(btn);
      else {
        delete btn.dataset.navHidden;
        btn.hidden = false;
        btn.style.display = "";
      }
      if (spec.minViewportWidth) {
        window.dispatchEvent?.(new Event("nav:visibilitychange"));
      }
    };
    updateDeviceVisibility();
    if (spec.minViewportWidth) {
      window.addEventListener("resize", updateDeviceVisibility, { passive: true });
      window.addEventListener("orientationchange", updateDeviceVisibility, { passive: true });
    }
    if (spec.blockedUntil) {
      btn.disabled = buttonBlocked(spec);
      if (btn.disabled) {
        btn.dataset.navBlockedUntil = spec.blockedUntil;
        continue;
      }
      delete btn.dataset.navBlockedUntil;
    }
    if (spec.custom) continue;
    btn.dataset.navHref = buttonHref(spec);
    if (btn.tagName === "A") { btn.setAttribute("href", buttonHref(spec)); continue; }
    btn.addEventListener("click", () => { location.href = buttonHref(spec); });
  }
}

function wireAccount(user, opts, d) {
  const apply = () => d.setTopbarAccount(user, {
    loginHref: loginUrl(),
    accountHref: linkTo("account"),
    withAccountSettings: true,
    ...(opts.account || {}),
  });
  apply();
  if (opts.accountOnLang) window.addEventListener("i18n:lang", apply);
}

export async function initPage(id, opts = {}) {
  const p = PAGES[id];
  if (!p) throw new Error(`initPage: nieznana strona "${id}"`);
  const d = opts.deps || await loadDeps();

  // Guard jest pierwszą bramką. Nie pytamy o sesję ani nie odsłaniamy strony,
  // dopóki urządzenie i viewport nie spełniają warunków tej trasy.
  const guard = d.guardViewportWidth({ minWidth: p.minViewportWidth || 0, backHref: backHref(id, { anon: true }), ...(p.deviceGuard || {}), ...opts.deviceGuard });
  if (!(await guard.ready)) return null;

  // Auth startuje dopiero po przejściu guarda; może biec równolegle z i18n.
  const userP = p.access === "public"
    ? Promise.resolve(d.getUser()).catch(() => null)
    : Promise.resolve(d.requireAuth(loginUrl()));
  userP.catch(() => {});
  if (opts.ready) await opts.ready;

  const user = (await userP) || null;
  // requireAuth przekierował (brak sesji / brak nazwy użytkownika) — nic więcej.
  if (!user && p.access !== "public") return null;
  setModalSheetPage(id);

  // Topbar działa także pod nakładką — „Wstecz” jest wtedy wyjściem.
  wireBack(id, user, opts, d);
  wireManual(id, user, opts);
  wireButtons(id, user, d);
  wireAccount(user, opts, d);
  document.querySelector(".topbar")?.classList.add("topbar-ready");

  if (p.access === "user" && isGuestUser(user)) {
    if (p.guestRedirect) {
      location.replace(linkTo(p.guestRedirect));
      return null;
    }
    showPageGuard({
      kind: "guest",
      state: "guest",
      iconName: "person",
      titleKey: "pageGuard.guestTitle",
      messageKey: "pageGuard.guestMessage",
      backHref: backHref(id, { anon: false }),
      loginHref: loginUrl({ forceAuth: true }),
    });
    return null;
  }

  // Account notices are shared across authenticated pages, not tied to the
  // Games library. Await the same blocking modal flow everywhere so users
  // don't miss a one-time notice while the page continues initializing.
  if (!new Set(["login", "privacy", "mailCenter", "connectDevice"]).has(id)) {
    if (isGuestUser(user)) {
      const { maybeShowGuestInfoModal } = await import("./guest-info-modal.js?v=v2026-10-19T12011");
      await maybeShowGuestInfoModal(user);
    } else if (user) {
      const { initRatingSystem } = await import("./rating-system.js?v=v2026-10-19T12011");

      await initRatingSystem(user);
    }
  }

  return user;
}
