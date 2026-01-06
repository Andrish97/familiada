// /familiada/js/pages/control/app.js

// ================== KOMUNIKATY ==================
const APP_MSG = {
  NO_ID: "Brak ?id w URL.",
  GAME_NOT_READY: (reason) => `Ta gra nie jest gotowa do PLAY: ${reason}`,
  DATA_MISMATCH: "Rozjazd danych gry (validate vs games).",

  QR_LABEL: (kind) =>
    kind === "display" ? "Wyświetlacz" :
    kind === "host" ? "Prowadzący" :
    kind === "buzzer" ? "Przycisk" :
    "Urządzenie",

  QR_COPY_OK: "Skopiowano link do urządzenia.",
  QR_COPY_FAIL: "Nie udało się skopiować linka.",

  UNLOAD_WARN:
    "Jeśli teraz opuścisz tę stronę, bieżący stan gry zostanie utracony (zostaje tylko zwykłe odświeżenie).",

  CONFIRM_BACK:
    "Powrót do listy gier spowoduje utratę bieżącego stanu gry. Kontynuować?",

  AUDIO_OK: "Dźwięk odblokowany.",
  AUDIO_FAIL: "Nie udało się odblokować dźwięku.",

  TEAMS_SAVED: "Zapisano.",

  FINAL_CONFIRMED: "Zatwierdzono.",
};
// ================= KONIEC KOMUNIKATÓW =================

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
  if (!gameId) throw new Error(APP_MSG.NO_ID);

  const basic = await loadGameBasic(gameId);

  const v = await validateGameReadyToPlay(gameId);
  if (!v.ok) throw new Error(APP_MSG.GAME_NOT_READY(v.reason));

  const { data, error } = await sb()
    .from("games")
    .select("id,name,type,status,share_key_display,share_key_host,share_key_buzzer")
    .eq("id", gameId)
    .single();

  if (error) throw error;
  if (data?.id !== basic.id) throw new Error(APP_MSG.DATA_MISMATCH);
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

    titleEl.textContent = APP_MSG.QR_LABEL(kind);
    linkEl.value = url;
    imgEl.src = qrSrc(url);

    overlay.classList.remove("hidden");
  }

  async function copyQrLink() {
    const url = getDeviceUrl(currentQrKind);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      ui.showAlert(APP_MSG.QR_COPY_OK);
    } catch {
      ui.showAlert(APP_MSG.QR_COPY_FAIL);
    }
  }

  function openQrLink() {
    const url = getDeviceUrl(currentQrKind);
    if (!url) return;
    window.open(url, "_blank");
  }

  const store = createStore(game.id);
  store.hydrate();

  // === OSTRZEŻENIE PRZY WYJŚCIU ZE STRONY ===
  function shouldWarnBeforeUnload() {
    const s = store.state;
    const r = s.rounds || {};
    const totals = r.totals || { A: 0, B: 0 };

    const gameStarted = !!s.locks?.gameStarted;
    const finalActive = !!s.locks?.finalActive;

    const someRoundProgress =
      r.phase && r.phase !== "IDLE";

    const somePoints =
      (totals.A || 0) > 0 ||
      (totals.B || 0) > 0 ||
      (r.bankPts || 0) > 0;

    return gameStarted && (someRoundProgress || somePoints || finalActive);
  }

  window.addEventListener("beforeunload", (e) => {
    if (!shouldWarnBeforeUnload()) return;
    const msg = APP_MSG.UNLOAD_WARN;
    e.preventDefault();
    e.returnValue = msg;
    return msg;
  });

  // realtime channels
  const chDisplay = rt(`familiada-display:${game.id}`);
  const chHost = rt(`familiada-host:${game.id}`);
  const chBuzzer = rt(`familiada-buzzer:${game.id}`);

  const devices = createDevices({ game, ui, store, chDisplay, chHost, chBuzzer });
  const presence = createPresence({ game, ui, store, devices });

  const display = createDisplay({ devices, store });
  const rounds = createRounds({ ui, store, devices, display, loadQuestions, loadAnswers });
  rounds.bootIfNeeded();
  const final = createFinal({ ui, store, devices, display, loadAnswers });

  // ===== Realtime: BUZZER_EVT =====
  const chControlIn = sb()
    .channel(`familiada-control:${game.id}`)
    .on("broadcast", { event: "BUZZER_EVT" }, (msg) => {
      const line = String(msg?.payload?.line || "").trim().toUpperCase();
      const [cmd, team] = line.split(/\s+/);
      if (cmd === "CLICK" && (team === "A" || team === "B")) {
        rounds.handleBuzzerClick(team);
      }
    })
    .subscribe();

  // === PICKER PYTAŃ FINAŁU ===
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

  devices.initLinksAndQr();

  store.setAudioUnlocked(!!isAudioUnlocked());
  ui.setAudioStatus(store.state.flags.audioUnlocked);

  ui.mountNavigation({
    canEnter: (card) => store.canEnterCard(card),
    onNavigate: (card) => store.setActiveCard(card),
  });

  ui.on("top.back", () => {
    if (shouldWarnBeforeUnload()) {
      const ok = confirm(APP_MSG.CONFIRM_BACK);
      if (!ok) return;
    }
    location.href = "/familiada/builder.html";
  });

  ui.on("top.logout", async () => {
    await signOut().catch(() => {});
    location.href = "/familiada/index.html";
  });

  ui.on("auth.showQr", (kind) => showQrModal(kind));
  ui.on("auth.qr.close", () => hideQrModal());
  ui.on("auth.qr.copy", async () => await copyQrLink());
  ui.on("auth.qr.open", () => openQrLink());

  ui.on("devices.next", () => store.setDevicesStep("devices_hostbuzzer"));
  ui.on("devices.back", () => store.setDevicesStep("devices_display"));
  ui.on("devices.toAudio", () => store.setDevicesStep("devices_audio"));
  ui.on("audio.back", () => store.setDevicesStep("devices_hostbuzzer"));

  ui.on("audio.unlock", () => {
    const ok = unlockAudio();
    store.setAudioUnlocked(!!ok);
    ui.setAudioStatus(!!ok);
    ui.setMsg("msgAudio", ok ? APP_MSG.AUDIO_OK : APP_MSG.AUDIO_FAIL);
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
      await devices.sendQrToDisplay();
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
    ui.setMsg("msgTeams", APP_MSG.TEAMS_SAVED);
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
    ui.setMsg("msgFinalPick", APP_MSG.FINAL_CONFIRMED);
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

}

main().catch((e) => {
  console.error(e);
  const el = document.getElementById("msgSide");
  if (el) el.textContent = e?.message || String(e);
});
