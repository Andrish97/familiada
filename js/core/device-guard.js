export function guardDesktopOnly({ minWidth = 980, message = "Ta strona działa tylko na komputerze." } = {}) {
  const mq = window.matchMedia(`(max-width:${minWidth}px)`);

  function apply() {
    let overlay = document.getElementById("deviceGuard");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "deviceGuard";
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.background = "rgba(0,0,0,.92)";
      overlay.style.color = "white";
      overlay.style.zIndex = "9999";
      overlay.style.display = "none";
      overlay.style.padding = "24px";
      overlay.style.fontFamily = "system-ui";
      overlay.innerHTML = `
        <div style="max-width:700px;margin:10vh auto;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);border-radius:18px;padding:18px">
          <div style="font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px">Niedostępne na telefonie</div>
          <div style="opacity:.9;line-height:1.4">${message}</div>
        </div>`;
      document.body.appendChild(overlay);
    }
    overlay.style.display = mq.matches ? "block" : "none";
  }

  mq.addEventListener?.("change", apply);
  window.addEventListener("resize", apply);
  apply();
}

