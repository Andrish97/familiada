// tests/e2e/polls-actions.spec.js
// Podręcznik, rozdział 15 (ankiety) — czynności, których nie sprawdzały inne
// spece, razem z wariantem „źle/podejrzanie”:
// 15.1 [Uruchom] przy za małej grze (UI i bezpośrednie RPC), Anuluj w oknach,
// 15.2 [Kopiuj link], [Otwórz], powiększony kod QR, [QR na wyświetlaczu] (kod 6 cyfr),
// 15.3 licznik „Pytanie n/10”, pusta odpowiedź, wyjście przed końcem nie liczy głosu,
// 15.5 [Przerwij] (głosy przepadają, stary link wygasa),
// 15.6 [Podlicz głosy] dopiero od 10 pełnych ankiet, remis na granicy szóstki,
// 15.7 [Uruchom ponownie] usuwa wyniki.
// Pełny cykl Zatrzymaj/Wznów/Podlicz/Zatwierdź i poprawki tekstu: polls.spec.js;
// komunikaty stanów linku: poll-voting.spec.js; 30 s na urządzeniu: poll-anonymous.spec.js.

const { test, expect } = require("./helpers/e2e-test");
const { serveBranchCode } = require("./helpers/branch-code");

const PAGES = ["polls", "polls/vote/text", "polls/vote/points", "polls/vote/qr"];
test.use({ serviceWorkers: "block", needs: { standard: 1 } });
test.beforeEach(async ({ context }) => {
  await serveBranchCode(context, { pages: PAGES });
});

const ORIGIN = "https://www.familijna.app";

async function rpc(page, name, args) {
  return page.evaluate(async ({ name, args }) => {
    const { data, error } = await window.__sbClient.rpc(name, args);
    return { data, error: error ? String(error.message) : null };
  }, { name, args });
}

// Szkic: `questions` pytań, w grze punktowej `answers[i]` odpowiedzi w pytaniu i (domyślnie 4).
async function seedDraft(page, { type = "poll_text", questions = 10, answers = [] } = {}) {
  return page.evaluate(async ({ type, questions, answers }) => {
    const sb = window.__sbClient;
    const { data: u } = await sb.auth.getUser();
    const { data: g, error } = await sb.from("games")
      .insert({ name: `E2E-polls-actions-${type}-${Date.now()}`, owner_id: u.user.id, type, status: "draft" })
      .select("id,share_key_poll").single();
    if (error) throw new Error("insert game: " + error.message);
    const { data: qs, error: qErr } = await sb.from("questions")
      .insert(Array.from({ length: questions }, (_, i) => ({ game_id: g.id, ord: i + 1, text: `Pytanie ${i + 1}` })))
      .select("id,ord");
    if (qErr) throw new Error("insert questions: " + qErr.message);
    qs.sort((a, b) => a.ord - b.ord);
    if (type === "poll_points") {
      const rows = qs.flatMap((q, i) => Array.from({ length: answers[i] ?? 4 }, (_, a) => ({ question_id: q.id, ord: a + 1, text: `Odp ${a + 1}`, fixed_points: 0 })));
      const { error: aErr } = await sb.from("answers").insert(rows);
      if (aErr) throw new Error("insert answers: " + aErr.message);
    }
    return { id: g.id, key: g.share_key_poll };
  }, { type, questions, answers });
}

async function openViaRpc(page, game) {
  const { error } = await rpc(page, "poll_open", { p_game_id: game.id, p_key: game.key });
  if (error) throw new Error("poll_open: " + error);
  return page.evaluate(async (id) => (await window.__sbClient.from("games").select("share_key_poll").eq("id", id).single()).data.share_key_poll, game.id);
}

async function deleteGame(page, id) {
  await page.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, id);
}

async function gameStatus(page, id) {
  return page.evaluate(async (id) => (await window.__sbClient.from("games").select("status").eq("id", id).single()).data?.status, id);
}

// Pełne ankiety anonimowe tą samą drogą co formularz (poll_anonymous_submit), każda z innej przeglądarki.
// pick(voter, question) -> tekst odpowiedzi (tekstowa) albo indeks odpowiedzi (punktowa).
async function voteFull(page, gameId, key, voters, pick) {
  return page.evaluate(async ({ gameId, key, voters, pickSrc }) => {
    const sb = window.__sbClient;
    const pick = eval(pickSrc);
    const { data: g } = await sb.from("games").select("type").eq("id", gameId).single();
    const { data: qs } = await sb.from("questions").select("id,ord,answers(id,ord)").eq("game_id", gameId).order("ord");
    for (let v = 0; v < voters; v++) {
      const items = qs.map((q) => {
        if (g.type === "poll_points") {
          const list = (q.answers || []).slice().sort((a, b) => a.ord - b.ord);
          return { question_id: q.id, answer_id: list[pick(v, q.ord) % list.length].id };
        }
        const raw = pick(v, q.ord);
        return { question_id: q.id, answer_raw: raw, answer_norm: raw.toLowerCase() };
      });
      const { data, error } = await sb.rpc("poll_anonymous_submit", {
        p_game_id: gameId, p_key: key, p_browser_token: crypto.randomUUID(), p_voter_token: crypto.randomUUID(), p_items: items,
      });
      if (error || !data?.ok) throw new Error("poll_anonymous_submit: " + (error?.message || JSON.stringify(data)));
    }
  }, { gameId, key, voters, pickSrc: pick.toString() });
}

async function countEntries(page, gameId, type) {
  return page.evaluate(async ({ gameId, type }) => {
    const { count, error } = await window.__sbClient.from(type === "poll_text" ? "poll_text_entries" : "poll_votes")
      .select("id", { head: true, count: "exact" }).eq("game_id", gameId);
    if (error) throw error;
    return count;
  }, { gameId, type });
}

async function gotoOwner(page, gameId) {
  await page.goto(`${ORIGIN}/polls?id=${gameId}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
}
const bar = (page, state) => expect(page.locator("#pollBar")).toHaveAttribute("data-state", state, { timeout: 30000 });
async function confirm(page, ok) {
  const button = page.locator(ok ? ".uni-foot .btn.gold:visible" : ".uni-foot .btn:not(.gold):visible").first();
  await expect(button).toBeVisible({ timeout: 10000 });
  await button.click();
}

async function voterPage(browser, url) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.addInitScript(() => localStorage.setItem("uiLang", "pl"));
  await serveBranchCode(context, { pages: PAGES });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return { context, page };
}

test("15.1 ankieta za małej gry: strona blokuje się z powodem (9 pytań, 2 odpowiedzi w Punktacji), bezpośrednie RPC odrzucone", async ({ page, context, accounts, loginAs }) => {
  await loginAs(page, context, accounts.standard[0]);
  const games = [
    { ...(await seedDraft(page, { type: "poll_text", questions: 9 })), reason: "Gra musi mieć co najmniej 10 pytań (masz: 9)." },
    { ...(await seedDraft(page, { type: "poll_points", questions: 10, answers: [2] })), reason: "Pytanie #1: musi mieć 3–6 odpowiedzi (masz: 2)." },
  ];
  try {
    for (const game of games) {
      await gotoOwner(page, game.id);
      await expect(page.getByText("Niedostępne w tym stanie gry", { exact: false })).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(game.reason)).toBeVisible();
      await expect(page.locator("#btnOpenPoll")).toBeHidden();
      const { error } = await rpc(page, "poll_open", { p_game_id: game.id, p_key: game.key });
      expect(error, "baza też nie uruchamia za małej ankiety").not.toBeNull();
      expect(await gameStatus(page, game.id)).toBe("draft");
    }
  } finally {
    for (const game of games) await deleteGame(page, game.id);
  }
});

test("15.2 udostępnianie: w szkicu nieaktywne; [Kopiuj link], [Otwórz], powiększony QR i [QR na wyświetlaczu]", async ({ page, context, accounts, loginAs }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
  await loginAs(page, context, accounts.standard[0]);
  const game = await seedDraft(page);
  try {
    await gotoOwner(page, game.id);
    await bar(page, "draft");
    for (const id of ["#btnCopy", "#btnOpen", "#btnOpenQr"]) await expect(page.locator(id)).toBeDisabled();

    await page.locator("#btnOpenPoll").click();
    await confirm(page, true);
    await bar(page, "poll_open");
    const link = await page.inputValue("#pollLink");
    expect(new URL(link).pathname).toBe("/go/");
    expect(new URL(link).searchParams.get("id")).toBe(game.id);

    await page.locator("#btnCopy").click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(link);

    const [popup] = await Promise.all([page.waitForEvent("popup"), page.locator("#btnOpen").click()]);
    // /go/ prowadzi głosującego do formularza tej ankiety.
    await popup.waitForURL(/\/polls\/vote\/text\//, { timeout: 15000 });
    expect(new URL(popup.url()).searchParams.get("id")).toBe(game.id);
    await popup.close();

    await page.locator("#qr").click();
    await expect(page.locator("#pollQrModalVote img")).toBeVisible();
    await expect(page.locator("#pollQrModalCodeVal")).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.locator("#pollQrModalVote")).toBeHidden();

    await page.locator("#btnOpenQr").click();
    await expect(page.locator("#pollQrModalCodeVal")).toHaveText(/^\d{6}$/, { timeout: 15000 });
    const code = (await page.locator("#pollQrModalCodeVal").textContent()).trim();
    await page.locator("#pollQrModalCopy").click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(code);
    const [screen] = await Promise.all([page.waitForEvent("popup"), page.locator("#pollQrModalOpen").click()]);
    const screenUrl = new URL(screen.url());
    expect(screenUrl.pathname).toBe("/polls/vote/qr/");
    expect(screenUrl.searchParams.get("id")).toBe(game.id);
    expect(screenUrl.searchParams.get("key")).toBe(new URL(link).searchParams.get("key"));
    await screen.close();
  } finally {
    await deleteGame(page, game.id);
  }
});

test("15.3 głosowanie tekstowe: „Pytanie n/10”, pusta odpowiedź nie przechodzi dalej, wyjście przed końcem nie liczy głosu", async ({ page, context, browser, accounts, loginAs }) => {
  await loginAs(page, context, accounts.standard[0]);
  const game = await seedDraft(page);
  const key = await openViaRpc(page, game);
  const voter = await voterPage(browser, `${ORIGIN}/polls/vote/text/?id=${game.id}&key=${key}`);
  try {
    const v = voter.page;
    const submits = [];
    v.on("request", (r) => { if (/rpc\/poll_(anonymous_submit|text_submit_batch)/.test(r.url())) submits.push(r.url()); });
    await expect(v.locator("#qtext")).toHaveText("Pytanie 1", { timeout: 15000 });
    await expect(v.locator("#prog")).toHaveText("Pytanie 1/10");

    for (const empty of ["", "    "]) {
      await v.locator("#answerInput").fill(empty);
      await v.locator("#btnSend").click();
      await expect(v.locator("#sub")).toContainText("Wpisz odpowiedź.");
      await expect(v.locator("#prog")).toHaveText("Pytanie 1/10");
    }
    // Enter w polu działa jak [Dalej]; nie ma przycisku pominięcia ani powrotu.
    await v.locator("#answerInput").fill("Kawa");
    await v.locator("#answerInput").press("Enter");
    await expect(v.locator("#prog")).toHaveText("Pytanie 2/10");
    await v.locator("#answerInput").fill("Herbata");
    await v.locator("#btnSend").click();
    await expect(v.locator("#prog")).toHaveText("Pytanie 3/10");
    await expect(v.locator("#qbox button:visible")).toHaveCount(1);

    // Wyjście w połowie: nic nie zostało wysłane ani zapisane.
    await voter.context.close();
    expect(submits).toEqual([]);
    expect(await countEntries(page, game.id, "poll_text")).toBe(0);
  } finally {
    await voter.context.close().catch(() => {});
    await deleteGame(page, game.id);
  }
});

test("15.3 Punktacja: kliknięcie odpowiedzi od razu przechodzi dalej, licznik „Pytanie n/10”, dwuklik nie przeskakuje pytania", async ({ page, context, browser, accounts, loginAs }) => {
  await loginAs(page, context, accounts.standard[0]);
  const game = await seedDraft(page, { type: "poll_points" });
  const key = await openViaRpc(page, game);
  const voter = await voterPage(browser, `${ORIGIN}/polls/vote/points/?id=${game.id}&key=${key}`);
  try {
    const v = voter.page;
    await expect(v.locator("#prog")).toHaveText("Pytanie 1/10", { timeout: 15000 });
    await expect(v.locator(".alist button")).toHaveCount(4);
    await v.locator(".alist button").nth(2).click();
    await expect(v.locator("#prog")).toHaveText("Pytanie 2/10");
    // Dwuklik odpowiada tylko na bieżące pytanie, nie na następne (niewidziane).
    await v.locator(".alist button").nth(1).dblclick();
    await expect(v.locator("#prog")).toHaveText("Pytanie 3/10");
    await v.waitForTimeout(300);
    await expect(v.locator("#prog")).toHaveText("Pytanie 3/10");
    expect(await countEntries(page, game.id, "poll_points")).toBe(0);
  } finally {
    await voter.context.close();
    await deleteGame(page, game.id);
  }
});

test("15.5 [Przerwij]: Anuluj nic nie zmienia; Przerwij przywraca szkic, głosy przepadają, stary link wygasa", async ({ page, context, browser, accounts, loginAs }) => {
  await loginAs(page, context, accounts.standard[0]);
  const game = await seedDraft(page);
  try {
    await gotoOwner(page, game.id);
    // Anuluj w oknie [Uruchom] zostawia szkic.
    await page.locator("#btnOpenPoll").click();
    await confirm(page, false);
    await bar(page, "draft");
    expect(await gameStatus(page, game.id)).toBe("draft");

    await page.locator("#btnOpenPoll").click();
    await confirm(page, true);
    await bar(page, "poll_open");
    const oldKey = new URL(await page.inputValue("#pollLink")).searchParams.get("key");
    await voteFull(page, game.id, oldKey, 2, (v) => `Kawa${v}`);
    await gotoOwner(page, game.id);
    await expect(page.locator("#pollStateInfo")).toHaveText("2 głosy", { timeout: 30000 });

    await page.locator("#btnAbort").click();
    await confirm(page, false);
    await bar(page, "poll_open");
    expect(await countEntries(page, game.id, "poll_text")).toBe(20);

    await page.locator("#btnAbort").click();
    await confirm(page, true);
    await bar(page, "draft");
    expect(await countEntries(page, game.id, "poll_text")).toBe(0);
    await expect(page.locator("#btnCopy")).toBeDisabled();

    const voter = await voterPage(browser, `${ORIGIN}/polls/vote/text/?id=${game.id}&key=${oldKey}`);
    await expect(voter.page.locator("#closed")).toBeVisible({ timeout: 15000 });
    await expect(voter.page.locator("#qbox")).toBeHidden();
    await voter.context.close();
    const late = await rpc(page, "poll_anonymous_submit", { p_game_id: game.id, p_key: oldKey, p_browser_token: crypto.randomUUID(), p_voter_token: crypto.randomUUID(), p_items: [] });
    expect(late.error || late.data?.ok === false, "stary link po przerwaniu nie przyjmuje głosów").toBeTruthy();
  } finally {
    await deleteGame(page, game.id);
  }
});

test("15.6 [Podlicz głosy] dopiero od 10 pełnych ankiet (UI i RPC); 15.7 [Uruchom ponownie] usuwa wyniki", async ({ page, context, accounts, loginAs }) => {
  test.setTimeout(180_000);
  await loginAs(page, context, accounts.standard[0]);
  const game = await seedDraft(page, { type: "poll_points" });
  try {
    const key = await openViaRpc(page, game);
    // 9 pełnych ankiet; rozkład 4/3/2 (i dziesiąta: 1) daje 40/30/20/10 pkt.
    await voteFull(page, game.id, key, 9, (v) => (v < 4 ? 0 : v < 7 ? 1 : 2));
    await rpc(page, "poll_stop", { p_game_id: game.id });
    await gotoOwner(page, game.id);
    await bar(page, "poll_stopped");
    await expect(page.locator("#btnTallyPoll")).toBeDisabled();
    await expect(page.locator("#hintTop")).toHaveText("Podliczyć można od 10 pełnych ankiet (jest: 9).");
    const early = await rpc(page, "poll_points_tally", { p_game_id: game.id });
    expect(early.error, "baza nie podlicza 9 ankiet").not.toBeNull();
    expect(await gameStatus(page, game.id)).toBe("poll_stopped");

    // Zatrzymana ankieta nie przyjmuje dziesiątego głosu.
    await expect(voteFull(page, game.id, key, 1, () => 3)).rejects.toThrow();

    await page.locator("#btnResumePoll").click();
    await confirm(page, true);
    await bar(page, "poll_open");
    await voteFull(page, game.id, key, 1, () => 3);
    await page.locator("#btnStopPoll").click();
    await confirm(page, true);
    await bar(page, "poll_stopped");
    await expect(page.locator("#btnTallyPoll")).toBeEnabled({ timeout: 30000 });
    await page.locator("#btnTallyPoll").click();
    await bar(page, "tally");
    // [Wyjdź z podliczania] wraca do zatrzymanej ankiety.
    await page.locator("#btnLeaveTally").click();
    await bar(page, "poll_stopped");
    await page.locator("#btnTallyPoll").click();
    await bar(page, "tally");
    await page.locator("#btnApproveTally").click();
    await confirm(page, true);
    await bar(page, "ready");
    expect(await gameStatus(page, game.id)).toBe("ready");
    const points = await page.evaluate(async (id) => {
      const { data } = await window.__sbClient.from("questions").select("ord,answers(ord,fixed_points)").eq("game_id", id).eq("ord", 1).single();
      return data.answers.sort((a, b) => a.ord - b.ord).map((a) => a.fixed_points);
    }, game.id);
    expect(points).toEqual([40, 30, 20, 10]);

    // [Uruchom ponownie]: Anuluj zostawia wynik; potwierdzenie usuwa głosy i daje nowy link.
    await page.locator("#btnReopenPoll").click();
    await confirm(page, false);
    await bar(page, "ready");
    await page.locator("#btnReopenPoll").click();
    await confirm(page, true);
    await bar(page, "poll_open");
    const newKey = new URL(await page.inputValue("#pollLink")).searchParams.get("key");
    expect(newKey).not.toBe(key);
    expect(await countEntries(page, game.id, "poll_points")).toBe(0);
    await expect(page.locator("#pollStateInfo")).toHaveText("0 głosów", { timeout: 30000 });
  } finally {
    await deleteGame(page, game.id);
  }
});

test("15.6 remis na granicy szóstki: [Zmień wybór w remisie] zmienia, które odpowiedzi trafią na tablicę", async ({ page, context, accounts, loginAs }) => {
  test.setTimeout(180_000);
  await loginAs(page, context, accounts.standard[0]);
  const game = await seedDraft(page);
  try {
    const key = await openViaRpc(page, game);
    // 10 pełnych ankiet. Pytanie 1: A×3, B×2 i pięć odpowiedzi po jednym głosie
    // (po 10 pkt) — na cztery ostatnie miejsca jest pięciu kandydatów. Pozostałe
    // pytania: trzy odpowiedzi bez remisu.
    await voteFull(page, game.id, key, 10, (v, ord) => ord === 1
      ? ["Alfa", "Alfa", "Alfa", "Beta", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta"][v]
      : ["Raz", "Raz", "Raz", "Raz", "Dwa", "Dwa", "Dwa", "Trzy", "Trzy", "Trzy"][v]);
    await rpc(page, "poll_stop", { p_game_id: game.id });
    await gotoOwner(page, game.id);
    await bar(page, "poll_stopped");
    await page.locator("#btnTallyPoll").click();
    await bar(page, "tally");
    const q1 = page.locator("#resultsList .resultQ").first();
    const tieBtn = q1.locator(".tcTieBtn");
    await expect(tieBtn).toBeVisible({ timeout: 30000 });
    await expect(tieBtn).toContainText("Zmień wybór w remisie");
    const info = q1.locator(".tallyTieInfo");
    await expect(info).toContainText("Remis na granicy szóstki.");
    const before = await info.textContent();
    await tieBtn.click();
    await expect(info).not.toHaveText(before);
    await expect(info).toContainText("Remis na granicy szóstki.");
    // Pozostałe pytania bez remisu.
    await expect(page.locator("#resultsList .resultQ").nth(1).locator(".tcTieBtn")).toBeHidden();
    await expect(page.locator("#btnApproveTally")).toBeEnabled({ timeout: 30000 });
  } finally {
    await deleteGame(page, game.id);
  }
});
