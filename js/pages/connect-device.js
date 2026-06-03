// js/pages/connect-device.js

import { sb } from "../core/supabase.js?v=v2026-06-03T21150";
import { getUser } from "../core/auth.js?v=v2026-06-03T21150";
import { isGuestUser } from "../core/guest-mode.js?v=v2026-06-03T21150";
import { isMobileDevice } from "../core/pwa.js?v=v2026-06-03T21150";
import { initI18n, t, getUiLang, withLangParam } from "../../translation/translation.js?v=v2026-06-03T21150";
import { initTopbarAccountDropdown } from "../core/topbar-controller.js?v=v2026-06-03T21150";
import "../core/contact-modal.js";

initI18n({ withSwitcher: true });

const btnBack             = document.getElementById("btnBack");
const btnManual           = document.getElementById("btnManual");
const btnScanQr           = document.getElementById("btnScanQr");
const sharedDevicesCard   = document.getElementById("sharedDevicesCard");
const sharedDevicesList   = document.getElementById("sharedDevicesList");
const msg                 = document.getElementById("msg");
const pageHint            = document.getElementById("pageHint");
const connectCodeInput    = document.getElementById("connectCodeInput");
const btnConnectCode      = document.getElementById("btnConnectCode");
const connectCodeMsg      = document.getElementById("connectCodeMsg");

const devicePreviewOverlay   = document.getElementById("devicePreviewOverlay");
const devicePreviewTitle     = document.getElementById("devicePreviewTitle");
const devicePreviewSub       = document.getElementById("devicePreviewSub");
const btnDevicePreviewConnect = document.getElementById("btnDevicePreviewConnect");
const btnDevicePreviewCancel  = document.getElementById("btnDevicePreviewCancel");
const btnDevicePreviewClose   = document.getElementById("btnDevicePreviewClose");

function setMsg(text)     { if (msg) msg.textContent = text || ""; }
function setCodeMsg(text) { if (connectCodeMsg) connectCodeMsg.textContent = text || ""; }

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function deviceTypeLabel(type) {
  if (type === "host")    return t("connectDevice.deviceType.host")    || "Prowadzący";
  if (type === "buzzer")  return t("connectDevice.deviceType.buzzer")  || "Buzzer";
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
  url.hash = "connect";
  return url.toString();
}

// ── Device preview modal ───────────────────────────────────────────────────────
let _previewDeviceInfo = null;

function showDevicePreview(info) {
  _previewDeviceInfo = info;
  const typeLabel = deviceTypeLabel(info.device_type);
  const emoji = deviceTypeEmoji(info.device_type);
  if (devicePreviewTitle) {
    devicePreviewTitle.textContent = `${emoji} ${typeLabel}`;
  }
  if (devicePreviewSub) {
    const gameName = info.game_name || "—";
    const owner    = info.owner_username || "—";
    const gameLabel  = t("connectDevice.enterCode.previewGame")  || "Gra:";
    const ownerLabel = t("connectDevice.enterCode.previewOwner") || "Właściciel:";
    devicePreviewSub.textContent = `${gameLabel} ${gameName}\n${ownerLabel} ${owner}`;
  }
  if (devicePreviewOverlay) devicePreviewOverlay.style.display = "";
}

function hideDevicePreview() {
  if (devicePreviewOverlay) devicePreviewOverlay.style.display = "none";
  _previewDeviceInfo = null;
}

btnDevicePreviewClose?.addEventListener("click", hideDevicePreview);
btnDevicePreviewCancel?.addEventListener("click", hideDevicePreview);
devicePreviewOverlay?.addEventListener("click", (e) => {
  if (e.target === devicePreviewOverlay) hideDevicePreview();
});

btnDevicePreviewConnect?.addEventListener("click", () => {
  if (!_previewDeviceInfo) return;
  const info = _previewDeviceInfo;
  hideDevicePreview();
  const page = info.device_type === "display" ? "display" : info.device_type;
  window.location.href = `/${page}?id=${info.game_id}&key=${info.share_key}`;
});

// ── Code input ─────────────────────────────────────────────────────────────────
async function handleCodeConnect() {
  const raw = String(connectCodeInput?.value || "").trim().replace(/\D/g, "");
  if (raw.length !== 6) {
    setCodeMsg(t("connectDevice.enterCode.invalidCode") || "Wprowadź 6-cyfrowy kod.");
    return;
  }
  setCodeMsg(t("connectDevice.enterCode.resolving") || "Sprawdzanie kodu…");
  if (btnConnectCode) btnConnectCode.disabled = true;

  try {
    const { data, error } = await sb().rpc("resolve_device_connect_code", { p_code: raw });
    if (error || !data?.ok) {
      setCodeMsg(t("connectDevice.enterCode.codeNotFound") || "Nie znaleziono urządzenia dla tego kodu.");
      return;
    }
    setCodeMsg("");
    showDevicePreview(data);
  } catch (e) {
    setCodeMsg(e?.message || "Błąd.");
  } finally {
    if (btnConnectCode) btnConnectCode.disabled = false;
  }
}

btnConnectCode?.addEventListener("click", handleCodeConnect);
connectCodeInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); handleCodeConnect(); }
});

// ── Shared devices (only logged-in non-guests) ─────────────────────────────────
async function renderSharedDevices() {
  if (!sharedDevicesList) return;
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
    sharedDevicesList.classList.add("is-empty");
    sharedDevicesList.innerHTML = `<div class="connect-device-empty">${t("connectDevice.shared.empty") || "Brak udostępnionych urządzeń."}</div>`;
    return;
  }
  sharedDevicesList.classList.remove("is-empty");

  sharedDevicesList.innerHTML = "";
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "connect-device-tile";

    const ownerLabel = escapeHtml(item.owner_username || item.owner_email || "—");
    const gameName   = escapeHtml(item.game_name || t("connectDevice.shared.noName") || "—");
    const typeLabel  = deviceTypeLabel(item.device_type);

    row.innerHTML = `
      <div class="connect-device-tile-icon">${deviceTypeEmoji(item.device_type)}</div>
      <div class="connect-device-tile-body">
        <div class="connect-device-tile-name">${gameName}</div>
        <div class="connect-device-tile-meta">
          <span>${typeLabel}</span>
          <span class="connect-device-tile-meta-dot">•</span>
          <span class="connect-device-tile-meta-owner">${ownerLabel}</span>
        </div>
      </div>
      <div class="connect-device-tile-arrow">→</div>
    `;

    row.addEventListener("click", async () => {
      if (!item.game_id || !item.share_key) {
        setMsg(t("connectDevice.shared.gameNotFound") || "Nie znaleziono gry.");
        return;
      }
      const isMobileType = item.device_type === "host" || item.device_type === "buzzer";
      if (_isMobile && item.device_type === "display") {
        alert(t("connectDevice.warning.desktopOnly"));
      } else if (!_isMobile && isMobileType) {
        alert(t("connectDevice.warning.mobileOnly"));
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

// ── QR scanner ─────────────────────────────────────────────────────────────────
async function loadJsQR() {
  if (window.jsQR) return;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

function buildScanOverlay() {
  const video = document.createElement("video");
  video.setAttribute("playsinline", "");
  video.style.cssText = "position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:9999;background:#000;";

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "position:fixed;top:calc(16px + env(safe-area-inset-top, 0px));right:16px;z-index:10000;padding:10px 16px;border-radius:12px;border:none;background:rgba(0,0,0,.7);color:#fff;font-size:1.2rem;cursor:pointer;";

  return { video, closeBtn };
}

async function startQrScan() {
  const hasCamera = !!navigator.mediaDevices?.getUserMedia;

  if (hasCamera) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const { video, closeBtn } = buildScanOverlay();

      document.body.appendChild(video);
      document.body.appendChild(closeBtn);
      video.srcObject = stream;
      await video.play();

      let scanning = true;
      const stop = () => {
        scanning = false;
        stream.getTracks().forEach(tr => tr.stop());
        video.remove();
        closeBtn.remove();
      };
      closeBtn.addEventListener("click", stop);

      if ("BarcodeDetector" in window) {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
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
      } else {
        await loadJsQR();
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const scan = () => {
          if (!scanning) return;
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = window.jsQR(imageData.data, imageData.width, imageData.height);
            if (code?.data?.startsWith("http")) {
              stop();
              window.location.href = code.data;
              return;
            }
          }
          if (scanning) requestAnimationFrame(scan);
        };
        requestAnimationFrame(scan);
      }
      return;
    } catch {
      setMsg(t("connectDevice.scan.cameraError") || "Brak dostępu do kamery.");
      return;
    }
  }

  await loadJsQR();
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

    let bitmap;
    const objectUrl = URL.createObjectURL(file);
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      const img = new Image();
      img.src = objectUrl;
      await new Promise(r => { img.onload = r; });
      bitmap = img;
    }

    let w = bitmap.width, h = bitmap.height;
    const MAX = 1500;
    if (w > MAX || h > MAX) {
      if (w > h) { h = Math.round((h * MAX) / w); w = MAX; }
      else        { w = Math.round((w * MAX) / h); h = MAX; }
    }

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    URL.revokeObjectURL(objectUrl);
    if (bitmap.close) bitmap.close();

    const imageData = canvas.getContext("2d").getImageData(0, 0, w, h);
    const code = window.jsQR(imageData.data, imageData.width, imageData.height);
    if (code?.data?.startsWith("http")) {
      window.location.href = code.data;
    } else {
      setMsg(t("connectDevice.scan.noQr") || "Nie znaleziono kodu QR.");
    }
  });

  input.click();
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────
(async () => {
  let currentUser = null;
  try { currentUser = await getUser(); } catch {}

  const isLoggedIn = !!currentUser;
  const guestMode  = isLoggedIn ? isGuestUser(currentUser) : true;

  if (isLoggedIn) {
    initTopbarAccountDropdown(currentUser);
  }

  btnBack?.addEventListener("click", () => {
    location.href = (isLoggedIn && !guestMode)
      ? withLangParam("builder")
      : withLangParam("index");
  });

  btnManual?.addEventListener("click", () => { location.href = buildManualUrl(); });

  if (pageHint) pageHint.textContent = _isMobile
    ? (t("connectDevice.header.hintMobile") || "Podłącz się jako prowadzący lub buzzer, albo zeskanuj QR z panelu sterowania.")
    : (t("connectDevice.header.hintDesktop") || "Podłącz się jako wyświetlacz lub zeskanuj QR z panelu sterowania.");

  if (_isMobile && btnScanQr) {
    btnScanQr.style.display = "";
    btnScanQr.addEventListener("click", startQrScan);
  }

  if (isLoggedIn && !guestMode) {
    if (sharedDevicesCard) sharedDevicesCard.style.display = "";
    await renderSharedDevices();
  }
})();
