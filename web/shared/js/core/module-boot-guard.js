// js/core/module-boot-guard.js — zwykły skrypt (nie moduł), wczytywany przed
// modułami strony. Jeden nieudany import ES (503 tuż po wdrożeniu, zgubione
// żądanie na słabym łączu) zatrzymuje cały graf modułów: strona urządzenia
// wyglądała na otwartą, ale nic nie startowało, a Control nie widział
// urządzenia (e2e 40185039280, 25.10). Tu: ponowne wczytanie strony po 1, 3
// i 8 s; po trzech próbach komunikat #deviceLoadError (strony urządzeń).
(function () {
  var DELAYS = [1000, 3000, 8000];
  var key = "familijna:boot-retry:" + location.pathname;
  var handled = false;
  function attempts() {
    try { return Number(sessionStorage.getItem(key)) || 0; } catch (e) { return 0; }
  }
  function setAttempts(n) {
    try { if (n > 0) sessionStorage.setItem(key, String(n)); else sessionStorage.removeItem(key); } catch (e) { /* tryb prywatny */ }
  }
  function showLoadError() {
    var box = document.getElementById("deviceLoadError");
    if (box) box.hidden = false;
  }
  function onBootFailure() {
    if (handled) return;
    handled = true;
    var n = attempts();
    if (n >= DELAYS.length) { setAttempts(0); showLoadError(); return; }
    setAttempts(n + 1);
    setTimeout(function () { location.reload(); }, DELAYS[n]);
  }
  window.addEventListener("error", function (event) {
    var el = event && event.target;
    if (!el || el.tagName !== "SCRIPT" || el.type !== "module") return;
    // Zewnętrzne dodatki (np. statystyki zablokowane przez CSP) nie są
    // modułami aplikacji i nie mogą uruchamiać pętli przeładowań.
    if (el.src && new URL(el.src, location.href).origin !== location.origin) return;
    onBootFailure();
  }, true);
  window.addEventListener("unhandledrejection", function (event) {
    var message = String((event && event.reason && event.reason.message) || "");
    if (/dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message)) onBootFailure();
  });
  // Strona działa od 30 s bez błędu wczytania — kolejne problemy liczymy od zera.
  setTimeout(function () { if (!handled) setAttempts(0); }, 30000);
})();
