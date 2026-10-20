import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Wyprzedzone setUiLang (np. initI18n strony i równoległe pageshow) nie może
// wrócić, zanim nowszy wybór wczyta słownik -- inaczej t() zaraz po await
// zwraca klucz (Wyświetlacz pokazywał „DISP” z „display.sumLabel” zamiast „SUMA”).
test("superseded setUiLang resolves only after the newer dictionary is loaded", async () => {
  const listeners = new Map();
  const saved = {};
  for (const key of ["window", "document", "location", "history", "localStorage", "navigator", "CustomEvent"]) saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
  const define = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  define("window", {
    addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) || []), fn]),
    dispatchEvent: (event) => (listeners.get(event.type) || []).forEach((fn) => fn(event)),
  });
  define("document", { documentElement: { dataset: {} }, readyState: "loading", querySelectorAll: () => [], getElementById: () => null, addEventListener() {} });
  define("location", { href: "https://example.test/control/display/", search: "" });
  define("history", { replaceState() {} });
  define("localStorage", { getItem: () => null, setItem() {} });
  define("navigator", { language: "pl-PL" });
  define("CustomEvent", class { constructor(type, init) { this.type = type; this.detail = init?.detail; } });
  try {
    const i18n = await import("../../web/shared/translation/translation.js");
    // Słownik EN już w pamięci (ten sam adres z ?v= co w loaderze), PL jeszcze
    // nie: starsze wywołanie kończy import przed nowszym -- jak przy wyścigu.
    const source = readFileSync(new URL("../../web/shared/translation/translation.js", import.meta.url), "utf8");
    const enPath = source.match(/import\('(\.\/en\.js[^']*)'\)/)[1];
    await import(new URL(enPath, new URL("../../web/shared/translation/", import.meta.url)).href);
    const older = i18n.setUiLang("en", { persist: false, updateUrl: false, apply: false });
    const newer = i18n.setUiLang("pl", { persist: false, updateUrl: false, apply: false });
    assert.equal(await older, false);
    assert.equal(i18n.t("display.sumLabel"), "SUMA");
    assert.equal(await newer, true);
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
