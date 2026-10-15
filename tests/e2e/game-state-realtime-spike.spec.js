// tests/e2e/game-state-realtime-spike.spec.js
//
// Zwykły JWT anon nie może odbierać `postgres_changes` z public.game_state.
// Migration 375 dodaje osobną, wąską politykę dla 5-minutowego JWT, który
// backend wystawia dopiero po sprawdzeniu klucza urządzenia i primary lease.
// Ten test nadal sprawdza brak dostępu bez tego scoped tokenu.
//
// Wykluczone kolejno jako przyczyna (wszystkie poprawne): publikacja
// supabase_realtime, slot replikacji, REPLICA IDENTITY FULL, GRANT SELECT
// dla anon na game_state, treść samej polityki RLS, jwt_secret w
// _realtime.tenants (był realnie rozjechany i naprawiony, ale to nie był
// właściwy powód), przekazywanie nagłówków przez Kong. Prawdziwa przyczyna:
// polityka game_state_anon_read_ready (migracja 259) sprawdzała
// EXISTS(...) na public.games — a to podzapytanie samo podlega RLS na
// games, gdzie jedyna polityka dla anon/public (games_select_by_keys,
// baseline) wymaga niestandardowego JWT-claimu "share_key", którego nic w
// tym repo nigdy nie ustawia.
//
// Decyzja migracji 261 nadal obowiązuje wobec zwykłego JWT anon: nie ma
// szerokiej polityki SELECT, a klucz urządzenia jest sprawdzany przez
// SECURITY DEFINER RPC. Migracja 375 dodaje osobną politykę RLS dla
// podpisanego, krótkotrwałego JWT z aktualnym primary lease. Ktoś odpytujący
// bezpośrednio bez takiego JWT nadal dostaje zero wierszy.
//
// Ten scenariusz pilnuje braku dostępu zwykłego anon i sprawdza, że
// game_state_get z poprawnym kluczem pozostaje działający. Niżej osobny E2E
// sprawdza token scoped i dostarczenie zmiany przez postgres_changes.

// Dotyka wyłącznie nowej, addytywnej tabeli public.game_state (migracje
// 259/260/261) — zero wpływu na dzisiejszy control.html/display/index.html i ich
// dane.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

test("public.game_state: zwykły anon nie ma bezpośredniego odczytu, game_state_get nadal działa z kluczem", async ({
  page,
  browser,
}) => {
  await loginAsTestUser(page, page.context());

  const gameName = `E2E-GAME-STATE-SPIKE-${Date.now()}`;
  const game = await page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data, error } = await sb
      .from("games")
      .insert({ name, owner_id: userData.user.id, type: "prepared", status: "ready" })
      .select("id, share_key_display, share_key_host, share_key_buzzer")
      .single();
    if (error) throw new Error("insert games failed: " + error.message);
    return data;
  }, gameName);

  try {
    const writeError = await page.evaluate(async (gid) => {
      const sb = window.__sbClient;
      const { error } = await sb.rpc("game_state_write", {
        p_game_id: gid,
        p_step: "devices_display",
        p_top_card: "devices",
        p_phase: null,
        p_control_team: null,
        p_detail: { teams: { teamA: "Spike A", teamB: "Spike B" } },
        p_sound_cue_key: null,
        p_expected_rev: null,
        p_lock_ms: null,
      });
      return error?.message || null;
    }, game.id);
    expect(writeError, "game_state_write (właściciel) nie powiodło się").toBeNull();
    const runtimeKey = await page.evaluate(async gid => {
      const sb = window.__sbClient;
      const { data: session, error: sessionError } = await sb.rpc("control_runtime_session_touch_v2", {
        p_game_id: gid, p_session_id: null,
      });
      if (sessionError || !session?.ok) throw sessionError || new Error(session?.error || "session touch failed");
      const { data: link, error: linkError } = await sb.rpc("control_runtime_device_link", {
        p_game_id: gid, p_device_type: "display",
      });
      if (linkError || !link?.ok) throw linkError || new Error(link?.error || "device link failed");
      return link.token;
    }, game.id);

    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto("/", { waitUntil: "domcontentloaded" });
    const lease = await anonPage.evaluate(async ({ gid, key }) => {
      const connectionId = crypto.randomUUID();
      const { data, error } = await window.__sbClient.rpc("control_device_instance_register", {
        p_game_id: gid, p_device_type: "display", p_key: key, p_connection_id: connectionId,
        p_meta: { visibility: "visible", focused: true },
      });
      if (error || data?.state !== "primary") throw error || new Error("display was not made primary");
      return { connectionId, epoch: data.epoch };
    }, { gid: game.id, key: runtimeKey });

    // 1) Bezpośredni SELECT ze zwykłym JWT anon — musi zwrócić zero wierszy.
    //    Sama rola anon nie spełnia scoped polityki z migracji 375.
    const directRead = await anonPage.evaluate(async (gid) => {
      const sb = window.__sbClient;
      const { data, error } = await sb.from("game_state").select("*").eq("game_id", gid);
      return { rowCount: data?.length ?? -1, error: error?.message || null };
    }, game.id);
    expect(directRead.error, "bezpośredni SELECT jako anon nie powinien zwracać błędu uprawnień").toBeNull();
    expect(directRead.rowCount, "anon nie powinien widzieć żadnego wiersza game_state bezpośrednio").toBe(0);

    // 2) game_state_get z NIEPOPRAWNYM kluczem — musi odmówić.
    const badKeyResult = await anonPage.evaluate(async ({ gid, lease }) => {
      const sb = window.__sbClient;
      const { data, error } = await sb.rpc("game_state_get", {
        p_game_id: gid,
        p_device_type: "display",
        p_key: "zly-klucz-na-pewno-nieprawidlowy",
        p_connection_id: lease.connectionId, p_epoch: lease.epoch,
      });
      return { data, error: error?.message || null };
    }, { gid: game.id, lease });
    expect(badKeyResult.error, "game_state_get z błędnym kluczem powinno rzucić błąd").toContain("forbidden");

    // 3) game_state_get z POPRAWNYM kluczem pozostaje działającą ścieżką
    //    dla zwykłego JWT anon i musi zwrócić prawdziwy stan gry.
    const goodKeyResult = await anonPage.evaluate(
      async ({ gid, key, lease }) => {
        const sb = window.__sbClient;
        const { data, error } = await sb.rpc("game_state_get", {
          p_game_id: gid,
          p_device_type: "display",
          p_key: key,
          p_connection_id: lease.connectionId,
          p_epoch: lease.epoch,
        });
        return { step: data?.step ?? null, error: error?.message || null };
      },
      { gid: game.id, key: runtimeKey, lease }
    );
    expect(goodKeyResult.error, "game_state_get z poprawnym kluczem nie powinno się nie udać").toBeNull();
    expect(goodKeyResult.step, "game_state_get z poprawnym kluczem powinno zwrócić zapisany stan").toBe("devices_display");

    // 4) Pomiar czasu odpowiedzi — czy odczyt przez RPC jest wystarczająco
    //    szybki dla realnego użycia (bootstrap urządzenia + ponowny odczyt po
    //    każdym broadcastowym "dzwonku"). 10 kolejnych wywołań z tej samej,
    //    anonimowej karty, tak jak realnie robiłoby to Display/Host/Buzzer.
    const timings = await anonPage.evaluate(
      async ({ gid, key, lease }) => {
        const sb = window.__sbClient;
        const results = [];
        for (let i = 0; i < 10; i++) {
          const t0 = performance.now();
          const { error } = await sb.rpc("game_state_get", {
            p_game_id: gid,
            p_device_type: "display",
            p_key: key,
            p_connection_id: lease.connectionId,
            p_epoch: lease.epoch,
          });
          results.push({ ms: performance.now() - t0, error: error?.message || null });
        }
        return results;
      },
      { gid: game.id, key: runtimeKey, lease }
    );
    const failedTimings = timings.filter((t) => t.error);
    expect(failedTimings.length, "żadne z 10 wywołań pomiarowych nie powinno się nie udać").toBe(0);
    const ms = timings.map((t) => t.ms);
    const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
    const max = Math.max(...ms);
    console.log(
      `[spike] czas odpowiedzi game_state_get (10 wywołań): avg=${avg.toFixed(1)}ms max=${max.toFixed(1)}ms wszystkie=[${ms
        .map((v) => v.toFixed(0))
        .join(", ")}]ms`
    );
    // Luźny górny limit — to nie jest ścisły budżet wydajności, tylko sanity
    // check, że pojedynczy odczyt nie jest rzędu sekund (co realnie zepsułoby
    // odczuwalną responsywność urządzeń po "dzwonku").
    expect(avg, "średni czas odpowiedzi game_state_get powinien być wyraźnie poniżej 1s").toBeLessThan(1000);

    await anonContext.close();
  } finally {
    await page.evaluate(async (gid) => {
      const sb = window.__sbClient;
      await sb.from("games").delete().eq("id", gid);
    }, game.id);
  }
});

test("control2: krótkotrwały token primary dostarcza zmiany game_state przez postgres_changes", async ({ page, browser }) => {
  await loginAsTestUser(page, page.context());
  const gameName = `E2E-GAME-STATE-SCOPED-REALTIME-${Date.now()}`;
  const game = await page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data, error } = await sb.from("games").insert({
      name, owner_id: userData.user.id, type: "prepared", status: "ready",
    }).select("id").single();
    if (error) throw error;
    return data;
  }, gameName);
  const deviceContext = await browser.newContext();
  let channelName = "";
  try {
    const { error: seedError } = await page.evaluate(async gid => {
      const { error } = await window.__sbClient.rpc("game_state_write", {
        p_game_id: gid, p_step: "devices_display", p_top_card: "devices",
        p_phase: null, p_control_team: null,
        p_detail: { teams: { teamA: "Seed A", teamB: "Seed B" } },
        p_sound_cue_key: null, p_expected_rev: null, p_lock_ms: null,
      });
      return { error };
    }, game.id);
    expect(seedError, "seed game_state_write should succeed").toBeNull();
    const keyResult = await page.evaluate(async (gid) => {
      const { data: session, error: sessionError } = await window.__sbClient.rpc("control_runtime_session_touch_v2", {
        p_game_id: gid, p_session_id: null,
      });
      if (sessionError || !session?.ok) throw sessionError || new Error(session?.error || "session touch failed");
      const { data, error } = await window.__sbClient.rpc("control_runtime_device_link", {
        p_game_id: gid, p_device_type: "display",
      });
      if (error || !data?.ok) throw error || new Error(data?.error || "link failed");
      return data.token;
    }, game.id);

    const devicePage = await deviceContext.newPage();
    let lease = null;
    devicePage.on("request", request => {
      if (!request.url().includes("control_device_instance_register")) return;
      try {
        const body = JSON.parse(request.postData() || "{}");
        lease = { connection_id: body.p_connection_id, epoch: null };
      } catch {}
    });
    devicePage.on("response", async response => {
      if (!response.url().includes("control_device_instance_register")) return;
      try {
        const data = await response.json();
        if (lease && data?.state === "primary") lease.epoch = data.epoch;
      } catch {}
    });
    await devicePage.goto(`/control/display?id=${game.id}&key=${keyResult}`, { waitUntil: "domcontentloaded" });
    await expect(devicePage.locator("#deviceLeaseOverlay")).toBeHidden({ timeout: 15000 });
    await expect.poll(() => lease?.connection_id && lease?.epoch).toBeTruthy();

    const direct = await devicePage.evaluate(async ({ gid, key, lease }) => {
      const sb = window.__sbClient;
      const { data, error } = await sb.functions.invoke("device-realtime-token", {
        body: { game_id: gid, device_type: "display", key,
          connection_id: lease.connection_id, epoch: lease.epoch },
      });
      if (error || !data?.token) throw error || new Error(data?.error || "missing realtime token");
      const { data: before, error: readError } = await sb.rpc("game_state_get", {
        p_game_id: gid, p_device_type: "display", p_key: key,
        p_connection_id: lease.connection_id, p_epoch: lease.epoch,
      });
      if (readError) throw readError;
      await sb.realtime.setAuth(data.token);
      const channelName = `e2e-scoped-state:${crypto.randomUUID()}`;
      const channel = sb.channel(channelName).on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "game_state", filter: `game_id=eq.${gid}`,
      }, payload => {
        if (Number(payload?.new?.rev) > Number(before?.rev)) window.__scopedRealtimeRev = payload.new.rev;
      });
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("postgres_changes subscribe timeout")), 12000);
        channel.subscribe(status => {
          if (status === "SUBSCRIBED") { clearTimeout(timeout); resolve(); }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            clearTimeout(timeout); reject(new Error(`postgres_changes: ${status}`));
          }
        });
      });
      // Give Realtime's postgres_changes listener a short settle interval
      // after the channel join acknowledgement before the first write.
      await new Promise(resolve => setTimeout(resolve, 500));
      return { channelName, beforeRev: before?.rev };
    }, { gid: game.id, key: keyResult, lease });
    channelName = direct.channelName;

    const { error: writeError } = await page.evaluate(async gid => {
      const { error } = await window.__sbClient.rpc("game_state_write", {
        p_game_id: gid, p_step: "devices_display", p_top_card: "devices",
        p_phase: null, p_control_team: null,
        p_detail: { teams: { teamA: "Realtime A", teamB: "Realtime B" } },
        p_sound_cue_key: null, p_expected_rev: null, p_lock_ms: null,
      });
      return { error };
    }, game.id);
    expect(writeError, "owner game_state_write should succeed").toBeNull();
    await expect.poll(() => devicePage.evaluate(() => window.__scopedRealtimeRev || null), { timeout: 15000 })
      .not.toBeNull();
  } finally {
    if (channelName) await deviceContext.pages()[0]?.evaluate(async name => {
      const sb = window.__sbClient;
      const channel = sb.getChannels().find(item => item.topic.endsWith(name));
      if (channel) await sb.removeChannel(channel);
      await sb.realtime.setAuth(undefined);
    }, channelName).catch(() => {});
    await deviceContext.close().catch(() => {});
    await page.evaluate(async gid => { await window.__sbClient.from("games").delete().eq("id", gid); }, game.id);
  }
});
