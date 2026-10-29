import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../../web/shared/js/core/module-boot-guard.js", import.meta.url), "utf8");

function boot(storage = new Map(), { withErrorBox = true } = {}) {
  const listeners = {};
  const timers = [];
  const box = { hidden: true };
  const env = { reloads: 0, timers, box, storage, listeners };
  vm.runInNewContext(source, {
    window: { addEventListener: (type, fn) => { listeners[type] = fn; } },
    document: { getElementById: (id) => (withErrorBox && id === "deviceLoadError" ? box : null) },
    location: { pathname: "/control/buzzer/", href: "https://www.familijna.app/control/buzzer/", origin: "https://www.familijna.app", reload: () => { env.reloads += 1; } },
    sessionStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    Number, String, URL,
  });
  env.failScript = (src = "/control/buzzer/js/main.js?v=test") => listeners.error({ target: { tagName: "SCRIPT", type: "module", src } });
  env.failImport = (message) => listeners.unhandledrejection({ reason: { message } });
  env.runTimer = (ms) => timers.find((t) => t.ms === ms).fn();
  return env;
}

test("nieudany moduł: przeładowanie po 1 s, kolejne po 3 i 8 s, potem komunikat", () => {
  const storage = new Map();
  for (const delay of [1000, 3000, 8000]) {
    const env = boot(storage);
    env.failScript();
    env.failScript();
    env.runTimer(delay);
    assert.equal(env.reloads, 1, `jedno przeładowanie po ${delay} ms`);
  }
  const last = boot(storage);
  last.failScript();
  assert.equal(last.reloads, 0);
  assert.equal(last.box.hidden, false, "po trzech próbach komunikat z przyciskiem Odśwież");
  assert.equal(storage.size, 0, "licznik wyzerowany do ręcznego odświeżenia");
});

test("nieudany import dynamiczny (Chrome/Safari/Firefox) też uruchamia ponowienie", () => {
  for (const message of ["Failed to fetch dynamically imported module: x", "Importing a module script failed.", "error loading dynamically imported module"]) {
    const env = boot();
    env.failImport(message);
    env.runTimer(1000);
    assert.equal(env.reloads, 1, message);
  }
  const other = boot();
  other.failImport("zwykły błąd aplikacji");
  assert.equal(other.timers.filter((t) => t.ms === 1000).length, 0);
});

test("błąd zewnętrznego modułu nie przeładowuje strony ani nie zużywa prób aplikacji", () => {
  const env = boot();
  env.failScript("https://static.cloudflareinsights.com/beacon.min.js/test");
  env.failScript("https://cdn.example.com/addon.js");
  assert.equal(env.timers.filter(t => t.ms < 30000).length, 0);
  assert.equal(env.storage.size, 0);
  env.failScript("https://www.familijna.app/control/buzzer/js/main.js?v=test");
  env.runTimer(1000);
  assert.equal(env.reloads, 1, "moduł aplikacji nadal odzyskuje połączenie po 1 s");
});

test("zwykły błąd obrazka albo skryptu klasycznego nie przeładowuje; 30 s bez błędu zeruje licznik", () => {
  const storage = new Map([["familijna:boot-retry:/control/buzzer/", "2"]]);
  const env = boot(storage);
  env.listeners.error({ target: { tagName: "IMG" } });
  env.listeners.error({ target: { tagName: "SCRIPT", type: "" } });
  assert.equal(env.timers.filter((t) => t.ms < 30000).length, 0);
  env.runTimer(30000);
  assert.equal(storage.size, 0);
});
