import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm";
import { sb } from "../../shared/js/core/supabase.js?v=v2026-10-05T15031";
import { initI18n, setUiLang, t, getUiLang } from "../../shared/translation/translation.js?v=v2026-10-05T15031";
import { icon } from "../../shared/js/core/icons.js?v=v2026-10-05T15031";

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
let renderAbortController = null;

async function render(u){
  if (!qr) {
    console.error("[poll-qr] missing #qr element");
    return;
  }

  // Anuluj poprzedni render, jeśli wciąż w toku
  if (renderAbortController) renderAbortController.abort();
  renderAbortController = new AbortController();
  const signal = renderAbortController.signal;

  qr.innerHTML = "";
  if(!u){ qr.textContent = t("pollQr.missingUrl"); return; }

  try{
    const timeoutId = setTimeout(() => renderAbortController?.abort(), 8000);
    const dataUrl = await QRCode.toDataURL(u, { width: 840, margin: 1 });
    clearTimeout(timeoutId);

    if (signal.aborted) return;

    const img = document.createElement("img");
    img.src = dataUrl;
    qr.innerHTML = "";
    qr.appendChild(img);
  }catch(e){
    if (signal.aborted) return;
    console.error("[poll-qr] QR error:", e);
    qr.textContent = e.name === "AbortError" ? t("pollQr.qrFailed") : t("pollQr.qrFailed");
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
let deviceInitFailed = false;
if (!url && paramId && paramKey) {
  if (qr) qr.textContent = t("pollQr.loadingGame");
  try {
    const { data, error } = await sb().rpc("get_poll_game", {
      p_game_id: paramId,
      p_key:     paramKey,
    });
    if (error) {
      // get_poll_game (supabase/schema.sql) rzuca zwykłe RAISE EXCEPTION
      // ('forbidden' dla złego klucza, 'not found' dla nieistniejącej gry)
      // — to NIE jest PGRST116 (ten kod dotyczy tylko braku wierszy przy
      // .single() na zapytaniach do tabel, nigdy wyjątków z funkcji RPC),
      // więc ten warunek nigdy nie był prawdziwy i zły klucz zawsze
      // pokazywał ogólny komunikat "Brak URL" zamiast "Nieprawidłowy klucz".
      if (error.message === "forbidden") {
        throw new Error("invalid_key");
      }
      throw new Error(error.message || "not_found");
    }
    if (!data?.game) throw new Error("not_found");

    const game = data.game;
    if (!["poll_open", "ready"].includes(game.status)) {
      throw new Error("invalid_status");
    }

    const base = game.type === "poll_points" ? "/poll-points/" : "/poll-text/";
    const voteUrl = new URL(base, location.href);
    voteUrl.searchParams.set("id", game.id);
    voteUrl.searchParams.set("key", paramKey);
    if (currentLang) voteUrl.searchParams.set("lang", currentLang);
    url = voteUrl.toString();
    myScope  = getScopeFromVoteUrl(url);
    myGameId = paramId;
  } catch(e) {
    console.error("[poll-qr] device init error:", e);
    const errorMsg = {
      "invalid_key": "pollQr.invalidKey",
      "invalid_status": "pollQr.invalidStatus",
      "not_found": "pollQr.missingUrlOrKey"
    }[e.message] || "pollQr.missingUrlOrKey";
    if (qr) qr.textContent = t(errorMsg);
    deviceInitFailed = true;
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
  // render() anuluje poprzedni render automatycznie
  await render(url);
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
let pollLangInterval = null;

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
  pollLangInterval = setInterval(pollLangOnce, POLL_LANG_INTERVAL_MS);
}

// Oczyść interval przy unload
window.addEventListener("beforeunload", () => {
  if (pollLangInterval) clearInterval(pollLangInterval);
});

updateFsIcon();
if (!deviceInitFailed) {
  render(url).finally(() => document.documentElement.classList.remove('page-loading'));
} else {
  document.documentElement.classList.remove('page-loading');
}
