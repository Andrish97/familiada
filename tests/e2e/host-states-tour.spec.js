// tests/e2e/host-states-tour.spec.js
//
// DIAGNOSTYCZNY, JEDNORAZOWY test — NIE część stałego zestawu regresyjnego.
// Przechodzi przez każdy odróżnialny stan renderowania Hosta
// (host2/js/render.js) i robi zrzut ekranu #paperText1/#paperText2/#cover2
// w każdym z nich, żeby ocenić wizualnie (nie z kodu), co Prowadzący
// faktycznie widzi na każdym etapie gry — Rundy i Finał.
//
// Zrzuty lądują w tests/test-results/<nazwa-testu>/NN-opis.png (przez
// testInfo.outputPath()) — ten sam katalog, który e2e-tests.yml już
// uploaduje jako artefakt "e2e-failure-screenshots" (workflow YAML: krok
// `if: failure()`). Test celowo KOŃCZY SIĘ rzuceniem błędu na końcu (po
// zrobieniu wszystkich zrzutów i posprzątaniu gry), żeby ten krok upload
// się odpalił — to nie jest prawdziwy fail testu, tylko trik żeby wymusić
// artefakt bez zmiany workflow YAML. USUŃ TEN PLIK po obejrzeniu zrzutów.
//
// Uruchomienie: workflow_dispatch na e2e-tests.yml, spec_filter:
//   --grep "Host — przegląd stanów"

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

test.describe.configure({ retries: 0 }); // bez retry — to nie jest prawdziwy fail, powtórka tylko zdublowałaby czas i zrzuty

test.setTimeout(180_000);

const WRITE_RPC_RE = /\/rpc\/(game_state_write|game_state_buzzer_press)(\?|$)/;

async function settleAfterWrite(page) {
  await page.waitForTimeout(150);
}

async function armAndConfirm(locator) {
  const page = locator.page();
  await locator.click();
  const responded = page.waitForResponse((resp) => WRITE_RPC_RE.test(resp.url()), { timeout: 15000 }).catch(() => null);
  await locator.click();
  await responded;
  await settleAfterWrite(page);
}

async function clickConfirmed(locator) {
  const page = locator.page();
  const responded = page.waitForResponse((resp) => WRITE_RPC_RE.test(resp.url()), { timeout: 15000 }).catch(() => null);
  await locator.click();
  await responded;
  await settleAfterWrite(page);
}

function answerTile(page, n) {
  return page.locator(".c2-tilegrid button").nth(n - 1);
}

async function revealAnswer(page, n) {
  await armAndConfirm(answerTile(page, n));
}

function xTile(page) {
  return page.getByRole("button", { name: "X", exact: true });
}

async function clickX(page) {
  await armAndConfirm(xTile(page));
}

async function makeGame(page, name, { settings = {}, roundQuestions = [], finalAnswerPts = null } = {}) {
  return page.evaluate(async ({ name, settings, roundQuestions, finalAnswerPts }) => {
    const clip17 = (s) => String(s ?? "").trim().slice(0, 17);
    const clip200 = (s) => String(s ?? "").trim().slice(0, 200);
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
        .from("questions").insert({ game_id: g.id, ord: q.ord, text: clip200(q.text) }).select("id").single();
      if (qErr) throw new Error("insert questions failed: " + qErr.message);
      const { error: aErr } = await sb.from("answers").insert(
        q.answers.map((a) => ({ ...a, question_id: qRow.id, text: clip17(a.text) }))
      );
      if (aErr) throw new Error("insert answers failed: " + aErr.message);
    }

    let finalPicked = [];
    if (finalAnswerPts) {
      for (let i = 1; i <= 5; i++) {
        const { data: fq, error: fqErr } = await sb
          .from("questions").insert({ game_id: g.id, ord: 100 + i, text: clip200(`Pytanie finałowe ${i}`) }).select("id").single();
        if (fqErr) throw new Error("insert final question failed: " + fqErr.message);
        const { error: faErr } = await sb.from("answers").insert([
          { question_id: fq.id, ord: 1, text: clip17("Odp. finałowa"), fixed_points: finalAnswerPts },
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

async function openAnon(browser, contexts, path) {
  const ctx = await browser.newContext();
  contexts.push(ctx);
  const p = await ctx.newPage();
  await p.goto(path, { waitUntil: "domcontentloaded" });
  return p;
}

test("Host — przegląd stanów (zrzuty ekranu każdego etapu)", async ({ page, browser }, testInfo) => {
  await loginAsTestUser(page, page.context());
  // 3 odpowiedzi (żeby zmieściły się DUEL/reveal/X/STEAL/odkrywanie reszty),
  // finalAnswerPts=15 (jak w control2.spec.js's "obaj gracze") — 5x15+5x15=150
  // < finalTarget(200), więc finał przechodzi WSZYSTKIE 10 pytań bez
  // wczesnego wyjścia, docierając naprawdę do f_end.
  const game = await makeGame(page, `E2E-HOSTTOUR-${Date.now()}`, {
    roundQuestions: [{
      ord: 1, text: "Pytanie testowe (runda)",
      answers: [
        { ord: 1, text: "Odpowiedź A", fixed_points: 40 },
        { ord: 2, text: "Odpowiedź B", fixed_points: 30 },
        { ord: 3, text: "Odpowiedź C", fixed_points: 20 },
      ],
    }],
    finalAnswerPts: 15,
  });
  const contexts = [];
  let n = 0;
  const shot = async (hostPage, label) => {
    n += 1;
    await hostPage.screenshot({ path: testInfo.outputPath(`${String(n).padStart(2, "0")}-${label}.png`) });
  };

  try {
    const hostPage = await openAnon(browser, contexts, `/host2?id=${game.id}&key=${game.share_key_host}`);
    await openAnon(browser, contexts, `/display2?id=${game.id}&key=${game.share_key_display}`);
    const buzzerPage = await openAnon(browser, contexts, `/buzzer2?id=${game.id}&key=${game.share_key_buzzer}`);

    await page.goto(`/control2?id=${game.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".stepTitle")).toHaveText("Urządzenia", { timeout: 15000 });
    await shot(hostPage, "pregame-devices");

    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".stepTitle")).toHaveText("Podsumowanie", { timeout: 10000 });
    await shot(hostPage, "setup-summary");

    await page.getByRole("button", { name: "Gotowe — przejdź do rund" }).click();
    await page.getByRole("button", { name: "Rozpocznij grę" }).click();
    await expect(page.locator(".c2-stepper")).toContainText("Runda 1", { timeout: 10000 });
    await shot(hostPage, "r-roundStart-before-question");

    await page.getByRole("button", { name: "Rozpocznij rundę" }).click();
    await expect(buzzerPage.getByRole("button", { name: "Przycisk A" })).toBeEnabled({ timeout: 10000 });
    await shot(hostPage, "r-duel-before-buzz-full-answers-visible");

    await buzzerPage.getByRole("button", { name: "Przycisk A" }).click();
    await expect(page.getByRole("button", { name: "Zatwierdź: Alfa" })).toBeEnabled({ timeout: 10000 });
    await shot(hostPage, "r-duel-buzzer-pressed-before-accept");

    await clickConfirmed(page.getByRole("button", { name: "Zatwierdź: Alfa" }));
    await shot(hostPage, "r-play-after-accept-no-reveal");

    await revealAnswer(page, 1);
    await shot(hostPage, "r-play-after-1-reveal");

    await clickX(page); await clickX(page); await clickX(page); // 3x X -> auto-STEAL
    await shot(hostPage, "r-steal-active");

    await revealAnswer(page, 2); // kradzież wygrana
    await shot(hostPage, "r-steal-resolved-win");

    await page.getByRole("button", { name: "Zakończ rundę" }).click();
    await shot(hostPage, "r-reveal-odkrywanie-reszty");

    await revealAnswer(page, 3); // ostatnia -> finalizeRound() -> próg trafiony -> f_start
    await expect(page.locator(".c2-stepper")).toContainText("Finał", { timeout: 10000 });
    await shot(hostPage, "f-start-covered-blank");

    await page.getByRole("button", { name: "Rozpocznij finał" }).click();
    await expect(page.locator(".c2-stepper")).toContainText("Finał — gracz 1, wpisywanie", { timeout: 10000 });
    await shot(hostPage, "f-p1-entry-static-before-fill");

    const p1Inputs = page.locator("#app input[type=text]");
    await expect(p1Inputs).toHaveCount(5, { timeout: 10000 });
    for (let i = 0; i < 5; i++) await p1Inputs.nth(i).fill("Odp. finałowa");
    await shot(hostPage, "f-p1-entry-filled-status");

    await page.getByRole("button", { name: "Rozpocznij odliczanie (15s)" }).click();
    await page.waitForTimeout(500); // niech dzwonek dojdzie do Hosta
    await shot(hostPage, "f-p1-entry-timer-running");

    // Podgląd "peek" — symulacja gestu przesunięcia operatora na Hoście,
    // żeby pokazać, co jest POD zasłoną (jeśli w tym momencie w ogóle
    // zasłonięta — patrz shared/gameStateShape.js's default host.covered).
    const box = await hostPage.locator("#cover2").boundingBox();
    if (box) {
      await hostPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await hostPage.mouse.down();
      await hostPage.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 5 });
      await hostPage.mouse.up();
      await hostPage.waitForTimeout(200);
      await shot(hostPage, "peek-gesture-during-p1-entry");
    }

    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".c2-stepper")).toContainText("Finał — mapowanie 1/5", { timeout: 10000 });
    await page.getByRole("button", { name: "Odp. finałowa (15)" }).click();
    await shot(hostPage, "f-p1-mapping-match-selected-before-reveal");

    await armAndConfirm(page.getByRole("button", { name: "Pokaż odpowiedź" }));
    await shot(hostPage, "f-p1-mapping-after-reveal-answer");

    await armAndConfirm(page.getByRole("button", { name: "Pokaż punkty" }));
    await shot(hostPage, "f-p1-mapping-after-reveal-points");

    for (let i = 1; i < 5; i++) {
      await page.getByRole("button", { name: "Dalej" }).click();
      await expect(page.locator(".c2-stepper")).toContainText(`Finał — mapowanie ${i + 1}/5`, { timeout: 10000 });
      await page.getByRole("button", { name: "Odp. finałowa (15)" }).click();
      await armAndConfirm(page.getByRole("button", { name: "Pokaż odpowiedź" }));
      await armAndConfirm(page.getByRole("button", { name: "Pokaż punkty" }));
    }
    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".c2-stepper")).toContainText("Finał — start rundy 2", { timeout: 10000 });
    await shot(hostPage, "f-p2-start-covered-blank");

    await page.getByRole("button", { name: "Rozpocznij 2 rundę" }).click();
    await expect(page.locator(".c2-stepper")).toContainText("Finał — gracz 2, wpisywanie", { timeout: 10000 });
    const p2Inputs = page.locator("#app input[type=text]");
    await expect(p2Inputs).toHaveCount(5, { timeout: 10000 });
    for (let i = 0; i < 5; i++) await p2Inputs.nth(i).fill("Odp. finałowa");
    await shot(hostPage, "f-p2-entry-filled-status");

    await page.getByRole("button", { name: "Rozpocznij odliczanie (20s)" }).click();
    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".c2-stepper")).toContainText("Finał — mapowanie 1/5", { timeout: 10000 });
    await page.getByRole("button", { name: "Odp. finałowa (15)" }).click();
    await shot(hostPage, "f-p2-mapping-shows-player1-answer-too");

    await armAndConfirm(page.getByRole("button", { name: "Pokaż odpowiedź" }));
    await armAndConfirm(page.getByRole("button", { name: "Pokaż punkty" }));
    await shot(hostPage, "f-p2-mapping-after-reveal");

    for (let i = 1; i < 5; i++) {
      await page.getByRole("button", { name: "Dalej" }).click();
      await expect(page.locator(".c2-stepper")).toContainText(`Finał — mapowanie ${i + 1}/5`, { timeout: 10000 });
      await page.getByRole("button", { name: "Odp. finałowa (15)" }).click();
      await armAndConfirm(page.getByRole("button", { name: "Pokaż odpowiedź" }));
      await armAndConfirm(page.getByRole("button", { name: "Pokaż punkty" }));
    }
    await page.getByRole("button", { name: "Dalej" }).click();
    await expect(page.locator(".c2-stepper")).toContainText("Koniec gry", { timeout: 10000 });
    await shot(hostPage, "f-end-covered-blank");

    await deleteGame(page, game.id);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
  }

  // Celowy "fail" — patrz komentarz na górze pliku: wymusza upload
  // tests/test-results/ jako artefakt (workflow YAML uploaduje go tylko
  // `if: failure()`), bez zmiany samego workflow.
  throw new Error(`Zrzuty gotowe (${n} szt.) — to celowy fail, żeby CI wgrał artefakt ze screenshotami. Zobacz komentarz na górze pliku.`);
});
