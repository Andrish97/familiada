// Galeria E20 (E25): przygotowanie wypożyczonego konta `dedicated: "e20-gallery"`
// -- logowanie, odnowienie materiałów Demo przez stronę Konto, odczyt
// identyfikatorów danych do zrzutów i zapis stanu sesji. Wołane z beforeAll
// speca, więc konto jest wypożyczone przez cały przebieg galerii.
const { serveBranchCode, serveBranchLoginHtml } = require("./branch-code");
const { readE20GalleryData } = require("./e20-gallery-data");

const PAGES = [
  "index", "account", "bases", "bases/explorer", "connect", "connect/tv",
  "control", "games",
  "games/editor", "games/settings", "friends", "go", "login", "login/confirm",
  "login/reset", "logos", "logos/editor/draw", "logos/editor/image", "logos/editor/text",
  "mails", "maintenance", "manual", "marketplace", "polls", "polls/vote/points",
  "polls/vote/qr", "polls/vote/text", "privacy", "subscribers", "tasks", "404",
];

async function prepareE20Gallery(browser, identity, loginAs) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  try {
    await serveBranchCode(context, { pages: PAGES });
    await context.route(/^https:\/\/www\.familijna\.app\/login\/?(?:\?.*)?$/, serveBranchLoginHtml);
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    page.setDefaultNavigationTimeout(20_000);
    // Pytanie o ocenę jest niezwiązane z widokami E20 i blokuje każdy
    // prywatny route, dopóki nie dostanie odpowiedzi. Pozostawiamy jego
    // standardowe wyciszenie dla kont testowych, jak w pozostałych testach.
    await loginAs(page, context, identity);
    // Odnów prawdziwe materiały Demo przez stronę Konto, zanim wybierzemy
    // istniejące rekordy do zrzutów; nie tworzymy atrap w teście.
    await page.goto("https://www.familijna.app/account/?lang=pl", { waitUntil: "domcontentloaded" });
    const restoreDemo = page.locator("#demoRestoreBtn");
    await restoreDemo.waitFor({ state: "visible", timeout: 20_000 });
    await restoreDemo.click();
    const restoreConfirmation = page.locator(".uni-modal:visible");
    await restoreConfirmation.waitFor({ state: "visible", timeout: 10_000 });
    await restoreConfirmation.getByRole("button", { name: "Przywróć", exact: true }).click();
    await page.waitForURL(/\/games\//, { timeout: 20_000 });
    await page.waitForFunction(() => Boolean(window.__sbClient), null, { timeout: 20_000 });
    const data = await readE20GalleryData(page);
    const pollSummary = Object.entries(data.polls)
      .map(([slot, poll]) => `${slot}=${poll ? `${poll.name} [${poll.status}]` : "brak"}`)
      .join("; ");
    console.log(`[e20-gallery] ${identity.name}: ankiety galerii: ${pollSummary}.`);
    const authState = await context.storageState();
    return { data, authState };
  } finally {
    await context.close();
  }
}

module.exports = { prepareE20Gallery };
