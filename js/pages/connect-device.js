// js/pages/connect-device.js
// Strona "Podłącz urządzenie" – dostępna wszędzie.
// Mobile/tablet: może podłączyć host/buzzer + skanować QR
// Desktop/TV: może podłączyć display + skanować QR

import { sb } from "../core/supabase.js";
import { requireAuth } from "../core/auth.js";
import { isGuestUser } from "../core/guest-mode.js";
import { isMobileDevice } from "../core/pwa.js";
import { initI18n, t, withLangParam } from "../../translation/translation.js";
import "../core/contact-modal.js";

initI18n({ withSwitcher: false });

const who = document.getElementById("who");
const whoStatic = document.getElementById("whoStatic");
const btnBack = document.getElementById("btnBack");
const btnAccount = document.getElementById("btnAccount");
const btnLogout = document.getElementById("btnLogout");
const sharedDevicesList = document.getElementById("sharedDevicesList");
const msg = document.getElementById("msg");
const scanSection = document.getElementById("scanSection");
const btnScanQr = document.getElementById("btnScanQr");
const scanMsg = document.getElementById("scanMsg");
const pageHint = document.getElementById("pageHint");

function setMsg(text) { if (msg) msg.textContent = text || ""; }

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function deviceTypeLabel(type) {
  if (type === "host") return t("connectDevice.deviceType.host") || "Prowadzący";
  if (type === "buzzer") return t("connectDevice.deviceType.buzzer") || "Buzzer";
  if (type === "display") return t("connectDevice.deviceType.display") || "Wyświetlacz";
  return type;
}

function deviceTypeEmoji(type) {
  if (type === "host") return "🎤";
  if (type === "buzzer") return "🔔";
  if (type === "display") return "📺";
  return "📱";
}

// Czy to urządzenie mobilne/tablet (może podłączyć host/buzzer)
const _isMobile = isMobileDevice();

async function renderSharedDevices() {
  const { data, error } = await sb().rpc("list_shared_devices_for_me");
  if (error) {
    console.warn("[connect-device] list_shared_devices_for_me:", error);
    sharedDevicesList.innerHTML = `<div style="opacity:.55;font-size:.88rem;">${t("connectDevice.shared.error") || "Błąd ładowania."}</div>`;
    return;
  }

  const items = (data || []).filter(item => {
    // Mobile/tablet widzi host/buzzer, desktop/TV widzi display
    if (_isMobile) return item.device_type === "host" || item.device_type === "buzzer";
    return item.device_type === "display";
  });

  if (!items.length) {
    sharedDevicesList.innerHTML = `<div style="opacity:.55;font-size:.88rem;">${t("connectDevice.shared.empty") || "Brak udostępnionych urządzeń."}</div>`;
    return;
  }

  sharedDevicesList.innerHTML = "";
  for (const item of items) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);";

    const ownerLabel = escapeHtml(item.owner_username || item.owner_email || "—");
    const typeLabel = escapeHtml(deviceTypeLabel(item.device_type));
    const gameName = escapeHtml(item.game_name || "");
    const emoji = deviceTypeEmoji(item.device_type);

    row.innerHTML = `
      <div style="font-size:1.4rem">${emoji}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700">${typeLabel}</div>
        <div style="font-size:.8rem;opacity:.65;">${ownerLabel}${gameName ? ` · ${gameName}` : ""}</div>
      </div>
      <button class="btn sm gold" data-open type="button">${t("connectDevice.shared.open") || "Otwórz"}</button>
    `;

    // Przycisk "Otwórz" – otwiera link do urządzenia (link jest w game_id + device_type)
    // Link budujemy tak samo jak w control/devices.js: /host?id=...&key=...
    // Ale tu nie mamy klucza – link musi być przekazany przez właściciela.
    // Rozwiązanie: link jest przechowywany w game_id, a klucz pobieramy z games.
    row.querySelector("[data-open]")?.addEventListener("click", async () => {
      setMsg(t("connectDevice.shared.opening") || "Otwieranie…");
      try {
        const { data: gameRow, error: gErr } = await sb()
          .from("games")
          .select("id,share_key_host,share_key_buzzer,share_key_display")
          .eq("id", item.game_id)
          .single();

        if (gErr || !gameRow) {
          setMsg(t("connectDevice.shared.gameNotFound") || "Nie znaleziono gry.");
          return;
        }

        let url;
        const base = new URL(location.origin);
        if (item.device_type === "host") {
          url = `${base.origin}/host?id=${gameRow.id}&key=${gameRow.share_key_host}`;
        } else if (item.device_type === "buzzer") {
          url = `${base.origin}/buzzer?id=${gameRow.id}&key=${gameRow.share_key_buzzer}`;
        } else {
          url = `${base.origin}/display?id=${gameRow.id}&key=${gameRow.share_key_display}`;
        }

        window.open(url, "_blank");
        setMsg("");
      } catch (e) {
        setMsg(e?.message || t("connectDevice.shared.error") || "Błąd.");
      }
    });

    sharedDevicesList.appendChild(row);
  }
}

// QR scanner – używa BarcodeDetector API (Chrome/Android) lub fallback do zewnętrznego skanera
async function startQrScan() {
  if (scanMsg) scanMsg.textContent = "";

  // BarcodeDetector API (Chrome 83+, Android)
  if ("BarcodeDetector" in window) {
    try {
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });

      // Tworzymy tymczasowy video element
      const video = document.createElement("video");
      video.srcObject = stream;
      video.setAttribute("playsinline", "");
      video.style.cssText = "position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:9999;background:#000;";
      document.body.appendChild(video);
      await video.play();

      // Przycisk zamknięcia
      const closeBtn = document.createElement("button");
      closeBtn.textContent = "✕";
      closeBtn.style.cssText = "position:fixed;top:16px;right:16px;z-index:10000;padding:10px 16px;border-radius:12px;border:none;background:rgba(0,0,0,.7);color:#fff;font-size:1.2rem;cursor:pointer;";
      document.body.appendChild(closeBtn);

      let scanning = true;
      closeBtn.addEventListener("click", () => {
        scanning = false;
        stream.getTracks().forEach(t => t.stop());
        video.remove();
        closeBtn.remove();
      });

      const scan = async () => {
        if (!scanning) return;
        try {
          const barcodes = await detector.detect(video);
          if (barcodes.length > 0) {
            const url = barcodes[0].rawValue;
            scanning = false;
            stream.getTracks().forEach(t => t.stop());
            video.remove();
            closeBtn.remove();
            // Otwórz zeskanowany URL
            if (url.startsWith("http")) {
              window.location.href = url;
            } else {
              if (scanMsg) scanMsg.textContent = url;
            }
            return;
          }
        } catch {}
        if (scanning) requestAnimationFrame(scan);
      };
      requestAnimationFrame(scan);
      return;
    } catch (e) {
      if (scanMsg) scanMsg.textContent = t("connectDevice.scan.cameraError") || "Brak dostępu do kamery.";
      return;
    }
  }

  // Fallback: otwórz zewnętrzny skaner (np. systemowy)
  if (scanMsg) scanMsg.textContent = t("connectDevice.scan.noApi") || "Użyj aparatu systemowego do zeskanowania kodu QR.";
}

(async () => {
  const currentUser = await requireAuth(withLangParam("../login"));
  const guestMode = isGuestUser(currentUser);

  const whoLabel = currentUser?.username || currentUser?.email || "—";
  if (who) who.textContent = whoLabel;
  if (whoStatic) whoStatic.textContent = whoLabel;

  if (guestMode) {
    if (btnAccount) btnAccount.style.display = "none";
    if (whoStatic) whoStatic.style.display = "";
  } else {
    if (btnAccount) btnAccount.style.display = "";
    if (whoStatic) whoStatic.style.display = "none";
  }

  // Dostosuj hint i sekcję skanowania do platformy
  if (_isMobile) {
    if (pageHint) pageHint.setAttribute("data-i18n", "connectDevice.header.hintMobile");
    if (pageHint) pageHint.textContent = t("connectDevice.header.hintMobile") || "Podłącz się jako prowadzący lub buzzer, albo zeskanuj QR z panelu sterowania.";
  } else {
    if (pageHint) pageHint.setAttribute("data-i18n", "connectDevice.header.hintDesktop");
    if (pageHint) pageHint.textContent = t("connectDevice.header.hintDesktop") || "Podłącz się jako wyświetlacz lub zeskanuj QR z panelu sterowania.";
    // Na desktop skanowanie QR przez kamerę jest mniej typowe, ale zostawiamy
  }

  btnBack?.addEventListener("click", () => { location.href = withLangParam("builder"); });
  btnAccount?.addEventListener("click", () => { location.href = "account"; });
  btnLogout?.addEventListener("click", async () => {
    const { signOut } = await import("../core/auth.js");
    await signOut();
    location.href = withLangParam("login");
  });

  btnScanQr?.addEventListener("click", startQrScan);

  await renderSharedDevices();
})();
