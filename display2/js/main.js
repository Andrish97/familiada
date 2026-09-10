// display2/js/main.js
// Punkt wejścia Display v2. Napisane od zera (nie kopia display/js/main.js)
// — inna orkiestracja: zamiast kanału komend + snapshotu z device_state,
// jest jedno wywołanie RPC na start (game_state_get, przez subscribe.js)
// i "dzwonek" broadcastowy zamiast kanału DISPLAY_CMD. Ping obecności
// (device_ping) i walidacja klucza (display_auth) to te same, generyczne,
// niezwiązane z komendami RPC co dziś — reużyte bez zmian.

import { initFullscreenButton } from "../../display/js/fullscreen.js?v=v2026-09-10T23113";
import { initI18n, setUiLang } from "../../translation/translation.js?v=v2026-09-10T23113";
import { startKeepAlive } from "../../js/core/keep-alive.js?v=v2026-09-10T23113";
import { sb } from "../../js/core/supabase.js?v=v2026-09-10T23113";
import { createScene } from "./scene.js?v=v2026-09-10T23113";
import { createQRController } from "./qr.js?v=v2026-09-10T23113";
import { createSubscription } from "../../js/core/game-state-subscribe.js?v=v2026-09-10T23113";
import { createRenderer } from "./render.js?v=v2026-09-10T23113";
import { createDisplaySoundReactor } from "./soundReactor.js?v=v2026-09-10T23113";
import { loadSfxManifest, initSfx, setCurrentGameId, applySfxGameSettings, unlockAudio, isAudioUnlocked } from "../../js/core/sfx.js?v=v2026-09-10T23113";

startKeepAlive();

const $ = (id) => document.getElementById(id);

function parseParams() {
  const u = new URL(location.href);
  return { gameId: u.searchParams.get("id") || "", key: u.searchParams.get("key") || "" };
}

async function authDisplayOrThrow(gameId, key) {
  if (!gameId || !key) throw new Error("Brak id lub key w URL.");
  const { data, error } = await sb().rpc("display_auth", { p_game_id: gameId, p_key: key });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error("Zły klucz (display) albo gra nie istnieje.");
  return row;
}

function startPresenceHeartbeat({ gameId, key }, pingMs = 3000) {
  const DEVICE_ID_KEY = "familiada:deviceId:display";
  let deviceId = localStorage.getItem(DEVICE_ID_KEY) || null;
  const ping = async () => {
    const { data, error } = await sb().rpc("device_ping", {
      p_game_id: gameId, p_device_type: "display", p_key: key, p_device_id: deviceId, p_meta: {},
    });
    if (!error && data?.device_id && !deviceId) {
      deviceId = data.device_id;
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
  };
  ping();
  setInterval(ping, pingMs);
}

function showBlack() {
  $("blackScreen")?.classList.remove("hidden");
  $("qrScreen")?.classList.add("hidden");
  $("gameScreen")?.classList.add("hidden");
}

// Instrumentacja WYŁĄCZNIE do obserwacji w E2E (tests/e2e/control2.spec.js).
// Display maluje na SVG dot-matrix, bez żadnego tekstu w DOM (w
// odróżnieniu od Hosta, gdzie zwykły .textContent wystarcza) — bez tego
// zapisu nie dałoby się z Playwrighta zweryfikować, co render.js FAKTYCZNIE
// kazał narysować scene.js (dokładny tekst/punkty/animacja), tylko czy
// strona się nie wywaliła. Zero wpływu na realne rysowanie — owija wywołania
// przezroczyście, oryginalna funkcja i tak się wykonuje.
function instrumentSceneApi(api) {
  window.__displayLog = [];
  const wrap = (obj, path) => {
    const out = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "function") {
        out[k] = (...args) => { window.__displayLog.push({ call: `${path}.${k}`, args }); return v.apply(obj, args); };
      } else if (v && typeof v === "object") {
        out[k] = wrap(v, `${path}.${k}`);
      } else {
        out[k] = v;
      }
    }
    return out;
  };
  return wrap(api, "api");
}

// Tryb podglądu dla D3 w Control (plan, sekcja 3a pkt 5: "Podgląd kolorów/
// motywu/logo w małej miniaturce w panelu Control" — Control osadza tę samą
// stronę w iframe zamiast montować scene.js osobno, prościej i bez
// duplikowania kodu rysującego). Zero autoryzacji/subskrypcji real
// game_state — Control (jedyne, co go osadza) sam zna aktualne ustawienia i
// przesyła gotowy, spreparowany wiersz przez postMessage; nie ma potrzeby
// przekazywać do iframe klucza dostępu do prawdziwej gry.
async function bootPreview(params) {
  const scene = await createScene();
  scene.api = instrumentSceneApi(scene.api);
  // Logo prawdziwej gry (jeśli jest) — jedyna rzecz w podglądzie wymagająca
  // realnego id+key (Control i tak już je zna i pokazuje w kodach QR/modalu
  // kopiowania, więc to nie jest nowy wyciek danych).
  const previewGameId = params.get("id");
  if (previewGameId) { try { await scene.api.logo.bindGame(previewGameId); } catch {} }
  const qrCtrl = createQRController({
    qrScreen: $("qrScreen"), gameScreen: $("gameScreen"),
    hostCard: $("qrHostCard"), buzzerCard: $("qrBuzzerCard"),
    hostImg: $("qrHostImg"), buzzerImg: $("qrBuzzerImg"),
    hostCodeEl: $("qrHostCode"), buzzerCodeEl: $("qrBuzzerCode"),
  });
  const qr = { show() {}, hide() { qrCtrl.hide(); } };
  const renderer = createRenderer({ scene, qr });

  $("blackScreen")?.classList.add("hidden");
  $("qrScreen")?.classList.add("hidden");
  $("gameScreen")?.classList.remove("hidden");

  // ZAWSZE renderSnapshot, nigdy renderDiff — w odróżnieniu od prawdziwej
  // gry, tu nie ma czego animować płynnie (to formularz ustawień, nie mecz),
  // a co ważniejsze: shared/deriveEvents.js w ogóle nie ma zdarzenia na
  // zmianę kolorów/motywu (bo w prawdziwej grze te pola nigdy się nie
  // zmieniają w trakcie rozgrywki — blokada ustawień po starcie) — gdyby
  // korzystać z renderDiff() tutaj, KAŻDA kolejna wiadomość po pierwszej
  // zgubiłaby zmianę koloru/motywu (deriveEvents nie ma jak jej wykryć),
  // mimo że sam wiersz niesie już nową wartość.
  window.addEventListener("message", (e) => {
    if (e.data?.type !== "familiada:preview-row") return;
    const row = e.data.row;
    // logoPreview (wyłącznie w wierszu podglądu — nigdy w prawdziwym
    // game_state) to jeszcze NIEZAPISANY wybór logo w formularzu ustawień —
    // bindGame/reload czytają logo z bazy, więc nie zobaczyłyby tego wcale.
    // Musi się wykonać PRZED renderSnapshot, żeby paintForStep's
    // api.logo.show() (step==="r_intro") narysował już właściwe logo, a nie
    // stare/domyślne z poprzedniej klatki.
    if ("logoPreview" in (row.detail?.display || {})) {
      scene.api.logo.setPreview(row.detail.display.logoPreview);
    }
    renderer.renderSnapshot(row);
    // Reszta tego układu (plan podglądu: prawo/góra/lewo = przykładowe
    // cyfry, wskaźnik wyłączony) nie odpowiada ŻADNEMU prawdziwemu stanowi
    // gry — to czysto demonstracyjne wypełnienie "small" (płótno niezależne
    // od "big", gdzie jest logo), więc idzie bezpośrednio przez scene.api,
    // nie przez wspólny (z prawdziwą grą) render.js's paintForStep.
    scene.api.small.rightDigits("123");
    scene.api.small.topDigits("456");
    scene.api.small.leftDigits("789");
    scene.api.indicator.set("OFF");
  });

  document.documentElement.classList.remove("page-loading");
  parent.postMessage({ type: "familiada:preview-ready" }, "*");
}

window.addEventListener("DOMContentLoaded", async () => {
  await initI18n({ withSwitcher: false });
  initFullscreenButton();

  const params = new URL(location.href).searchParams;
  if (params.get("preview") === "1") {
    await bootPreview(params);
    return;
  }

  try {
    const { gameId, key } = parseParams();
    const game = await authDisplayOrThrow(gameId, key);
    startPresenceHeartbeat({ gameId: game.id, key });

    // Dźwięk "ze źródła Wyświetlacz" (zgłoszone) — ten sam js/core/sfx.js co
    // Control, wczytany niezależnie tutaj. Głośności/warianty (BEZ własnych
    // plików — patrz shared/gameStateShape.js) dociągane niżej z pierwszego
    // wiersza game_state, gdzie control2/js/app.js je zdenormalizowało.
    setCurrentGameId(game.id);
    await loadSfxManifest();
    await initSfx();
    const soundReactor = createDisplaySoundReactor();

    const audioUnlockScreen = $("audioUnlockScreen");
    const btnAudioUnlock = $("btnAudioUnlock");
    function syncAudioUnlockScreen(row) {
      if (!audioUnlockScreen) return;
      const wantsDisplaySound = row.detail?.settings?.soundSource === "display";
      audioUnlockScreen.classList.toggle("hidden", !wantsDisplaySound || isAudioUnlocked());
    }
    btnAudioUnlock?.addEventListener("click", () => {
      unlockAudio();
      audioUnlockScreen?.classList.add("hidden");
    });

    const scene = await createScene();
    scene.api = instrumentSceneApi(scene.api);
    const qrCtrl = createQRController({
      qrScreen: $("qrScreen"), gameScreen: $("gameScreen"),
      hostCard: $("qrHostCard"), buzzerCard: $("qrBuzzerCard"),
      hostImg: $("qrHostImg"), buzzerImg: $("qrBuzzerImg"),
      hostCodeEl: $("qrHostCode"), buzzerCodeEl: $("qrBuzzerCode"),
    });
    await scene.api.logo.bindGame?.(game.id);

    // Host/buzzer NIEZALEŻNE — jeden LUB oba naraz (plan, korekta po
    // feedbacku: pierwszy przebieg pokazywał tylko jeden na raz, źle).
    const qr = {
      show(qrDetail) {
        $("blackScreen")?.classList.add("hidden");
        const host = qrDetail?.host || {};
        const buzzer = qrDetail?.buzzer || {};
        qrCtrl.setHost(host.show ? host.url || "" : "");
        qrCtrl.setHostCode(host.show ? host.code || "" : "");
        qrCtrl.setBuzzer(buzzer.show ? buzzer.url || "" : "");
        qrCtrl.setBuzzerCode(buzzer.show ? buzzer.code || "" : "");
        qrCtrl.setSingle(!!host.show !== !!buzzer.show);
        qrCtrl.show();
      },
      hide() {
        qrCtrl.hide();
      },
    };

    const renderer = createRenderer({ scene, qr });
    let prevRow = null;
    let appliedLang = null;

    const subscription = createSubscription({
      gameId: game.id,
      deviceType: "display",
      key,
      onRow: (row) => {
        // Język idzie za operatorem w Control (control2/js/app.js's
        // LANG-push, dawniej osobna komenda `LANG <code>` — dziś zwykłe
        // pole w game_state, patrz shared/gameStateShape.js).
        const lang = row.detail?.settings?.uiLang;
        if (lang && lang !== appliedLang) {
          appliedLang = lang;
          setUiLang(lang, { persist: true, updateUrl: true, apply: true }).catch(() => {});
        }

        // Dźwięk — patrz komentarz przy setCurrentGameId() wyżej. Reaplikowane
        // na KAŻDY wiersz (tanie — kilka localStorage.setItem), nie tylko raz:
        // operator może zmienić głośność w modalu ustawień PO tym, jak Display
        // już dostał pierwszy (pusty) wiersz `sound` — "raz" zamroziłoby
        // ustawienia sprzed realnej konfiguracji (złapane przy pisaniu testu
        // E2E, nie w prawdziwej grze — ale ten sam mechanizm tam też obowiązuje).
        if (row.detail?.settings?.sound) {
          applySfxGameSettings(row.detail.settings.sound);
        }
        soundReactor.onRow(row);
        syncAudioUnlockScreen(row);

        // Widoczność kontenerów zależy wyłącznie od trybu — samo malowanie
        // planszy/QR/czarnego to render.js.
        const mode = row.detail?.display?.mode || "BLACK";
        if (mode === "GAME") {
          $("blackScreen")?.classList.add("hidden");
          $("qrScreen")?.classList.add("hidden");
          $("gameScreen")?.classList.remove("hidden");
        } else if (mode === "QR") {
          $("gameScreen")?.classList.add("hidden");
        } else {
          $("qrScreen")?.classList.add("hidden");
          $("gameScreen")?.classList.add("hidden");
          $("blackScreen")?.classList.remove("hidden");
        }

        if (!prevRow) renderer.renderSnapshot(row);
        else renderer.renderDiff(prevRow, row);
        prevRow = row;
      },
      onError: (error) => {
        console.warn("[display2] game_state_get failed:", error);
        showBlack();
      },
    });

    document.documentElement.classList.remove("page-loading");
    await subscription.start();
  } catch (e) {
    console.warn("[display2]", e?.message || e);
    showBlack();
  }
});
