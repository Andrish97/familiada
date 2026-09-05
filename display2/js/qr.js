// display2/js/qr.js
// Napisane od zera dla v2 (nie kopia display/js/qr.js) — i tak jest to
// prosta, generyczna funkcja URL->obrazek QR przez zewnętrzne API, bez
// żadnego związku z komendami. Różnica od dzisiejszego: detail.display.mode
// niesie JEDEN qrTarget na raz ("host"|"buzzer"), nie dwie karty naraz —
// dokładnie tak, jak faktycznie przebiega parowanie w D1 (operator pokazuje
// kod dla jednego urządzenia na raz).

function mkQrImageUrl(url, size = 420) {
  const u = new URL("https://api.qrserver.com/v1/create-qr-code/");
  u.searchParams.set("size", `${size}x${size}`);
  u.searchParams.set("data", url);
  u.searchParams.set("margin", "10");
  return u.toString();
}

export function createQrOverlay({ overlayEl, imgEl }) {
  function show(url) {
    if (imgEl) imgEl.src = mkQrImageUrl(url);
    overlayEl?.classList.remove("hidden");
  }
  function hide() {
    overlayEl?.classList.add("hidden");
    if (imgEl) imgEl.removeAttribute("src");
  }
  return { show, hide };
}
