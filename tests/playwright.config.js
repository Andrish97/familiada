// tests/playwright.config.js
// @ts-check
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0, // tymczasowo 0 na czas diagnozy — szybszy feedback loop
  reporter: [["list"]],
  use: {
    baseURL: "https://www.familiada.online",
    screenshot: "only-on-failure",
    trace: "off", // celowo wyłączone — trace potrafi nagrać nagłówki żądań (patrz tests/README.md)
    video: "off",
  },
});
