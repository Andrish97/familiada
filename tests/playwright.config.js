// tests/playwright.config.js
// @ts-check
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 90_000, // logowanie gościa (auth signup + seed demo) bywa wolne w CI
  retries: 0, // tymczasowo 0 na czas diagnozy błędu modala (przywrócić do 1 potem)
  reporter: [["list"]],
  use: {
    baseURL: "https://www.familiada.online",
    screenshot: "only-on-failure",
    trace: "off", // celowo wyłączone — trace potrafi nagrać nagłówki żądań (patrz tests/README.md)
    video: "off",
  },
});
