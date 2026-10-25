const { IDS } = require("../data/demo.cjs");
const themes = ["modern", "neon", "studio", "gold"];

module.exports = themes.flatMap((theme) => [
  {
    id: `display-theme-${theme}`, category: "play", title: `Wyświetlacz — ${theme}`,
    path: "/control/display/?preview=1", devices: ["desktop-1400"],
    sources: ["web/shared/js/display/", "web/shared/data/display-themes.json"],
    ready: () => document.readyState === "complete",
    steps: [async (view, { lang }) => {
      const { buildGameState } = await import("../data/game-state.mjs");
      const row = buildGameState(lang, "round");
      row.detail.display.theme = theme;
      await view.waitForTimeout(1200);
      await view.evaluate(row => window.postMessage({ type: "familiada:preview-row", row }, "*"), row);
      await view.waitForSelector(`#baseSvg[data-display-theme="${theme}"]`);
      await view.waitForSelector("#gameScreen:not(.hidden)");
      await view.waitForTimeout(800);
    }],
  },
  {
    id: `settings-theme-${theme}`, category: "play", title: `Ustawienia motywu — ${theme}`,
    path: `/games/settings/?id=${IDS.game}`, devices: ["desktop-1400", "phone"],
    sources: ["web/shared/js/display/", "web/shared/data/display-themes.json"],
    ready: "#gsContentInner",
    db: db => {
      const game = db.tables.games.find(g => g.id === IDS.game);
      game.settings.display = { ...game.settings.display, theme };
    },
    steps: [async view => {
      const toggle = view.locator("#gsSidebarToggle");
      if (await toggle.isVisible()) await toggle.click();
      await view.locator('.gs-sidebar-item[data-cat="display"]').click();
      await view.locator("#gsThemeSelect .ui-select-btn").click();
    }],
  },
]);
