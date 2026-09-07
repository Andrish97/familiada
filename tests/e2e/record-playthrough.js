// tests/e2e/record-playthrough.js
//
// Nagrywa Control v2 + Display2 + Host2 + Buzzer2 W JEDNYM UJĘCIU (4 okna
// kafelkowane 2x2 na wirtualnym ekranie X11), z dźwiękiem — do przeglądu
// wizualnego, NIE część `npm test` / playwright.config.js. Scenariusze to
// TE SAME kroki co w tests/e2e/control2.spec.js (te same selektory, te
// same asercje-jako-punkty-synchronizacji, zamienione tu na krótkie
// oczekiwania żeby nagranie było oglądalne) — "system testów, który już
// mamy", owinięty w headed przeglądarkę + ffmpeg zamiast headless.
//
// Uruchamiane WYŁĄCZNIE przez .github/workflows/e2e-record.yml (ręczny
// workflow_dispatch) — ten skrypt sam w sobie niczego nie nagrywa bez
// działającego Xvfb (:99) i wirtualnego zlewu PulseAudio, oba
// przygotowywane przez ten workflow PRZED odpaleniem tego pliku.
//
// Wymagane zmienne środowiskowe (te same co istniejący e2e-tests.yml):
// E2E_BYPASS_SECRET, TEST_USERNAME, TEST_PASSWORD.
// Opcjonalnie: DISPLAY (domyślnie ":99"), PULSE_SINK (domyślnie "CaptureSink"),
// RECORD_OUT_DIR (domyślnie "tests/recordings").
//
// Uruchomienie lokalne (Linux z realnym X11 + audio, np. do próby przed CI):
//   DISPLAY=:0 PULSE_SINK=<istniejący sink> \
//     E2E_BYPASS_SECRET=... TEST_USERNAME=... TEST_PASSWORD=... \
//     node tests/e2e/record-playthrough.js
// Ten skrypt zakłada gotowe środowisko (Xvfb/PulseAudio) — nie uruchamia
// ich sam.

const { chromium } = require("@playwright/test");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { loginAsTestUser } = require("./helpers/login");

const BASE_URL = "https://www.familiada.online";
const DISPLAY_NUM = process.env.DISPLAY || ":99";
const PULSE_SINK = process.env.PULSE_SINK || "CaptureSink";
const OUT_DIR = process.env.RECORD_OUT_DIR || path.join(__dirname, "..", "recordings");
const SCREEN_W = 1920, SCREEN_H = 1080;
const QUAD_W = SCREEN_W / 2, QUAD_H = SCREEN_H / 2;

// ===== Pomocnicze — skopiowane z control2.spec.js. Zamierzone
// duplikowanie tego małego, samodzielnego bloku zamiast refaktoru
// działającego pliku testowego (żeby nie ryzykować jego zepsucia bez
// możliwości uruchomienia go stąd dla sprawdzenia). =====

async function makeGame(page, name, { settings = {}, roundQuestions = [], finalAnswerPts = null } = {}) {
  return page.evaluate(async ({ name, settings, roundQuestions, finalAnswerPts }) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data: g, error: gErr } = await sb
      .from("games")
      .insert({
        name, owner_id: userData.user.id, type: "prepared", status: "ready",
        settings: { teams: { teamA: "Alfa", teamB: "Beta" }, game: { hasFinal: false }, ...settings },
      })
      .select("id, share_key_display, share_key_host, share_key_buzzer")
      .single();
    if (gErr) throw new Error("insert games failed: " + gErr.message);

    for (const q of roundQuestions) {
      const { data: qRow, error: qErr } = await sb
        .from("questions").insert({ game_id: g.id, ord: q.ord, text: q.text }).select("id").single();
      if (qErr) throw new Error("insert questions failed: " + qErr.message);
      const { error: aErr } = await sb.from("answers").insert(
        q.answers.map((a) => ({ question_id: qRow.id, ...a }))
      );
      if (aErr) throw new Error("insert answers failed: " + aErr.message);
    }

    let finalPicked = [];
    if (finalAnswerPts) {
      for (let i = 1; i <= 5; i++) {
        const { data: fq, error: fqErr } = await sb
          .from("questions").insert({ game_id: g.id, ord: 100 + i, text: `Pytanie finałowe ${i}` }).select("id").single();
        if (fqErr) throw new Error("insert final question failed: " + fqErr.message);
        const { error: faErr } = await sb.from("answers").insert([
          { question_id: fq.id, ord: 1, text: "Odpowiedź finałowa", fixed_points: finalAnswerPts },
        ]);
        if (faErr) throw new Error("insert final answer failed: " + faErr.message);
        finalPicked.push({ id: fq.id });
      }
      const { error: upErr } = await sb.from("games").update({
        settings: {
          teams: { teamA: "Alfa", teamB: "Beta" },
          game: { hasFinal: true, finalQuestionsMode: "pick" },
          questions: { final: finalPicked, rounds: [] },
        },
      }).eq("id", g.id);
      if (upErr) throw new Error("update final settings failed: " + upErr.message);
    }

    return g;
  }, { name, settings, roundQuestions, finalAnswerPts });
}

async function deleteGame(page, gameId) {
  await page.evaluate(async (gid) => {
    const sb = window.__sbClient;
    await sb.from("games").delete().eq("id", gid);
  }, gameId).catch(() => {});
}

const TWO_QUESTIONS = [
  { ord: 1, text: "Pytanie testowe 1", answers: [
    { ord: 1, text: "Odpowiedź A", fixed_points: 40 },
    { ord: 2, text: "Odpowiedź B", fixed_points: 30 },
    { ord: 3, text: "Odpowiedź C", fixed_points: 20 },
  ] },
  { ord: 2, text: "Pytanie testowe 2", answers: [
    { ord: 1, text: "Odpowiedź A", fixed_points: 40 },
    { ord: 2, text: "Odpowiedź B", fixed_points: 30 },
    { ord: 3, text: "Odpowiedź C", fixed_points: 20 },
  ] },
];

// ===== Kafelkowanie okien 2x2 na wirtualnym ekranie (CDP Browser.setWindowBounds) =====

const QUADRANTS = {
  control: { left: 0, top: 0, width: QUAD_W, height: QUAD_H },
  display: { left: QUAD_W, top: 0, width: QUAD_W, height: QUAD_H },
  host: { left: 0, top: QUAD_H, width: QUAD_W, height: QUAD_H },
  buzzer: { left: QUAD_W, top: QUAD_H, width: QUAD_W, height: QUAD_H },
};

async function positionWindow(context, page, bounds) {
  const session = await context.newCDPSession(page);
  const { windowId } = await session.send("Browser.getWindowForTarget");
  await session.send("Browser.setWindowBounds", { windowId, bounds: { ...bounds, windowState: "normal" } });
}

async function tileDevices(contexts, pages) {
  for (const name of ["control", "display", "host", "buzzer"]) {
    await positionWindow(contexts[name], pages[name], QUADRANTS[name]);
  }
}

// ===== Nagrywanie: cały wirtualny ekran + monitor wirtualnego zlewu audio =====

function startRecording(outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const args = [
    "-y",
    "-video_size", `${SCREEN_W}x${SCREEN_H}`,
    "-framerate", "30",
    "-f", "x11grab", "-i", DISPLAY_NUM,
    "-f", "pulse", "-i", `${PULSE_SINK}.monitor`,
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k",
    outFile,
  ];
  console.log("[record] ffmpeg", args.join(" "));
  return spawn("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] });
}

async function stopRecording(proc) {
  if (!proc || proc.exitCode !== null) return;
  proc.kill("SIGINT"); // finalizuje plik zamiast urwać go w połowie
  await new Promise((resolve) => proc.once("exit", resolve));
}

// ===== Otwarcie i skasowanie 4 urządzeń jednej gry, po jednym oknie na ćwiartkę =====

async function openTiledDevices(browser, game) {
  const contexts = {};
  const pages = {};
  for (const name of ["control", "display", "host", "buzzer"]) {
    const ctx = await browser.newContext({ baseURL: BASE_URL, viewport: null }); // viewport:null -> rozmiar okna, nie fixed viewport
    contexts[name] = ctx;
    pages[name] = await ctx.newPage();
  }
  await loginAsTestUser(pages.control, contexts.control);
  await tileDevices(contexts, pages);

  await Promise.all([
    pages.control.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" }),
    pages.display.goto(`/display2?id=${game.id}&key=${game.share_key_display}`, { waitUntil: "domcontentloaded" }),
    pages.host.goto(`/host2?id=${game.id}&key=${game.share_key_host}`, { waitUntil: "domcontentloaded" }),
    pages.buzzer.goto(`/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`, { waitUntil: "domcontentloaded" }),
  ]);

  return { contexts, pages };
}

async function closeAll(contexts) {
  for (const ctx of Object.values(contexts)) await ctx.close().catch(() => {});
}

// Symuluje gest przesunięcia (peek) na Hoście — host2/js/main.js's
// setupPeekSwipe(): pointerdown -> pointerup w odległości >= 60px, lokalnie
// pokazuje to, co jest pod zasłoną pasma 2, BEZ żadnego zapisu do
// game_state (patrz notatka w figurze 7 "Mapa Rozgrywki": Host ma treść
// zawsze, zasłona to tylko wizualna nakładka). Ten podgląd sam się cofa
// przy KOLEJNEJ zmianie stanu (host2/js/render.js's `peeked = false` na
// nowym wierszu) — więc następna scripted akcja w scenariuszu naturalnie
// pokaże na nagraniu, że zasłona wraca sama.
async function hostPeekSwipe(hostPage) {
  await hostPage.mouse.move(300, 220);
  await hostPage.mouse.down();
  await hostPage.mouse.move(300, 360, { steps: 10 });
  await hostPage.mouse.up();
}

// ===== Scenariusz 1: pojedynek z resetem, pass, kradzież wygrana i
// przegrana, dosłanianie reszty, mnożnik pominięty (2 pytania), koniec gry
// bez finału. Ten sam przebieg co control2.spec.js's test "reset
// pojedynku, pass, kradzież wygrana/przegrana, odkrywanie reszty...". =====

async function scenarioRoundsMechanics(pages) {
  const { control, buzzer } = pages;

  await control.getByRole("button", { name: "Dalej" }).click();
  await control.getByRole("button", { name: "Zakończ podłączanie" }).click();
  await control.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
  await control.getByRole("button", { name: "Dalej" }).click();

  // ===== RUNDA 1 =====
  await control.getByRole("button", { name: "Start rundy" }).click();
  await buzzer.getByRole("button", { name: "Buzzer A" }).click();
  await control.getByRole("button", { name: "Przyjmij" }).click();
  await control.getByRole("button", { name: "X", exact: true }).click(); // A pudłuje -> kolej B
  await control.getByRole("button", { name: "X", exact: true }).click(); // B pudłuje też -> RESET
  await buzzer.getByRole("button", { name: "Buzzer B" }).click();
  await control.getByRole("button", { name: "Przyjmij" }).click();
  await control.getByRole("button", { name: "#1" }).click(); // B trafia -> wygrywa pojedynek
  await control.getByRole("button", { name: "X", exact: true }).click();
  await control.getByRole("button", { name: "X", exact: true }).click();
  await control.getByRole("button", { name: "X", exact: true }).click(); // 3x pudło -> auto-KRADZIEŻ
  await control.getByRole("button", { name: "#2" }).click(); // kradzież WYGRANA
  await control.getByRole("button", { name: "Zakończ rundę" }).click();
  await control.getByRole("button", { name: "#3" }).click(); // dosłanianie reszty

  // ===== RUNDA 2 =====
  await control.getByRole("button", { name: "Start rundy" }).click();
  await buzzer.getByRole("button", { name: "Buzzer B" }).click();
  await control.getByRole("button", { name: "Przyjmij" }).click();
  await control.getByRole("button", { name: "#1" }).click(); // B trafia -> kontrola B, allowPass
  await control.getByRole("button", { name: "Pass" }).click(); // oddaje pytanie -> kontrola A
  await control.getByRole("button", { name: "#2" }).click(); // A trafia
  await control.getByRole("button", { name: "X", exact: true }).click();
  await control.getByRole("button", { name: "X", exact: true }).click();
  await control.getByRole("button", { name: "X", exact: true }).click(); // 3x pudło A -> auto-KRADZIEŻ dla B
  await control.getByRole("button", { name: "X", exact: true }).click(); // B kradnie, ale PUDŁUJE -> kradzież PRZEGRANA
  await control.getByRole("button", { name: "Zakończ rundę" }).click();
  await control.getByRole("button", { name: "#3" }).click(); // dosłanianie reszty

  // ===== Koniec gry bez finału =====
  await control.getByRole("button", { name: "Pokaż koniec gry" }).click();
  await control.waitForTimeout(2500); // zostaw ekran końcowy widoczny chwilę na nagraniu
}

// ===== Scenariusz 2: finał pełny — oba bloki, naturalne wygaśnięcie
// zegarka gracza 1, powtórzenie u gracza 2, odsłonięcie odpowiedzi gracza 1
// na Display I Host przy starcie tury gracza 2. Ten sam przebieg co
// control2.spec.js's test "finał — obaj gracze, wszystkie 10 pytań...". =====

async function scenarioFinalFull(pages) {
  const { control, buzzer, host } = pages;

  await control.getByRole("button", { name: "Dalej" }).click();
  await control.getByRole("button", { name: "Zakończ podłączanie" }).click();
  await control.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
  await control.getByRole("button", { name: "Dalej" }).click();
  await control.getByRole("button", { name: "Start rundy" }).click();

  await buzzer.getByRole("button", { name: "Buzzer A" }).click();
  await control.getByRole("button", { name: "Przyjmij" }).click();
  await control.getByRole("button", { name: "#1" }).click(); // A dobija do progu finału (300 pkt)
  await control.getByRole("button", { name: "X", exact: true }).click();
  await control.getByRole("button", { name: "X", exact: true }).click();
  await control.getByRole("button", { name: "X", exact: true }).click();
  await control.getByRole("button", { name: "Zakończ rundę" }).click();

  await control.getByRole("button", { name: "Start finału" }).click();
  await control.waitForTimeout(4000); // final_theme + reveal

  // Host: zasłona pasma 2 właśnie się włączyła (startFinal). Prowadzący
  // sam podgląda gestem przesunięcia — Host ma treść zawsze, zasłona to
  // tylko lokalna nakładka. Ta próba znika sama na następnej akcji
  // (wpisanie pierwszej odpowiedzi wysyła nowy stan, co resetuje peek).
  await hostPeekSwipe(host);
  await host.waitForTimeout(1500);

  // Gracz 1: wpisz wszystkie 5, uruchom zegarek, poczekaj na NATURALNE wygaśnięcie (15s)
  const p1Inputs = control.locator("#app input[type=text]");
  for (let i = 0; i < 5; i++) await p1Inputs.nth(i).fill("Odpowiedź finałowa");
  await control.getByRole("button", { name: "Start timera" }).click();
  await control.waitForTimeout(16_000);

  await control.getByRole("button", { name: "Dalej" }).click();
  for (let i = 0; i < 5; i++) {
    await control.getByRole("button", { name: "Odpowiedź finałowa (15)" }).click();
    await control.getByRole("button", { name: "Pokaż odpowiedź" }).click();
    await control.getByRole("button", { name: "Pokaż punkty" }).click();
    await control.getByRole("button", { name: "Dalej" }).click();
  }

  await control.getByRole("button", { name: "Start rundy 2" }).click();
  await control.waitForTimeout(1500); // niech nagranie złapie pełne odsłonięcie odpowiedzi gracza 1 na Display

  // Host NIE dostaje żadnego automatycznego odsłonięcia razem z Display —
  // zasłona pasma 2 zostaje włączona przez cały finał (patrz figura 7).
  // Prowadzący znowu peekuje sam, żeby to pokazać na nagraniu wprost.
  await hostPeekSwipe(host);
  await host.waitForTimeout(1500);

  // Gracz 2: pytanie #1 = powtórzenie, reszta wpisana normalnie
  await control.getByLabel("powtórzenie").first().check();
  const p2Inputs = control.locator("#app input[type=text]");
  for (let i = 1; i < 5; i++) await p2Inputs.nth(i).fill("Odpowiedź finałowa");
  await control.getByRole("button", { name: "Start timera" }).click();
  await control.getByRole("button", { name: "Dalej" }).click(); // tym razem NIE czekamy na naturalne wygaśnięcie

  for (let i = 0; i < 5; i++) {
    if (i > 0) await control.getByRole("button", { name: "Odpowiedź finałowa (15)" }).click();
    await control.getByRole("button", { name: "Pokaż odpowiedź" }).click();
    await control.getByRole("button", { name: "Pokaż punkty" }).click();
    await control.getByRole("button", { name: "Dalej" }).click();
  }

  await control.getByRole("button", { name: "Zakończ", exact: true }).click();
  await control.waitForTimeout(3000); // ekran końcowy widoczny chwilę na nagraniu
}

// ===== Orkiestracja: jedna przeglądarka, po kolei każdy scenariusz z
// własną grą testową, własnym zestawem 4 okien i własnym plikiem nagrania. =====

const SCENARIOS = [
  {
    file: "01-rundy-mechanika.mp4",
    makeGame: (setupPage) => makeGame(setupPage, `E2E-REC-ROUNDS-${Date.now()}`, { roundQuestions: TWO_QUESTIONS }),
    run: scenarioRoundsMechanics,
  },
  {
    file: "02-final-pelny.mp4",
    makeGame: (setupPage) => makeGame(setupPage, `E2E-REC-FINAL-${Date.now()}`, {
      roundQuestions: [{ ord: 1, text: "Pytanie testowe (runda)", answers: [{ ord: 1, text: "Odpowiedź warta 300", fixed_points: 300 }] }],
      finalAnswerPts: 15,
    }),
    run: scenarioFinalFull,
  },
];

async function main() {
  for (const env of ["E2E_BYPASS_SECRET", "TEST_USERNAME", "TEST_PASSWORD"]) {
    if (!process.env[env]) throw new Error(`Brak ${env} w zmiennych środowiskowych`);
  }

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      `--window-size=${QUAD_W},${QUAD_H}`,
    ],
  });

  try {
    for (const scenario of SCENARIOS) {
      console.log(`\n=== Scenariusz: ${scenario.file} ===`);
      const setupCtx = await browser.newContext({ baseURL: BASE_URL });
      const setupPage = await setupCtx.newPage();
      await loginAsTestUser(setupPage, setupCtx);
      const game = await scenario.makeGame(setupPage);

      const { contexts, pages } = await openTiledDevices(browser, game);
      const rec = startRecording(path.join(OUT_DIR, scenario.file));
      try {
        await scenario.run(pages);
      } catch (err) {
        console.error(`[record] scenariusz ${scenario.file} rzucił błąd:`, err);
        throw err;
      } finally {
        await stopRecording(rec);
        await closeAll(contexts);
      }

      await deleteGame(setupPage, game.id);
      await setupCtx.close().catch(() => {});
    }
  } finally {
    await browser.close();
  }
}

main().then(() => {
  console.log("Nagrywanie zakończone, pliki w", OUT_DIR);
  process.exit(0);
}).catch((err) => {
  console.error("record-playthrough.js failed:", err);
  process.exit(1);
});
