import { sb } from "../../../shared/js/core/supabase.js?v=v2026-10-05T22313";
const form = document.getElementById("tvConnectForm");
const input = document.getElementById("tvCode");
const button = document.getElementById("tvConnect");
const message = document.getElementById("tvMessage");
let pending = false;
input.focus();
input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, "").slice(0, 6); });
document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") { event.preventDefault(); button.focus(); }
  if (event.key === "ArrowUp") { event.preventDefault(); input.focus(); }
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (pending) return;
  const code = input.value.trim();
  if (!/^\d{6}$/.test(code)) { message.textContent = "Wpisz 6-cyfrowy kod Wyświetlacza lub ekranu QR ankiety."; input.focus(); return; }
  pending = true;
  button.disabled = true;
  message.textContent = "Sprawdzanie kodu…";
  try {
    const { data, error } = await sb().rpc("resolve_device_connect_code", { p_code: code });
    if (error || !data?.ok) { message.textContent = "Kod jest nieprawidłowy lub wygasł. Sprawdź kod w panelu sterowania."; return; }
    if (!["display", "poll_qr"].includes(data.device_type)) { message.textContent = "Ten kod nie jest kodem wyświetlacza. Wpisz kod Wyświetlacza z panelu sterowania lub ekranu QR z ankiety."; return; }
    if (!data.game_id || !data.share_key) throw new Error("missing display credentials");
    const target = new URL(data.device_type === "poll_qr" ? "/poll-qr/" : "/display/", location.origin);
    target.searchParams.set("id", data.game_id);
    target.searchParams.set("key", data.share_key);
    location.replace(target.href);
  } catch {
    message.textContent = "Nie udało się połączyć. Sprawdź połączenie internetowe i spróbuj ponownie.";
  } finally {
    pending = false;
    button.disabled = false;
  }
});
