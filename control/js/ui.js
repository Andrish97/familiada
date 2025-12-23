// control/js/ui.js
export function createUI() {
  const handlers = new Map(); // event -> Set(fn)

  function on(evt, fn) {
    if (!handlers.has(evt)) handlers.set(evt, new Set());
    handlers.get(evt).add(fn);
    return () => handlers.get(evt).delete(fn);
  }

  function emit(evt, payload) {
    const set = handlers.get(evt);
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  const $ = (id) => document.getElementById(id);

  // --- navigation ---
  function mountNavigation({ isUnlocked, onNavigate }) {
    document.querySelectorAll(".navItem[data-card]").forEach((b) => {
      b.addEventListener("click", () => {
        const card = b.dataset.card;
        if (!card) return;
        if (!isUnlocked(card)) return;
        onNavigate(card);
        showCard(card);
      });
    });
  }

  function showCard(card) {
    document.querySelectorAll(".cardPanel[data-card]").forEach((p) => p.classList.add("hidden"));
    const panel = document.querySelector(`.cardPanel[data-card="${card}"]`);
    panel?.classList.remove("hidden");

    document.querySelectorAll(".navItem[data-card]").forEach((b) => b.classList.remove("active"));
    const nb = document.querySelector(`.navItem[data-card="${card}"]`);
    nb?.classList.add("active");
  }

  function updateNavEnabled({ setup, game, final }) {
    if ($("navSetup")) $("navSetup").disabled = !setup;
    if ($("navGame")) $("navGame").disabled = !game;
    if ($("navFinal")) $("navFinal").disabled = !final;
  }

  function updateLocks({ devices, setup, game, final }) {
    setLock("lockSetup", setup);
    setLock("lockGame", game);
    setLock("lockFinal", final);
  }

  function setLock(id, unlocked) {
    const el = $(id);
    if (!el) return;
    el.textContent = unlocked ? "" : "🔒";
  }

  // --- steps ---
  function showDevicesStep(step) {
    const a = document.querySelector('[data-step="devices_display"]');
    const b = document.querySelector('[data-step="devices_hostbuzzer"]');
    if (!a || !b) return;

    if (step === "devices_display") {
      a.classList.remove("hidden");
      b.classList.add("hidden");
    } else {
      a.classList.add("hidden");
      b.classList.remove("hidden");
    }
  }

  function showSetupStep(step) {
    const a = document.querySelector('[data-step="setup_names"]');
    const b = document.querySelector('[data-step="setup_final"]');
    if (!a || !b) return;

    if (step === "setup_names") {
      a.classList.remove("hidden");
      b.classList.add("hidden");
    } else {
      a.classList.add("hidden");
      b.classList.remove("hidden");
    }
  }

  // --- device badges & top dots ---
  function badge(el, status, text) {
    if (!el) return;
    el.classList.remove("ok", "bad", "mid");
    el.classList.add(status);
    el.textContent = text;
  }

  function dot(el, status) {
    if (!el) return;
    el.classList.remove("ok", "bad", "mid");
    el.classList.add(status);
  }

  function setDeviceBadges({ display, host, buzzer }) {
    badge($("pillDisplay"), display.on ? "ok" : "bad", display.on ? "OK" : "OFFLINE");
    badge($("pillHost"), host.on ? "ok" : "bad", host.on ? "OK" : "OFFLINE");
    badge($("pillBuzzer"), buzzer.on ? "ok" : "bad", buzzer.on ? "OK" : "OFFLINE");

    if ($("seenDisplay")) $("seenDisplay").textContent = display.seen || "—";
    if ($("seenHost")) $("seenHost").textContent = host.seen || "—";
    if ($("seenBuzzer")) $("seenBuzzer").textContent = buzzer.seen || "—";

    dot($("dotDisplay"), display.on ? "ok" : "bad");
    dot($("dotHost"), host.on ? "ok" : "bad");
    dot($("dotBuzzer"), buzzer.on ? "ok" : "bad");
  }

  function setDeviceBadgesUnavailable() {
    badge($("pillDisplay"), "mid", "—");
    badge($("pillHost"), "mid", "—");
    badge($("pillBuzzer"), "mid", "—");

    if ($("seenDisplay")) $("seenDisplay").textContent = "brak";
    if ($("seenHost")) $("seenHost").textContent = "brak";
    if ($("seenBuzzer")) $("seenBuzzer").textContent = "brak";

    dot($("dotDisplay"), "mid");
    dot($("dotHost"), "mid");
    dot($("dotBuzzer"), "mid");
  }

  // --- helpers ---
  function setMsg(id, text) { const el = $(id); if (el) el.textContent = text || ""; }
  function setText(id, text) { const el = $(id); if (el) el.textContent = text ?? ""; }
  function setValue(id, value) { const el = $(id); if (el) el.value = value ?? ""; }
  function setEnabled(id, enabled) { const el = $(id); if (el) el.disabled = !enabled; }
  function el(id) { return $(id); }

  // --- buzz log ---
  function appendBuzzLog(line) {
    const log = $("buzzLog");
    if (!log) return;
    const ts = new Date().toLocaleTimeString();
    log.textContent = `[${ts}] ${line}\n` + (log.textContent || "");
  }

  // --- QR modal ---
  function openQrModal({ hostUrl, buzzerUrl }) {
    const modal = $("qrModal");
    const hostImg = $("qrHostImg");
    const buzImg = $("qrBuzzerImg");
    const hostTxt = $("qrHostUrl");
    const buzTxt = $("qrBuzzerUrl");

    if (hostImg) hostImg.src = qrSrc(hostUrl);
    if (buzImg) buzImg.src = qrSrc(buzzerUrl);
    if (hostTxt) hostTxt.textContent = hostUrl;
    if (buzTxt) buzTxt.textContent = buzzerUrl;

    modal?.classList.remove("hidden");
  }

  function closeQrModal() {
    $("qrModal")?.classList.add("hidden");
  }

  function qrSrc(url) {
    const u = encodeURIComponent(String(url));
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${u}`;
  }

  // --- final picker visibility ---
  function setFinalPickerVisible(visible) {
    const card = $("finalPickerCard");
    if (!card) return;
    card.style.display = visible ? "" : "none";
  }

  function setGameMeta(game) {
    if ($("gameLabel")) $("gameLabel").textContent = `Control — ${game.name}`;
    if ($("gameMeta")) $("gameMeta").textContent = `${game.type} / ${game.status} / ${game.id}`;
  }

  function getTeamA() { return String($("teamA")?.value ?? "").trim(); }
  function getTeamB() { return String($("teamB")?.value ?? "").trim(); }

  function setFinalStatus(store) {
    const el = $("finalStatus");
    if (!el) return;

    if (store.state.hasFinal !== true) {
      el.textContent = "Finał wyłączony albo nieustawiony.";
      return;
    }
    const n = store.state.finalQuestionIds.length;
    el.textContent = n === 5 ? "Finał włączony. Wybrano 5 pytań." : `Finał włączony, ale brakuje pytań: ${n}/5.`;
  }

  // --- wire DOM events (once) ---
  function wire() {
    // topbar
    $("btnBack")?.addEventListener("click", () => emit("top.back"));
    $("btnLogout")?.addEventListener("click", () => emit("top.logout"));

    // devices step buttons
    $("btnDevicesNext")?.addEventListener("click", () => emit("devices.next"));
    $("btnDevicesBack")?.addEventListener("click", () => emit("devices.back"));
    $("btnDevicesFinish")?.addEventListener("click", () => emit("nav.goSetup"));

    // link buttons
    $("btnOpenDisplay")?.addEventListener("click", () => emit("devices.openDisplay"));
    $("btnOpenHost")?.addEventListener("click", () => emit("devices.openHost"));
    $("btnOpenBuzzer")?.addEventListener("click", () => emit("devices.openBuzzer"));

    $("btnCopyDisplay")?.addEventListener("click", () => emit("devices.copyDisplay"));
    $("btnCopyHost")?.addEventListener("click", () => emit("devices.copyHost"));
    $("btnCopyBuzzer")?.addEventListener("click", () => emit("devices.copyBuzzer"));

    // qr modal
    $("btnOpenQrModal")?.addEventListener("click", () => emit("qr.open"));
    $("btnQrClose")?.addEventListener("click", () => closeQrModal());
    $("qrBack")?.addEventListener("click", () => closeQrModal());

    $("btnQrCopyHost")?.addEventListener("click", () => emit("qr.copyHost"));
    $("btnQrCopyBuzzer")?.addEventListener("click", () => emit("qr.copyBuzzer"));

    // display QR/black
    $("btnDispBlack")?.addEventListener("click", () => emit("display.black"));
    $("btnDispQr")?.addEventListener("click", () => emit("display.qr"));

    // devices log
    $("btnBuzzLogClear")?.addEventListener("click", () => { if ($("buzzLog")) $("buzzLog").textContent = ""; });

    // setup step buttons
    $("btnSetupNext")?.addEventListener("click", () => emit("setup.next"));
    $("btnSetupBack")?.addEventListener("click", () => emit("setup.back"));
    $("btnSetupFinish")?.addEventListener("click", () => emit("setup.finish"));

    // teams
    $("btnSaveTeams")?.addEventListener("click", () => emit("teams.save"));

    // final yes/no
    $("finalYes")?.addEventListener("change", () => emit("final.toggle", true));
    $("finalNo")?.addEventListener("change", () => emit("final.toggle", false));

    // final picker
    $("btnReloadQuestions")?.addEventListener("click", () => emit("final.reload"));
    $("btnSaveFinalQs")?.addEventListener("click", () => emit("final.save"));

    // game
    $("btnGameReady")?.addEventListener("click", () => emit("game.ready"));
    $("btnShowLogo")?.addEventListener("click", () => emit("game.showLogo"));
    $("btnHideBoard")?.addEventListener("click", () => emit("game.hide"));
  }

  wire();

  return {
    on,
    emit,

    mountNavigation,
    showCard,
    updateNavEnabled,
    updateLocks,

    showDevicesStep,
    showSetupStep,

    setDeviceBadges,
    setDeviceBadgesUnavailable,

    setMsg,
    setText,
    setValue,
    setEnabled,
    el,

    appendBuzzLog,
    openQrModal,
    closeQrModal,

    setFinalPickerVisible,

    setGameMeta,
    getTeamA,
    getTeamB,
    setFinalStatus,
  };
}


