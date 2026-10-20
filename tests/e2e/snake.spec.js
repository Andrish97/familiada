// Ukryta gra w węża: kod QR z kadru ankiet (id demo) → /go/ → /snake/,
// zdarzenia scan/enter/start/finish w bazie i postęp zalogowanego.
// Przeglądarka testu ma identyfikator „e2e-…”, więc statystyki admina go pomijają.
const { test, expect } = require("@playwright/test");
const { loginAsPooledTestUser } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");

const SITE = "https://www.familiada.online";
const DEMO_ID = "00000000-0000-4000-8000-000000000103";
const QR = `${SITE}/go/?p=anon&id=${DEMO_ID}&key=poll103KEY&lang=pl`;
const GAME = `${SITE}/snake/?qr=${DEMO_ID}&lang=pl`;
const branch = process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0";
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ context }) => {
  if (branch) await serveBranchCode(context, { pages: ["snake", "go"] });
  await context.addInitScript((id) => {
    try { if (!localStorage.getItem("familiada:snake:visitor")) localStorage.setItem("familiada:snake:visitor", id); } catch {}
  }, `e2e-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
});

// Odpowiedzi snake_log w kolejności: [{ kind, body }].
function recordSnakeLog(page) {
  const log = [];
  page.on("response", async (res) => {
    if (!res.url().includes("/rpc/snake_log")) return;
    const kind = res.request().postDataJSON()?.p_kind;
    log.push({ kind, status: res.status(), body: await res.json().catch(() => null) });
  });
  return log;
}

// Plansza z kolorów kropek dużego wyświetlacza (30x10 kafli): głowa (kafel
// z oczami), długość węża i jabłko (czerwone albo w fazie mrugnięcia).
const readBoard = (page) => page.evaluate(() => {
  const tiles = [...document.querySelectorAll("#displays > g")[0].children].slice(1);
  const out = { head: null, apple: null, length: 0 };
  tiles.forEach((tile, i) => {
    const fills = [...tile.querySelectorAll("circle")].map((c) => c.getAttribute("fill"));
    const lit = fills.filter((f) => f === "#d7ff3d").length;
    const at = { x: i % 30, y: Math.floor(i / 30) };
    if (fills.includes("#ff4040") || lit === 23) out.apple = at;
    else if (lit === 35) out.length++;
    else if (lit === 33) { out.head = at; out.length++; }
  });
  return out;
});

// Ściany są przenikalne, więc grę kończy tylko własny ogon: zjada dwa jabłka
// (5 pól) i zawraca w siebie (góra, lewo, dół). Klawiatura, przeglądarka komputerowa.
async function playUntilCrash(page) {
  const frame = page.locator("#snakeFrame");
  await expect(frame).toHaveAttribute("data-mode", "intro", { timeout: 30_000 });
  const key = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };
  const opposite = { up: "down", down: "up", left: "right", right: "left" };
  let dir = "right";
  await page.locator("body").press("ArrowUp");
  dir = "up";
  await expect(frame).toHaveAttribute("data-mode", "play");
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (Date.now() > deadline) throw new Error("bot nie zjadł dwóch jabłek w 60 s");
    const b = await readBoard(page);
    if (await frame.getAttribute("data-mode") !== "play") throw new Error("gra skończyła się przed zawróceniem");
    if (b.length >= 5 && b.head) break;
    if (!b.head || !b.apple) { await page.waitForTimeout(20); continue; }
    const want = b.apple.x !== b.head.x ? (b.apple.x > b.head.x ? "right" : "left") : (b.apple.y > b.head.y ? "down" : "up");
    const next = want === opposite[dir] ? (dir === "left" || dir === "right" ? "up" : "left") : want;
    if (next !== dir) { await page.locator("body").press(key[next]); dir = next; }
    await page.waitForTimeout(30);
  }
  // Zawrócenie w ogon: kierunek z faktycznego ruchu głowy (nie z naciśnięć --
  // ostatni skręt mógł jeszcze nie wejść), trzy skręty w kolejnych krokach;
  // gdyby wąż przeżył (np. wolne pole po ogonie), powtórka.
  const headDir = async () => {
    const a = (await readBoard(page)).head;
    let b = a;
    await expect.poll(async () => { b = (await readBoard(page)).head; return JSON.stringify(b); }, { timeout: 2_000, intervals: [15] }).not.toBe(JSON.stringify(a));
    const wrap = (v, n) => (v > 1 ? v - n : v < -1 ? v + n : v);
    const dx = wrap(b.x - a.x, 30), dy = wrap(b.y - a.y, 10);
    return dx > 0 ? "right" : dx < 0 ? "left" : dy > 0 ? "down" : "up";
  };
  for (let attempt = 0; attempt < 4 && (await frame.getAttribute("data-mode")) === "play"; attempt++) {
    const d = await headDir();
    const turns = d === "up" || d === "down" ? ["left", opposite[d], "right"] : ["up", opposite[d], "down"];
    for (const turn of turns) {
      if ((await frame.getAttribute("data-mode")) !== "play") break;
      const before = JSON.stringify((await readBoard(page)).head);
      await page.locator("body").press(key[turn]);
      await expect.poll(async () => (await frame.getAttribute("data-mode")) !== "play" || JSON.stringify((await readBoard(page)).head) !== before, { timeout: 2_000, intervals: [15] }).toBe(true);
    }
    await page.waitForTimeout(400);
  }
  await expect(frame).toHaveAttribute("data-mode", "over", { timeout: 5_000 });
}

test("wąż: kod QR z kadru prowadzi do gry, zdarzenia trafiają do bazy (bez konta)", async ({ page }) => {
  test.setTimeout(120_000);
  const log = recordSnakeLog(page);
  await page.goto(QR, { waitUntil: "domcontentloaded" });
  await page.waitForURL(GAME, { timeout: 30_000 });
  await expect(page.locator("#displays circle").first()).toBeAttached({ timeout: 30_000 });
  await expect(page.locator("#snakeProgress")).toContainText("by zapisać rekord");
  await expect(page.locator("#snakeLogin")).toBeVisible();
  await playUntilCrash(page);
  await expect.poll(() => log.map((e) => e.kind).join(","), { timeout: 15_000 }).toBe("scan,enter,start,finish");
  for (const e of log) {
    expect(e.status, `${e.kind}: HTTP`).toBe(200);
    // Treści odpowiedzi na „scan” nie da się odczytać -- /go/ od razu przechodzi do gry.
    if (e.kind !== "scan") expect(e.body, `${e.kind}: odpowiedź`).toEqual({ ok: true });
  }
});

test("wąż: „Zaloguj się” wraca do gry, zalogowany ma zapisany rekord i liczbę gier", async ({ page, context }) => {
  test.setTimeout(180_000);
  await page.goto(GAME, { waitUntil: "domcontentloaded" });
  // Adres linku uzupełnia skrypt gry po starcie (w HTML jest goły /login/).
  await expect(page.locator("#snakeLogin")).toHaveAttribute("href", /next=snake&qr=00000000-0000-4000-8000-000000000103/, { timeout: 30_000 });
  const loginHref = await page.locator("#snakeLogin").getAttribute("href");
  // Logowanie z linku w grze -- po zalogowaniu powrót do węża (mapa: wyjątek next=snake).
  // Zdarzenia liczone dopiero od powrotu (wcześniejsze „enter” było bez konta).
  let log = [];
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame() && /\/snake\//.test(frame.url()) && !log.attached) { log = recordSnakeLog(page); log.attached = true; } });
  await loginAsPooledTestUser(page, context, 0, { url: `${SITE}${loginHref}`, expectUrl: /\/snake\/\?qr=00000000-0000-4000-8000-000000000103/ });
  await expect(page.locator("#snakeProgress")).toContainText("na koncie", { timeout: 30_000 });
  await expect(page.locator("#snakeLogin")).toBeHidden();
  await expect.poll(() => log.find((e) => e.kind === "enter")?.body?.ok, { timeout: 15_000 }).toBe(true);
  const before = log.find((e) => e.kind === "enter").body.games;
  await playUntilCrash(page);
  await expect.poll(() => log.find((e) => e.kind === "finish")?.body?.games, { timeout: 15_000 }).toBe(before + 1);
  const finish = log.find((e) => e.kind === "finish").body;
  await expect(page.locator("#snakeProgress")).toContainText(`gry: ${before + 1}`);
  expect(finish.best).toBeGreaterThanOrEqual(0);
});

// Blokadę robi Worker, więc sprawdzamy ją tylko na produkcji (kod brancha
// podaje stronę z plików z pominięciem Workera).
test("wąż: bez linku z kodu QR /snake/ to zwykłe 404", async ({ page }) => {
  test.skip(branch, "blokada w Workerze -- test kontrolny na produkcji");
  for (const path of ["/snake/", "/snake/?lang=pl", "/snake/?qr=8f14e45f-ceea-467a-9c2b-2f3a1d6e5b10"]) {
    const res = await page.goto(`${SITE}${path}`, { waitUntil: "domcontentloaded" });
    expect(res.status(), path).toBe(404);
    await expect(page.locator("#snakeFrame")).toHaveCount(0);
  }
});
