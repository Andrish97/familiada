// tests/playwright.config.js
// @ts-check
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 90_000, // logowanie gościa (auth signup + seed demo) bywa wolne w CI
  retries: 1,
  // game-deletion i restore-demo logują się na to samo TEST_USERNAME —
  // przy domyślnej równoległości (2 workery) dwa jednoczesne logowania na
  // jedno konto powodowały niedeterministyczne błędy (raz zawieszony modal
  // potwierdzenia, raz timeout samego logowania). Testy w tym repo i tak
  // dotykają współdzielonego stanu na produkcji, więc szeregowe wykonanie
  // jest właściwym trade-offem, nie tylko obejściem.
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "https://www.familiada.online",
    screenshot: "only-on-failure",
    trace: "off", // celowo wyłączone — trace potrafi nagrać nagłówki żądań (patrz tests/README.md)
    // video to samo nagranie ekranu (bez sieci/nagłówków, w odróżnieniu od
    // trace) -- bezpieczne, włączone tylko dla failujących testów, żeby
    // zdiagnozować zawieszenia D&D w CI bez realnego podglądu (patrz
    // Runda 11, docs/plan-testy-i-poprawki.md)
    video: "retain-on-failure",
  },
});
