// js/pages/privacy.js
//
// - publiczna strona (bez wymuszania logowania)
// - jeśli user zalogowany -> pokazuj username + Wyloguj
// - jeśli niezalogowany -> ukryj username + Wyloguj, a Wstecz wraca do /
//   (initPage: konto, „Wstecz” i etykieta wg mapy nawigacji)

import { initI18n } from "../../shared/translation/translation.js?v=v2026-10-10T15075";
import { initPage } from "../../shared/js/core/page-init.js?v=v2026-10-10T15075";
import "../../shared/js/core/contact-modal.js?v=v2026-10-10T15075";

window.dispatchEvent(new Event("resize"));

document.addEventListener("DOMContentLoaded", async () => {
  const i18nP = initI18n({ withSwitcher: true });
  // Strona publiczna: zalogowany widzi konto, niezalogowany wraca na landing.
  // Menu konta odświeża się po zmianie języka (etykiety są tekstem, nie data-i18n).
  const pageP = initPage("privacy", { ready: i18nP, account: { showAuthEntry: false }, accountOnLang: true });
  await i18nP;
  document.documentElement.classList.remove('page-loading');

  await pageP;
});
