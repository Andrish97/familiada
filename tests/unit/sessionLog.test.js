import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../../web/shared/js/core/session-log.js", import.meta.url), "utf8")
  .replace(/^import .*;$/gm, "")
  .replace(/export (const|function|async function)/g, "$1");

function load({ rpc, navigator = {}, timers = [] } = {}) {
  const context = {
    sb: () => ({ rpc }),
    SUPABASE_URL: "https://api.example", SUPABASE_ANON_KEY: "anon",
    getDeviceProfile: () => ({ formFactor: "phone" }),
    navigator, window: { matchMedia: () => ({ matches: false }) },
    document: { addEventListener() {}, removeEventListener() {} },
    AbortSignal, crypto: { randomUUID: () => `id-${Math.random()}` },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    fetch: async () => ({}),
  };
  return vm.runInNewContext(`${source}; ({ createSessionLog, collectDeviceInfo });`, context);
}

test("dziennik sesji: paczki po 20, event_id i parametry RPC", async () => {
  const calls = [];
  const { createSessionLog } = load({
    rpc: (name, params) => { calls.push({ name, params }); return { abortSignal: async () => ({ data: params.p_events.length, error: null }) }; },
  });
  const log = createSessionLog({ rpc: "control2_device_log", params: () => ({ p_game_id: "g" }), canSend: () => false });
  for (let i = 0; i < 25; i += 1) log.push({ event_type: "page_state", n: i });
  assert.equal(calls.length, 0, "bez prawa wysyłki nic nie wychodzi");
  const ready = createSessionLog({ rpc: "control2_device_log", params: () => ({ p_game_id: "g" }) });
  for (let i = 0; i < 25; i += 1) ready.push({ event_type: "page_state", n: i });
  await ready.flush();
  await new Promise(resolve => setImmediate(resolve));
  const sizes = calls.map(call => call.params.p_events.length);
  assert.equal(sizes.reduce((a, b) => a + b, 0), 25);
  assert.ok(sizes.every(size => size <= 20));
  assert.ok(calls.every(call => call.name === "control2_device_log" && call.params.p_game_id === "g"));
  assert.ok(calls.flatMap(call => call.params.p_events).every(event => typeof event.event_id === "string"));
  assert.equal(ready.pending, 0);
});

test("dziennik sesji: błąd sieci zostawia zdarzenia i planuje ponowienie", async () => {
  const timers = [];
  let fail = true;
  const sent = [];
  const { createSessionLog } = load({
    timers,
    rpc: (name, params) => ({ abortSignal: async () => {
      if (fail) throw new TypeError("network");
      sent.push(...params.p_events);
      return { data: params.p_events.length, error: null };
    } }),
  });
  const log = createSessionLog({ rpc: "control2_control_log", params: () => ({ p_game_id: "g" }) });
  log.push({ kind: "error", message: "x" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(log.pending, 1);
  assert.equal(timers[0].ms, 1000);
  fail = false;
  await timers[0].fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(log.pending, 0);
  assert.equal(sent[0].kind, "error");
});

test("opis urządzenia: zgrubna klasa, przeglądarka i system bez wersji", async () => {
  const { collectDeviceInfo } = load({
    navigator: {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
      maxTouchPoints: 5, getBattery: async () => ({ level: 0.37, charging: false }),
    },
  });
  const info = await collectDeviceInfo();
  assert.equal(info.event_type, "device_info");
  assert.equal(info.device_class, "phone");
  assert.equal(info.browser, "safari");
  assert.equal(info.os, "ios");
  assert.equal(info.battery_level, 40);
  assert.equal(info.charging, false);
  assert.ok(!JSON.stringify(info).includes("17"), "bez numerów wersji");
});
