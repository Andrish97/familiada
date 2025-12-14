export function buildUrl(page, params) {
  const u = new URL(page, location.origin + location.pathname.replace(/\/[^/]*$/, "/"));
  Object.entries(params).forEach(([k,v]) => u.searchParams.set(k, String(v)));
  return u.toString();
}

export async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text);
}

export function showQR({ title="QR", text="", url="" }) {
  const wrap = document.createElement("div");
  wrap.style.position = "fixed";
  wrap.style.inset = "0";
  wrap.style.background = "rgba(0,0,0,.75)";
  wrap.style.display = "grid";
  wrap.style.placeItems = "center";
  wrap.style.zIndex = "9999";

  wrap.innerHTML = `
    <div style="width:min(520px,92vw);background:#0b1226;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:16px">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
        <div style="font-weight:900;letter-spacing:.08em;text-transform:uppercase">${title}</div>
        <button data-x style="border:none;background:transparent;color:#fff;font-size:18px;cursor:pointer">✕</button>
      </div>
      <div style="opacity:.85;margin:8px 0 12px">${text}</div>
      <div id="qrBox" style="display:grid;place-items:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:14px"></div>
      <div style="margin-top:10px;word-break:break-all;opacity:.75;font-size:12px">${url}</div>
    </div>
  `;

  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target?.dataset?.x !== undefined) wrap.remove();
  });

  document.body.appendChild(wrap);

  // QRCode z CDN (w html dodamy skrypt)
  // eslint-disable-next-line no-undef
  new QRCode(wrap.querySelector("#qrBox"), { text: url, width: 240, height: 240 });
}

