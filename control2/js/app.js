// control2/js/app.js
// Punkt wejścia Control v2 — spina store/engine/devices/presence/
// soundReactor/ui. Nawigacja przedmeczowa (devices_display →
// devices_hostbuzzer → setup_finish → r_intro → r_roundStart) jest liniowa,
// bez rozgałęzień, więc żyje tu (app-level), nie w engine.js (patrz
// komentarz na górze engine.js) — ale i tak przechodzi przez
// assertTransition(), żeby tabela stanów była mechanizmem wszędzie, nie
// tylko wewnątrz silnika reguł gry.

import { guardDesktopOnly } from "../../js/core/device-guard.js?v=v2026-09-05T07140";
import { initI18n, getUiLang } from "../../translation/translation.js?v=v2026-09-05T07140";
import { requireAuth } from "../../js/core/auth.js?v=v2026-09-05T07140";
import { sb } from "../../js/core/supabase.js?v=v2026-09-05T07140";
import { loadQuestions, loadAnswers } from "../../js/core/game-validate.js?v=v2026-09-05T07140";
import { loadSfxManifest, initSfx, setCurrentGameId, unlockAudio } from "../../js/core/sfx.js?v=v2026-09-05T07140";
import { assertTransition } from "../../shared/gameStateMachine.js?v=v2026-09-05T07140";
import { confirmModal } from "../../js/core/modal.js?v=v2026-09-05T07140";
import { DEFAULT_SETTINGS } from "../../shared/gameStateShape.js?v=v2026-09-05T07140";
import { rt } from "../../js/core/realtime.js?v=v2026-09-05T07140";
import { doorbellTopic } from "../../js/core/game-state-doorbell.js?v=v2026-09-05T00002";

// Ustawienia "advanced" zachowywane przez "Zacznij od nowa" (sekcja 3a pkt 2
// — dokładnie jak dzisiejsze resetProgress({keepAdvanced:true})).
const ADVANCED_SETTINGS_KEYS = ["roundMultipliers", "finalMinPoints", "finalTarget", "endScreenMode", "finalPrizeMultiplier", "mainPrizeAmount"];

import { createStore } from "./store.js?v=v2026-09-05T07140";
import { createEngine } from "./engine.js?v=v2026-09-05T07140";
import { createDevices } from "./devices.js?v=v2026-09-05T07140";
import { createPresence } from "./presence.js?v=v2026-09-05T07140";
import { createSoundReactor } from "./soundReactor.js?v=v2026-09-05T07140";
import { createUI } from "./ui.js?v=v2026-09-05T07140";

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

  const { data: game, error: gameError } = await sb().from("games").select("*").eq("id", gameId).single();
  if (gameError || !game) { root.textContent = "Nie znaleziono gry."; return; }

  setCurrentGameId(gameId);
  await loadSfxManifest();
  await initSfx();

  const store = createStore(gameId);
  const expiredTimer = await store.hydrate();

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

  async function advance(nextStep, extra = {}) {
    assertTransition(store.state.step, nextStep);
    store.state.step = nextStep;
    Object.assign(store.state, extra);
    await store.commit();
  }

  async function handle(action, payload) {
    try {
      if (action === "devices.showQr") {
        store.state.display.mode = "QR";
        store.state.display.qrTarget = payload.kind;
        store.state.display.qrUrl = payload.url;
        store.state.display.qrCode = payload.code || null;
        await store.commit();
        return;
      }
      if (action === "devices.hideQr") {
        store.state.display.mode = "BLACK";
        store.state.display.qrTarget = null;
        store.state.display.qrUrl = null;
        store.state.display.qrCode = null;
        await store.commit();
        return;
      }
      if (action === "devices.next") {
        if (store.state.step === "devices_display") { await advance("devices_hostbuzzer"); return; }
        // Wyjście z D1: wracamy do BLACK, jeśli operator zostawił widoczny QR.
        store.state.display.mode = "BLACK";
        store.state.display.qrTarget = null;
        store.state.display.qrUrl = null;
        store.state.display.qrCode = null;
        await advance("setup_finish");
        return;
      }
      if (action === "setup.start") {
        store.state.teams.teamA = payload.teamA;
        store.state.teams.teamB = payload.teamB;
        store.state.settings.hasFinal = payload.hasFinal;
        store.state.locks.gameStarted = true;
        await advance("r_intro", { topCard: "rounds" });
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
      picked: [], confirmed: false, winnerTeam: null,
      runtime: { sum: 0, timer: { running: false, phase: null, endsAt: 0 }, map1: [null,null,null,null,null], map2: [null,null,null,null,null], p1: [null,null,null,null,null], p2: [null,null,null,null,null], reached200: false },
    };
    store.state.display = { mode: "BLACK", qrTarget: null, colors: store.state.display.colors, theme: store.state.display.theme, logoId: store.state.display.logoId };
    store.state.host = { covered: false };
    store.state.step = "devices_display";
    store.state.phase = null;
    store.state.controlTeam = null;
    store.state.topCard = "devices";
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
