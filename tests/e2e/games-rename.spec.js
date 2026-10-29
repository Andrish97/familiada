// tests/e2e/games-rename.spec.js
// Strona „Moje gry” działa pod /games/. Stary builder został usunięty.
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
    expect(html).toContain("games/js/games.js");
    expect(html).toContain("games/css/games.css");
    expect(html).not.toMatch(/builder/i);

    for (const asset of ["/games/js/games.js", "/games/js/games-import-export.js", "/games/css/games.css"]) {
      const r = await request.get(asset);
      expect(r.status(), asset).toBe(200);
    }
  });

  test("stary builder zwraca 404 bez przekierowania", async ({ request }) => {
    for (const path of ["/builder", "/builder.html", "/builder/"]) {
      const result = await request.get(path, { maxRedirects: 0 });
      expect(result.status(), path).toBe(404);
    }
  });

  test("manifest PWA startuje z /games", async ({ request }) => {
    const res = await request.get("/manifest.json");
    expect(res.status()).toBe(200);
    const m = await res.json();
    expect(m.start_url).toBe("/games/");
  });
});
