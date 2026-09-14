// tests/e2e/static-assets-routing.spec.js
// Weryfikuje trzy rzeczy wprowadzone/naprawione w Cloudflare Workerze
// (cloudflare/maintenance-worker/src/index.js) przy okazji ograniczania
// zużycia limitu KV/requestów Workera:
//
// 1) Statyczne assety (dopasowane po rozszerzeniu, nie po folderze) mają
//    teraz realny Cache-Control zamiast wymuszanego wszędzie "no-store" —
//    wersjonowane (?v=...) dostają długi "immutable", niewersjonowane
//    krótki fallback.
// 2) /maintenance-state.json i /sitemap.xml MUSZĄ zostać dynamiczne — nie
//    wolno im wpaść w bramkę assetów (patrz DYNAMIC_JSON_PATHS w Workerze).
// 3) Przy okazji ten plik jest testem regresji na osobnym, znalezionym
//    tego samego dnia bugu: oba te endpointy miały w kodzie literał
//    `url.pathname === "/sitemap.xml?v=..."` — url.pathname z definicji
//    nigdy nie zawiera "?...", więc warunek nigdy nie był prawdziwy.
//    Realny skutek: /sitemap.xml po cichu serwował statyczny plik zapasowy
//    z 3 adresami zamiast pełnej listy gier z marketplace (ten sam bug co
//    kiedyś już raz "naprawiono" — auto-wersjoner w scripts/version-assets.js
//    przy każdym deployu na nowo dopisywał "?v=..." do tego literału),
//    a /maintenance-state.json zwracał prawdziwe 404 zamiast stanu z KV.
//
// Same żądania publiczne (GET, bez logowania) — nie potrzebuje żadnych
// sekretów. Można odpalić samodzielnie, lokalnie, bez reszty zestawu E2E:
//   cd tests && npx playwright test e2e/static-assets-routing.spec.js

const { test, expect } = require("@playwright/test");

test.describe("routing Workera: statyczne assety vs. endpointy dynamiczne", () => {
  test("/maintenance-state.json zwraca żywy stan z KV, nie 404 ani cache", async ({ request }) => {
    const res = await request.get("/maintenance-state.json");

    expect(res.status(), "404 = wpadło w bramkę assetów zamiast do getState()").toBe(200);

    const ct = res.headers()["content-type"] || "";
    expect(ct).toContain("application/json");

    // Musi zostać "no-store" — to jest sygnał, że NIE przeszło przez
    // serveStaticAsset() (który ustawiłby immutable/max-age), tylko przez
    // normalną ścieżkę json() w Workerze.
    expect(res.headers()["cache-control"]).toBe("no-store");

    const body = await res.json();
    expect(typeof body.enabled).toBe("boolean");
    expect(body).toHaveProperty("mode");
  });

  test("/sitemap.xml jest dynamiczny (lista gier), nie statyczny fallback z 3 adresami", async ({ request }) => {
    const res = await request.get("/sitemap.xml");

    expect(res.status()).toBe(200);

    const ct = res.headers()["content-type"] || "";
    expect(ct).toContain("xml");

    const body = await res.text();

    // Statyczny plik zapasowy (sitemap.xml w repo) ma ten komentarz na
    // starcie i xmlns:xhtml (alternate-language linki) — dynamiczna wersja
    // generowana przez serveDynamicSitemap() nie ma żadnego z nich.
    expect(body).not.toContain("fallback only");
    expect(body).not.toContain("xmlns:xhtml");

    // Sygnatura Cache-Control ustawiana wyłącznie przez serveDynamicSitemap()
    // — potwierdza, że to Worker wygenerował odpowiedź, nie origin.
    expect(res.headers()["cache-control"]).toContain("s-maxage=3600");

    expect(body).toContain("<urlset");
    expect(body).toContain("https://www.familiada.online/marketplace");
  });

  test("statyczny asset (css) dostaje realny Cache-Control zamiast no-store", async ({ request }) => {
    const bare = await request.get("/css/base.css");
    expect(bare.status()).toBe(200);
    expect(bare.headers()["content-type"] || "").toContain("css");
    // Bez ?v= dostaje ostrożny, krótki TTL — ale musi być cache'owalny,
    // nie "no-store" jak wcześniej wszystko w tym Workerze.
    expect(bare.headers()["cache-control"]).not.toBe("no-store");
    expect(bare.headers()["cache-control"]).toContain("max-age=600");

    const versioned = await request.get("/css/base.css?v=e2e-test-marker");
    expect(versioned.status()).toBe(200);
    // Z ?v= (jak w realnych referencjach z HTML) — długi, "immutable" TTL,
    // bo URL jest unikalny per deploy.
    expect(versioned.headers()["cache-control"]).toContain("immutable");
    expect(versioned.headers()["cache-control"]).toContain("max-age=31536000");
  });
});
