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
    pl: "Uwaga! Ta konsola jest przeznaczona dla programistów.\n\nWklejenie tu kodu na czyjąś prośbę może dać tej osobie dostęp do Twojego konta (atak Self-XSS).\n\nNie wklejaj kodu, którego nie rozumiesz.",
    en: "Warning! This console is intended for developers.\n\nPasting code here at someone's request may give that person access to your account (Self-XSS attack).\n\nDo not paste code you don't understand.",
    uk: "Увага! Ця консоль призначена для розробників.\n\nВставлення сюди коду на чиєсь прохання може надати цій особі доступ до твого облікового запису (атака Self-XSS).\n\nНе вставляй код, якого не розумієш."
  };
  
  console.warn(warnings[lang] || warnings.pl);
})();
