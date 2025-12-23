// control/js/ui.js
export function createUI() {
  const handlers = new Map();
  const $ = (id) => document.getElementById(id);

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

  function setMsg(id, text) { const el = $(id); if (el) el.textContent = text || ""; }
  function setText(id, text) { const el = $(id); if (el) el.textContent = text ?? ""; }
  function setValue(id, value) { const el = $(id); if (el) el.value = value ?? ""; }
  function setEnabled(id, enabled) { const el = $(id); if (el) el.disabled = !enabled; }

  function showCard(card) {
    document.querySelectorAll(".cardPanel[data-card]").forEach((p) => p.classList.add("hidden"));
    document.querySelector(`.cardPanel[data-card="${card}"]`)?.classList.remove("hidden");

    document.querySelectorAll(".navItem[data-card]").forEach((b) => b.classList.remove("active"));
    document.querySelector(`.navItem[data-card="${card}"]`)?.classList.add("active");
  }

  function mountNavigation({ canEnter, onNavigate }) {
    document.querySelectorAll(".navItem[data-card]").forEach((b) => {
      b.addEventListener("click", () => {
        const card = b.dataset.card;
        if (!card) return;
        if (!canEnter(card)) return;
        onNavigate(card);
        showCard(card);
      });
    });
  }

  function setNavEnabled(flags) {
    if ($("navDevices")) $("navDevices").disabled = !flags.devices;
    if ($("navSetup")) $("navSetup").disabled = !flags.setup;
    if ($("navGame")) $("navGame").disabled = !flags.game;
    if ($("navFinal")) $("navFinal").disabled = !flags.final;
  }

  function showDevicesStep(step) {
    const a = document.querySelector('[data-step="devices_display"]');
    const b = document.querySelector('[data-step="devices_hostbuzzer"]');
    if (!a || !b) return;
    if (step === "devices_display") { a.classList.remove("hidden"); b.classList.add("hidden"); }
    else { a.classList.add("hidden"); b.classList.remove("hidden"); }
  }

  function showSetupStep(step) {
    const a = document.querySelector('[data-step="setup_names"]');
    const b = document.querySelector('[data-step="setup_final"]');
    if (!a || !b) return;
    if (step === "setup_names") { a.classList.remove("hidden"); b.classList.add("hidden"); }
    else { a.classList.add("hidden"); b.classList.remove("hidden"); }
  }

  // badges + dots
  function badge(el, status, text) {
    if (!el) return;
    el.classList.remove("ok","bad","mid");
    el.classList.add(status);
    el.textContent = text;
  }
  function dot(el, status) {
    if (!el) return;
    el.classList.remove("ok","bad","mid");
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

  // QR inline
  function setQrInlineVisible(visible) {
    const el = $("qrInlineCard");
    if (!el) return;
    el.style.display = visible ? "" : "none";
  }

  function setQrInline({ hostUrl, buzzerUrl, hostImgSrc, buzzerImgSrc }) {
    if ($("qrHostInlineImg")) $("qrHostInlineImg").src = hostImgSrc;
    if ($("qrBuzzerInlineImg")) $("qrBuzzerInlineImg").src = buzzerImgSrc;
    if ($("qrHostInlineUrl")) $("qrHostInlineUrl").textContent = hostUrl;
    if ($("qrBuzzerInlineUrl")) $("qrBuzzerInlineUrl").textContent = buzzerUrl;
  }

  function setCardQr({ hostUrl, buzzerUrl, hostImgSrc, buzzerImgSrc }) {
    if ($("qrHostCardImg")) $("qrHostCardImg").src = hostImgSrc;
    if ($("qrBuzzerCardImg")) $("qrBuzzerCardImg").src = buzzerImgSrc;
    if ($("qrHostCardUrl")) $("qrHostCardUrl").textContent = hostUrl;
    if ($("qrBuzzerCardUrl")) $("qrBuzzerCardUrl").textContent = buzzerUrl;
  }

  // final picker visibility
  function setFinalPickerVisible(visible) {
    const card = $("finalPickerCard");
    if (!card) return;
    card.style.display = visible ? "" : "none";
  }

  // teams getters
  function getTeamA() { return String($("teamA")?.value ?? "").trim(); }
  function getTeamB() { return String($("teamB")?.value ?? "").trim(); }

  function setGameName(name) {
    if ($("gameLabel")) $("gameLabel").textContent = `Control — ${name}`;
    if ($("gameMeta")) $("gameMeta").textContent = ""; // mniej śmieci w UI
  }

  function setFinalStatus(store) {
    const el = $("finalStatus");
    if (!el) return;
    if (store.state.hasFinal !== true) { el.textContent = "Finał wyłączony albo nieustawiony."; return; }
    const n = store.state.finalQuestionIds.length;
    el.textContent = n === 5 ? "Finał włączony. Wybrano 5 pytań." : `Finał włączony, ale brakuje pytań: ${n}/5.`;
  }

  // alerts
  function showAlert(text) {
    const bar = $("alertBar");
    const txt = $("alertTxt");
    if (txt) txt.textContent = text;
    bar?.classList.remove("hidden");
    // hard fallback:
    try { window.alert(text); } catch {}
  }

  function hideAlert() {
    $("alertBar")?.classList.add("hidden");
  }

  // wire once
  function wire() {
    $("btnBack")?.addEventListener("click", () => emit("top.back"));
    $("btnLogout")?.addEventListener("click", () => emit("top.logout"));

    $("btnAlertClose")?.addEventListener("click", () => hideAlert());

    // devices steps
    $("btnDevicesNext")?.addEventListener("click", () => emit("devices.next"));
    $("btnDevicesBack")?.addEventListener("click", () => emit("devices.back"));
    $("btnDevicesFinish")?.addEventListener("click", () => emit("devices.finish"));

    // links
    $("btnOpenDisplay")?.addEventListener("click", () => emit("devices.openDisplay"));
    $("btnOpenHost")?.addEventListener("click", () => emit("devices.openHost"));
    $("btnOpenBuzzer")?.addEventListener("click", () => emit("devices.openBuzzer"));

    $("btnCopyDisplay")?.addEventListener("click", () => emit("devices.copyDisplay"));
    $("btnCopyHost")?.addEventListener("click", () => emit("devices.copyHost"));
    $("btnCopyBuzzer")?.addEventListener("click", () => emit("devices.copyBuzzer"));

    $("btnDispBlack")?.addEventListener("click", () => emit("display.black"));

    $("btnSendQrToDisplay")?.addEventListener("click", () => emit("display.sendQrToDisplay"));
    $("btnSendQrToDisplay2")?.addEventListener("click", () => emit("display.sendQrToDisplay"));

    // setup
    $("btnSaveTeams")?.addEventListener("click", () => emit("teams.save"));
    $("btnSetupNext")?.addEventListener("click", () => emit("setup.next"));
    $("btnSetupBack")?.addEventListener("click", () => emit("setup.back"));
    $("btnSetupFinish")?.addEventListener("click", () => emit("setup.finish"));

    $("finalYes")?.addEventListener("change", () => emit("final.toggle", true));
    $("finalNo")?.addEventListener("change", () => emit("final.toggle", false));

    $("btnReloadQuestions")?.addEventListener("click", () => emit("final.reload"));
    $("btnSaveFinalQs")?.addEventListener("click", () => emit("final.save"));

    // game
    $("btnGameReady")?.addEventListener("click", () => emit("game.ready"));
  }

  wire();

  return {
    on,
    emit,

    mountNavigation,
    showCard,
    setNavEnabled,

    showDevicesStep,
    showSetupStep,

    setDeviceBadges,
    setDeviceBadgesUnavailable,

    setMsg,
    setText,
    setValue,
    setEnabled,

    setQrInlineVisible,
    setQrInline,
    setCardQr,

    setFinalPickerVisible,
    setFinalStatus,

    getTeamA,
    getTeamB,

    setGameName,

    showAlert,
  };
}
