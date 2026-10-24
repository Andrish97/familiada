import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../../web/shared/js/core/keep-alive.js", import.meta.url), "utf8")
  .replace(/export function/g, "function");

function createEnv({ wakeResults }) {
  const listeners = new Map();
  const document = {
    hidden: false,
    title: "Prowadzący",
    body: { appendChild() {} },
    createElement: () => ({ getContext: () => null, captureStream: () => null, setAttribute() {}, style: {} }),
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
  };
  const requests = [];
  const navigator = {
    wakeLock: {
      request(kind) {
        requests.push(kind);
        const result = wakeResults.shift();
        if (result === "deny") return Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
        const lockListeners = new Map();
        const lock = {
          released: false,
          addEventListener(type, fn) { lockListeners.set(type, fn); },
          release() { lock.released = true; lockListeners.get("release")?.(); },
        };
        return Promise.resolve(lock);
      },
    },
  };
  const context = vm.createContext({
    document, navigator, setInterval: () => 0, clearInterval() {}, setTimeout, console,
  });
  vm.runInContext(`${source}\nthis.api = { startKeepAlive, onWakeLockChange };`, context);
  const fire = type => { for (const fn of [...(listeners.get(type) || [])]) fn({ type }); };
  const count = type => listeners.get(type)?.size || 0;
  return { api: context.api, requests, fire, count, document };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test("odmowa blokady wygaszania (iOS bez gestu) jest ponawiana przy dotknięciu", async () => {
  const env = createEnv({ wakeResults: ["deny", "grant"] });
  const states = [];
  env.api.onWakeLockChange(state => states.push(state.phase));
  env.api.startKeepAlive({ videoWakeLockFallback: false });
  await tick();
  assert.deepEqual(states, ["denied"]);
  assert.equal(env.requests.length, 1);
  assert.equal(env.count("touchend"), 1, "czeka na gest");

  env.fire("touchend");
  await tick();
  assert.deepEqual(states, ["denied", "granted"]);
  assert.equal(env.requests.length, 2);
  assert.equal(env.count("touchend"), 0, "po udanym ponowieniu bez nasłuchu gestów");

  env.fire("click");
  await tick();
  assert.equal(env.requests.length, 2, "blokada trzymana — bez kolejnych żądań");
});

test("kolejne odmowy czekają na następny gest, bez pętli żądań", async () => {
  const env = createEnv({ wakeResults: ["deny", "deny", "grant"] });
  env.api.startKeepAlive({ videoWakeLockFallback: false });
  await tick();
  env.fire("pointerup");
  await tick();
  assert.equal(env.requests.length, 2);
  await tick();
  assert.equal(env.requests.length, 2, "bez gestu nie ponawia");
  env.fire("keydown");
  await tick();
  assert.equal(env.requests.length, 3);
});

test("ukryta karta nie prosi o blokadę; powrót na widoczność ją bierze", async () => {
  const env = createEnv({ wakeResults: ["grant"] });
  env.document.hidden = true;
  env.api.startKeepAlive({ videoWakeLockFallback: false });
  await tick();
  assert.equal(env.requests.length, 0);
  env.document.hidden = false;
  env.fire("visibilitychange");
  await tick();
  assert.equal(env.requests.length, 1);
});
