import { FULLSCREEN_ICON, FULLSCREEN_EXIT_ICON } from "../../js/core/icons.js?v=v2026-09-21T08065";

export const initFullscreenButton = () => {
  const fsBtn = document.getElementById("fsBtn");
  if (!fsBtn) return;

  const sync = () => {
    const on = !!document.fullscreenElement;
    fsBtn.innerHTML = on ? FULLSCREEN_EXIT_ICON : FULLSCREEN_ICON;
    fsBtn.classList.toggle("on", on);
    fsBtn.title = on ? "Wyjście z pełnego ekranu" : "Pełny ekran";
  };

  fsBtn.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (e) {
      console.warn("Fullscreen error:", e);
    }
    sync();
  });

  document.addEventListener("fullscreenchange", sync);
  sync();
};
