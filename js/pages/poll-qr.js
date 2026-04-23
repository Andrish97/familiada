import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm";
import { initI18n, setUiLang, t, getUiLang } from "../../translation/translation.js?v=v2026-04-23T16261";

// 1. Inicjalizacja i18n
await initI18n({ withSwitcher: false });

const qs = new URLSearchParams(location.search);
let url = qs.get("url");

// Jeśli w URL strony poll-qr jest lang, upewnij się, że link w QR też go ma
const currentLang = getUiLang();
if (url && currentLang) {
  url = withLangInUrl(url, currentLang);
}

function getScopeFromVoteUrl(u){
  try{
    const x = new URL(u, location.href);
    const id = x.searchParams.get("id") || "";
    const key = x.searchParams.get("key") || "";
    return `${id}:${key}`;
  }catch{
    return "";
  }
}

let myScope = getScopeFromVoteUrl(url);

const qr = document.getElementById("qr");

function withLangInUrl(u, lang){
  try{
    const x = new URL(u, location.href);
    x.searchParams.set("lang", lang);
    return x.toString();
  }catch{
    return u;
  }
}

const btnFS = document.getElementById("btnFS");

function updateFsIcon(){
  if(!btnFS) return;
  btnFS.textContent = document.fullscreenElement ? "⧉" : "⛶";
}

async function render(u){
  if (!qr) return;
  qr.innerHTML = "";
  if(!u){ qr.textContent = t("pollQr.missingUrl"); return; }

  try{
    const dataUrl = await QRCode.toDataURL(u, { width: 840, margin: 1 });
    const img = document.createElement("img");
    img.src = dataUrl;
    qr.appendChild(img);
  }catch(e){
    console.error("[poll-qr] QR error:", e);
    qr.textContent = t("pollQr.qrFailed");
  }
}

btnFS?.addEventListener("click", async ()=>{
  try{
    if(!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }catch(e){
    console.warn("[poll-qr] fullscreen error", e);
  }
});

document.addEventListener("fullscreenchange", updateFsIcon);

// --- i18n sync (polls -> poll-qr) ---
const I18N_BC_NAME = "familiada:polls:qr-sync";
const i18nBc = ("BroadcastChannel" in window) ? new BroadcastChannel(I18N_BC_NAME) : null;

i18nBc?.addEventListener("message", async (ev) => {
  const msg = ev?.data;
  if (!msg || msg.type !== "polls:qr:i18n" || !msg.lang) return;
  if (msg.scope !== myScope) return;

  // 1) przestaw UI języka w poll-qr
  await setUiLang(msg.lang, { persist: false, updateUrl: true, apply: true });

  // 2) wymuś, żeby QR kodował link z właściwym lang
  url = withLangInUrl(url, msg.lang);
  myScope = getScopeFromVoteUrl(url);
  render(url);
});

window.addEventListener("beforeunload", () => {
  try { i18nBc?.close?.(); } catch {}
});

updateFsIcon();
render(url);
