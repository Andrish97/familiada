// tests/e2e/games-rename.spec.js
// Strona „Moje gry” zmieniła adres z /builder na /games. Stary adres
// (zakładki, skróty PWA sprzed zmiany, linki w starych e-mailach) musi
// nadal działać: builder.html przekierowuje na /games, zachowując
// ?parametry i #hash. Sprawdza też, że /games i jego zasoby są serwowane.
//
// Same żądania publiczne, bez logowania. Uwaga: jak cały zestaw E2E, działa
// na PRODUKCJI — ma sens dopiero po wdrożeniu zmiany na main:
//   cd tests && npx playwright test e2e/games-rename.spec.js

const { test, expect } = require("@playwright/test");

test.describe("zmiana nazwy builder → games", () => {
  test("/games serwuje stronę listy gier z games.js i games.css", async ({ request }) => {
    const res = await request.get("/games");
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("js/pages/games.js");
    expect(html).toContain("css/games.css");
    expect(html).not.toMatch(/builder/i);

    for (const asset of ["/js/pages/games.js", "/js/pages/games-import-export.js", "/css/games.css"]) {
      const r = await request.get(asset);
      expect(r.status(), asset).toBe(200);
    }
  });

  test("stary adres /builder przekierowuje na /games z ?query i #hash", async ({ page }) => {
    const visited = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) visited.push(frame.url());
    });
    await page.goto("/builder?tab=market&lang=en#top", { waitUntil: "commit" });
    // /games bez zalogowania może od razu przejść dalej (np. na logowanie),
    // więc sprawdzamy, czy /games z parametrami pojawił się w historii nawigacji.
    await expect.poll(
      () => visited.some((u) => new URL(u).pathname === "/games" && u.includes("?tab=market&lang=en") && u.endsWith("#top")),
      { timeout: 15000, message: `odwiedzone: ${visited.join(" → ")}` },
    ).toBe(true);
  });

  test("manifest PWA startuje z /games", async ({ request }) => {
    const res = await request.get("/manifest.json");
    expect(res.status()).toBe(200);
    const m = await res.json();
    expect(m.start_url).toBe("/games");
  });
});
