export function guardDesktopOnly({
  minWidth = 980,
  message = "Ta strona działa tylko na komputerze."
} = {}) {

  const mq = window.matchMedia(`(max-width:${minWidth}px)`);

  function ensureOverlay() {
    let overlay = document.getElementById("deviceGuard");

    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "deviceGuard";

    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      inset: "0",
      background: "rgba(0,0,0,.92)",
      color: "#fff",
      zIndex: "2147483647", // maksymalny bezpieczny
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
      boxSizing: "border-box",
      overscrollBehavior: "none"
    });

    overlay.innerHTML = `
      <div id="deviceGuardBox"></div>
    `;

    const box = overlay.firstElementChild;

    Object.assign(box.style, {
      width: "100%",
      maxWidth: "100vw",
      boxSizing: "border-box",
      background: "rgba(255,255,255,.06)",
      border: "1px solid rgba(255,255,255,.18)",
      borderRadius: "18px",
      padding: "18px",
      textAlign: "left"
    });

    box.innerHTML = `
      <div style="
        font-weight:900;
        letter-spacing:.08em;
        text-transform:uppercase;
        margin-bottom:10px;
      ">
        Niedostępne na telefonie
      </div>
      <div style="
        opacity:.9;
        line-height:1.4;
        word-wrap:break-word;
      ">
        ${message}
      </div>
    `;

    /* ⬇️ ważne: do <html>, nie do body */
    document.documentElement.appendChild(overlay);

    return overlay;
  }

  function apply() {
    const overlay = ensureOverlay();
    overlay.style.display = mq.matches ? "flex" : "none";

    if (mq.matches) {
      // blokada scrolla niezależnie od stylów strony
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }
  }

  mq.addEventListener?.("change", apply);
  window.addEventListener("resize", apply);

  apply();
}
