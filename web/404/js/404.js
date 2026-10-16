import { initI18n, withLangParam } from "../../shared/translation/translation.js?v=v2026-10-15T22404";

(async () => {
  try {
    await initI18n({ withSwitcher: true, apply: true });
  } catch (err) {
    console.error("[404] i18n nieaktywny:", err);
  } finally {
    document.documentElement.classList.remove('page-loading');
    document.querySelector('.topbar')?.classList.add('topbar-ready');
  }
  document.querySelector("main[data-skel-step]")?.classList.add("skel-step-ready");
  setTimeout(() => {
    window.location.href = withLangParam("/");
  }, 5000);
})();
