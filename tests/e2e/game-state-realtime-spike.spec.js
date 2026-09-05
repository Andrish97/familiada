// tests/e2e/game-state-realtime-spike.spec.js
//
// Historia: ten plik zaczynał jako test-spike sprawdzający, czy
// `postgres_changes` na public.game_state dochodzi do roli `anon`
// (Display/Host/Buzzer). Odpowiedź (seria uruchomień 2026-09-04/05,
// łącznie z ręczną diagnozą bezpośrednio na produkcyjnym self-hosted
// Supabase): NIE — i to nie jest błąd konfiguracji do naprawienia.
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
// Decyzja architektoniczna (migracja 2026-09-05_261): zamiast to naprawiać,
// usunięto politykę anon na game_state CAŁKOWICIE — dokładnie jak dziś
// public.device_state (zero polityki SELECT dla anon). Prawdziwe
// zabezpieczenie treści gry ma być egzekwowane wyłącznie przez
// share_key/6-cyfrowy kod sprawdzany WEWNĄTRZ SECURITY DEFINER RPC
// (game_state_get) — nie przez RLS na surowej tabeli. Ktoś odpytujący
// game_state bezpośrednio (REST, postgres_changes) bez przejścia przez ten
// RPC ma dostać zero wierszy ZAWSZE, niezależnie od statusu gry czy
// znajomości game_id.
//
// Ten plik teraz pilnuje właśnie TEGO — że anon nigdy nie widzi wiersza
// bezpośrednio, a jedyna działająca droga to game_state_get z poprawnym
// kluczem. To świadomy, trwały stan, nie coś do "naprawienia" jeśli kiedyś
// zacznie się zmieniać (np. przy upgradzie Realtime) — stąd deterministyczne
// asercje zamiast pollowania z 20s timeoutem jak w poprzedniej wersji tego
// testu.
//
// Dotyka wyłącznie nowej, addytywnej tabeli public.game_state (migracje
// 259/260/261) — zero wpływu na dzisiejszy control.html/display.html i ich
// dane.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

test("public.game_state: anon nie ma bezpośredniego dostępu do odczytu, jedyną drogą jest game_state_get z poprawnym kluczem", async ({
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
      });
      return error?.message || null;
    }, game.id);
    expect(writeError, "game_state_write (właściciel) nie powiodło się").toBeNull();

    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto("/", { waitUntil: "domcontentloaded" });

    // 1) Bezpośredni SELECT jako anon — musi zwrócić zero wierszy, bez
    //    względu na status gry czy znajomość game_id. Brak polityki SELECT
    //    dla anon (migracja 261) oznacza, że RLS filtruje wszystko, nie że
    //    to błąd uprawnień — więc `error` powinien być null, a `data` puste.
    const directRead = await anonPage.evaluate(async (gid) => {
      const sb = window.__sbClient;
      const { data, error } = await sb.from("game_state").select("*").eq("game_id", gid);
      return { rowCount: data?.length ?? -1, error: error?.message || null };
    }, game.id);
    expect(directRead.error, "bezpośredni SELECT jako anon nie powinien zwracać błędu uprawnień").toBeNull();
    expect(directRead.rowCount, "anon nie powinien widzieć żadnego wiersza game_state bezpośrednio").toBe(0);

    // 2) game_state_get z NIEPOPRAWNYM kluczem — musi odmówić.
    const badKeyResult = await anonPage.evaluate(async (gid) => {
      const sb = window.__sbClient;
      const { data, error } = await sb.rpc("game_state_get", {
        p_game_id: gid,
        p_device_type: "display",
        p_key: "zly-klucz-na-pewno-nieprawidlowy",
      });
      return { data, error: error?.message || null };
    }, game.id);
    expect(badKeyResult.error, "game_state_get z błędnym kluczem powinno rzucić błąd").toContain("forbidden");

    // 3) game_state_get z POPRAWNYM kluczem — to jest jedyna działająca
    //    droga odczytu dla anon, i musi zwrócić prawdziwy stan gry.
    const goodKeyResult = await anonPage.evaluate(
      async ({ gid, key }) => {
        const sb = window.__sbClient;
        const { data, error } = await sb.rpc("game_state_get", {
          p_game_id: gid,
          p_device_type: "display",
          p_key: key,
        });
        return { step: data?.step ?? null, error: error?.message || null };
      },
      { gid: game.id, key: game.share_key_display }
    );
    expect(goodKeyResult.error, "game_state_get z poprawnym kluczem nie powinno się nie udać").toBeNull();
    expect(goodKeyResult.step, "game_state_get z poprawnym kluczem powinno zwrócić zapisany stan").toBe("devices_display");

    await anonContext.close();
  } finally {
    await page.evaluate(async (gid) => {
      const sb = window.__sbClient;
      await sb.from("games").delete().eq("id", gid);
    }, game.id);
  }
});
