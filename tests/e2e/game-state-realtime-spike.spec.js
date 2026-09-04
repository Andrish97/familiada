// tests/e2e/game-state-realtime-spike.spec.js
//
// Test-spike z planu przebudowy Control (sekcja 1, "Ryzyko do zweryfikowania
// jako pierwszy krok implementacji"): czy `postgres_changes` na tym
// self-hostowanym Supabase realnie dochodzi do roli `anon` (Display/Host/
// Buzzer), nie tylko `authenticated` (jedyny dotąd potwierdzony w tym repo
// przypadek — js/pages/settings.js + migracja 2026-04-15_145).
//
// Jeśli ten test PRZECHODZI: architektura z planu (urządzenia subskrybują
// public.game_state bezpośrednio przez postgres_changes) działa bez
// fallbacku.
// Jeśli PADA na kroku "anon dostał zdarzenie": trzeba włączyć fallback
// opisany w planie — Control dodatkowo wysyła broadcast-"dzwonek" z {rev},
// a urządzenia bez działającego postgres_changes doczytują wiersz przez
// game_state_get.
//
// Dotyka wyłącznie nowej, addytywnej tabeli public.game_state (migracje
// 259/260) — zero wpływu na dzisiejszy control.html/display.html i ich dane.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

test("postgres_changes na public.game_state dochodzi do anonimowego klienta (Display/Host/Buzzer)", async ({
  page,
  context,
  browser,
}) => {
  await loginAsTestUser(page, context);

  // 1) Stwórz testową grę jako właściciel, status "ready" — polityka
  //    game_state_anon_read_ready wymaga tego dla odczytu przez anon.
  const gameName = `E2E-GAME-STATE-SPIKE-${Date.now()}`;
  const gameId = await page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data: game, error } = await sb
      .from("games")
      .insert({ name, owner_id: userData.user.id, type: "prepared", status: "ready" })
      .select("id")
      .single();
    if (error) throw new Error("insert games failed: " + error.message);
    return game.id;
  }, gameName);

  try {
    // 2) Drugi, CAŁKOWICIE anonimowy kontekst przeglądarki — bez logowania,
    //    tak jak prawdziwy Display/Host/Buzzer. Nawigacja na stronę główną
    //    tylko po to, żeby załadował się SDK supabase-js (window.__sbClient).
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto("/", { waitUntil: "domcontentloaded" });

    // 3) Anon subskrybuje postgres_changes na tym jednym game_id i czeka na
    //    potwierdzenie SUBSCRIBED, zanim cokolwiek zapiszemy — inaczej byłby
    //    możliwy wyścig (zapis przed gotowością subskrypcji).
    await anonPage.evaluate(async (gid) => {
      window.__spikeEvents = [];
      const sb = window.__sbClient;
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("subskrypcja nie osiągnęła SUBSCRIBED w 10s")), 10000);
        sb.channel(`spike-game-state:${gid}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "game_state", filter: `game_id=eq.${gid}` },
            (payload) => window.__spikeEvents.push(payload)
          )
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              clearTimeout(timeout);
              resolve();
            }
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              clearTimeout(timeout);
              reject(new Error("subskrypcja: " + status));
            }
          });
      });
    }, gameId);

    // 4) Właściciel (Control) zapisuje stan gry przez game_state_write —
    //    dokładnie ta sama ścieżka co control2/js/persist.js.
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
      });
      return error?.message || null;
    }, gameId);
    expect(writeError, "game_state_write (pierwszy zapis) nie powiodło się").toBeNull();

    // Drugi zapis (zmiana kroku) — na wypadek gdyby pierwszy (INSERT) umknął
    // przez wyścig subskrypcji, ten (UPDATE) i tak powinien dojść.
    const secondWriteError = await page.evaluate(async (gid) => {
      const sb = window.__sbClient;
      const { error } = await sb.rpc("game_state_write", {
        p_game_id: gid,
        p_step: "devices_hostbuzzer",
        p_top_card: "devices",
        p_phase: null,
        p_control_team: null,
        p_detail: null,
        p_sound_cue_key: null,
        p_expected_rev: 1,
      });
      return error?.message || null;
    }, gameId);
    expect(secondWriteError, "game_state_write (drugi zapis) nie powiodło się").toBeNull();

    // 5) Poczekaj aż anon dostanie CHOĆ JEDNO zdarzenie (INSERT lub UPDATE).
    await anonPage.waitForFunction(() => window.__spikeEvents && window.__spikeEvents.length > 0, {
      timeout: 15000,
    });

    const events = await anonPage.evaluate(() => window.__spikeEvents);
    expect(events.length, "anon powinien dostać przynajmniej jedno zdarzenie postgres_changes").toBeGreaterThan(0);
    // Diagnostyka w logu CI — przydatna niezależnie od wyniku.
    console.log("[spike] zdarzenia odebrane przez anon:", JSON.stringify(events.map((e) => ({ eventType: e.eventType, new: e.new })), null, 2));

    await anonContext.close();
  } finally {
    // Sprzątanie: usunięcie gry kasuje kaskadowo game_state/game_state_history
    // (FK ON DELETE CASCADE, migracja 259).
    await page.evaluate(async (gid) => {
      const sb = window.__sbClient;
      await sb.from("games").delete().eq("id", gid);
    }, gameId);
  }
});
