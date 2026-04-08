import { initI18n } from "../../translation/translation.js?v=v2026-04-08T02172";

(async () => {
  await initI18n({ withSwitcher: true, apply: true });
  setTimeout(() => {
    window.location.href = "https://familiada.online/";
  }, 5000);
})();
