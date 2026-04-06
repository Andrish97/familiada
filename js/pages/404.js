import { initI18n } from "../../translation/translation.js?v=v2026-04-06T06132";

(async () => {
  await initI18n({ withSwitcher: true, apply: true });
  setTimeout(() => {
    window.location.href = "https://familiada.online/";
  }, 5000);
})();
