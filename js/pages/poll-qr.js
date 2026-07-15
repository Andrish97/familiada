import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm";
import { sb } from "../core/supabase.js?v=v2026-07-15T22112";
import { rt } from "../core/realtime.js?v=v2026-07-15T22112";
import { initI18n, setUiLang, t, getUiLang } from "../../translation/translation.js?v=v2026-07-15T22112";

// 1. Inicjalizacja i18n
await initI18n({ withSwitcher: false });

const qs = new URLSearchParams(location.search);
let url = qs.get("url");
const paramId  = qs.get("id");
const paramKey = qs.get("key");

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

function withLangInUrl(u, lang){
  try{
    const x = new URL(u, location.href);
    x.searchParams.set("lang", lang);
    return x.toString();
  }catch{
    return u;
  }
}

const qr = document.getElementById("qr");

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

// Jeśli w URL strony poll-qr jest lang, upewnij się, że link w QR też go ma
const currentLang = getUiLang();
if (url && currentLang) {
  url = withLangInUrl(url, currentLang);
}

let myScope = getScopeFromVoteUrl(url);
let myGameId = myScope.split(":")[0] || "";

// --- Tryb device: ?id=&key= (podłączenie przez 6-cyfrowy kod) ---
if (!url && paramId && paramKey) {
  if (qr) qr.textContent = t("pollQr.loadingGame");
  try {
    const { data, error } = await sb().rpc("get_poll_game", {
      p_game_id: paramId,
      p_key:     paramKey,
    });
    if (error || !data?.game) throw new Error(error?.message || "not_found");

    const game = data.game;
    const base = game.type === "poll_points" ? "poll-points" : "poll-text";
    const voteUrl = new URL(base, location.href);
    voteUrl.searchParams.set("id", game.id);
    voteUrl.searchParams.set("key", paramKey);
    if (currentLang) voteUrl.searchParams.set("lang", currentLang);
    url = voteUrl.toString();
    myScope  = getScopeFromVoteUrl(url);
    myGameId = paramId;
  } catch(e) {
    console.error("[poll-qr] device init error:", e);
    if (qr) qr.textContent = t("pollQr.missingUrlOrKey");
  }
}

// --- Fullscreen ---
const btnFS = document.getElementById("btnFS");

function updateFsIcon(){
  if(!btnFS) return;
  btnFS.textContent = document.fullscreenElement ? "⧉" : "⛶";
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

// --- i18n sync (polls -> poll-qr) — BroadcastChannel (same-browser) ---
const I18N_BC_NAME = "familiada:polls:qr-sync";
const i18nBc = ("BroadcastChannel" in window) ? new BroadcastChannel(I18N_BC_NAME) : null;

async function applyLangChange(lang) {
  await setUiLang(lang, { persist: false, updateUrl: true, apply: true });
  url = withLangInUrl(url, lang);
  myScope = getScopeFromVoteUrl(url);
  render(url);
}

i18nBc?.addEventListener("message", async (ev) => {
  const msg = ev?.data;
  if (!msg || msg.type !== "polls:qr:i18n" || !msg.lang) return;
  if (msg.scope !== myScope) return;
  await applyLangChange(msg.lang);
});

window.addEventListener("beforeunload", () => {
  try { i18nBc?.close?.(); } catch {}
});

// --- i18n sync — Supabase Realtime (cross-device, np. TV) ---
if (myGameId) {
  rt(`familiada-poll-qr:${myGameId}`).onBroadcast("POLL_QR_LANG", async (msg) => {
    const { lang, scope } = msg?.payload ?? {};
    if (!lang) return;
    if (scope && scope !== myScope) return;
    await applyLangChange(lang);
  });
}

updateFsIcon();
render(url);

// Powiadom polls, że urządzenie jest gotowe — polls odpowie POLL_QR_LANG z aktualnym językiem
if (myGameId) {
  const readyPayload = { scope: myScope };
  try { i18nBc?.postMessage({ type: "polls:qr:ready", ...readyPayload }); } catch {}
  rt(`familiada-poll-qr:${myGameId}`)
    .sendBroadcast("POLL_QR_READY", readyPayload, { mode: "http" })
    .catch((e) => console.warn("[poll-qr] ready broadcast failed", e));
}
