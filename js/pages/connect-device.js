// js/pages/connect-device.js

import { sb } from "../core/supabase.js";
import { requireAuth } from "../core/auth.js";
import { isGuestUser, showGuestBlockedOverlay } from "../core/guest-mode.js";
import { isMobileDevice } from "../core/pwa.js";
import { initI18n, t, getUiLang, withLangParam } from "../../translation/translation.js";
import { autoInitTopbarAuthButton } from "../core/topbar-auth.js";
import "../core/contact-modal.js";

initI18n({ withSwitcher: true });

const who = document.getElementById("who");
const btnBack = document.getElementById("btnBack");
const btnManual = document.getElementById("btnManual");
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

function getCurrentRelativeUrl() {
  return `${location.pathname.split("/").pop() || "connect-device"}${location.search}${location.hash}`;
}

function buildManualUrl() {
  const url = new URL("manual", location.href);
  url.searchParams.set("ret", getCurrentRelativeUrl());
  url.searchParams.set("lang", getUiLang() || "pl");
  url.hash = "connect-device";
  return url.toString();
}

async function renderSharedDevices() {
  sharedDevicesList.innerHTML = `<div style="opacity:.55;font-size:.88rem;text-align:center;padding:20px;">${t("connectDevice.shared.loading") || "Ładowanie…"}</div>`;

  const { data, error } = await sb().rpc("list_shared_devices_for_me");
  if (error) {
    sharedDevicesList.innerHTML = `<div style="opacity:.55;font-size:.88rem;text-align:center;padding:20px;">${t("connectDevice.shared.error") || "Błąd ładowania."}</div>`;
    return;
  }

  const items = (data || []).filter(item =>
    _isMobile ? (item.device_type === "host" || item.device_type === "buzzer")
              : item.device_type === "display"
  );

  if (!items.length) {
    sharedDevicesList.innerHTML = `
      <div style="opacity:.35;font-size:.88rem;text-align:center;padding:30px 20px;border:1px dashed rgba(255,255,255,.12);border-radius:16px;">
        ${t("connectDevice.shared.empty") || "Brak udostępnionych urządzeń."}
      </div>`;
    return;
  }

  sharedDevicesList.innerHTML = "";
  for (const item of items) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:14px;padding:14px;border-radius:16px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);transition:background .2s,border-color .2s;cursor:pointer;";
    row.addEventListener("mouseenter", () => { row.style.background = "rgba(255,255,255,.08)"; row.style.borderColor = "rgba(255,255,255,.2)"; });
    row.addEventListener("mouseleave", () => { row.style.background = "rgba(255,255,255,.05)"; row.style.borderColor = "rgba(255,255,255,.12)"; });

    const ownerLabel = escapeHtml(item.owner_username || item.owner_email || "—");
    const gameName = escapeHtml(item.game_name || "Bez nazwy");
    const typeLabel = deviceTypeLabel(item.device_type);
    
    row.innerHTML = `
      <div style="width:48px;height:48px;border-radius:12px;background:rgba(255,234,166,.1);display:grid;place-items:center;font-size:1.6rem;color:#ffeaa6;">
        ${deviceTypeEmoji(item.device_type)}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:900;font-size:1.05rem;letter-spacing:.02em;margin-bottom:2px;">${escapeHtml(gameName)}</div>
        <div style="font-size:.85rem;opacity:.6;display:flex;align-items:center;gap:6px;">
          <span>${typeLabel}</span>
          <span style="opacity:.3;">•</span>
          <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ownerLabel}</span>
        </div>
      </div>
      <div style="font-size:1.2rem;opacity:.4;">→</div>
    `;

    row.addEventListener("click", async () => {
      if (!item.game_id || !item.share_key) { 
        setMsg(t("connectDevice.shared.gameNotFound") || "Nie znaleziono gry lub klucza."); 
        return; 
      }
      setMsg(t("connectDevice.shared.opening") || "Otwieranie…");
      try {
        const page = item.device_type === "display" ? "display" : item.device_type;
        window.location.href = `/${page}?id=${item.game_id}&key=${item.share_key}`;
      } catch (e) { 
        setMsg(e?.message || "Błąd."); 
      }
    });

    sharedDevicesList.appendChild(row);
  }
}

// QR scanner – otwiera zeskanowany URL bezpośrednio
async function startQrScan() {
  // iOS Safari – brak BarcodeDetector, używamy input[capture] + jsQR
  if (!("BarcodeDetector" in window)) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;

      // Załaduj jsQR jeśli nie ma
      if (!window.jsQR) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }

      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise(r => { img.onload = r; });

      // Resize do max 1024px, bo jsQR słabo radzi sobie z ogromnymi zdjęciami z iOS
      let w = img.width;
      let h = img.height;
      const MAX = 1024;
      if (w > MAX || h > MAX) {
        if (w > h) {
          h = Math.round((h * MAX) / w);
          w = MAX;
        } else {
          w = Math.round((w * MAX) / h);
          h = MAX;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(img.src);

      const imageData = canvas.getContext("2d").getImageData(0, 0, w, h);
      const code = window.jsQR(imageData.data, imageData.width, imageData.height);
      if (code?.data?.startsWith("http")) {
        window.location.href = code.data;
      } else {
        setMsg(t("connectDevice.scan.noQr") || "Nie znaleziono kodu QR.");
      }
    });

    input.click();
    return;
  }

  // Chrome/Android – BarcodeDetector + live video
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

  if (guestMode) {
    showGuestBlockedOverlay({ backHref: "builder", loginHref: "login?force_auth=1", showLoginButton: true });
    return;
  }

  if (who) who.textContent = currentUser?.username || currentUser?.email || "—";
  if (btnLogout) {
    autoInitTopbarAuthButton(btnLogout);
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
  btnManual?.addEventListener("click", () => { location.href = buildManualUrl(); });

  await renderSharedDevices();
})();
