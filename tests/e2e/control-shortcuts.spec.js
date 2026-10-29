// tests/e2e/control-shortcuts.spec.js
// Podręcznik 17.6 „Skróty klawiszowe panelu” (i 17.2: dwa kliknięcia) —
// każdy skrót z tabeli na prawdziwym kodzie Panelu sterowania: control/js/ui.js
// (klawiatura, kafle, zaznacz → potwierdź) i control/js/engine.js (stan gry).
// Bez bazy, Workera i urządzeń: strona testowa ładuje te dwa moduły i podaje
// akcje panelu wprost do silnika (to samo, co robi control/js/app.js po
// odblokowaniu). Dzięki temu test chodzi lokalnie i w CI w kilka sekund.
// Warianty „źle/podejrzanie”: skrót bez Enter, z modyfikatorem, w polu
// tekstowym, przy otwartym oknie, przytrzymany klawisz, klawisz nieistniejącej
// odpowiedzi, panel zablokowany na czas dźwięku.
// Ctrl+Enter (zegar finału) obsługuje control/js/app.js — sprawdza go
// control2.spec.js „finał — obaj gracze…” (tylko CI, wymaga urządzeń).

const fs = require("fs");
const path = require("path");
const { test, expect } = require("./helpers/e2e-test");
const { serveBranchCode } = require("./helpers/branch-code");

test.use({ serviceWorkers: "block", viewport: { width: 1400, height: 900 } });
test.beforeEach(async ({ context }) => {
  await serveBranchCode(context, { pages: [] });
});

const WEB_ROOT = process.env.E2E_WEB_ROOT ? path.resolve(process.env.E2E_WEB_ROOT) : path.resolve(__dirname, "..", "..", "web");
const CONTROL_HTML = fs.readFileSync(path.join(WEB_ROOT, "control", "index.html"), "utf8");
const V = (CONTROL_HTML.match(/\/control\/js\/app\.js(\?v=[^"]+)"/) || [, ""])[1];
const PARTS = (CONTROL_HTML.match(/<meta name="i18n-parts" content="([^"]+)"/) || [, "control"])[1];
const HARNESS = "https://www.familijna.app/control/__shortcuts.html";

const harnessHtml = `<!doctype html><html lang="pl"><head><meta charset="utf-8">
<meta name="i18n-parts" content="${PARTS}">
${["shared/style/tokens.css", "shared/style/base.css", "shared/style/components.css", "shared/style/layout.css", "shared/style/utilities.css", "control/css/control.css"].map((href) => `<link rel="stylesheet" href="/${href}${V}">`).join("\n")}
</head><body class="control-body">
<input id="outsideField" aria-label="pole poza panelem">
<main class="wrap wide"><div class="shell"><div class="control-tabs-card"><section class="main control-main-card"><div id="app"></div></section></div></div></main>
<div class="overlay" id="testDialog" role="dialog" hidden>okno</div>
<script type="module">
  const { initI18n } = await import("/shared/translation/translation.js${V}");
  await initI18n({ withSwitcher: false });
  const { createUI } = await import("/control/js/ui.js${V}");
  const { createEngine } = await import("/control/js/engine.js${V}");
  const { makeDefaultState, DEFAULT_SETTINGS } = await import("/shared/js/gameplay/gameStateShape.js${V}");
  const answers = (id) => [40, 30, 15, 10, 4, 1].map((p, i) => ({ id: id + "-a" + (i + 1), ord: i + 1, text: "Odpowiedź " + (i + 1), fixed_points: p }));
  const picked = ["f1", "f2", "f3", "f4", "f5"];
  const events = [];
  let busy = false;
  let queue = Promise.resolve();
  const state = makeDefaultState("g1");
  const store = { state, async commit() { state.rev += 1; } };
  const engine = createEngine({
    store,
    loadQuestionPool: async () => [1, 2, 3].map((n) => ({ id: "q" + n, ord: n, text: "Pytanie " + n })),
    loadQuestions: async () => picked.map((id, i) => ({ id, ord: i + 1, text: "Pytanie finału " + (i + 1) })),
    loadAnswers: async (id) => answers(id),
  });
  let ui;
  const render = () => ui.render(state, { busy, presenceFlags: { display: true, host: true, buzzer: true }, urls: {}, connectCodes: {}, shareBadges: {} });
  async function emit(action, payload) {
    events.push({ action, type: payload?.type ?? null, payload: payload ?? null });
    if (action === "ui.flushTyping") return queue;
    if (action === "ui.rerender") return render();
    if (action !== "game.dispatch" || busy) return;
    queue = queue.then(() => engine.dispatch(payload)).then(render);
    return queue;
  }
  ui = createUI({ root: document.getElementById("app"), emit });
  window.__h = {
    state, events,
    async setup(patch) {
      Object.assign(state.settings, DEFAULT_SETTINGS, { hasFinal: true }, patch.settings || {});
      state.step = patch.step || "r_roundStart";
      state.phase = patch.phase || "READY";
      state.final.picked = patch.picked || picked;
      state.final.confirmed = patch.confirmed ?? true;
      render();
    },
    dispatch: (action) => { queue = queue.then(() => engine.dispatch(action)).then(render); return queue; },
    settle: () => queue,
    setBusy(value) { busy = value; render(); },
    rerender: render,
  };
</script></body></html>`;

async function openHarness(page, setup = {}) {
  await page.route(HARNESS, (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: harnessHtml }));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(HARNESS);
  await page.waitForFunction(() => !!window.__h);
  await page.evaluate((s) => window.__h.setup(s), setup);
  return errors;
}

const st = (page, fn) => page.evaluate(fn);
const rounds = (page) => st(page, () => JSON.parse(JSON.stringify({ ...window.__h.state.rounds, step: window.__h.state.step, phase: window.__h.state.phase, controlTeam: window.__h.state.controlTeam })));
const settle = (page) => page.evaluate(() => window.__h.settle());
const tile = (page, key) => page.locator(`#app [data-shortcut="${key}"]`);
const press = async (page, key) => { await page.keyboard.press(key); await settle(page); };

// Runda po przyjęciu zgłoszenia drużyny A i trafieniu odpowiedzi #1 (pojedynek wygrany).
async function playPhase(page, setup = {}) {
  const errors = await openHarness(page, setup);
  await page.evaluate(async () => {
    await window.__h.dispatch({ type: "START_ROUND" });
    await window.__h.dispatch({ type: "ACCEPT_BUZZ", team: "A" });
    await window.__h.dispatch({ type: "REVEAL_ANSWER", ord: 1 });
  });
  expect((await rounds(page)).phase).toBe("PLAY");
  return errors;
}

test("17.6 N, potem Enter: przycisk przejścia dalej; samo N nic nie robi", async ({ page }) => {
  const errors = await openHarness(page);
  await expect(tile(page, "n")).toBeVisible();
  await press(page, "n");
  expect((await rounds(page)).step).toBe("r_roundStart");
  await press(page, "Enter");
  expect((await rounds(page)).step).toBe("r_duel");
  expect(errors).toEqual([]);
});

test("17.6 C, potem Enter: zatwierdza zgłoszenie z Przycisku; bez zgłoszenia C nic nie robi", async ({ page }) => {
  await openHarness(page);
  await page.evaluate(() => window.__h.dispatch({ type: "START_ROUND" }));
  await expect(tile(page, "c")).toHaveCount(0);
  await press(page, "c");
  await press(page, "Enter");
  expect((await rounds(page)).step).toBe("r_duel");

  await page.evaluate(() => { window.__h.state.rounds.duel.lastPressed = "B"; window.__h.rerender(); });
  await press(page, "c");
  await expect(tile(page, "c")).toHaveClass(/c2-tile-armed/);
  expect((await rounds(page)).duel.firstTeam).toBeNull();
  await press(page, "Enter");
  const r = await rounds(page);
  expect(r.step).toBe("r_play");
  expect(r.duel.firstTeam).toBe("B");
});

test("17.6 A / B, potem Enter: wybór drużyny przy przycisku fizycznym", async ({ page }) => {
  await openHarness(page, { settings: { physicalBuzzer: true } });
  await page.evaluate(() => window.__h.dispatch({ type: "START_ROUND" }));
  await press(page, "a");
  await press(page, "b");
  await expect(tile(page, "b")).toHaveClass(/c2-tile-primary/);
  expect((await rounds(page)).duel.firstTeam).toBeNull();
  await press(page, "Enter");
  expect((await rounds(page)).duel.firstTeam).toBe("B");
});

test("17.6 1–6, potem Enter: odsłania odpowiedź; klawisz bez odpowiedzi, drugi Enter i przytrzymany Enter nic nie dodają", async ({ page }) => {
  await playPhase(page);
  await press(page, "2");
  await expect(tile(page, "2")).toHaveClass(/c2-tile-armed/);
  expect((await rounds(page)).revealed).toEqual([1]);
  await page.keyboard.down("Enter");
  await page.keyboard.down("Enter"); // przytrzymany klawisz = zdarzenie z repeat
  await page.keyboard.up("Enter");
  await settle(page);
  let r = await rounds(page);
  expect(r.revealed).toEqual([1, 2]);
  expect(r.bankPts).toBe(70);
  await press(page, "Enter");
  expect((await rounds(page)).bankPts).toBe(70);

  // „7” nie istnieje na tablicy; „1” jest już odsłonięta (kafel nieaktywny).
  await press(page, "7");
  await press(page, "Enter");
  await press(page, "1");
  await press(page, "Enter");
  r = await rounds(page);
  expect(r.revealed).toEqual([1, 2]);
  expect(r.bankPts).toBe(70);
});

test("17.6 X, potem Enter: jeden błąd; samo X tylko zaznacza", async ({ page }) => {
  await playPhase(page);
  await press(page, "x");
  await expect(tile(page, "x")).toHaveClass(/c2-tile-armed/);
  expect((await rounds(page)).xA).toBe(0);
  await press(page, "Enter");
  expect((await rounds(page)).xA).toBe(1);
  await expect(tile(page, "x")).toContainText("1 / 3");
});

test("17.6 T, potem Enter: odliczanie 3 s; ponownie T i Enter wyłącza je bez X", async ({ page }) => {
  await playPhase(page);
  await press(page, "t");
  await press(page, "Enter");
  expect((await rounds(page)).timer3.running).toBe(true);
  await press(page, "t");
  await press(page, "Enter");
  const r = await rounds(page);
  expect(r.timer3.running).toBe(false);
  expect(r.xA).toBe(0);
});

test("17.6 P, potem Enter: oddaje kontrolę raz; po pierwszej odpowiedzi drużyny P nic nie robi", async ({ page }) => {
  await playPhase(page);
  await press(page, "p");
  await press(page, "Enter");
  let r = await rounds(page);
  expect(r.controlTeam).toBe("B");
  await expect(tile(page, "p")).toHaveCount(0);
  await press(page, "p");
  await press(page, "Enter");
  expect((await rounds(page)).controlTeam).toBe("B");

  await playPhase(page);
  await press(page, "x");
  await press(page, "Enter");
  await press(page, "p");
  await press(page, "Enter");
  r = await rounds(page);
  expect(r.controlTeam).toBe("A");
});

test("17.6 skróty nie działają w polu tekstowym, z Ctrl/Alt, przy otwartym oknie ani gdy panel czeka na dźwięk", async ({ page }) => {
  await playPhase(page);
  const before = await rounds(page);

  await page.locator("#outsideField").focus();
  await press(page, "2");
  await press(page, "Enter");
  await expect(page.locator("#outsideField")).toHaveValue("2");
  await page.locator("#outsideField").blur();

  for (const combo of ["Control+2", "Alt+2", "Shift+2"]) await press(page, combo);
  await press(page, "Enter");
  await expect(page.locator("#app .c2-tile-armed")).toHaveCount(0);

  await page.evaluate(() => { document.getElementById("testDialog").hidden = false; });
  await press(page, "2");
  await press(page, "Enter");
  await press(page, "m");
  await page.evaluate(() => { document.getElementById("testDialog").hidden = true; });

  await page.evaluate(() => window.__h.setBusy(true));
  await press(page, "x");
  await press(page, "Enter");
  await page.evaluate(() => window.__h.setBusy(false));

  const after = await rounds(page);
  expect(after.revealed).toEqual(before.revealed);
  expect(after.xA).toBe(0);
  const events = await st(page, () => window.__h.events.map((e) => e.action));
  expect(events.filter((a) => a === "settings.toggleSoundMuted")).toEqual([]);
});

test("17.6 M: wycisza i włącza dźwięk; w polu tekstowym M to zwykła litera", async ({ page }) => {
  await playPhase(page);
  await press(page, "m");
  await page.locator("#outsideField").focus();
  await press(page, "m");
  await expect(page.locator("#outsideField")).toHaveValue("m");
  const muted = await st(page, () => window.__h.events.filter((e) => e.action === "settings.toggleSoundMuted").length);
  expect(muted).toBe(1);
});

test("17.6 kolumna podpowiedzi pokazuje skróty bieżącego kroku", async ({ page }) => {
  await playPhase(page);
  const hint = page.locator("#app .c2-hint-shortcuts");
  await expect(hint).toBeVisible();
  for (const key of ["1–6", "X", "T", "P", "M"]) await expect(hint).toContainText(key);
});

// ---- Finał ----

async function finalEntry(page, round = 1) {
  const errors = await openHarness(page, { step: "f_start", phase: null });
  await page.evaluate(async (round) => {
    await window.__h.dispatch({ type: "START_FINAL" });
    if (round === 2) {
      const s = window.__h.state;
      s.final.runtime.timer.usedP1 = true;
      s.step = "f_p2_start";
      await window.__h.dispatch({ type: "START_P2_ROUND" });
    }
  }, round);
  expect(await st(page, () => window.__h.state.step)).toBe(`f_p${round}_entry`);
  return errors;
}
const entryInput = (page, i) => page.locator(`#app .c2-entryrow[data-i="${i}"] input`);

test("17.6 finał: Enter i ↓ przechodzą do następnego pustego pola, ↑ do poprzedniego", async ({ page }) => {
  const errors = await finalEntry(page, 1);
  await entryInput(page, 0).click();
  await page.keyboard.type("Kawa");
  await press(page, "Enter");
  await expect(entryInput(page, 1)).toBeFocused();
  await page.keyboard.type("Herbata");
  await press(page, "ArrowDown");
  await expect(entryInput(page, 2)).toBeFocused();
  // ↑ pomija wypełnione pola i wraca do poprzedniego pustego (zawija się).
  await press(page, "ArrowUp");
  await expect(entryInput(page, 4)).toBeFocused();
  // Enter w polu to nawigacja, nie przejście dalej ani skrót N.
  await press(page, "Enter");
  expect(await st(page, () => window.__h.state.step)).toBe("f_p1_entry");
  expect(await st(page, () => window.__h.state.final.runtime.p1.map((e) => e?.text || ""))).toEqual(["Kawa", "Herbata", "", "", ""]);
  expect(errors).toEqual([]);
});

test("17.6 finał, gracz 2: Shift+Enter w pustym polu oznacza powtórzenie, w wypełnionym nie", async ({ page }) => {
  await finalEntry(page, 2);
  await entryInput(page, 0).click();
  await press(page, "Shift+Enter");
  expect(await st(page, () => window.__h.state.final.runtime.p2[0]?.repeat)).toBe(true);
  await entryInput(page, 1).click();
  await page.keyboard.type("Rower");
  await press(page, "Shift+Enter");
  expect(await st(page, () => window.__h.state.final.runtime.p2[1]?.repeat || false)).toBe(false);
  expect(await st(page, () => window.__h.events.filter((e) => e.type === "SET_REPEAT").length)).toBe(1);
});

test("17.6 finał, gracz 1: Shift+Enter nie oznacza powtórzenia", async ({ page }) => {
  await finalEntry(page, 1);
  await entryInput(page, 0).click();
  await press(page, "Shift+Enter");
  expect(await st(page, () => window.__h.events.filter((e) => e.type === "SET_REPEAT").length)).toBe(0);
});

async function mapping(page, round, texts) {
  await finalEntry(page, round);
  await page.evaluate(async ({ round, texts }) => {
    const h = window.__h;
    for (let i = 0; i < 5; i++) await h.dispatch({ type: "SET_ENTRY_TEXT", round, idx: i, text: texts[i] || "" });
    h.state.final.runtime.timer[round === 1 ? "usedP1" : "usedP2"] = true;
    await h.dispatch({ type: "START_MAPPING", round });
  }, { round, texts });
  expect(await st(page, () => window.__h.state.step)).toBe(`f_p${round}_map_q1`);
}
const mapRow = (page, round, idx = 0) => page.evaluate(({ round, idx }) => JSON.parse(JSON.stringify(window.__h.state.final.runtime[`map${round}`][idx])), { round, idx });

test("17.6 ocena w finale: 1–6 wybiera odpowiedź, Enter odsłania odpowiedź, potem punkty, kolejny Enter nie przechodzi dalej", async ({ page }) => {
  await mapping(page, 1, ["Odp", "", "", "", ""]);
  await press(page, "2");
  let row = await mapRow(page, 1);
  expect(row.kind).toBe("MATCH");
  expect(row.pts).toBe(30);
  await press(page, "Enter");
  row = await mapRow(page, 1);
  expect(row.revealedAnswer).toBe(true);
  expect(row.revealedPoints).toBe(false);
  expect(await st(page, () => window.__h.state.final.runtime.sum)).toBe(0);
  await press(page, "Enter");
  expect((await mapRow(page, 1)).revealedPoints).toBe(true);
  expect(await st(page, () => window.__h.state.final.runtime.sum)).toBe(30);
  await press(page, "Enter");
  expect(await st(page, () => window.__h.state.step)).toBe("f_p1_map_q1");
  // Po odsłonięciu wybór jest zamrożony.
  await press(page, "1");
  expect((await mapRow(page, 1)).pts).toBe(30);
  // N, potem Enter: [Dalej].
  await press(page, "n");
  await press(page, "Enter");
  expect(await st(page, () => window.__h.state.step)).toBe("f_p1_map_q2");
});

test("17.6 ocena w finale: W dla wpisanej odpowiedzi, O dla pustego pola; odwrotnie nic się nie dzieje", async ({ page }) => {
  await mapping(page, 1, ["Coś", "", "", "", ""]);
  // Wpisany tekst: domyślnie „Nie ma na liście” (W podświetlone), O nieaktywne.
  await expect(tile(page, "w")).toHaveClass(/c2-tile-primary/);
  await press(page, "o");
  expect((await mapRow(page, 1)).kind).toBeNull();
  await press(page, "1");
  expect((await mapRow(page, 1)).kind).toBe("MATCH");
  await press(page, "w");
  expect((await mapRow(page, 1)).kind).toBe("MISS");
  await expect(tile(page, "w")).toHaveClass(/c2-tile-primary/);

  await page.evaluate(() => window.__h.dispatch({ type: "REVEAL_ANSWER_ONLY", round: 1, idx: 0 }));
  await page.evaluate(() => window.__h.dispatch({ type: "REVEAL_POINTS", round: 1, idx: 0 }));
  await page.evaluate(() => window.__h.dispatch({ type: "NEXT_QUESTION", round: 1, idx: 1 }));
  expect(await st(page, () => window.__h.state.step)).toBe("f_p1_map_q2");
  await press(page, "w");
  await press(page, "1");
  expect((await mapRow(page, 1, 1)).kind).toBeNull();
  // Puste pole: domyślnie „Brak odpowiedzi” (O podświetlone), W i 1–6 nieaktywne.
  await press(page, "o");
  await expect(tile(page, "o")).toHaveClass(/c2-tile-primary/);
  await expect(tile(page, "w")).toBeDisabled();
  await press(page, "Enter");
  const row = await mapRow(page, 1, 1);
  expect(row.revealedAnswer && row.revealedPoints).toBe(true);
});

test("17.6 ocena w finale: I przenosi do pola wpisanej odpowiedzi; R tylko u gracza 2", async ({ page }) => {
  await mapping(page, 1, ["", "", "", "", ""]);
  await press(page, "r");
  expect(await st(page, () => window.__h.events.filter((e) => e.type === "SET_REPEAT").length)).toBe(0);
  await page.keyboard.press("i");
  await expect(page.locator('#app .c2-mapinput[data-i="0"] input')).toBeFocused();

  await mapping(page, 2, ["", "", "", "", ""]);
  await press(page, "r");
  expect(await st(page, () => window.__h.state.final.runtime.p2[0]?.repeat)).toBe(true);
});

test("17.3 kradzież rozstrzygnięta: kafle odpowiedzi nieaktywne, 3 i Enter nie dokładają punktów", async ({ page }) => {
  await playPhase(page);
  await page.evaluate(async () => {
    for (let i = 0; i < 3; i++) await window.__h.dispatch({ type: "ADD_X" });
    await window.__h.dispatch({ type: "ADD_X" }); // przeciwnicy pudłują kradzież
  });
  const before = await rounds(page);
  expect(before.steal.used).toBe(true);
  await expect(tile(page, "3")).toBeDisabled();
  await press(page, "3");
  await press(page, "Enter");
  await tile(page, "3").click({ force: true });
  await tile(page, "3").click({ force: true });
  await settle(page);
  const after = await rounds(page);
  expect(after.bankPts).toBe(before.bankPts);
  expect(after.revealed).toEqual(before.revealed);
});

test("17.2/17.6 podsumowanie: E i B z Enter (ustawienia, powrót), N i Enter startuje grę; bez 5 pytań finału [Gotowe] nieaktywne", async ({ page }) => {
  await openHarness(page, { step: "setup_finish", phase: null, picked: ["f1", "f2", "f3", "f4"] });
  const start = page.locator("#app [data-c2-summary-start]");
  await expect(start).toBeVisible();
  await expect(start).toBeDisabled();
  await press(page, "n");
  await press(page, "Enter");
  await start.click({ force: true });
  const actions = () => st(page, () => window.__h.events.map((e) => e.action));
  expect(await actions()).not.toContain("setup.start");

  await press(page, "e");
  await press(page, "Enter");
  await press(page, "b");
  await press(page, "Enter");
  expect(await actions()).toEqual(expect.arrayContaining(["setup.openSettings", "setup.back"]));

  await page.evaluate(() => window.__h.setup({ step: "setup_finish", phase: null }));
  await expect(start).toBeEnabled();
  await press(page, "n");
  await press(page, "Enter");
  expect((await actions()).filter((a) => a === "setup.start")).toHaveLength(1);
});
