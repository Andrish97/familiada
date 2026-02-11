import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm";
import { initI18n, setUiLang, t } from "../../translation/translation.js";

initI18n({ withSwitcher: false });

const MSG = {
  missingUrl: () => t("pollQr.missingUrl"),
  qrFailed: () => t("pollQr.qrFailed"),
};

const qs = new URLSearchParams(location.search);
let url = qs.get("url");

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
    return u; // jeśli to nie URL, zostaw jak jest
  }
}

const btnFS = document.getElementById("btnFS");

function updateFsIcon(){
  if(!btnFS) return;
  btnFS.textContent = document.fullscreenElement ? "⧉" : "⛶";
}

async function render(u){
  qr.innerHTML = "";
  if(!u){ qr.textContent = MSG.missingUrl(); return; }

  try{
    const wrap = document.createElement("div");
    wrap.className = "qrFrame";
    
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, u, { width: 420, margin: 1 });
    
    wrap.appendChild(canvas);
    qr.appendChild(wrap);
  }catch(e){
    console.error("[poll-qr] QR error:", e);
    qr.textContent = MSG.qrFailed();
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

  // 1) przestaw UI języka w poll-qr (bez zapisywania w localStorage)
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
