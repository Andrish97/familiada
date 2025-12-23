// control/js/app.js
import { requireAuth, signOut } from "/familiada/js/core/auth.js";
import { sb } from "/familiada/js/core/supabase.js";
import { rt } from "/familiada/js/core/realtime.js";
import { loadGameBasic, validateGameReadyToPlay, loadQuestions } from "/familiada/js/core/game-validate.js";

import { createStore } from "./store.js";
import { createPresence } from "./presence.js";
import { createDevices } from "./devices.js";
import { createUI } from "./ui.js";
import { createFinalPicker } from "./finalPicker.js";
import { createDisplay } from "./display.js";

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

  const ui = createUI();
  ui.setGameName(game.name);

  const store = createStore(game.id);
  store.hydrate();

  const chDisplay = rt(`familiada-display:${game.id}`);
  const chHost = rt(`familiada-host:${game.id}`);
  const chBuzzer = rt(`familiada-buzzer:${game.id}`);
  const chControl = rt(`familiada-control:${game.id}`);

  const devices = createDevices({ game, ui, store, chDisplay, chHost, chBuzzer, chControl });
  const presence = createPresence({ game, ui, store, devices });

  const display = createDisplay({ devices, store });

  const picker = createFinalPicker({
    ui,
    store,
    loadQuestions: () => loadQuestions(game.id),
  });

  // nav
  ui.mountNavigation({
    canEnter: (card) => store.canEnterCard(card),
    onNavigate: (card) => store.setActiveCard(card),
  });

  // DEVICES steps
  ui.on("devices.next", () => store.setDevicesStep("devices_hostbuzzer"));
  ui.on("devices.back", () => store.setDevicesStep("devices_display"));

  ui.on("devices.finish", () => {
    // mark done + lock devices card, then go setup
    store.completeCard("devices");
    store.setActiveCard("setup");
  });

  // SETUP steps
  ui.on("setup.next", () => store.setSetupStep("setup_final"));
  ui.on("setup.back", () => store.setSetupStep("setup_names"));

  ui.on("setup.finish", () => {
    store.completeCard("setup");
    store.setActiveCard("game");
  });

  // Teams
  ui.on("teams.save", () => {
    store.setTeams(ui.getTeamA(), ui.getTeamB());
    ui.setMsg("msgTeams", "Zapisano.");
  });

  // Final toggle
  ui.on("final.toggle", (hasFinal) => store.setHasFinal(hasFinal));
  ui.on("final.save", () => {
    store.setFinalQuestionIds(picker.getSelectedIds());
    ui.setMsg("msgFinalPick", "Zapisano 5 pytań.");
  });
  ui.on("final.reload", () => picker.reload());

  // DEVICE buttons
  ui.on("display.black", async () => {
    await devices.sendDisplayCmd("MODE BLACK");
    ui.setMsg("msgDevices", "Wyświetlacz: czarny ekran.");
  });

  ui.on("display.sendQrToDisplay", async () => {
    await devices.sendQrToDisplay();
    ui.setMsg("msgDevices2", "Wysłano QR na wyświetlacz.");
  });

  // GAME (na razie bez LOGO/HIDE)
  ui.on("game.ready", async () => {
    const { teamA, teamB } = store.state.teams;
    await display.gameReady(teamA, teamB);
    ui.setMsg("msgGame", "Wysłano: gra gotowa.");
  });

  // topbar
  ui.on("top.back", () => (location.href = "/familiada/builder.html"));
  ui.on("top.logout", async () => {
    await signOut().catch(() => {});
    location.href = "/familiada/index.html";
  });

  // links + QR inline
  devices.initLinksAndQrInline();

  // render
  function render() {
    ui.showCard(store.state.activeCard);

    ui.showDevicesStep(store.state.steps.devices);
    ui.showSetupStep(store.state.steps.setup);

    // card availability (and lock completed)
    ui.setNavEnabled({
      devices: store.canEnterCard("devices"),
      setup: store.canEnterCard("setup"),
      game: store.canEnterCard("game"),
      final: store.canEnterCard("final"),
    });

    // devices step buttons
    ui.setEnabled("btnDevicesNext", store.state.flags.displayOnline);
    ui.setEnabled("btnDevicesFinish", store.state.flags.displayOnline && store.state.flags.hostOnline && store.state.flags.buzzerOnline);

    // setup
    ui.setEnabled("btnSetupNext", store.state.teams.teamA.trim().length > 0 || store.state.teams.teamB.trim().length > 0);
    ui.setEnabled("btnSetupFinish", store.canFinishSetup());

    ui.setFinalPickerVisible(store.state.hasFinal === true);
    picker.render(store.state.hasFinal === true);

    ui.setFinalStatus(store);

    // hide QR inline once you leave devices card
    ui.setQrInlineVisible(store.state.activeCard === "devices" && store.state.steps.devices === "devices_display");
  }

  store.subscribe(render);

  picker.onChange(() => {
    ui.setEnabled("btnSaveFinalQs", store.state.hasFinal === true && picker.getSelectedIds().length === 5);
  });

  await presence.start();
  render();
}

main().catch((e) => {
  console.error(e);
  const el = document.getElementById("msgSide");
  if (el) el.textContent = e?.message || String(e);
});
