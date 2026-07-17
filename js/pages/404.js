import { initI18n } from "../../translation/translation.js?v=v2026-07-17T09323";

(async () => {
  await initI18n({ withSwitcher: true, apply: true });
  document.documentElement.classList.remove('page-loading');
  document.querySelector('.topbar')?.classList.add('topbar-ready');
  setTimeout(() => {
    window.location.href = "https://familiada.online/";
  }, 5000);
})();
