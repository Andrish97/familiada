import { initI18n } from "../../translation/translation.js?v=v2026-07-15T23571";

(async () => {
  await initI18n({ withSwitcher: true, apply: true });
  document.documentElement.classList.remove('page-loading');
  setTimeout(() => {
    window.location.href = "https://familiada.online/";
  }, 5000);
})();
