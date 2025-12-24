import { requireAuth, signOut } from "/familiada/js/core/auth.js";
import { sb } from "/familiada/js/core/supabase.js";
import { rt } from "/familiada/js/core/realtime.js";
import { validateGameReadyToPlay, loadGameBasic, loadQuestions, loadAnswers } from "/familiada/js/core/game-validate.js";
import { unlockAudio, isAudioUnlocked, playSfx } from "/familiada/js/core/sfx.js";

import { createStore } from "./store.js";
import { createUI } from "./ui.js";
import { createDevices } from "./devices.js";
import { createPresence } from "./presence.js";
import { createDisplay } from "./display.js";
import { createRounds } from "./gameRounds.js";
import { createFinal } from "./gameFinal.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

async function ensureAuthOrRedirect() {
  const user = await requireAuth("/familiada/index.html");
  const who = document.getElementById("who");
  if (who) who.textContent = user?.email || user?.id || "—";
  return user;
}

async function loadGameOrThrow() {
  if (!gameId) throw new Error("Brak ?id w URL.");

  const basic = await loadGameBasic(gameId);

  const v = await validateGameReadyToPlay(gameId);
  if (!v.ok) throw new Error(`Ta gra nie jest gotowa do PLAY: ${v.reason}`);

  const { data, error } = await sb()
    .from("games")
    .select("id,name,type,status,share_key_display,share_key_host,share_key_buzzer")
    .eq("id", gameId)
    .single();

  if (error) throw error;
  if (data?.id !== basic.id) throw new Error("Rozjazd danych gry (validate vs games).");
  return data;
}

async function main() {
  await ensureAuthOrRedirect();
  const game = await loadGameOrThrow();

  const qsAll = await loadQuestions(game.id);
  sessionStorage.setItem("familiada:questionsCache", JSON.stringify(qsAll));

  
  const ui = createUI();
  ui.setGameHeader(game.name, `${game.type} / ${game.status}`);
  
  const store = createStore(game.id);
  store.hydrate();

  // realtime channels
  const chDisplay = rt(`familiada-display:${game.id}`);
  const chHost = rt(`familiada-host:${game.id}`);
  const chBuzzer = rt(`familiada-buzzer:${game.id}`);
  const chControl = rt(`familiada-control:${game.id}`); // BUZZER_EVT etc.

  const devices = createDevices({ game, ui, store, chDisplay, chHost, chBuzzer, chControl });
  const presence = createPresence({ game, ui, store, devices });

  const display = createDisplay({ devices, store });
  const rounds = createRounds({ ui, store, devices, display, loadQuestions, loadAnswers });
  const final = createFinal({ ui, store, devices, display, loadAnswers });

  // init links + QR images
  devices.initLinksAndQr();

  // initial audio
  store.setAudioUnlocked(!!isAudioUnlocked());
  ui.setAudioStatus(store.state.flags.audioUnlocked);

  // navigation
  ui.mountNavigation({
    canEnter: (card) => store.canEnterCard(card),
    onNavigate: (card) => store.setActiveCard(card),
  });

  // TOP buttons
  ui.on("top.back", () => (location.href = "/familiada/builder.html"));
  ui.on("top.logout", async () => {
    await signOut().catch(() => {});
    location.href = "/familiada/index.html";
  });

  // DEVICE steps
  ui.on("devices.next", () => store.setDevicesStep("devices_hostbuzzer"));
  ui.on("devices.back", () => store.setDevicesStep("devices_display"));
  ui.on("devices.toAudio", () => store.setDevicesStep("devices_audio"));
  ui.on("audio.back", () => store.setDevicesStep("devices_hostbuzzer"));

  ui.on("audio.unlock", () => {
    const ok = unlockAudio();
    store.setAudioUnlocked(!!ok);
    ui.setAudioStatus(!!ok);
    ui.setMsg("msgAudio", ok ? "Dźwięk odblokowany." : "Nie udało się odblokować dźwięku.");
    playSfx("ui_tick");
  });

  ui.on("devices.finish", () => {
    store.completeCard("devices");
    store.setActiveCard("setup");
  });

  ui.on("display.black", async () => {
    await devices.sendDisplayCmd("MODE BLACK");
    playSfx("ui_tick");
  });

  ui.on("qr.toggle", async () => {
    const now = store.state.flags.qrOnDisplay;
    if (!now) {
      await devices.sendQrToDisplay();
      store.setQrOnDisplay(true);
      ui.setQrToggleLabel(true);
    } else {
      await devices.sendDisplayCmd("MODE BLACK");
      store.setQrOnDisplay(false);
      ui.setQrToggleLabel(false);
    }
    playSfx("ui_tick");
  });

  // SETUP
  ui.on("setup.backToDevices", () => store.setActiveCard("devices"));
  ui.on("teams.save", () => {
    store.setTeams(ui.getTeamA(), ui.getTeamB());
    ui.setMsg("msgTeams", "Zapisano.");
    playSfx("ui_tick");
  });

  ui.on("setup.next", () => store.setSetupStep("setup_final"));
  ui.on("setup.back", () => store.setSetupStep("setup_names"));

  ui.on("final.toggle", (hasFinal) => store.setHasFinal(hasFinal));

  ui.on("final.reload", () => final.pickerReload().catch((e) => ui.setMsg("msgFinalPick", e?.message || String(e))));

  ui.on("final.confirm", () => {
    // lock list into “only view”
    store.confirmFinalQuestions(final.pickerGetSelectedIds());
    ui.setFinalConfirmed(true);
    ui.setMsg("msgFinalPick", "Zatwierdzono.");
    playSfx("ui_tick");
  });

  ui.on("final.edit", () => {
    store.unconfirmFinalQuestions();
    ui.setFinalConfirmed(false);
    ui.setMsg("msgFinalPick", "");
    playSfx("ui_tick");
  });

  ui.on("setup.finish", () => {
    store.completeCard("setup");
    store.setActiveCard("rounds");
  });

  // ROUNDS
  ui.on("rounds.backToSetup", () => {
    if (store.state.locks.gameStarted) return; // after start -> blocked (as agreed)
    store.setActiveCard("setup");
  });

  ui.on("game.ready", async () => {
    await rounds.stateGameReady();
  });

  ui.on("game.startIntro", async () => {
    await rounds.stateStartGameIntro();
  });

  ui.on("rounds.start", async () => {
    await rounds.startRound();
  });

  ui.on("rounds.resetRound", () => rounds.resetRound());

  ui.on("buzz.enable", () => rounds.enableBuzzerDuel());
  ui.on("buzz.acceptA", () => rounds.acceptBuzz("A"));
  ui.on("buzz.acceptB", () => rounds.acceptBuzz("B"));

  ui.on("rounds.pass", () => rounds.passQuestion());
  ui.on("rounds.timer3", () => rounds.startTimer3());

  ui.on("rounds.answerClick", (ord) => rounds.revealAnswerByOrd(ord));
  ui.on("rounds.addX", () => rounds.addX());
  ui.on("rounds.stealTry", () => rounds.stealTry());
  ui.on("rounds.end", () => rounds.endRound());

  // FINAL
  ui.on("final.back", () => store.setActiveCard("rounds"));
  ui.on("final.start", () => final.startFinal());
  ui.on("final.toMapping", () => final.toMapping());
  ui.on("final.revealAll", () => final.revealAll());
  ui.on("final.commit", () => final.commitToDisplay());
  ui.on("final.finish", () => final.finishFinal());

  // Presence loop
  await presence.start();

  // render loop
  const render = () => {
    ui.showCard(store.state.activeCard);
    ui.showDevicesStep(store.state.steps.devices);
    ui.showSetupStep(store.state.steps.setup);

    ui.setNavEnabled({
      devices: store.canEnterCard("devices"),
      setup: store.canEnterCard("setup"),
      rounds: store.canEnterCard("rounds"),
      final: store.canEnterCard("final"),
    });

    ui.setEnabled("btnDevicesNext", store.state.flags.displayOnline);
    ui.setEnabled("btnQrToggle", store.state.flags.hostOnline && store.state.flags.buzzerOnline);
    ui.setEnabled("btnDevicesToAudio", store.state.flags.displayOnline && store.state.flags.hostOnline && store.state.flags.buzzerOnline);

    ui.setEnabled("btnDevicesFinish", store.state.flags.audioUnlocked);

    ui.setEnabled("btnSetupNext", store.teamsOk());
    ui.setEnabled("btnSetupFinish", store.canFinishSetup());

    ui.setFinalHasFinal(store.state.hasFinal === true);
    ui.setFinalConfirmed(store.state.final.confirmed === true);

    ui.setEnabled("btnConfirmFinal", store.state.hasFinal === true && store.state.final.confirmed === false && store.state.final.picked.length === 5);
    ui.setEnabled("btnEditFinal", store.state.hasFinal === true && store.state.final.confirmed === true);

    ui.setEnabled("btnStartRound", store.canStartRounds());

    // rounds HUD
    ui.setRoundsHud(store.state.rounds);

    // final UI
    ui.setEnabled("btnFinalStart", store.canEnterCard("final") && store.state.final.runtime.phase === "IDLE");
  };

  store.subscribe(render);
  render();

  // boot view state
  ui.setQrToggleLabel(store.state.flags.qrOnDisplay);

  // init questions picker for final
  await final.pickerReload().catch(() => {});
  final.pickerRender();
}

main().catch((e) => {
  console.error(e);
  const el = document.getElementById("msgSide");
  if (el) el.textContent = e?.message || String(e);
});
