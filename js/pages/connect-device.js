// js/pages/connect-device.js

import { sb } from "../core/supabase.js";
import { requireAuth } from "../core/auth.js";
import { isGuestUser } from "../core/guest-mode.js";
import { isMobileDevice } from "../core/pwa.js";
import { initI18n, t, withLangParam } from "../../translation/translation.js";
import "../core/contact-modal.js";

initI18n({ withSwitcher: true });

const who = document.getElementById("who");
const whoStatic = document.getElementById("whoStatic");
const btnBack = document.getElementById("btnBack");
const btnAccount = document.getElementById("btnAccount");
const btnLogout = document.getElementById("btnLogout");
const btnScanQr = document.getElementById("btnScanQr");
const sharedDevicesList = document.getElementById("sharedDevicesList");
const msg = document.getElementById("msg");
const pageHint = document.getElementById("pageHint");

function setMsg(text) { if (msg) msg.textContent = text || ""; }

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function deviceTypeLabel(type) {
  if (type === "host") return t("connectDevice.deviceType.host") || "Prowadzący";
  if (type === "buzzer") return t("connectDevice.deviceType.buzzer") || "Buzzer";
  if (type === "display") return t("connectDevice.deviceType.display") || "Wyświetlacz";
  return type;
}

function deviceTypeEmoji(type) {
  return type === "host" ? "🎤" : type === "buzzer" ? "🔔" : "📺";
}

const _isMobile = isMobileDevice();

async function renderSharedDevices() {
  sharedDevicesList.innerHTML = `<div style="opacity:.55;font-size:.88rem;">${t("connectDevice.shared.loading") || "Ładowanie…"}</div>`;

  const { data, error } = await sb().rpc("list_shared_devices_for_me");
  if (error) {
    sharedDevicesList.innerHTML = `<div style="opacity:.55;font-size:.88rem;">${t("connectDevice.shared.error") || "Błąd ładowania."}</div>`;
    return;
  }

  const items = (data || []).filter(item =>
    _isMobile ? (item.device_type === "host" || item.device_type === "buzzer")
              : item.device_type === "display"
  );

  if (!items.length) {
    sharedDevicesList.innerHTML = `<div style="opacity:.55;font-size:.88rem;">${t("connectDevice.shared.empty") || "Brak udostępnionych urządzeń."}</div>`;
    return;
  }

  sharedDevicesList.innerHTML = "";
  for (const item of items) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);";
    const ownerLabel = escapeHtml(item.owner_username || item.owner_email || "—");
    const gameName = escapeHtml(item.game_name || "");
    row.innerHTML = `
      <div style="font-size:1.4rem">${deviceTypeEmoji(item.device_type)}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700">${escapeHtml(deviceTypeLabel(item.device_type))}</div>
        <div style="font-size:.8rem;opacity:.65;">${ownerLabel}${gameName ? ` · ${gameName}` : ""}</div>
      </div>
      <button class="btn sm gold" data-open type="button">${t("connectDevice.shared.open") || "Otwórz"}</button>
    `;

    row.querySelector("[data-open]")?.addEventListener("click", async () => {
      if (!item.game_id) { setMsg(t("connectDevice.shared.gameNotFound") || "Brak gry."); return; }
      setMsg(t("connectDevice.shared.opening") || "Otwieranie…");
      try {
        const { data: g, error: gErr } = await sb()
          .from("games")
          .select("id,share_key_host,share_key_buzzer,share_key_display")
          .eq("id", item.game_id)
          .single();
        if (gErr || !g) { setMsg(t("connectDevice.shared.gameNotFound") || "Nie znaleziono gry."); return; }
        const key = item.device_type === "host" ? g.share_key_host
                  : item.device_type === "buzzer" ? g.share_key_buzzer
                  : g.share_key_display;
        const page = item.device_type === "display" ? "display" : item.device_type;
        window.open(`${location.origin}/${page}?id=${g.id}&key=${key}`, "_blank");
        setMsg("");
      } catch (e) { setMsg(e?.message || "Błąd."); }
    });

    sharedDevicesList.appendChild(row);
  }
}

// QR scanner – otwiera zeskanowany URL bezpośrednio
async function startQrScan() {
  if (!("BarcodeDetector" in window)) {
    setMsg(t("connectDevice.scan.noApi") || "Użyj aparatu systemowego do zeskanowania kodu QR.");
    return;
  }
  try {
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });

    const video = document.createElement("video");
    video.srcObject = stream;
    video.setAttribute("playsinline", "");
    video.style.cssText = "position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:9999;background:#000;";
    document.body.appendChild(video);
    await video.play();

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = "position:fixed;top:16px;right:16px;z-index:10000;padding:10px 16px;border-radius:12px;border:none;background:rgba(0,0,0,.7);color:#fff;font-size:1.2rem;cursor:pointer;";
    document.body.appendChild(closeBtn);

    let scanning = true;
    const stop = () => { scanning = false; stream.getTracks().forEach(t => t.stop()); video.remove(); closeBtn.remove(); };
    closeBtn.addEventListener("click", stop);

    const scan = async () => {
      if (!scanning) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length) {
          const url = codes[0].rawValue;
          stop();
          if (url.startsWith("http")) window.location.href = url;
          return;
        }
      } catch {}
      if (scanning) requestAnimationFrame(scan);
    };
    requestAnimationFrame(scan);
  } catch {
    setMsg(t("connectDevice.scan.cameraError") || "Brak dostępu do kamery.");
  }
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

  if (pageHint) pageHint.textContent = _isMobile
    ? (t("connectDevice.header.hintMobile") || "Podłącz się jako prowadzący lub buzzer.")
    : (t("connectDevice.header.hintDesktop") || "Podłącz się jako wyświetlacz.");

  // Skanowanie QR tylko na mobile
  if (_isMobile && btnScanQr) {
    btnScanQr.style.display = "";
    btnScanQr.addEventListener("click", startQrScan);
  }

  btnBack?.addEventListener("click", () => { location.href = withLangParam("builder"); });
  btnAccount?.addEventListener("click", () => { location.href = "account"; });
  btnLogout?.addEventListener("click", async () => {
    const { signOut } = await import("../core/auth.js");
    await signOut();
    location.href = withLangParam("login");
  });

  await renderSharedDevices();
})();
