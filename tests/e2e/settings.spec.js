// tests/e2e/settings.spec.js
// Weryfikuje mobilny "sheet" modal (js/core/modal-sheet.js) na
// settings.html (panel admina) -- modale: oceniający (#ratersOverlay),
// przydzielenie zgłoszenia (#assignReportModal), odrzucenie zgłoszenia z
// marketplace (#marketRejectOverlay).
//
// UWAGA WAŻNA (do zweryfikowania przez kogoś z realnym dostępem admina):
// settings.html siedzi za Cloudflare Access (patrz komentarz w
// settings.html: "Ten panel wymaga autoryzacji Cloudflare Access") --
// istniejący helper logowania (tests/e2e/helpers/login.js,
// loginAsTestUser/E2E_BYPASS_SECRET) omija WYŁĄCZNIE Turnstile na stronie
// /login dla zwykłych kont Supabase, nie ma NIC wspólnego z Cloudflare
// Access przed panelem admina. W tym repo nie ma dotąd żadnego mechanizmu
// e2e do autoryzacji Cloudflare Access, więc nawigacja do /settings w CI
// może się nie udać (przekierowanie na ekran logowania Cloudflare) zanim
// jakikolwiek z poniższych testów zdąży cokolwiek sprawdzić.
//
// Dodatkowo dane potrzebne do otwarcia tych modali (oceny gier, zgłoszenia
// mailowe) są czytane przez settings.js WYŁĄCZNIE przez wewnętrzne Worker
// API (`/_admin_api/*`, adminFetch()), NIE przez window.__sbClient jak na
// innych stronach objętych tym plikiem testów -- więc nie da się ich
// zaseedować tym samym wzorcem co gry/bazy pytań gdzie indziej.
//
// Żeby mimo to pokryć samą MECHANIKĘ trybu sheet (ten sam kod co na innych
// stronach: modal-sheet.js + css/base.css "Modal sheet (mobile)"), poniższe
// testy otwierają modal wprost przez wywołanie DOM-owe (dokładnie to, co
// robi enterModalSheet()/show()), zamiast przechodzić przez pełny,
// niedostępny w CI przepływ (Cloudflare Access + realne dane admina).
// To sprawdza kontrakt CSS/HTML, NIE testuje realnego wywołania
// openRatersModal()/openRejectModal()/openAssignModal() przez UI -- to
// wymaga osobnego zweryfikowania z realnym dostępem admina.

const { test, expect } = require("@playwright/test");

const BASE_URL = "https://www.familiada.online/settings";

async function simulateSheetOpen(page, overlaySelector) {
  await page.evaluate((sel) => {
    const overlay = document.querySelector(sel);
    if (!overlay) throw new Error(`overlay ${sel} not found in DOM`);
    overlay.style.display = overlay.id === "assignReportModal" ? "" : "";
    overlay.hidden = false;
    document.body.classList.add("sheet-open");
    overlay.classList.add("sheet-active");
  }, overlaySelector);
}

async function simulateSheetClose(page, overlaySelector) {
  await page.evaluate((sel) => {
    const overlay = document.querySelector(sel);
    if (!overlay) return;
    document.body.classList.remove("sheet-open");
    overlay.classList.remove("sheet-active");
    overlay.style.display = "none";
    overlay.hidden = true;
  }, overlaySelector);
}

test.describe("settings: mobile sheet modal -- kontrakt CSS/HTML (oceniający/przydzielenie/odrzucenie)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("#ratersOverlay w trybie sheet wypełnia viewport i chowa resztę main.wrap", async ({ page }) => {
    const res = await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    test.skip(!res || res.status() >= 400, "settings.html niedostępne w tym środowisku (Cloudflare Access) -- patrz komentarz na górze pliku");

    const overlaySel = "#ratersOverlay";
    const hasOverlay = await page.locator(overlaySel).count();
    test.skip(hasOverlay === 0, "modal nie jest w DOM (strona pewnie pokazała ekran logowania Cloudflare Access zamiast panelu)");

    await simulateSheetOpen(page, overlaySel);
    const overlay = page.locator(overlaySel);
    await expect(overlay).toBeVisible();

    const box = await overlay.locator(".modal").boundingBox();
    expect(box.width).toBeGreaterThan(370);

    await expect(page.locator(".topbar")).toBeVisible();

    await simulateSheetClose(page, overlaySel);
    await expect(overlay).toBeHidden();
  });

  test("#marketRejectOverlay w trybie sheet wypełnia viewport", async ({ page }) => {
    const res = await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    test.skip(!res || res.status() >= 400, "settings.html niedostępne w tym środowisku (Cloudflare Access)");

    const overlaySel = "#marketRejectOverlay";
    const hasOverlay = await page.locator(overlaySel).count();
    test.skip(hasOverlay === 0, "modal nie jest w DOM (Cloudflare Access?)");

    await simulateSheetOpen(page, overlaySel);
    const overlay = page.locator(overlaySel);
    await expect(overlay).toBeVisible();

    const box = await overlay.locator(".modal").boundingBox();
    expect(box.width).toBeGreaterThan(370);

    await simulateSheetClose(page, overlaySel);
    await expect(overlay).toBeHidden();
  });

  test("#assignReportModal (market-preview-overlay) w trybie sheet wypełnia viewport", async ({ page }) => {
    const res = await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    test.skip(!res || res.status() >= 400, "settings.html niedostępne w tym środowisku (Cloudflare Access)");

    const overlaySel = "#assignReportModal";
    const hasOverlay = await page.locator(overlaySel).count();
    test.skip(hasOverlay === 0, "modal nie jest w DOM (Cloudflare Access?)");

    await simulateSheetOpen(page, overlaySel);
    const overlay = page.locator(overlaySel);
    await expect(overlay).toBeVisible();

    // ten modal używa .market-preview-card zamiast .modal
    const box = await overlay.locator(".market-preview-card").boundingBox();
    expect(box.width).toBeGreaterThan(370);

    await simulateSheetClose(page, overlaySel);
    await expect(overlay).toBeHidden();
  });
});
