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

const { test, expect } = require("./helpers/e2e-test");

test.use({ needs: { standard: 1 } });

test("public.game_state: zwykły anon nie ma bezpośredniego odczytu, game_state_get nadal działa z kluczem", async ({
  page,
  browser,
  accounts,
  loginAs,
}) => {
  await loginAs(page, page.context(), accounts.standard[0]);

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
    const ordinaryCompletionRead = await anonPage.evaluate(async (gid) => {
      const { data, error } = await window.__sbClient
        .from("game_state_display_completion").select("game_id").eq("game_id", gid);
      return { rowCount: data?.length ?? -1, error: error?.message || null };
    }, game.id);
    expect(ordinaryCompletionRead.error).toBeNull();
    expect(ordinaryCompletionRead.rowCount, "zwykły anon nie powinien czytać potwierdzenia Displaya").toBe(0);

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

// Kanały z bazy (migracje 508–511): urządzenie z tokenem dostaje stan tylko
// na własnym kanale game-state:<gra>:<połączenie>; cudzy temat, kanał Control
// i dołączenie bez tokenu są odrzucane; właściciel dostaje stan
// i potwierdzenia planszy na game-control:<gra>.
test("control2: prywatne kanały z bazy — urządzenie, Control i odmowy", async ({ page, browser, accounts, loginAs }) => {
  test.setTimeout(120_000);
  await loginAs(page, page.context(), accounts.standard[0]);
  const game = await page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data, error } = await sb.from("games").insert({
      name, owner_id: userData.user.id, type: "prepared", status: "ready",
    }).select("id").single();
    if (error) throw error;
    return data;
  }, `E2E-GAME-STATE-DB-CHANNELS-${Date.now()}`);
  const contexts = [];
  const write = (label) => page.evaluate(async ({ gid, label }) => {
    const { data, error } = await window.__sbClient.rpc("game_state_write", {
      p_game_id: gid, p_step: "devices_display", p_top_card: "devices",
      p_phase: null, p_control_team: null, p_detail: { teams: { teamA: label, teamB: "B" } },
      p_sound_cue_key: null, p_expected_rev: null, p_lock_ms: null,
    });
    if (error) throw error;
    return Number(data.rev);
  }, { gid: game.id, label });
  try {
    await write("Seed");
    const keys = await page.evaluate(async (gid) => {
      const sb = window.__sbClient;
      const { data: session, error: sessionError } = await sb.rpc("control_runtime_session_touch_v2", { p_game_id: gid, p_session_id: null });
      if (sessionError || !session?.ok) throw sessionError || new Error("session touch failed");
      const keys = {};
      for (const type of ["display", "host"]) {
        const { data, error } = await sb.rpc("control_runtime_device_link", { p_game_id: gid, p_device_type: type });
        if (error || !data?.ok) throw error || new Error(`link ${type} failed`);
        keys[type] = data.token;
      }
      return keys;
    }, game.id);

    // Urządzenie: lease, heartbeat, token, kanał własny i próba cudzego.
    const openDevice = async (type) => {
      const context = await browser.newContext();
      contexts.push(context);
      const devicePage = await context.newPage();
      await devicePage.goto("/", { waitUntil: "domcontentloaded" });
      await devicePage.waitForFunction(() => !!window.__sbClient && !!window.supabase, null, { timeout: 20000 });
      const info = await devicePage.evaluate(async ({ gid, key, type }) => {
        const sb = window.__sbClient;
        const connectionId = crypto.randomUUID();
        const { data: reg, error } = await sb.rpc("control_device_instance_register", {
          p_game_id: gid, p_device_type: type, p_key: key, p_connection_id: connectionId, p_meta: { visibility: "visible", focused: true },
        });
        if (error || reg?.state !== "primary") throw error || new Error(`${type} not primary`);
        window.__heartbeat = setInterval(() => {
          sb.rpc("control_device_instance_heartbeat", { p_game_id: gid, p_device_type: type, p_key: key,
            p_connection_id: connectionId, p_epoch: reg.epoch, p_meta: { visibility: "visible", focused: true } }).then(() => {}, () => {});
        }, 3000);
        const { data: tokenData, error: tokenError } = await sb.functions.invoke("device-realtime-token", {
          body: { game_id: gid, device_type: type, key, connection_id: connectionId, epoch: reg.epoch },
        });
        if (tokenError || !tokenData?.token) throw tokenError || new Error("missing token");
        window.__rt = window.supabase.createClient(sb.supabaseUrl, sb.supabaseKey, { accessToken: async () => tokenData.token });
        await window.__rt.realtime.setAuth();
        window.__got = { own: [], completion: [] };
        const join = (topic, onState, onCompletion) => new Promise((resolve) => {
          const channel = window.__rt.channel(topic, { config: { private: true } });
          if (onState) channel.on("broadcast", { event: "state" }, ({ payload }) => onState(Number(payload?.row?.rev)));
          if (onCompletion) channel.on("broadcast", { event: "completion" }, ({ payload }) => onCompletion(payload?.row));
          const timer = setTimeout(() => resolve("TIMEOUT"), 15000);
          channel.subscribe((status) => {
            if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT"].includes(status)) { clearTimeout(timer); resolve(status); }
          });
        });
        const own = await join(`game-state:${gid}:${connectionId}`, (rev) => window.__got.own.push(rev), (row) => window.__got.completion.push(row?.rendered_rev));
        const control = await join(`game-control:${gid}`);
        return { connectionId, epoch: reg.epoch, own, control };
      }, { gid: game.id, key: keys[type], type });
      return { page: devicePage, ...info };
    };
    const display = await openDevice("display");
    const host = await openDevice("host");
    expect(display.own, "Wyświetlacz dołącza do własnego kanału").toBe("SUBSCRIBED");
    expect(host.own, "Prowadzący dołącza do własnego kanału").toBe("SUBSCRIBED");
    expect(display.control, "urządzenie nie dołączy do kanału Control").toBe("CHANNEL_ERROR");
    // Cudzy kanał (Prowadzącego) z tokenem Wyświetlacza.
    const foreign = await display.page.evaluate(({ gid, conn }) => new Promise((resolve) => {
      const channel = window.__rt.channel(`game-state:${gid}:${conn}`, { config: { private: true } });
      const timer = setTimeout(() => resolve("TIMEOUT"), 15000);
      channel.subscribe((status) => { if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT"].includes(status)) { clearTimeout(timer); resolve(status); } });
    }), { gid: game.id, conn: host.connectionId });
    expect(foreign, "token Wyświetlacza nie otworzy kanału Prowadzącego").toBe("CHANNEL_ERROR");
    // Bez tokenu (zwykły anon) — odmowa.
    const anonJoin = await host.page.evaluate(({ gid, conn }) => new Promise((resolve) => {
      const channel = window.__sbClient.channel(`game-state:${gid}:${conn}`, { config: { private: true } });
      const timer = setTimeout(() => resolve("TIMEOUT"), 15000);
      channel.subscribe((status) => { if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT"].includes(status)) { clearTimeout(timer); resolve(status); } });
    }), { gid: game.id, conn: host.connectionId });
    expect(anonJoin, "bez tokenu urządzenia brak dostępu").toBe("CHANNEL_ERROR");

    // Control (właściciel): game-control:<gra>.
    const controlStatus = await page.evaluate((gid) => new Promise((resolve) => {
      window.__ctrl = { state: [], completion: [] };
      const channel = window.__sbClient.channel(`game-control:${gid}`, { config: { private: true } })
        .on("broadcast", { event: "state" }, ({ payload }) => window.__ctrl.state.push(Number(payload?.row?.rev)))
        .on("broadcast", { event: "completion" }, ({ payload }) => window.__ctrl.completion.push(Number(payload?.row?.rendered_rev)));
      window.__ctrlChannel = channel;
      const timer = setTimeout(() => resolve("TIMEOUT"), 15000);
      Promise.resolve(window.__sbClient.realtime.setAuth()).catch(() => {}).then(() => channel.subscribe((status) => {
        if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT"].includes(status)) { clearTimeout(timer); resolve(status); }
      }));
    }), game.id);
    expect(controlStatus, "właściciel dołącza do kanału Control").toBe("SUBSCRIBED");

    const rev = await write("Live");
    await expect.poll(() => display.page.evaluate(() => window.__got.own), { timeout: 10000 }).toContain(rev);
    await expect.poll(() => host.page.evaluate(() => window.__got.own), { timeout: 10000 }).toContain(rev);
    await expect.poll(() => page.evaluate(() => window.__ctrl.state), { timeout: 10000 }).toContain(rev);
    // Potwierdzenie planszy (Wyświetlacz) dochodzi do Control i urządzeń.
    const completeError = await display.page.evaluate(async ({ gid, key, conn, epoch, rev }) => {
      const { error } = await window.__sbClient.rpc("game_state_display_complete", {
        p_game_id: gid, p_key: key, p_rev: rev, p_connection_id: conn, p_epoch: epoch });
      return error?.message || null;
    }, { gid: game.id, key: keys.display, conn: display.connectionId, epoch: display.epoch, rev });
    expect(completeError).toBeNull();
    await expect.poll(() => page.evaluate(() => window.__ctrl.completion), { timeout: 10000 }).toContain(rev);
    await expect.poll(() => display.page.evaluate(() => window.__got.completion), { timeout: 10000 }).toContain(rev);

    // Koniec sesji i zastąpienie urządzenia: docs/sql/test-db-broadcast-508.sql.
  } finally {
    for (const context of contexts) {
      await context.pages()[0]?.evaluate(async () => { clearInterval(window.__heartbeat); await window.__rt?.removeAllChannels(); }).catch(() => {});
      await context.close().catch(() => {});
    }
    await page.evaluate(async () => { await window.__sbClient?.removeAllChannels(); }).catch(() => {});
    await page.evaluate(async (gid) => { await window.__sbClient.from("games").delete().eq("id", gid); }, game.id);
  }
});
