export const initFullscreenButton = () => {
  const fsBtn = document.getElementById("fsBtn");
  if (!fsBtn) return;

  const ICON_ENTER = "▢";
  const ICON_EXIT  = "⧉";

  const sync = () => {
    const on = !!document.fullscreenElement;
    fsBtn.textContent = on ? ICON_EXIT : ICON_ENTER;
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
