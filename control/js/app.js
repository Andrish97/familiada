// control/js/app.js
import { requireAuth, signOut } from "/familiada/js/core/auth.js";
import { sb } from "/familiada/js/core/supabase.js";
import { rt } from "/familiada/js/core/realtime.js"; // Twój runtime manager
import {
  loadGameBasic,
  validateGameReadyToPlay,
  loadQuestions
} from "/familiada/js/core/game-validate.js";

import { createStore } from "./store.js";
import { createPresence } from "./presence.js";
import { createDevices } from "./devices.js";
import { createUI } from "./ui.js";
import { createFinalPicker } from "./finalPicker.js";
import { createDisplay } from "./display.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

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

async function ensureAuthOrRedirect() {
  const user = await requireAuth("/familiada/index.html");
  const who = document.getElementById("who");
  if (who) who.textContent = user?.email || user?.id || "—";
  return user;
}

async function main() {
  await ensureAuthOrRedirect();
  const game = await loadGameOrThrow();

  const ui = createUI();
  ui.setGameMeta(game);

  const store = createStore(game.id);
  store.hydrate();

  // realtime topics (persistent singletons)
  const chDisplay = rt(`familiada-display:${game.id}`);
  const chHost = rt(`familiada-host:${game.id}`);
  const chBuzzer = rt(`familiada-buzzer:${game.id}`);
  const chControl = rt(`familiada-control:${game.id}`);

  const devices = createDevices({ game, ui, store, chDisplay, chHost, chBuzzer, chControl });

  // Presence (polling from device_presence) + top dots + step unlocking
  const presence = createPresence({ game, ui, store, devices });

  // Display driver (only what we need right now)
  const display = createDisplay({ devices, store });

  // Final questions picker (nice UI)
  const picker = createFinalPicker({
    ui,
    store,
    loadQuestions: () => loadQuestions(game.id),
  });

  // Wire basic card navigation + locking
  ui.mountNavigation({
    isUnlocked: (card) => store.isCardUnlocked(card),
    onNavigate: (card) => store.setActiveCard(card),
  });

  // Apply active card initially
  ui.showCard(store.state.activeCard);

  // DEVICES steps
  ui.on("devices.next", () => store.setDevicesStep("devices_hostbuzzer"));
  ui.on("devices.back", () => store.setDevicesStep("devices_display"));

  // SETUP steps
  ui.on("setup.next", () => store.setSetupStep("setup_final"));
  ui.on("setup.back", () => store.setSetupStep("setup_names"));

  // Team names
  ui.on("teams.save", () => {
    const a = ui.getTeamA();
    const b = ui.getTeamB();
    store.setTeams(a, b);
  });

  // Final yes/no
  ui.on("final.toggle", (hasFinal) => store.setHasFinal(hasFinal));

  // Save final Qs
  ui.on("final.save", () => {
    store.setFinalQuestionIds(picker.getSelectedIds());
  });

  // GAME: display “gra gotowa”
  ui.on("game.ready", async () => {
    const { teamA, teamB } = store.state.teams;
    await display.gameReady(teamA, teamB);
    ui.setMsg("msgGame", "Wysłano: gra gotowa.");
  });

  // GAME: logo
  ui.on("game.showLogo", async () => {
    await display.showLogo();
    ui.setMsg("msgGame", "Wysłano: logo.");
  });

  ui.on("game.hide", async () => {
    await display.hide();
    ui.setMsg("msgGame", "Wysłano: HIDE.");
  });

  // Setup: enable/disable buttons based on store
  function renderAll() {
    ui.showCard(store.state.activeCard);

    // steps visibility
    ui.showDevicesStep(store.state.steps.devices);
    ui.showSetupStep(store.state.steps.setup);

    // locks
    ui.updateLocks({
      devices: store.isCardUnlocked("devices"),
      setup: store.isCardUnlocked("setup"),
      game: store.isCardUnlocked("game"),
      final: store.isCardUnlocked("final"),
    });

    // enable nav buttons
    ui.updateNavEnabled({
      setup: store.isCardUnlocked("setup"),
      game: store.isCardUnlocked("game"),
      final: store.isCardUnlocked("final"),
    });

    // devices step buttons
    ui.setEnabled("btnDevicesNext", store.state.flags.displayOnline);
    ui.setEnabled("btnDevicesFinish", store.state.flags.displayOnline && store.state.flags.hostOnline && store.state.flags.buzzerOnline);

    // setup step buttons
    ui.setEnabled("btnSetupNext", !!store.state.teams.teamA || !!store.state.teams.teamB);
    ui.setEnabled("btnSetupFinish", store.canFinishSetup());

    // picker visibility + state
    ui.setFinalPickerVisible(store.state.hasFinal === true);
    picker.render(store.state.hasFinal === true);

    // final status
    ui.setFinalStatus(store);
  }

  // Store subscription
  store.subscribe(renderAll);

  // Picker: internal updates call store for rerender
  picker.onChange(() => {
    ui.setEnabled("btnSaveFinalQs", picker.getSelectedIds().length === 5);
  });

  // Devices: QR modal and links + copy/open
  devices.initLinksAndQr();

  // Topbar buttons
  ui.on("top.back", () => (location.href = "/familiada/builder.html"));
  ui.on("top.logout", async () => {
    await signOut().catch(() => {});
    location.href = "/familiada/index.html";
  });

  // Start presence polling
  await presence.start();

  // Initial render
  renderAll();
}

main().catch((e) => {
  console.error(e);
  const el = document.getElementById("msgSide");
  if (el) el.textContent = e?.message || String(e);
});
