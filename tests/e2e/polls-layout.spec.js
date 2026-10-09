// tests/e2e/polls-layout.spec.js
// Układ przycisków na stronie /polls/?id=<gra> (właściciel ankiety) w każdym
// stanie ankiety i na czterech szerokościach (desktop, laptop, tablet, telefon).
// Kod strony i CSS idą z brancha (serveBranchCode), baza z produkcji.
//
// Dla każdego (stan, zakładka, viewport) zbieramy WSZYSTKIE naruszenia do jednej
// tablicy i dopiero na końcu robimy expect(...).toEqual([]), żeby jeden przebieg
// CI pokazał pełną listę problemów. Do logu trafia też zwięzły zrzut prostokątów
// wszystkich widocznych przycisków ("[polls-layout] ..."), z którego da się
// odczytać układ bez oglądania zrzutów ekranu (te też są załączone).
//
// Sprawdzane dla każdego widocznego button / .btn w main:
//  a) nie nachodzi na inny widoczny przycisk (pole przecięcia > 1 px²),
//  b) mieści się w oknie (poziomo) i w swoim rodzicu, brak poziomego scrolla strony,
//  c) tekst nie jest obcięty (scrollWidth <= clientWidth + 1),
//  d) przyciski w jednym rzędzie (ten sam rodzic, pokrywające się w pionie)
//     mają tę samą wysokość (±1 px).
//
// Stany (pasek stanu: data-state): szkic, otwarta (z głosami), zatrzymana,
// podliczanie (oba typy; tekstowa z uchwytami i polami edycji), gotowa
// (karta Udostępnianie nieaktywna). Na telefonie akcje są w dolnym pasku
// przyklejonym do ekranu, przyciski równej szerokości. Subskrybenci
// wymagają osobnego konta subskrybenta, którego tu nie zakładamy — kafelki
// subskrybentów są mierzone tylko, jeśli konto testowe już jakichś ma.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context }) => {
  await serveBranchCode(context, { pages: ["polls"] });
});

const VIEWPORTS = [
  { name: "1400x900", width: 1400, height: 900 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "390x844", width: 390, height: 844 },
];
const VOTERS = 20;
const POINTS_PLAN = [8, 6, 4, 2]; // głosy na 4 odpowiedzi
const TEXT_POOL = ["Pizza", "Kotek", "Herbata", "Rower"];

async function seedPollGame(page, type) {
  return await page.evaluate(async (type) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data: game, error } = await sb
      .from("games")
      .insert({ name: `E2E-LAYOUT-${type.toUpperCase()}-${Date.now()}`, owner_id: userData.user.id, type, status: "draft" })
      .select("id")
      .single();
    if (error) throw new Error("insert games failed: " + error.message);
    const questions = [];
    for (let ord = 1; ord <= 10; ord++) {
      const { data: q, error: qErr } = await sb
        .from("questions")
        .insert({ game_id: game.id, ord, text: `Pytanie ${ord}` })
        .select("id")
        .single();
      if (qErr) throw new Error("insert questions failed: " + qErr.message);
      const question = { id: q.id, ord, answers: [] };
      if (type === "poll_points") {
        for (let a = 1; a <= 4; a++) {
          const { data: ans, error: aErr } = await sb
            .from("answers")
            .insert({ question_id: q.id, ord: a, text: `Odp ${ord}.${a}` })
            .select("id")
            .single();
          if (aErr) throw new Error("insert answers failed: " + aErr.message);
          question.answers.push({ id: ans.id, ord: a });
        }
      }
      questions.push(question);
    }
    return { gameId: game.id, questions };
  }, type);
}

async function deleteGame(page, gameId) {
  await page.evaluate(async (id) => {
    await window.__sbClient.from("games").delete().eq("id", id);
  }, gameId);
}

async function getGameStatus(page, gameId) {
  return await page.evaluate(async (id) => {
    const { data } = await window.__sbClient.from("games").select("status").eq("id", id).single();
    return data?.status;
  }, gameId);
}

async function gotoPoll(page, gameId) {
  await page.goto(`https://www.familiada.online/polls?id=${gameId}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#pollBar")).toBeVisible({ timeout: 30000 });
}

async function bulkVote(page, rpcName, gameId, key, plans) {
  await page.evaluate(async ({ rpcName, gameId, key, plans }) => {
    const sb = window.__sbClient;
    for (let i = 0; i < plans.length; i += 10) {
      const res = await Promise.all(
        plans.slice(i, i + 10).map((v) =>
          sb.rpc(rpcName, { p_game_id: gameId, p_key: key, p_voter_token: v.token, p_items: v.items })
        )
      );
      const bad = res.find((r) => r.error);
      if (bad) throw new Error("bulk vote failed: " + bad.error.message);
    }
  }, { rpcName, gameId, key, plans });
}

function norm(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, " ");
}

function votePlans(type, questions) {
  const plans = [];
  for (let i = 0; i < VOTERS; i++) {
    let acc = 0;
    let bucket = 0;
    for (let b = 0; b < POINTS_PLAN.length; b++) {
      acc += POINTS_PLAN[b];
      if (i < acc) { bucket = b; break; }
    }
    const items = questions.map((q) =>
      type === "poll_points"
        ? { question_id: q.id, answer_id: q.answers[bucket].id }
        : { question_id: q.id, answer_raw: TEXT_POOL[bucket], answer_norm: norm(TEXT_POOL[bucket]) }
    );
    plans.push({ token: `e2e-layout-${type}-${Date.now()}-${i}`, items });
  }
  return plans;
}

/** Działa w przeglądarce: zwraca prostokąty widocznych przycisków i naruszenia. */
function measureInPage() {
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).join(".") : "";
    return `${el.tagName.toLowerCase()}${id}${id ? "" : cls}`;
  };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.display === "none" || ps.visibility === "hidden") return false;
    }
    return true;
  };
  const all = [...document.querySelectorAll("button, .btn")]
    .filter((el, i, arr) => arr.indexOf(el) === i && visible(el));
  const inMain = all.filter((el) => el.closest("main"));
  const vw = window.innerWidth;
  const boxes = all.map((el) => {
    const r = el.getBoundingClientRect();
    return { el, r, label: describe(el), text: (el.textContent || "").trim().slice(0, 24) };
  });
  const violations = [];
  const push = (kind, b, extra) => violations.push({ kind, el: b.label, text: b.text, ...extra });

  if (document.documentElement.scrollWidth > window.innerWidth) {
    violations.push({ kind: "page-hscroll", scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth });
  }

  const mainBoxes = boxes.filter((b) => inMain.includes(b.el));
  for (const b of mainBoxes) {
    const { r } = b;
    // a) nakładanie na inne widoczne przyciski
    for (const o of boxes) {
      if (o === b || o.el.contains(b.el) || b.el.contains(o.el)) continue;
      const w = Math.min(r.right, o.r.right) - Math.max(r.left, o.r.left);
      const h = Math.min(r.bottom, o.r.bottom) - Math.max(r.top, o.r.top);
      if (w > 0 && h > 0 && w * h > 1 && boxes.indexOf(o) > boxes.indexOf(b)) {
        push("overlap", b, { with: o.label, area: Math.round(w * h) });
      }
    }
    // b) okno i rodzic
    if (r.left < -1 || r.right > vw + 1) push("outside-viewport", b, { left: Math.round(r.left), right: Math.round(r.right), vw });
    const pr = b.el.parentElement?.getBoundingClientRect();
    if (pr && (r.left < pr.left - 1 || r.right > pr.right + 1)) {
      push("outside-parent", b, { left: Math.round(r.left), right: Math.round(r.right), parentLeft: Math.round(pr.left), parentRight: Math.round(pr.right) });
    }
    // c) obcięty tekst
    if (b.el.scrollWidth > b.el.clientWidth + 1) push("text-clipped", b, { scrollWidth: b.el.scrollWidth, clientWidth: b.el.clientWidth });
  }
  // d) ta sama wysokość w jednym rzędzie (ten sam rodzic, pokrywanie w pionie > 50%)
  for (let i = 0; i < mainBoxes.length; i++) {
    for (let j = i + 1; j < mainBoxes.length; j++) {
      const a = mainBoxes[i];
      const c = mainBoxes[j];
      if (a.el.parentElement !== c.el.parentElement) continue;
      if (getComputedStyle(a.el).position === "absolute" || getComputedStyle(c.el).position === "absolute") continue;
      const ov = Math.min(a.r.bottom, c.r.bottom) - Math.max(a.r.top, c.r.top);
      if (ov < Math.min(a.r.height, c.r.height) * 0.5) continue;
      if (Math.abs(a.r.height - c.r.height) > 1) {
        violations.push({ kind: "row-height", a: a.label, b: c.label, ha: Math.round(a.r.height * 10) / 10, hb: Math.round(c.r.height * 10) / 10 });
      }
    }
  }
  const dump = boxes.map((b) => [b.label, b.text, Math.round(b.r.left), Math.round(b.r.top), Math.round(b.r.width), Math.round(b.r.height)]);
  return { violations, dump };
}

async function checkState(page, testInfo, state, tabs, all) {
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const tab of tabs) {
      if (tab) {
        const tabBtn = page.locator(tab);
        if (await tabBtn.isVisible()) await tabBtn.click();
      }
      await page.waitForTimeout(250);
      const label = `${state} | ${tab || "-"} | ${vp.name}`;
      const { violations, dump } = await page.evaluate(measureInPage);
      console.log(`[polls-layout] ${label} ${JSON.stringify(dump)}`);
      if (violations.length) console.log(`[polls-layout] VIOLATIONS ${label} ${JSON.stringify(violations)}`);
      for (const v of violations) all.push({ state: label, ...v });
      const shot = await page.screenshot({ fullPage: true });
      await testInfo.attach(`${label}.png`, { body: shot, contentType: "image/png" });
    }
  }
}

async function confirmOk(page) {
  const ok = page.locator(".uni-foot .btn.gold:visible");
  await expect(ok).toBeVisible({ timeout: 10000 });
  await ok.click({ timeout: 10000 });
}

async function expectBarState(page, state) {
  await expect(page.locator("#pollBar")).toHaveAttribute("data-state", state, { timeout: 60000 });
}

async function runStates(page, context, testInfo, type) {
  const all = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  await loginAsTestUser(page, context);
  const game = await seedPollGame(page, type);
  const tag = type;
  try {
    // 1. szkic — Udostępnianie aktywne jako przygotowanie („Link pojawi się po uruchomieniu”)
    await gotoPoll(page, game.gameId);
    await expectBarState(page, "draft");
    await checkState(page, testInfo, `${tag}-draft`, ["#tabShare", "#tabResults"], all);

    // 2. otwarta, z głosami
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.locator("#btnOpenPoll").click();
    await confirmOk(page);
    await expect(page.locator("#pollLink")).not.toHaveValue("", { timeout: 15000 });
    const key = new URL(await page.inputValue("#pollLink")).searchParams.get("key");
    await bulkVote(page, type === "poll_points" ? "poll_points_vote_batch" : "poll_text_submit_batch", game.gameId, key, votePlans(type, game.questions));
    await gotoPoll(page, game.gameId);
    await expectBarState(page, "poll_open");
    await expect(page.locator("#btnStopPoll")).toBeEnabled({ timeout: 60000 });
    await checkState(page, testInfo, `${tag}-open`, ["#tabShare", "#tabResults"], all);

    // 3. zatrzymana — surowe wyniki, link nadal ważny
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.locator("#btnStopPoll").click();
    await confirmOk(page);
    await expectBarState(page, "poll_stopped");
    await expect(page.locator("#secResults")).toHaveClass(/active/);
    await expect.poll(() => getGameStatus(page, game.gameId), { timeout: 30000 }).toBe("poll_stopped");
    await expect(page.locator("#btnTallyPoll")).toBeEnabled({ timeout: 60000 });
    await checkState(page, testInfo, `${tag}-stopped`, ["#tabShare", "#tabResults"], all);

    // 4. podliczanie (te same wiersze: punkty / uchwyty i edycja)
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.locator("#tabResults").click();
    await page.locator("#btnTallyPoll").click();
    await expectBarState(page, "tally");
    await expect(page.locator("#resultsList .aList.tally").first()).toBeVisible({ timeout: 60000 });
    await expect(page.locator("#btnApproveTally")).toBeEnabled({ timeout: 60000 });
    await checkState(page, testInfo, `${tag}-tally`, [null], all);

    // 5. gotowa — Udostępnianie nieaktywne
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.locator("#btnApproveTally").click();
    await confirmOk(page);
    await expect.poll(() => getGameStatus(page, game.gameId), { timeout: 60000 }).toBe("ready");
    await gotoPoll(page, game.gameId);
    await expectBarState(page, "ready");
    await expect(page.locator("#tabShare")).toBeDisabled();
    await checkState(page, testInfo, `${tag}-ready`, ["#tabResults"], all);
  } finally {
    await deleteGame(page, game.gameId);
  }
  expect(all).toEqual([]);
}

test("układ przycisków: ankieta punktowa (szkic, otwarta, zatrzymana, podliczanie, gotowa)", async ({ page, context }, testInfo) => {
  test.setTimeout(420_000);
  await runStates(page, context, testInfo, "poll_points");
});

test("układ przycisków: ankieta tekstowa (szkic, otwarta, zatrzymana, podliczanie, gotowa)", async ({ page, context }, testInfo) => {
  test.setTimeout(420_000);
  await runStates(page, context, testInfo, "poll_text");
});
