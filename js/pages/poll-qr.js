import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm";
import { sb } from "../core/supabase.js?v=v2026-09-24T23191";
import { initI18n, setUiLang, t, getUiLang } from "../../translation/translation.js?v=v2026-09-24T23191";
import { icon } from "../core/icons.js?v=v2026-09-24T23191";

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
  btnFS.innerHTML = icon(document.fullscreenElement ? "fullscreen-exit" : "fullscreen-enter");
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

async function applyLangChange(lang) {
  await setUiLang(lang, { persist: false, updateUrl: true, apply: true });
  url = withLangInUrl(url, lang);
  myScope = getScopeFromVoteUrl(url);
  render(url);
}

// --- Język: pollowanie games.poll_qr_lang (migracja 269) zamiast komend ---
// Wcześniej: BroadcastChannel (ta sama przeglądarka) + Supabase Realtime
// broadcast POLL_QR_LANG (inne urządzenie), oba wymagające, żeby polls.js i
// poll-qr.js były podłączone w TEJ SAMEJ chwili, gdy operator zmienia
// język — urządzenie, które akurat straciło łącze/dołączyło PO tym
// momencie, zostawało trwale z nieaktualnym językiem aż do kolejnej
// zmiany. Naprawa: poll-qr samo się dopytuje o stan (ten sam get_poll_game,
// którego już używa przy starcie) — jak Display v2, zamiast czekać na
// komendę z zewnątrz.
const myKey = myScope.split(":")[1] || "";
const POLL_LANG_INTERVAL_MS = 4000;

async function pollLangOnce() {
  if (!myGameId || !myKey) return;
  try {
    const { data, error } = await sb().rpc("get_poll_game", { p_game_id: myGameId, p_key: myKey });
    if (error || !data?.game) return;
    const lang = data.game.poll_qr_lang;
    if (lang && lang !== getUiLang()) await applyLangChange(lang);
  } catch (e) {
    console.warn("[poll-qr] lang poll failed", e);
  }
}

if (myGameId && myKey) {
  pollLangOnce();
  setInterval(pollLangOnce, POLL_LANG_INTERVAL_MS);
}

updateFsIcon();
render(url).finally(() => document.documentElement.classList.remove('page-loading'));
