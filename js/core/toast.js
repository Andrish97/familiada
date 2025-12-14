export function toast(msg, ms = 1800) {
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.left = "50%";
  el.style.bottom = "18px";
  el.style.transform = "translateX(-50%)";
  el.style.background = "rgba(0,0,0,.75)";
  el.style.border = "1px solid rgba(255,255,255,.18)";
  el.style.color = "#fff";
  el.style.padding = "10px 12px";
  el.style.borderRadius = "14px";
  el.style.zIndex = "9999";
  el.style.fontFamily = "system-ui";
  el.style.boxShadow = "0 18px 40px rgba(0,0,0,.45)";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

