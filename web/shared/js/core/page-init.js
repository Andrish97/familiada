// js/core/page-init.js
// Jedno wywołanie na starcie strony zamiast requireAuth + showGuestBlockedOverlay
// + guardDesktopOnly + ręcznego podpinania #btnBack / #btnManual / konta.
// Wszystko wynika z wpisu strony w PAGES (nav-map.js):
//
//   1. dostęp   public — bez wymuszania logowania (user albo null),
//               guest  — wymaga sesji (konto albo gość), inaczej loginUrl(),
//               user   — tylko konto; gość dostaje wspólną nakładkę (page-overlay.js),
//   2. urządzenie  "wide" — guardDesktopOnly (na żywo), "noPhone" — blokada telefonu,
//   3. topbar   #btnBack (etykieta + cel z backHref, najpierw handleSheetBack()),
//               #btnManual (linkTo("manual", { hash: wpis.manual })), konto, topbar-ready,
//   4. zwraca użytkownika (null dla niezalogowanego, zablokowanego albo przekierowanego).
//
// Odstępstwa strony przekazujemy przez opts, nie przez zapasowe ścieżki:
//   ready          Promise (np. initI18n), na który czekamy przed pokazaniem czegokolwiek
//                  — auth startuje od razu, równolegle z nim
//   back           id przycisku „Wstecz” (domyślnie "btnBack"); false — strona go nie ma
//   backLabel      false — etykietę ustawia sama strona
//   onBack         (href, ev) => … zamiast przejścia na href (np. zapis przed wyjściem);
//                  handleSheetBack() i tak idzie pierwsze
//   manual         id przycisku „Wskazówki” (domyślnie "btnManual"); false — strona go nie ma
//   onManual       (href, ev) => … zamiast przejścia na href
//   account        opcje setTopbarAccount (withAccountSettings, showAuthEntry, onLogout)
//   accountOnLang  true — odśwież menu konta po zmianie języka
//   deps           podmiana zależności (testy)

import { PAGES, backHref, linkTo, loginUrl, renderBackLabel } from "./nav-map.js?v=v2026-10-09T22521";
import { isGuestUser } from "./guest-mode.js?v=v2026-10-09T22521";
import { showPageGuard } from "./page-overlay.js?v=v2026-10-09T22521";

async function loadDeps() {
  const [auth, topbar, sheet, device] = await Promise.all([
    import("./auth.js?v=v2026-10-09T22521"),
    import("./topbar-controller.js?v=v2026-10-09T22521"),
    import("./modal-sheet.js?v=v2026-10-09T22521"),
    import("./device-guard.js?v=v2026-10-09T22521"),
  ]);
  return {
    getUser: auth.getUser,
    requireAuth: auth.requireAuth,
    setTopbarAccount: topbar.setTopbarAccount,
    handleSheetBack: sheet.handleSheetBack,
    guardDesktopOnly: device.guardDesktopOnly,
    blockPhone: device.blockPhone,
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
    const href = linkTo("manual", { hash: anchor });
    if (opts.onManual) { await opts.onManual(href, ev); return; }
    location.href = href;
  });
}

function wireAccount(user, opts, d) {
  const apply = () => d.setTopbarAccount(user, {
    loginHref: loginUrl(),
    accountHref: linkTo("account"),
    ...(opts.account || {}),
  });
  apply();
  if (opts.accountOnLang) window.addEventListener("i18n:lang", apply);
}

export async function initPage(id, opts = {}) {
  const p = PAGES[id];
  if (!p) throw new Error(`initPage: nieznana strona "${id}"`);
  const d = opts.deps || await loadDeps();

  // Auth startuje od razu, równolegle z i18n (opts.ready).
  const userP = p.access === "public"
    ? Promise.resolve(d.getUser()).catch(() => null)
    : Promise.resolve(d.requireAuth(loginUrl()));
  userP.catch(() => {});
  if (opts.ready) await opts.ready;

  const user = (await userP) || null;
  // requireAuth przekierował (brak sesji / brak nazwy użytkownika) — nic więcej.
  if (!user && p.access !== "public") return null;

  // Urządzenie: guard stoi przed wszystkim, co strona zrobi dalej.
  let blockedByDevice = false;
  if (p.device === "wide") {
    d.guardDesktopOnly({ backHref: backHref(id, { anon: !user }) });
  } else if (p.device === "noPhone") {
    blockedByDevice = d.blockPhone({ backHref: backHref(id, { anon: !user }) });
  }

  // Topbar działa także pod nakładką — „Wstecz” jest wtedy wyjściem.
  wireBack(id, user, opts, d);
  wireManual(id, user, opts);
  wireAccount(user, opts, d);
  document.querySelector(".topbar")?.classList.add("topbar-ready");

  if (blockedByDevice) return null;

  if (p.access === "user" && isGuestUser(user)) {
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

  return user;
}
