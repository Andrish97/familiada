// Self-XSS Security Warning - outputs warning in console in page language
(function() {
  "use strict";

  // Podwójne zabezpieczenie przed wielokrotnym uruchomieniem
  // 1. Zmienna globalna (działa przy wielokrotnym parsowaniu skryptu na stronie)
  if (window._sw_executed) return;
  window._sw_executed = true;

  // 2. Session storage (działa przy reloadach i dziwnych stanach przeglądarki)
  try {
    if (sessionStorage.getItem('_sw_warned')) return;
    sessionStorage.setItem('_sw_warned', '1');
  } catch (e) {}

  function getLang() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("lang");
    if (q) {
      if (q.startsWith("en")) return "en";
      if (q.startsWith("uk") || q.startsWith("ua")) return "uk";
    }
    try {
      const stored = localStorage.getItem("uiLang");
      if (stored) {
        if (stored.startsWith("en")) return "en";
        if (stored.startsWith("uk") || stored.startsWith("ua")) return "uk";
      }
    } catch (e) {}
    if (navigator?.language) {
      if (navigator.language.startsWith("en")) return "en";
      if (navigator.language.startsWith("uk") || navigator.language.startsWith("ua")) return "uk";
    }
    return "pl";
  }
  
  const lang = getLang();
  const warnings = {
    pl: "OSTRZEŻENIE BEZPIECZEŃSTWA\n\nUżywanie tej konsoli może pozwolić atakującym na podszywanie się pod Ciebie i kradzież informacji (atak Self-XSS).\n\nJeśli ktoś poprosił Cię o wklejenie tutaj kodu — nie rób tego. To równoznaczne z przekazaniem dostępu do konta osobie trzeciej.\n\nNie wklejaj ani nie wpisuj kodu, którego nie rozumiesz.",
    en: "SECURITY WARNING\n\nUsing this console may allow attackers to impersonate you and steal your information (Self-XSS attack).\n\nIf someone asked you to paste code here — do not do it. This is equivalent to handing over access to your account to a third party.\n\nDo not paste or enter code you don't understand.",
    uk: "ПОПЕРЕДЖЕННЯ ПРО БЕЗПЕКУ\n\nВикористання цієї консолі може дозволити зловмисникам видавати себе за тебе та красти твою інформацію (атака Self-XSS).\n\nЯкщо хтось попросив тебе вставити сюди код — не роби цього. Це рівнозначно передачі доступу до твого акаунта третій особі.\n\nНе вставляй і не вводь код, якого не розумієш."
  };
  
  console.warn(warnings[lang] || warnings.pl);
})();
