import { initI18n } from "../../translation/translation.js";

(async () => {
  await initI18n({ withSwitcher: true, apply: true });
  setTimeout(() => {
    window.location.href = "/";
  }, 2000);
})();
