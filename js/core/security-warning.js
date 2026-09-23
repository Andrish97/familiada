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
    pl: "🎭 STOP! 🎭\n\nUżywanie tej konsoli może pozwolić atakującym na podszywanie się pod Ciebie i kradzież informacji (atak Self-XSS).\n\nJeśli ktoś powiedział Ci, żeby wkleić tutaj kod — NIE RÓB TEGO! To jak oddanie kluczy do domu nieznajomemu. 🏠🔑\n\nNie wklejaj kodu, którego nie rozumiesz. Twoje dane Ci podziękują! 🙏",
    en: "🎭 STOP! 🎭\n\nUsing this console may allow attackers to impersonate you and steal your information (Self-XSS attack).\n\nIf someone told you to paste code here — DON'T DO IT! It's like giving your house keys to a stranger. 🏠🔑\n\nDo not enter or paste code you don't understand. Your data will thank you! 🙏",
    uk: "🎭 СТОП! 🎭\n\nВикористання цієї консолі може дозволити зловмисникам видавати себе за тебе та красти твою інформацію (атака Self-XSS).\n\nЯкщо хтось сказав тобі вставити сюди код — НЕ РОБИ ЦЬОГО! Це як віддати ключі від дому незнайомцю. 🏠🔑\n\nНе вводь і не вставляй код, якого не розумієш. Твої дані подякують! 🙏"
  };
  
  console.warn(warnings[lang] || warnings.pl);
})();
