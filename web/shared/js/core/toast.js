// Jeden wspólny dymek komunikatu po akcji (docs/ujednolicenie-wygladu.md,
// „Komunikaty po akcji”). Jeden kontener #appToast dopięty do body; nowy
// komunikat zastępuje poprzedni. Zwykły znika sam po ok. 3 s, błąd zostaje,
// aż użytkownik go kliknie. Używać tylko tam, gdzie efekt akcji nie jest
// widoczny sam (wysłany mail, skopiowany link, zapis bez zmiany na ekranie).

export const TOAST_DEFAULT_MS = 3000;

let box = null;
let textEl = null;
let timer = null;
let hideTimer = null;

function ensureBox() {
  if (box && box.isConnected) return box;
  box = document.createElement("div");
  box.id = "appToast";
  box.className = "app-toast";
  textEl = document.createElement("span");
  textEl.className = "app-toast-text";
  const close = document.createElement("span");
  close.className = "app-toast-close";
  close.setAttribute("aria-hidden", "true");
  close.textContent = "✕";
  box.append(textEl, close);
  box.addEventListener("click", () => hideToast());
  document.body.appendChild(box);
  return box;
}

export function hideToast() {
  clearTimeout(timer);
  timer = null;
  if (!box) return;
  box.classList.remove("show");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (box && !box.classList.contains("show")) textEl.textContent = ""; }, 250);
}

export function toast(message, { kind = "info", ms = TOAST_DEFAULT_MS } = {}) {
  const text = String(message ?? "").trim();
  if (!text || typeof document === "undefined") return;
  const el = ensureBox();
  const isError = kind === "error";
  clearTimeout(timer);
  clearTimeout(hideTimer);
  textEl.textContent = text;
  el.classList.toggle("error", isError);
  el.setAttribute("role", isError ? "alert" : "status");
  el.setAttribute("aria-live", isError ? "assertive" : "polite");
  // wymuszenie ponownego odtworzenia przejścia przy zastąpieniu komunikatu
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  timer = isError ? null : setTimeout(hideToast, ms);
}
