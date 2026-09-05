// control2/js/devices.js
// Parowanie urządzeń (linki + 6-cyfrowe kody) — CAŁKOWICIE poza
// public.game_state, tak jak dziś (plan, sekcja 2 punkt "0."): to fakt
// "jak się połączyć", nie stan gry. W odróżnieniu od dzisiejszego
// control/js/devices.js — ZERO wysyłania komend (sendDisplayCmd/
// sendHostCmd/sendBuzzerCmd/kolejki nie istnieją tu wcale). Tryb Display
// (BLACK/QR/GAME) to już nie komenda wysyłana stąd — to zwykły zapis
// detail.display.mode przez engine.js/store.js, czytany przez Display samo.
//
// Kody 6-cyfrowe: reużywają bez zmian istniejące, już bezpieczne RPC
// (generate_device_connect_code / resolve_device_connect_code, migracja
// 2026-05-30_203) — to czysty lookup "kod -> share_key", niezwiązany z
// komendami, nie wymaga żadnej zmiany dla v2.

import { getUiLang } from "../../translation/translation.js?v=v2026-09-05T19011";
import { sb } from "../../js/core/supabase.js?v=v2026-09-05T19011";

function makeUrl(path, gameId, key, { lang } = {}) {
  const u = new URL(path, location.origin);
  u.searchParams.set("id", gameId);
  u.searchParams.set("key", key);
  if (lang) u.searchParams.set("lang", lang);
  return u.toString();
}

export function createDevices({ game }) {
  function buildUrls(lang) {
    const targetLang = lang || getUiLang();
    return {
      displayUrl: makeUrl("../display2", game.id, game.share_key_display, { lang: targetLang }),
      hostUrl: makeUrl("../host2", game.id, game.share_key_host, { lang: targetLang }),
      buzzerUrl: makeUrl("../buzzer2", game.id, game.share_key_buzzer || "", { lang: targetLang }),
    };
  }

  async function generateConnectCode(deviceType) {
    const shareKey =
      deviceType === "host" ? game.share_key_host :
      deviceType === "buzzer" ? (game.share_key_buzzer || game.share_key_host) :
      game.share_key_display;
    const { data, error } = await sb().rpc("generate_device_connect_code", {
      p_game_id: game.id,
      p_device_type: deviceType,
      p_share_key: shareKey,
      p_game_name: game.name || null,
    });
    if (error || !data?.ok) return null;
    return data.code;
  }

  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }

  return { buildUrls, generateConnectCode, copyToClipboard };
}
