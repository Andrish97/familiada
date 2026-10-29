// tests/e2e/realtime-paths-benchmark.spec.js
//
// Pomiar kanału z bazy (migracje 508–510; decyzja właściciela 2026-10-29 —
// jedyny mechanizm powiadomień gry). Wyniki porównania z dawnymi drogami
// (postgres_changes, dzwonek + odczyt): e2e 40868645209 — kanał z bazy
// p50 141 ms / p90 158 ms, dawne ~420 ms.
// Na produkcyjnej bazie, Realtime i Workerze, bez kodu aplikacji: trzy
// urządzenia (display, host, buzzer) z własnym lease, tokenem i heartbeatem
// co 3 s dołączają do game-state:<gra>:<połączenie>. Control zapisuje
// 60 zmian w tempie gry (700 ms) i serię 20 jak w finale (150 ms). Czas od
// startu zapisu do odebrania wiersza, liczba zgubionych.
// Profil „slow” dokłada to samo opóźnienie każdemu żądaniu HTTP i każdej
// wiadomości WebSocket w obie strony (page.route + routeWebSocket).
// Test nie ocenia wydajności progiem — wypisuje wynik ([bench] …) i dołącza
// JSON; pada tylko, gdy kanał nic nie dostarczył.

const { test, expect } = require("./helpers/e2e-test");

test.use({ needs: { standard: 1, resources: ["heavy"] } });

const DEVICES = ["display", "host", "buzzer"];
const PROFILES = [
  { name: "normal", delayMs: 0 },
  { name: "slow", delayMs: 150 },
];
const STEADY = { count: 60, gapMs: 700 };
const BURST = { count: 20, gapMs: 150 };
const MISS_MS = 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function addLatency(page, delayMs) {
  if (!delayMs) return;
  await page.route("**/*", async (route) => { await sleep(delayMs); await route.fallback(); });
  await page.routeWebSocket(/\/realtime\//, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => setTimeout(() => server.send(message), delayMs));
    server.onMessage((message) => setTimeout(() => ws.send(message), delayMs));
  });
}

// Strona urządzenia: lease + heartbeat, token, kanał z bazy.
async function startDevice(page, { gid, key, type }) {
  return page.evaluate(async ({ gid, key, type }) => {
    const sb = window.__sbClient;
    const bench = window.__bench = { dbcast: {}, errors: [], dbcastStatus: null };
    const connectionId = crypto.randomUUID();
    const { data: reg, error: regError } = await sb.rpc("control_device_instance_register", {
      p_game_id: gid, p_device_type: type, p_key: key,
      p_connection_id: connectionId, p_meta: { visibility: "visible", focused: true },
    });
    if (regError || reg?.state !== "primary") throw regError || new Error(`${type} not primary`);
    const lease = { p_connection_id: connectionId, p_epoch: reg.epoch };
    // Builder supabase-js wysyła żądanie dopiero przy then/await — samo
    // „void sb.rpc(...)” nie wysyłało heartbeatu i lease wygasał po 12 s.
    window.__benchHeartbeat = setInterval(() => {
      sb.rpc("control_device_instance_heartbeat", {
        p_game_id: gid, p_device_type: type, p_key: key, ...lease,
        p_meta: { visibility: "visible", focused: true },
      }).then(({ error }) => { if (error) bench.errors.push(`heartbeat:${error.message}`); }, () => {});
    }, 3000);

    const { data: tokenData, error: tokenError } = await sb.functions.invoke("device-realtime-token", {
      body: { game_id: gid, device_type: type, key, connection_id: connectionId, epoch: reg.epoch },
    });
    if (tokenError || !tokenData?.token) throw tokenError || new Error("missing realtime token");
    const realtime = window.supabase.createClient(sb.supabaseUrl, sb.supabaseKey, { accessToken: async () => tokenData.token });
    window.__benchRealtime = realtime;
    await realtime.realtime.setAuth();
    // Kanał z bazy (508): prywatny, dołączenie sprawdza polityka na realtime.messages.
    const dbcast = realtime.channel(`game-state:${gid}:${connectionId}`, { config: { private: true } })
      .on("broadcast", { event: "state" }, ({ payload }) => {
        const rev = Number(payload?.row?.rev);
        if (Number.isFinite(rev)) bench.dbcast[rev] ??= Date.now();
      });
    await new Promise((resolve) => {
      const timer = setTimeout(() => { bench.dbcastStatus = "TIMEOUT"; resolve(); }, 15000);
      dbcast.subscribe((status, error) => {
        bench.dbcastStatus = error ? `${status}:${String(error?.message || error).slice(0, 80)}` : status;
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(timer); resolve(); }
      });
    });
    return true;
  }, { gid, key, type });
}

// Control: sam zapis — baza wysyła zmianę urządzeniom.
async function runWrites(page, gid) {
  return page.evaluate(async ({ gid, steady, burst }) => {
    const sb = window.__sbClient;
    const writes = {};
    const plan = [...Array(steady.count).fill(steady.gapMs), ...Array(burst.count).fill(burst.gapMs)];
    let i = 0;
    for (const gapMs of plan) {
      i += 1;
      const startedAt = Date.now();
      const { data, error } = await sb.rpc("game_state_write", {
        p_game_id: gid, p_step: "devices_display", p_top_card: "devices",
        p_phase: null, p_control_team: null,
        p_detail: { teams: { teamA: `Bench ${i}`, teamB: "B" } },
        p_sound_cue_key: null, p_expected_rev: null, p_lock_ms: null,
      });
      if (error) throw error;
      const rev = Number(data?.rev);
      writes[rev] = { startedAt, doneAt: Date.now(), burst: gapMs === burst.gapMs };
      await new Promise((resolve) => setTimeout(resolve, gapMs));
    }
    return writes;
  }, { gid, steady: STEADY, burst: BURST });
}

function quantiles(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { n: sorted.length, p50: q(0.5), p90: q(0.9), max: sorted.at(-1) };
}

function summarize(writes, devices) {
  const out = {};
  for (const [type, bench] of Object.entries(devices)) {
    const fromStart = [], fromDone = [];
    let miss = 0;
    for (const [revText, write] of Object.entries(writes)) {
      const at = bench.dbcast[Number(revText)];
      if (at == null || at - write.startedAt > MISS_MS) { miss += 1; continue; }
      fromStart.push(at - write.startedAt);
      fromDone.push(at - write.doneAt);
    }
    out[type] = {
      dbcast_ms: quantiles(fromStart), dbcast_after_write_ms: quantiles(fromDone),
      dbcast_miss: miss, dbcast_status: bench.dbcastStatus, errors: bench.errors.slice(0, 5),
    };
  }
  return out;
}

for (const profile of PROFILES) {
  test(`realtime: kanał z bazy — profil ${profile.name}`, async ({ page, browser, accounts, loginAs }, testInfo) => {
    test.setTimeout(240_000);
    await loginAs(page, page.context(), accounts.standard[0]);
    const game = await page.evaluate(async (name) => {
      const sb = window.__sbClient;
      const { data: userData } = await sb.auth.getUser();
      const { data, error } = await sb.from("games").insert({ name, owner_id: userData.user.id, type: "prepared", status: "ready" }).select("id").single();
      if (error) throw error;
      return data;
    }, `E2E-REALTIME-BENCH-${profile.name}-${Date.now()}`);
    const contexts = [];
    try {
      const keys = await page.evaluate(async ({ gid, devices }) => {
        const sb = window.__sbClient;
        const { error: seedError } = await sb.rpc("game_state_write", {
          p_game_id: gid, p_step: "devices_display", p_top_card: "devices", p_phase: null, p_control_team: null,
          p_detail: { teams: { teamA: "Seed", teamB: "B" } }, p_sound_cue_key: null, p_expected_rev: null, p_lock_ms: null,
        });
        if (seedError) throw seedError;
        const { data: session, error: sessionError } = await sb.rpc("control_runtime_session_touch_v2", { p_game_id: gid, p_session_id: null });
        if (sessionError || !session?.ok) throw sessionError || new Error("session touch failed");
        const keys = {};
        for (const type of devices) {
          const { data, error } = await sb.rpc("control_runtime_device_link", { p_game_id: gid, p_device_type: type });
          if (error || !data?.ok) throw error || new Error(`link ${type} failed`);
          keys[type] = data.token;
        }
        return keys;
      }, { gid: game.id, devices: DEVICES });

      const devicePages = {};
      for (const type of DEVICES) {
        const context = await browser.newContext();
        contexts.push(context);
        const devicePage = await context.newPage();
        await devicePage.goto("/", { waitUntil: "domcontentloaded" });
        await devicePage.waitForFunction(() => !!window.__sbClient && !!window.supabase, null, { timeout: 20000 });
        await addLatency(devicePage, profile.delayMs);
        await startDevice(devicePage, { gid: game.id, key: keys[type], type });
        devicePages[type] = devicePage;
      }
      await addLatency(page, profile.delayMs);

      const writes = await runWrites(page, game.id);
      await sleep(MISS_MS + 500);
      const devices = {};
      for (const [type, devicePage] of Object.entries(devicePages)) {
        devices[type] = await devicePage.evaluate(() => window.__bench);
      }
      const summary = summarize(writes, devices);
      console.log(`[bench] ${profile.name} (+${profile.delayMs} ms): ${JSON.stringify(summary)}`);
      await testInfo.attach(`realtime-bench-${profile.name}.json`, { body: JSON.stringify({ profile, summary }, null, 2), contentType: "application/json" });
      for (const result of Object.values(summary)) {
        expect(result.dbcast_ms?.n ?? 0, `kanał z bazy nic nie dostarczył (${result.dbcast_status})`).toBeGreaterThan(0);
      }
    } finally {
      for (const context of contexts) {
        await context.pages()[0]?.evaluate(async () => {
          clearInterval(window.__benchHeartbeat);
          await window.__benchRealtime?.removeAllChannels();
          await window.__sbClient?.removeAllChannels();
        }).catch(() => {});
        await context.close().catch(() => {});
      }
      await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
      await page.evaluate(async (gid) => { await window.__sbClient.from("games").delete().eq("id", gid); }, game.id).catch(() => {});
    }
  });
}
