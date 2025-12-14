export function confirmModal({ title="Potwierdź", text="Na pewno?", okText="Tak", cancelText="Nie" } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.style.position = "fixed";
    wrap.style.inset = "0";
    wrap.style.background = "rgba(0,0,0,.7)";
    wrap.style.display = "grid";
    wrap.style.placeItems = "center";
    wrap.style.zIndex = "9999";

    wrap.innerHTML = `
      <div style="width:min(520px,92vw);background:#0b1226;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:16px;box-shadow:0 24px 60px rgba(0,0,0,.6)">
        <div style="font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">${title}</div>
        <div style="opacity:.9;line-height:1.35;margin-bottom:14px">${text}</div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button data-cancel style="padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;cursor:pointer">${cancelText}</button>
          <button data-ok style="padding:10px 12px;border-radius:12px;border:1px solid rgba(255,220,120,.35);background:rgba(255,220,120,.18);color:#fff;font-weight:900;cursor:pointer">${okText}</button>
        </div>
      </div>
    `;

    const done = (v) => { wrap.remove(); resolve(v); };
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) done(false);
      if (e.target?.dataset?.cancel !== undefined) done(false);
      if (e.target?.dataset?.ok !== undefined) done(true);
    });
    document.body.appendChild(wrap);
  });
}

