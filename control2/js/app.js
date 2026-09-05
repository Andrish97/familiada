// control2/js/app.js
// Punkt wejścia Control v2 — spina store/engine/devices/presence/
// soundReactor/ui. Nawigacja przedmeczowa (devices_display →
// devices_hostbuzzer → setup_finish → r_intro → r_roundStart) jest liniowa,
// bez rozgałęzień, więc żyje tu (app-level), nie w engine.js (patrz
// komentarz na górze engine.js) — ale i tak przechodzi przez
// assertTransition(), żeby tabela stanów była mechanizmem wszędzie, nie
// tylko wewnątrz silnika reguł gry.

import { guardDesktopOnly } from "../../js/core/device-guard.js?v=v2026-09-05T18380";
import { guardResourceLock } from "../../js/core/resource-lock.js?v=v2026-09-05T18380";
import { initI18n, getUiLang, t } from "../../translation/translation.js?v=v2026-09-05T18380";
import { requireAuth } from "../../js/core/auth.js?v=v2026-09-05T18380";
import { setTopbarAccount } from "../../js/core/topbar-controller.js?v=v2026-09-05T18380";
import { sb } from "../../js/core/supabase.js?v=v2026-09-05T18380";
import { loadQuestions, loadAnswers } from "../../js/core/game-validate.js?v=v2026-09-05T18380";
import { loadSfxManifest, initSfx, setCurrentGameId, unlockAudio, applySfxGameSettings, loadSfxFromCloud } from "../../js/core/sfx.js?v=v2026-09-05T18380";
import { listGameSounds } from "../../js/core/sfx-cloud.js?v=v2026-09-05T18380";
import { assertTransition } from "../../shared/gameStateMachine.js?v=v2026-09-05T18380";
import { confirmModal } from "../../js/core/modal.js?v=v2026-09-05T18380";
import { DEFAULT_SETTINGS } from "../../shared/gameStateShape.js?v=v2026-09-05T18380";
import { rt } from "../../js/core/realtime.js?v=v2026-09-05T18380";
import { doorbellTopic } from "../../js/core/game-state-doorbell.js?v=v2026-09-05T18380";

function qrImgSrc(url) {
  const u = encodeURIComponent(String(url ?? ""));
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${u}`;
}

// Ustawienia "advanced" zachowywane przez "Zacznij od nowa" (sekcja 3a pkt 2
// — dokładnie jak dzisiejsze resetProgress({keepAdvanced:true})).
const ADVANCED_SETTINGS_KEYS = ["roundMultipliers", "finalMinPoints", "finalTarget", "endScreenMode", "finalPrizeMultiplier", "mainPrizeAmount"];

// Denormalizacja games.settings (skonfigurowane osobno, na stronie
// game-settings, ZANIM operator w ogóle otworzy Control) do płaskiego
// game_state.detail — odpowiednik dzisiejszego control/js/app.js's
// applyGameSettingsToStore(). D3 ("setup_finish") to w nowej wersji
// wyłącznie PODSUMOWANIE tych już zapisanych ustawień (plan, tabela D3),
// nie formularz do wypełnienia — więc to musi się wykonać, zanim operator
// tam dotrze, nie jako efekt kliknięcia "Rozpocznij".
function applyGameSettingsToState(settings, state) {
  if (!settings || typeof settings !== "object") return;
  const { teams, display, game, questions } = settings;

  if (teams?.teamA || teams?.teamB) {
    state.teams.teamA = teams.teamA || "";
    state.teams.teamB = teams.teamB || "";
  }

  if (display) {
    if (display.colors) state.display.colors = { ...state.display.colors, ...display.colors };
    if (display.theme !== undefined) state.display.theme = display.theme;
    if (display.logoId !== undefined) state.display.logoId = display.logoId;
  }

  if (game) {
    if (game.hasFinal !== undefined && game.hasFinal !== null) state.settings.hasFinal = game.hasFinal;
    if (game.finalQuestionsMode) state.settings.finalQuestionsMode = game.finalQuestionsMode;
    if (game.roundsQuestionsMode) state.settings.roundsQuestionsMode = game.roundsQuestionsMode;
    if (game.advanced && typeof game.advanced === "object") {
      const adv = game.advanced;
      if (Array.isArray(adv.roundMultipliers) && adv.roundMultipliers.length) state.settings.roundMultipliers = adv.roundMultipliers;
      if (typeof adv.finalMinPoints === "number") state.settings.finalMinPoints = adv.finalMinPoints;
      if (typeof adv.finalTarget === "number") state.settings.finalTarget = adv.finalTarget;
      if (typeof adv.endScreenMode === "string") state.settings.endScreenMode = adv.endScreenMode;
      if (typeof adv.finalPrizeMultiplier === "number") state.settings.finalPrizeMultiplier = adv.finalPrizeMultiplier;
      if (typeof adv.mainPrizeAmount === "number") state.settings.mainPrizeAmount = adv.mainPrizeAmount;
    }
  }

  if (questions) {
    // Tak jak w starym applyGameSettingsToStore: tylko gdy finał faktycznie
    // włączony — inaczej martwa lista pytań finałowych niepotrzebnie
    // wykluczyłaby te pytania z puli rund (pickQuestionPool niżej).
    if (game?.hasFinal === true && Array.isArray(questions.final) && questions.final.length > 0) {
      const ids = questions.final.map((q) => q.id).filter(Boolean);
      if (ids.length > 0) {
        state.final.picked = ids.slice(0, 5);
        state.final.confirmed = true;
      }
    }
    if (Array.isArray(questions.rounds) && questions.rounds.length > 0) {
      state.settings.roundsPicked = questions.rounds.slice();
    }
  }
}

import { createStore } from "./store.js?v=v2026-09-05T18380";
import { createEngine } from "./engine.js?v=v2026-09-05T18380";
import { createDevices } from "./devices.js?v=v2026-09-05T18380";
import { createPresence } from "./presence.js?v=v2026-09-05T18380";
import { createSoundReactor } from "./soundReactor.js?v=v2026-09-05T18380";
import { createUI } from "./ui.js?v=v2026-09-05T18380";

guardDesktopOnly();

async function pickQuestionPool(state) {
  const all = await loadQuestions(state.gameId);
  const finalPicked = new Set((state.final.picked || []).map(String));
  let pool = finalPicked.size ? all.filter((q) => !finalPicked.has(String(q.id))) : all.slice();

  if (state.settings.roundsQuestionsMode === "pick" && state.settings.roundsPicked?.length) {
    const byId = new Map(pool.map((q) => [String(q.id), q]));
    const ordered = state.settings.roundsPicked.map((p) => byId.get(String(p.id))).filter(Boolean);
    const orderedIds = new Set(ordered.map((q) => String(q.id)));
    return [...ordered, ...pool.filter((q) => !orderedIds.has(String(q.id)))];
  }

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

async function main() {
  await initI18n({ withSwitcher: true });

  const params = new URLSearchParams(location.search);
  const gameId = params.get("id");
  const root = document.getElementById("app");
  if (!gameId) { root.textContent = "Brak parametru ?id= w URL."; return; }

  const user = await requireAuth();
  if (!user) return; // requireAuth already redirected

  setTopbarAccount(user, { showAuthEntry: true });

  const { data: game, error: gameError } = await sb().from("games").select("*").eq("id", gameId).single();
  if (gameError || !game) { root.textContent = "Nie znaleziono gry."; return; }

  // Warstwa 1 blokady (docs/plan-testy-i-poprawki.md, sekcja "Control" —
  // punkt odłożony do teraz, bo dopiero game_state daje realny stan do
  // przejęcia). resourceType:"game" to WSPÓLNY klucz z game-settings.js/
  // editor.js — Control blokuje edycję ustawień w trakcie rozgrywki, i
  // widzi odwrotnie, gdy ktoś inny (druga karta Control, ustawienia,
  // edytor) już trzyma tę samą grę.
  const lock = await guardResourceLock({
    resourceType: "game",
    resourceId: gameId,
    context: "control",
    message: t("resourceLock.gameMessage"),
    backHref: "/builder",
  });
  if (!lock.ok) return;

  setCurrentGameId(gameId);
  await loadSfxManifest();
  await initSfx();

  // Głośności/warianty dźwięku skonfigurowane w game-settings (poza
  // Control) — dokładnie jak dzisiejsze control/js/app.js's main().
  if (game.settings?.sound) {
    applySfxGameSettings(game.settings.sound);
    const customKeys = Object.entries(game.settings.sound.variants || {})
      .filter(([, v]) => v === "__custom__")
      .map(([k]) => k);
    if (customKeys.length > 0) {
      (async () => {
        try {
          const { data: { user } } = await sb().auth.getUser();
          if (user?.id) {
            const urlMap = await listGameSounds(sb(), user.id, gameId, customKeys);
            if (urlMap.size > 0) loadSfxFromCloud(urlMap);
          }
        } catch (e) { console.warn("[control2] wczytanie własnych dźwięków nie powiodło się:", e); }
      })();
    }
  }

  const store = createStore(gameId);
  const expiredTimer = await store.hydrate();

  // Tylko przed startem gry (D0-D3) — po "Rozpocznij" te pola żyją już
  // wyłącznie w game_state i nie mają być nadpisywane przy każdym
  // wznowieniu Control w trakcie rozgrywki (patrz komentarz przy funkcji).
  if (!store.state.locks.gameStarted) {
    applyGameSettingsToState(game.settings, store.state);
    await store.commit();
  }

  const engine = createEngine({
    store,
    loadQuestionPool: () => pickQuestionPool(store.state),
    loadQuestions,
    loadAnswers,
    now: Date.now,
  });

  if (expiredTimer) {
    // "Dogonienie" wygasłego timera przy wznowieniu (plan, sekcja 4) —
    // zanim cokolwiek się wyrenderuje operatorowi.
    await engine.dispatch({ type: "EXPIRE_TIMER" });
  }

  // Control jest jedynym urządzeniem "authenticated" — może czytać
  // game_state bezpośrednio (dla siebie), więc na dzwonek reaguje pełnym
  // hydrate() zamiast RPC z kluczem jak anon. To jedyny sposób, żeby
  // Control zauważył zmianę zapisaną przez KOGOŚ INNEGO — jedyny taki
  // przypadek to Buzzer piszący bezpośrednio przez game_state_buzzer_press
  // (sekcja 1/4 planu). Własne zapisy Control i tak już ma zaaplikowane
  // synchronicznie przez commit() zanim ten sam dzwonek do niego wróci —
  // stąd warunek rev > store.state.rev, żeby nie robić zbędnego refetchu.
  let externalRefreshInFlight = false;
  rt(doorbellTopic(gameId)).onBroadcast("rev", async (msg) => {
    const rev = msg?.payload?.rev;
    if (typeof rev !== "number" || rev <= store.state.rev) return;
    if (externalRefreshInFlight) return;
    externalRefreshInFlight = true;
    try {
      const expiredNow = await store.hydrate();
      if (expiredNow) await engine.dispatch({ type: "EXPIRE_TIMER" });
    } finally {
      externalRefreshInFlight = false;
    }
  });

  const devices = createDevices({ game });
  const urls = devices.buildUrls(getUiLang());
  const connectCodes = {};
  for (const kind of ["display", "host", "buzzer"]) {
    connectCodes[kind] = await devices.generateConnectCode(kind).catch(() => null);
  }

  let presenceFlags = {};
  const presence = createPresence({
    gameId,
    onChange: ({ flags }) => { presenceFlags = flags; renderCurrent(); },
  });
  presence.start();

  const soundReactor = createSoundReactor(store);

  // Odblokowanie audio po cichu na pierwszej dowolnej interakcji (sekcja 3a
  // pkt 4) — bez osobnego ekranu, bez dźwięku słyszalnego dla operatora.
  const unlockOnce = () => { unlockAudio(); document.removeEventListener("pointerdown", unlockOnce); document.removeEventListener("keydown", unlockOnce); };
  document.addEventListener("pointerdown", unlockOnce, { once: true });
  document.addEventListener("keydown", unlockOnce, { once: true });

  const root2 = document.getElementById("app");
  const ui = createUI({ root: root2, emit: handle });

  function renderCurrent() {
    ui.render(store.state, { urls, presenceFlags, connectCodes });
  }

  // ===== Modal QR z topbaru (prywatny podgląd operatora — nie to samo co
  // "QR na wyświetlaczu"; identyczna logika/DOM co dzisiejsze
  // control/js/app.js's showQrModal/hideQrModal). =====
  function getDeviceUrl(kind) {
    if (kind === "display") return urls.displayUrl;
    if (kind === "host") return urls.hostUrl;
    if (kind === "buzzer") return urls.buzzerUrl;
    return null;
  }
  function qrModalLabel(kind) {
    if (kind === "host") return t("control.deviceHost");
    if (kind === "buzzer") return t("control.deviceBuzzer");
    return t("control.qrModalTitle");
  }
  function showQrModal(kind) {
    const url = getDeviceUrl(kind);
    if (!url) return;
    const overlay = document.getElementById("qrModalOverlay");
    const titleEl = document.getElementById("qrModalTitle");
    const imgEl = document.getElementById("qrModalImg");
    const codeValEl = document.getElementById("qrModalCodeVal");
    if (!overlay || !titleEl) return;
    titleEl.textContent = qrModalLabel(kind);
    if (codeValEl) codeValEl.textContent = connectCodes[kind] || "——————";
    const qrWrap = document.getElementById("qrModalQrWrap");
    if (kind === "display") { if (qrWrap) qrWrap.style.display = "none"; }
    else { if (qrWrap) qrWrap.style.display = ""; if (imgEl) imgEl.src = qrImgSrc(url); }
    const openBtn = document.getElementById("qrModalOpen");
    if (openBtn) {
      if (kind === "display") { openBtn.href = url; openBtn.classList.remove("hidden"); }
      else openBtn.classList.add("hidden");
    }
    overlay.dataset.kind = kind;
    overlay.classList.remove("hidden");
  }
  function hideQrModal() {
    document.getElementById("qrModalOverlay")?.classList.add("hidden");
  }
  document.getElementById("qrModalClose")?.addEventListener("click", hideQrModal);
  document.getElementById("qrModalOverlay")?.addEventListener("click", (ev) => {
    if (ev.target?.id === "qrModalOverlay") hideQrModal();
  });
  document.getElementById("qrModalCopy")?.addEventListener("click", async () => {
    const kind = document.getElementById("qrModalOverlay")?.dataset.kind;
    const code = kind && connectCodes[kind];
    if (code) { try { await navigator.clipboard.writeText(code); } catch {} }
  });

  // ===== Info / Polityka prywatności — identyczna logika co dzisiejszy
  // control/js/app.js (helpOverlay -> iframe /manual, legalOverlay -> /privacy). =====
  const helpOverlay = document.getElementById("helpOverlay");
  const helpFrame = document.getElementById("helpFrame");
  const legalOverlay = document.getElementById("legalOverlay");
  const legalFrame = document.getElementById("legalFrame");
  function buildHelpUrl() {
    const url = new URL("manual", location.href);
    url.searchParams.set("modal", "control");
    url.searchParams.set("lang", getUiLang() || "pl");
    url.searchParams.set("tab", "control");
    url.hash = "control";
    return url.toString();
  }
  function buildLegalUrl() {
    const url = new URL("privacy", location.href);
    url.searchParams.set("modal", "control");
    url.searchParams.set("lang", getUiLang() || "pl");
    url.hash = "control";
    return url.toString();
  }
  function openHelpModal() { if (helpFrame) helpFrame.src = buildHelpUrl(); helpOverlay?.classList.remove("hidden"); }
  function closeHelpModal() { helpOverlay?.classList.add("hidden"); }
  function openLegalModal() { if (legalFrame) legalFrame.src = buildLegalUrl(); legalOverlay?.classList.remove("hidden"); }
  function closeLegalModal() { legalOverlay?.classList.add("hidden"); }
  document.getElementById("btnManual")?.addEventListener("click", openHelpModal);
  document.getElementById("btnHelpClose")?.addEventListener("click", (ev) => { ev.stopImmediatePropagation(); closeHelpModal(); });
  helpOverlay?.addEventListener("click", (ev) => { if (ev.target === helpOverlay) closeHelpModal(); });
  document.getElementById("btnLegal")?.addEventListener("click", (ev) => { ev.stopImmediatePropagation(); openLegalModal(); });
  document.getElementById("btnBackToManual")?.addEventListener("click", (ev) => { ev.stopImmediatePropagation(); closeLegalModal(); openHelpModal(); });
  document.getElementById("btnLegalClose")?.addEventListener("click", (ev) => { ev.stopImmediatePropagation(); closeLegalModal(); });
  legalOverlay?.addEventListener("click", (ev) => { if (ev.target === legalOverlay) closeLegalModal(); });

  // ===== Modal ustawień gry (edycja WYŁĄCZNIE w game-settings — Control
  // tylko otwiera ten sam modal co dzisiejszy btnOpenGsModal/gsOverlay,
  // identyczny protokół postMessage gs:requestClose / gs:close). Inaczej
  // niż dziś: nie przekazujemy gs:displayCmd do żadnego prawdziwego
  // urządzenia — sekcja 3a pkt 5 planu: Display zostaje BLACK przez cały
  // etap ustawień, podgląd na żywo to tylko lokalna miniaturka w D3 (patrz
  // niżej), odświeżana po ZAMKNIĘCIU modala, nie w locie przy każdej
  // zmianie suwaka.
  const gsOverlayEl = document.getElementById("gsOverlay");
  const gsFrameEl = document.getElementById("gsFrame");
  function openGsModal() {
    if (gsFrameEl) gsFrameEl.src = `/game-settings?id=${encodeURIComponent(gameId)}&modal=1`;
    gsOverlayEl?.classList.remove("hidden");
  }
  async function onGsModalClose() {
    gsOverlayEl?.classList.add("hidden");
    if (gsFrameEl) gsFrameEl.src = "";
    // Ustawienia mogły się zmienić (drużyny/finał/pytania/dźwięk) —
    // odśwież podsumowanie D3, tylko gdy gra jeszcze nie wystartowała
    // (patrz applyGameSettingsToState — po starcie to już wyłącznie
    // game_state, nie games.settings).
    if (!store.state.locks.gameStarted) {
      try {
        const { data: freshGame } = await sb().from("games").select("settings").eq("id", gameId).single();
        applyGameSettingsToState(freshGame?.settings, store.state);
        await store.commit();
      } catch (e) { console.warn("[control2] odświeżenie ustawień po zamknięciu modala nie powiodło się:", e); }
    }
  }
  function requestGsModalClose() {
    gsFrameEl?.contentWindow?.postMessage({ type: "gs:requestClose" }, "*");
  }
  document.getElementById("btnOpenGsModal")?.addEventListener("click", openGsModal);
  gsOverlayEl?.addEventListener("click", (ev) => { if (ev.target === gsOverlayEl) requestGsModalClose(); });
  window.addEventListener("message", (ev) => {
    if (ev.data?.type === "gs:close" && ev.source === gsFrameEl?.contentWindow) onGsModalClose();
  });

  document.getElementById("btnBack")?.addEventListener("click", async () => {
    // Ostrzeżenie tylko w trakcie realnej rozgrywki (jak dzisiejsze
    // shouldWarnBeforeUnload()) — z D0-D3 wychodzimy bez pytania.
    if (store.state.locks.gameStarted && !store.state.locks.gameEnded) {
      const ok = await confirmModal({
        title: t("control.leaveTitle"),
        text: t("control.leaveText"),
        okText: t("control.leaveOk"),
        cancelText: t("control.leaveCancel"),
      });
      if (!ok) return;
    }
    location.href = "/builder";
  });

  async function advance(nextStep, extra = {}) {
    assertTransition(store.state.step, nextStep);
    store.state.step = nextStep;
    Object.assign(store.state, extra);
    await store.commit();
  }

  async function handle(action, payload) {
    try {
      if (action === "ui.rerender") {
        // Czysto lokalna zmiana UI (np. zaznaczenie drużyny w trybie
        // physicalBuzzer, przed potwierdzeniem) — bez zapisu do game_state.
        renderCurrent();
        return;
      }
      // Host/buzzer NIEZALEŻNE — jeden LUB oba naraz na Display (dokładnie
      // jak dzisiejsze qrHostOnDisplay/qrBuzzerOnDisplay + syncQrDisplay w
      // control/js/app.js, nie jeden qrTarget na raz jak w pierwszym
      // przebiegu control2).
      async function syncQrDisplay() {
        const q = store.state.display.qr;
        const wantHost = !!q.host.show && !store.state.settings.noHostTablet;
        const wantBuzzer = !!q.buzzer.show && !store.state.settings.physicalBuzzer;
        q.host.show = wantHost;
        q.buzzer.show = wantBuzzer;
        q.host.url = wantHost ? urls.hostUrl : null;
        q.host.code = wantHost ? connectCodes.host : null;
        q.buzzer.url = wantBuzzer ? urls.buzzerUrl : null;
        q.buzzer.code = wantBuzzer ? connectCodes.buzzer : null;
        store.state.display.mode = (wantHost || wantBuzzer) ? "QR" : "BLACK";
        await store.commit();
      }
      if (action === "qr.host.toggle") {
        store.state.display.qr.host.show = !store.state.display.qr.host.show;
        await syncQrDisplay();
        return;
      }
      if (action === "qr.buzzer.toggle") {
        store.state.display.qr.buzzer.show = !store.state.display.qr.buzzer.show;
        await syncQrDisplay();
        return;
      }
      if (action === "qr.toggle") {
        // Globalny "Schowaj QR" — chowa oba naraz.
        store.state.display.qr.host.show = false;
        store.state.display.qr.buzzer.show = false;
        await syncQrDisplay();
        return;
      }
      if (action === "devices.noHostTablet") {
        store.state.settings.noHostTablet = !!payload;
        if (payload) { store.state.display.qr.host.show = false; }
        await syncQrDisplay();
        return;
      }
      if (action === "devices.physicalBuzzer") {
        store.state.settings.physicalBuzzer = !!payload;
        if (payload) { store.state.display.qr.buzzer.show = false; }
        await syncQrDisplay();
        return;
      }
      if (action === "qr.modal.show") {
        showQrModal(payload);
        return;
      }
      if (action === "devices.copyCode") {
        const code = connectCodes[payload];
        if (code) { try { await navigator.clipboard.writeText(code); } catch {} }
        return;
      }
      if (action === "devices.next") {
        if (store.state.step === "devices_display") { await advance("devices_hostbuzzer"); return; }
        // Wyjście z D1: wracamy do BLACK, jeśli operator zostawił widoczny QR.
        store.state.display.mode = "BLACK";
        store.state.display.qr.host = { show: false, url: null, code: null };
        store.state.display.qr.buzzer = { show: false, url: null, code: null };
        await advance("setup_finish");
        return;
      }
      if (action === "setup.openSettings") {
        openGsModal();
        return;
      }
      if (action === "setup.start") {
        // D3 to już tylko podsumowanie — drużyny/finał/pytania są od dawna
        // ustawione w games.settings i zdenormalizowane wyżej w main().
        store.state.locks.gameStarted = true;
        await advance("r_intro", { topCard: "rounds" });
        return;
      }
      if (action === "setup.reshuffleRounds") {
        // Sekcja 3a pkt 1: "Losuj ponownie" — tylko w trybie losowym i tylko
        // przed startem gry (potem pula jest już w grze). Wymusza budowę puli
        // teraz (normalnie leniwie budowana dopiero przy pierwszym
        // START_ROUND), żeby dało się ją przetasować z góry.
        if (store.state.settings.roundsQuestionsMode === "pick" || store.state.locks.gameStarted) return;
        store.state.rounds._questionPool = await pickQuestionPool(store.state);
        await store.commit();
        return;
      }
      if (action === "setup.reshuffleFinal") {
        if (store.state.settings.finalQuestionsMode === "pick" || store.state.locks.gameStarted) return;
        const all = await loadQuestions(store.state.gameId);
        const roundsPicked = new Set((store.state.settings.roundsPicked || []).map((q) => String(q.id)));
        const pool = store.state.settings.roundsQuestionsMode === "pick" && roundsPicked.size
          ? all.filter((q) => !roundsPicked.has(String(q.id)))
          : all.slice();
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        store.state.final.picked = pool.slice(0, 5).map((q) => q.id);
        store.state.final.confirmed = true;
        await store.commit();
        return;
      }
      if (action === "session.finish") {
        // Gra już zakończona (locks.gameEnded) — czysta nawigacja z powrotem
        // do listy gier, bez żadnego dalszego zapisu do game_state.
        location.href = "/builder";
        return;
      }
      if (action === "rounds.introNext") { await advance("r_roundStart", { phase: "READY" }); return; }
      if (action === "game.dispatch") { await engine.dispatch(payload); return; }
    } catch (e) {
      console.error("[control2] akcja nie powiodła się:", action, e);
      alert(`Błąd: ${e.message || e}`);
    }
  }

  const btnMute = document.getElementById("btnMute");
  function syncMuteButton() { if (btnMute) btnMute.textContent = soundReactor.isMuted() ? "🔇" : "🔊"; }
  syncMuteButton();
  btnMute?.addEventListener("click", () => { soundReactor.toggleMuted(); syncMuteButton(); });

  // "Cofnij ostatnią akcję" (plan, sekcja 4) — jednopoziomowe cofnięcie
  // przez game_state_undo/game_state_history. Nigdy nie było wcześniej
  // wystawione w UI (tylko store.undo() istniał) — dopięte tu.
  document.getElementById("btnUndo")?.addEventListener("click", async () => {
    try {
      await store.undo();
    } catch (e) {
      if (String(e?.message || e).includes("no_history")) {
        alert("Brak akcji do cofnięcia.");
      } else {
        console.error("[control2] cofnięcie nie powiodło się:", e);
        alert(`Błąd cofnięcia: ${e.message || e}`);
      }
    }
  });

  document.getElementById("btnStartOver")?.addEventListener("click", async () => {
    const ok = await confirmModal({
      title: "Zacznij od nowa",
      text: "To wróci do podłączania urządzeń i wyzeruje postęp gry (drużyny, pytania, wyniki). Parowanie urządzeń zostaje. Ustawienia zaawansowane zostają zachowane.",
    });
    if (!ok) return;
    const keptAdvanced = {};
    for (const key of ADVANCED_SETTINGS_KEYS) keptAdvanced[key] = store.state.settings[key];
    store.state.locks = { gameStarted: false, finalActive: false, gameEnded: false };
    store.state.teams = { teamA: "", teamB: "" };
    store.state.settings = { ...DEFAULT_SETTINGS, ...keptAdvanced };
    store.state.rounds = {
      roundNo: 1, bankPts: 0, xA: 0, xB: 0, totals: { A: 0, B: 0 },
      passUsed: false, allowPass: false, canEndRound: false, lockPlayControls: false,
      question: null, answers: [], revealed: [],
      duel: { enabled: false, lastPressed: null, firstTeam: null, secondTeam: null, currentTeam: null },
      timer3: { running: false, endsAt: 0, resolved: null },
      steal: { active: false, used: false, team: null, won: null },
      stealWon: false, _questionPool: [], _usedQuestionIds: [],
    };
    store.state.final = {
      picked: [], confirmed: false, winnerTeam: null, questions: [],
      runtime: { sum: 0, timer: { running: false, phase: null, endsAt: 0 }, map1: [null,null,null,null,null], map2: [null,null,null,null,null], p1: [null,null,null,null,null], p2: [null,null,null,null,null], reached200: false },
    };
    store.state.display = {
      mode: "BLACK",
      qr: { host: { show: false, url: null, code: null }, buzzer: { show: false, url: null, code: null } },
      colors: store.state.display.colors, theme: store.state.display.theme, logoId: store.state.display.logoId,
    };
    store.state.host = { covered: false };
    store.state.step = "devices_display";
    store.state.phase = null;
    store.state.controlTeam = null;
    store.state.topCard = "devices";
    // D3 znów pokaże podsumowanie games.settings (drużyny/finał/pytania) —
    // odśwież je z bazy, bo mogły się zmienić od czasu wejścia w Control.
    try {
      const { data: freshGame } = await sb().from("games").select("settings").eq("id", gameId).single();
      applyGameSettingsToState(freshGame?.settings, store.state);
    } catch (e) {
      console.warn("[control2] odświeżenie games.settings po 'Zacznij od nowa' nie powiodło się:", e);
    }
    await store.commit();
  });

  store.subscribe(renderCurrent);
  renderCurrent();
}

main().catch((e) => {
  console.error("[control2] błąd startu:", e);
  const root = document.getElementById("app");
  if (root) root.textContent = `Błąd startu: ${e.message || e}`;
});
