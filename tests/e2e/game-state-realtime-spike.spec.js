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
// Jeśli PADA na kroku "anon dostał zdarzenie" (nie na samej subskrypcji):
// trzeba włączyć fallback opisany w planie — Control dodatkowo wysyła
// broadcast-"dzwonek" z {rev}, a urządzenia bez działającego
// postgres_changes doczytują wiersz przez game_state_get.
//
// Dotyka wyłącznie nowej, addytywnej tabeli public.game_state (migracje
// 259/260) — zero wpływu na dzisiejszy control.html/display.html i ich dane.
//
// UWAGA (run #93, 2026-09-04): pierwsza wersja tego testu zawiesiła się na
// 90s bez żadnego czytelnego błędu i padła dopiero na assercji sprzątającej
// w bloku finally ("Target page, context or browser has been closed") — bo
// obsługiwała tylko 2 z 4 możliwych statusów callbacku .subscribe()
// (SUBSCRIBED/CHANNEL_ERROR), pomijając CLOSED/TIMED_OUT — więc obietnica
// wisiała w nieskończoność aż zabił ją zewnętrzny timeout Playwrighta,
// zamiast rzucić czytelny błąd po kilku sekundach. Poprawione: wszystkie 4
// statusy obsłużone jawnie + logi postępu po stronie Node (widoczne w CI
// nawet przy zawieszeniu), żeby kolejny fail od razu pokazywał, na którym
// kroku i z jakim statusem.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

// Więcej kroków niż typowy spec (login + dwa konteksty przeglądarki + kilka
// round-tripów do bazy) — globalny domyślny timeout (90s z playwright.config.js)
// zostaje jako twardy górny limit, ale dajemy nieco więcej z uwagi na to.
test.setTimeout(120_000);

test("postgres_changes na public.game_state dochodzi do anonimowego klienta (Display/Host/Buzzer)", async ({
  page,
  context,
  browser,
}) => {
  await loginAsTestUser(page, context);
  console.log("[spike] zalogowano jako TEST_USERNAME");

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
  console.log("[spike] utworzono testową grę:", gameId);

  try {
    // 2) Drugi, CAŁKOWICIE anonimowy kontekst przeglądarki — bez logowania,
    //    tak jak prawdziwy Display/Host/Buzzer. Nawigacja na stronę główną
    //    tylko po to, żeby załadował się SDK supabase-js (window.__sbClient).
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto("/", { waitUntil: "domcontentloaded" });
    console.log("[spike] anonimowy kontekst otwarty, strona załadowana");

    // 3) Anon subskrybuje postgres_changes na tym jednym game_id i czeka na
    //    potwierdzenie SUBSCRIBED, zanim cokolwiek zapiszemy — inaczej byłby
    //    możliwy wyścig (zapis przed gotowością subskrypcji).
    //
    //    Kluczowe: sb.channel().subscribe(callback) może wywołać callback z
    //    DOKŁADNIE JEDNYM z 4 stanów (RealtimeSubscribeStates supabase-js):
    //    SUBSCRIBED | TIMED_OUT | CLOSED | CHANNEL_ERROR. Wszystkie 4 muszą
    //    być obsłużone jawnie — pominięcie choćby jednego (jak w pierwszej
    //    wersji tego testu, CLOSED) zostawia obietnicę wiszącą bez końca.
    const subscribeResult = await anonPage.evaluate(async (gid) => {
      window.__spikeEvents = [];
      window.__spikeStatuses = [];
      const sb = window.__sbClient;
      if (!sb) return { ok: false, reason: "window.__sbClient nie istnieje na stronie głównej" };

      return await new Promise((resolve) => {
        const hardTimeout = setTimeout(
          () => resolve({ ok: false, reason: "hard-timeout 15s, statusy: " + JSON.stringify(window.__spikeStatuses) }),
          15000
        );
        sb.channel(`spike-game-state:${gid}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "game_state", filter: `game_id=eq.${gid}` },
            (payload) => window.__spikeEvents.push(payload)
          )
          .subscribe((status, err) => {
            window.__spikeStatuses.push(status);
            if (status === "SUBSCRIBED") {
              clearTimeout(hardTimeout);
              resolve({ ok: true });
              return;
            }
            // TIMED_OUT | CLOSED | CHANNEL_ERROR — wszystkie pozostałe
            // możliwe wartości traktujemy jako ostateczną porażkę subskrypcji.
            clearTimeout(hardTimeout);
            resolve({ ok: false, reason: `status=${status}` + (err ? ` err=${err.message || err}` : "") });
          });
      });
    }, gameId);
    console.log("[spike] wynik subskrypcji anon:", JSON.stringify(subscribeResult));
    expect(subscribeResult.ok, "subskrypcja anon nie osiągnęła SUBSCRIBED: " + subscribeResult.reason).toBe(true);

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
    console.log("[spike] pierwszy game_state_write, błąd:", writeError);
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
    console.log("[spike] drugi game_state_write, błąd:", secondWriteError);
    expect(secondWriteError, "game_state_write (drugi zapis) nie powiodło się").toBeNull();

    // 5) Poczekaj aż anon dostanie CHOĆ JEDNO zdarzenie (INSERT lub UPDATE).
    //
    //    UWAGA (run #95, 2026-09-04): page.waitForFunction() domyślnie
    //    polluje przez requestAnimationFrame ("polling: 'raf'") — a rAF w
    //    Chromium nie odpala się dla karty w tle/bez fokusu. anonPage to
    //    drugi, nigdy niefokusowany kontekst, więc rAF-polling potrafił
    //    utknąć bez końca mimo podanego timeout:20000 (widać było SUBSCRIBED
    //    i oba udane zapisy w logu, potem cisza aż do zewnętrznego limitu
    //    testu). Zamiast tego: ręczne pollowanie po stronie Node, całkowicie
    //    niezależne od stanu widoczności/fokusu strony.
    const pollDeadline = Date.now() + 20000;
    let events = [];
    while (Date.now() < pollDeadline) {
      events = await anonPage.evaluate(() => window.__spikeEvents || []);
      if (events.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    console.log("[spike] po pollowaniu — liczba zdarzeń:", events.length);

    expect(events.length, "anon powinien dostać przynajmniej jedno zdarzenie postgres_changes").toBeGreaterThan(0);
    // Diagnostyka w logu CI — przydatna niezależnie od wyniku.
    console.log(
      "[spike] zdarzenia odebrane przez anon:",
      JSON.stringify(events.map((e) => ({ eventType: e.eventType, new: e.new })), null, 2)
    );

    await anonContext.close();
  } finally {
    // Sprzątanie: usunięcie gry kasuje kaskadowo game_state/game_state_history
    // (FK ON DELETE CASCADE, migracja 259). page/context wciąż żyją niezależnie
    // od tego co stało się z anonContext powyżej, więc to bezpieczne.
    await page.evaluate(async (gid) => {
      const sb = window.__sbClient;
      await sb.from("games").delete().eq("id", gid);
    }, gameId);
    console.log("[spike] posprzątano testową grę:", gameId);
  }
});
