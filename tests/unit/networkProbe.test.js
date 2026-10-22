import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyProbe, createNetworkMonitor, measureNetwork } from "../../web/shared/js/core/network-probe.js";

test("classifyProbe: wolny Cloudflare = łącze urządzenia, wolna sama baza = serwer", () => {
  assert.equal(classifyProbe({ edgeMs: 80, dbMs: 200 }), "ok");
  assert.equal(classifyProbe({ edgeMs: 1500, dbMs: 1700 }), "device_network");
  assert.equal(classifyProbe({ edgeMs: 90, dbMs: 2500 }), "server");
  assert.equal(classifyProbe({ edgeMs: 90, dbMs: 5000, dbFailed: true }), "server");
  assert.equal(classifyProbe({ edgeMs: 5000, dbMs: 5000, edgeFailed: true, dbFailed: true }), "device_network");
  assert.equal(classifyProbe({ edgeMs: 5000, dbMs: 150, edgeFailed: true }), "ok");
});

function fakeClock() {
  let t = 0;
  const timers = [];
  return {
    now: () => t,
    setTimer: (fn, ms) => { const h = { fn, at: t + ms }; timers.push(h); return h; },
    clearTimer: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); },
    async advance(ms) {
      t += ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const due = timers[0];
        if (!due || due.at > t) break;
        timers.shift();
        due.fn();
        await new Promise((r) => setImmediate(r));
      }
    },
  };
}

test("createNetworkMonitor: pomiar startowy, spowolnienie raz, powrót po dwóch dobrych", async () => {
  const clock = fakeClock();
  const samples = [
    { edgeMs: 80, dbMs: 150 },
    { edgeMs: 90, dbMs: 2600 },
    { edgeMs: 1400, dbMs: 1600 },
    { edgeMs: 85, dbMs: 140 },
    { edgeMs: 82, dbMs: 130 },
  ];
  const sent = [];
  const monitor = createNetworkMonitor({
    probe: async () => samples.shift() ?? { edgeMs: 80, dbMs: 120 },
    send: (phase, data) => sent.push({ phase, ...data }),
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
  });
  monitor.start();
  await clock.advance(3_000); // baseline
  await clock.advance(30_000); // początek spowolnienia (serwer)
  assert.equal(monitor.incidentOpen, true);
  await clock.advance(5_000); // nadal wolno (łącze)
  await clock.advance(5_000); // pierwszy dobry
  await clock.advance(5_000); // drugi dobry — zamknięcie
  assert.deepEqual(sent.map((e) => e.phase), ["baseline", "slow", "recovered"]);
  assert.equal(sent[0].verdict, "ok");
  assert.equal(sent[1].verdict, "server");
  const rec = sent[2];
  assert.equal(rec.samples, 2);
  assert.equal(rec.server_samples, 1);
  assert.equal(rec.device_network_samples, 1);
  assert.equal(rec.max_edge_ms, 1400);
  assert.equal(rec.max_db_ms, 2600);
  assert.equal(rec.duration_ms, 15_000);
  monitor.stop();
  await clock.advance(60_000);
  assert.equal(sent.length, 3);
});

test("measureNetwork: karta w tle nie mierzy; błąd RPC liczony jako nieudany", async () => {
  assert.equal(await measureNetwork({ pingUrl: "x", rpc: async () => ({}), doc: { visibilityState: "hidden" } }), null);
  let t = 0;
  const sample = await measureNetwork({
    pingUrl: "https://api.example/_ping",
    fetchImpl: async () => { t += 70; return { ok: true }; },
    rpc: async () => { t += 2000; return { error: new Error("timeout") }; },
    now: () => t, doc: { visibilityState: "visible" },
    nav: { onLine: true, connection: { effectiveType: "4g", rtt: 100, downlink: 8.2, type: "wifi" } },
  });
  assert.equal(sample.edgeMs, 70);
  assert.equal(sample.dbMs, 2000);
  assert.equal(sample.dbFailed, true);
  assert.equal(sample.effective_type, "4g");
  assert.equal(sample.connection_type, "wifi");
  assert.equal(classifyProbe(sample), "server");
});
