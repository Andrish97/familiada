// /familiada/js/pages/control/app.js
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

    // === Modal QR z auth bar (top-status) ===
  let currentQrKind = null; // "display" | "host" | "buzzer"

  function qrSrc(url) {
    const u = encodeURIComponent(String(url ?? ""));
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${u}`;
  }

  function getDeviceUrl(kind) {
    if (!window || !kind) return null;
    // devices będzie zdefiniowane niżej, ale w momencie użycia już istnieje
    if (!devices || !devices.getUrls) return null;
    const urls = devices.getUrls();
    if (kind === "display") return urls.displayUrl;
    if (kind === "host") return urls.hostUrl;
    if (kind === "buzzer") return urls.buzzerUrl;
    return null;
  }

  function hideQrModal() {
    const overlay = document.getElementById("qrModalOverlay");
    if (overlay) overlay.classList.add("hidden");
  }

  function showQrModal(kind) {
    const url = getDeviceUrl(kind);
    if (!url) return;

    currentQrKind = kind;

    const overlay = document.getElementById("qrModalOverlay");
    const titleEl = document.getElementById("qrModalTitle");
    const imgEl = document.getElementById("qrModalImg");
    const linkEl = document.getElementById("qrModalLink");

    if (!overlay || !titleEl || !imgEl || !linkEl) return;

    const label =
      kind === "display" ? "Wyświetlacz" :
      kind === "host" ? "Prowadzący" :
      kind === "buzzer" ? "Przycisk" :
      "Urządzenie";

    titleEl.textContent = label;
    linkEl.value = url;
    imgEl.src = qrSrc(url);

    overlay.classList.remove("hidden");
  }

  async function copyQrLink() {
    const url = getDeviceUrl(currentQrKind);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      ui.showAlert("Skopiowano link do urządzenia.");
    } catch {
      ui.showAlert("Nie udało się skopiować linka.");
    }
  }

  function openQrLink() {
    const url = getDeviceUrl(currentQrKind);
    if (!url) return;
    window.open(url, "_blank");
  }

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
  rounds.bootIfNeeded();
  const final = createFinal({ ui, store, devices, display, loadAnswers });

  // === PICKER PYTAŃ FINAŁU (przeniesiony z dawnego gameFinal) ===
  let finalPickerAll = [];
  let finalPickerSelected = new Set();

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function finalPickerReload() {
    const raw = sessionStorage.getItem("familiada:questionsCache");
    finalPickerAll = raw ? JSON.parse(raw) : [];
    finalPickerSelected = new Set(store.state.final.picked || []);
    finalPickerRender();
  }

  function finalPickerGetSelectedIds() {
    return Array.from(finalPickerSelected);
  }

  function finalPickerRender() {
    const root = document.getElementById("finalQList");
    const chips = document.getElementById("pickedChips");
    const cnt = document.getElementById("pickedCount");
    if (!root || !chips || !cnt) return;

    const confirmed = store.state.final.confirmed === true;

    const picked = finalPickerAll.filter((q) => finalPickerSelected.has(q.id));
    cnt.textContent = String(picked.length);

    // chips
    chips.innerHTML = picked
      .map(
        (q) => `
      <div class="chip">
        <span>#${q.ord}</span>
        <span>${escapeHtml(q.text || "")}</span>
        ${confirmed ? "" : `<button type="button" data-x="${q.id}">✕</button>`}
      </div>
    `
      )
      .join("");

    if (!confirmed) {
      chips.querySelectorAll("button[data-x]").forEach((b) => {
        b.addEventListener("click", () => {
          finalPickerSelected.delete(b.dataset.x);
          store.state.final.picked = Array.from(finalPickerSelected).slice(0, 5);
          finalPickerRender();
        });
      });
    }

    // lista pytań
    if (confirmed) {
      root.innerHTML = picked
        .map(
          (q) => `
        <div class="qRow">
          <div class="meta">#${q.ord}</div>
          <div class="txt">${escapeHtml(q.text || "")}</div>
        </div>
      `
        )
        .join("");
      return;
    }

    root.innerHTML = finalPickerAll
      .map((q) => {
        const checked = finalPickerSelected.has(q.id);
        const disabled = !checked && finalPickerSelected.size >= 5;
        return `
        <label class="qRow">
          <input type="checkbox" data-qid="${q.id}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}/>
          <div class="meta">#${q.ord}</div>
          <div class="txt">${escapeHtml(q.text || "")}</div>
        </label>
      `;
      })
      .join("");

    root.querySelectorAll("input[data-qid]").forEach((inp) => {
      inp.addEventListener("change", () => {
        const id = inp.dataset.qid;
        if (!id) return;
        if (inp.checked) {
          if (finalPickerSelected.size >= 5) {
            inp.checked = false;
            return;
          }
          finalPickerSelected.add(id);
        } else {
          finalPickerSelected.delete(id);
        }
        store.state.final.picked = Array.from(finalPickerSelected).slice(0, 5);
        finalPickerRender();
      });
    });
  }
  // === KONIEC pickera pytań finału ===

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

    // auth bar: QR z top bara
  ui.on("auth.showQr", (kind) => {
    showQrModal(kind);
  });
  ui.on("auth.qr.close", () => {
    hideQrModal();
  });
  ui.on("auth.qr.copy", async () => {
    await copyQrLink();
  });
  ui.on("auth.qr.open", () => {
    openQrLink();
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
    playSfx("answer_correct");
  });

  ui.on("devices.finish", () => {
    store.completeCard("devices");
    store.setActiveCard("setup");
  });

  ui.on("display.black", async () => {
    await devices.sendDisplayCmd("APP BLACK");
  });

  ui.on("qr.toggle", async () => {
    const now = store.state.flags.qrOnDisplay;

    if (!now) {
      await devices.sendQrToDisplay(); // pokaż QR zawsze (linki są zawsze)
      store.setQrOnDisplay(true);
      ui.setQrToggleLabel(true, store.state.flags.hostOnline && store.state.flags.buzzerOnline);
    } else {
      await devices.sendDisplayCmd("APP BLACK");
      store.setQrOnDisplay(false);
      ui.setQrToggleLabel(false, store.state.flags.hostOnline && store.state.flags.buzzerOnline);
    }
  });

  // SETUP
  ui.on("setup.backToDevices", () => store.setActiveCard("devices"));
  ui.on("teams.save", () => {
    store.setTeams(ui.getTeamA(), ui.getTeamB());
    ui.setMsg("msgTeams", "Zapisano.");
  });

  ui.on("teams.change", ({ teamA, teamB }) => {
    store.setTeams(teamA, teamB);
  });

  ui.on("setup.next", () => store.setSetupStep("setup_final"));
  ui.on("setup.back", () => store.setSetupStep("setup_names"));

  ui.on("final.toggle", (hasFinal) => store.setHasFinal(hasFinal));

  ui.on("final.reload", () =>
    finalPickerReload().catch((e) => ui.setMsg("msgFinalPick", e?.message || String(e)))
  );

  ui.on("final.confirm", () => {
    store.confirmFinalQuestions(finalPickerGetSelectedIds());
    ui.setFinalConfirmed(true);
    ui.setMsg("msgFinalPick", "Zatwierdzono.");
    finalPickerRender();
  });

  ui.on("final.edit", () => {
    store.unconfirmFinalQuestions();
    ui.setFinalConfirmed(false);
    ui.setMsg("msgFinalPick", "");
    finalPickerRender();
  });

  ui.on("setup.finish", () => {
    store.completeCard("setup");
    store.setActiveCard("rounds");
  });

  // ROUNDS
  ui.on("game.ready", async () => {
    await rounds.stateGameReady();
  });

  ui.on("game.startIntro", async () => {
    await rounds.stateStartGameIntro();
  });

  ui.on("rounds.start", async () => {
    await rounds.startRound();
  });

  // back buttons:
  ui.on("rounds.back", (step) => rounds.backTo(step));

  // duel
  ui.on("buzz.enable", () => rounds.enableBuzzerDuel());
  ui.on("buzz.retry", () => rounds.retryDuel());
  ui.on("buzz.acceptA", () => rounds.acceptBuzz("A"));
  ui.on("buzz.acceptB", () => rounds.acceptBuzz("B"));

  // play
  ui.on("rounds.pass", () => rounds.passQuestion());
  ui.on("rounds.timer3", () => rounds.startTimer3());
  ui.on("rounds.answerClick", (ord) => rounds.revealAnswerByOrd(ord));
  ui.on("rounds.addX", () => rounds.addX());

  // steal/end
  ui.on("rounds.goSteal", () => rounds.goSteal());
  ui.on("rounds.stealMiss", () => rounds.stealMiss());
  ui.on("rounds.goEnd", () => rounds.goEndRound());
  ui.on("rounds.end", () => rounds.endRound());

  // FINAL (runtime – nie picker)
  final.bootIfNeeded();

  ui.on("final.start", () => final.startFinal());
  ui.on("final.back", (card) => store.setActiveCard(card));
  ui.on("final.backStep", (step) => final.backTo(step));

  ui.on("final.p1.timer", () => final.p1StartTimer());
  ui.on("final.p1.toQ", (n) => final.toP1MapQ(n));
  ui.on("final.p1.nextQ", (n) => final.nextFromP1Q(n));

  ui.on("final.p2.start", () => final.startP2Round());
  ui.on("final.p2.timer", () => final.p2StartTimer());
  ui.on("final.p2.toQ", (n) => final.toP2MapQ(n));
  ui.on("final.p2.nextQ", (n) => final.nextFromP2Q(n));

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
    ui.setEnabled("btnQrToggle", store.state.flags.displayOnline);
    ui.setEnabled(
      "btnDevicesToAudio",
      store.state.flags.displayOnline && store.state.flags.hostOnline && store.state.flags.buzzerOnline
    );

    ui.setEnabled(
      "btnDevicesFinish",
      store.state.steps.devices === "devices_audio" && store.state.flags.audioUnlocked
    );
    ui.setEnabled("btnSetupNext", store.teamsOk());
    ui.setEnabled("btnSetupFinish", store.canFinishSetup());

    ui.setFinalHasFinal(store.state.hasFinal === true);
    ui.setFinalConfirmed(store.state.final.confirmed === true);

    ui.setEnabled(
      "btnConfirmFinal",
      store.state.hasFinal === true &&
        store.state.final.confirmed === false &&
        store.state.final.picked.length === 5
    );
    ui.setEnabled(
      "btnEditFinal",
      store.state.hasFinal === true && store.state.final.confirmed === true
    );

    ui.setEnabled("btnStartRound", store.canStartRounds());

    // rounds HUD
    ui.setRoundsHud(store.state.rounds);

    // final UI – Start finału tylko na kroku f_start
    ui.setEnabled(
      "btnFinalStart",
      store.canEnterCard("final") && store.state.final.step === "f_start"
    );
  };

  store.subscribe(render);
  render();

  ui.setRoundsStep(
    store.state.rounds.phase === "IDLE" || store.state.rounds.phase === "READY"
      ? "READY"
      : store.state.rounds.phase === "INTRO"
      ? "INTRO"
      : "ROUND"
  );

  // boot view state
  ui.setQrToggleLabel(
    store.state.flags.qrOnDisplay,
    store.state.flags.hostOnline && store.state.flags.buzzerOnline
  );

  // init questions picker for final (setup karta)
  await finalPickerReload().catch(() => {});
}

main().catch((e) => {
  console.error(e);
  const el = document.getElementById("msgSide");
  if (el) el.textContent = e?.message || String(e);
});
