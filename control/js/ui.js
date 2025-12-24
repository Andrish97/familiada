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
  function setImg(id, src) { const el = $(id); if (el) el.src = src || ""; }

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
    if ($("navRounds")) $("navRounds").disabled = !flags.rounds;
    if ($("navFinal")) $("navFinal").disabled = !flags.final;
  }

  function showDevicesStep(step) {
    const s1 = document.querySelector('[data-step="devices_display"]');
    const s2 = document.querySelector('[data-step="devices_hostbuzzer"]');
    const s3 = document.querySelector('[data-step="devices_audio"]');
    if (!s1 || !s2 || !s3) return;

    s1.classList.toggle("hidden", step !== "devices_display");
    s2.classList.toggle("hidden", step !== "devices_hostbuzzer");
    s3.classList.toggle("hidden", step !== "devices_audio");
  }

  function showSetupStep(step) {
    const a = document.querySelector('[data-step="setup_names"]');
    const b = document.querySelector('[data-step="setup_final"]');
    if (!a || !b) return;
    a.classList.toggle("hidden", step !== "setup_names");
    b.classList.toggle("hidden", step !== "setup_final");
  }

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

  function showAlert(text) {
    const bar = $("alertBar");
    const txt = $("alertTxt");
    if (txt) txt.textContent = text;
    bar?.classList.remove("hidden");
  }
  function hideAlert() { $("alertBar")?.classList.add("hidden"); }

  function setAudioStatus(unlocked) {
    const el = $("audioStatus");
    if (!el) return;
    el.classList.remove("ok","bad","mid");
    el.classList.add(unlocked ? "ok" : "bad");
    el.textContent = unlocked ? "OK" : "ZABLOKOWANE";
  }

  function getTeamA() { return String($("teamA")?.value ?? "").trim(); }
  function getTeamB() { return String($("teamB")?.value ?? "").trim(); }

  function setFinalHasFinal(on) {
    const card = $("finalPickerCard");
    if (!card) return;
    card.style.display = on ? "" : "none";
  }

  function setFinalConfirmed(confirmed) {
    const only = $("finalOnlyView");
    const btnEdit = $("btnEditFinal");
    const btnConfirm = $("btnConfirmFinal");

    if (only) only.style.display = confirmed ? "" : "none";
    if (btnEdit) btnEdit.style.display = confirmed ? "" : "none";
    if (btnConfirm) btnConfirm.style.display = confirmed ? "none" : "";
  }

  function setQrToggleLabel(isOn) {
    const b = $("btnQrToggle");
    if (!b) return;
    b.textContent = isOn ? "Ukryj QR" : "QR na wyświetlaczu";
  }

  function setRoundsHud(r) {
    setText("roundNo", String(r.roundNo));
    setText("controlTeam", r.controlTeam ? (r.controlTeam === "A" ? "A" : "B") : "—");
    setText("bankPts", String(r.bankPts));
    setText("xA", String(r.xA));
    setText("xB", String(r.xB));
    setText("t3", r.timer3.running ? String(r.timer3.secLeft ?? 3) : "—");
  }

  function setGameHeader(name, meta) {
    setText("gameLabel", name ? `Control — ${name}` : "Control");
    setText("gameMeta", meta || "");
  }

  function setRoundQuestion(text) { setText("roundQuestion", text || "—"); }

  function renderRoundAnswers(answers, revealedSet) {
    const root = $("roundAnswers");
    if (!root) return;

    root.innerHTML = answers
      .slice()
      .sort((a,b) => (a.ord||0) - (b.ord||0))
      .map((a) => {
        const rev = revealedSet?.has?.(a.ord) ? "revealed" : "";
        const pts = Number(a.fixed_points ?? 0);
        return `
          <button class="ansBtn ${rev}" type="button" data-ord="${a.ord}">
            <div class="ansTop"><span>#${a.ord}</span><span>${rev ? pts : "—"}</span></div>
            <div class="ansText">${escapeHtml(rev ? a.text : "—")}</div>
          </button>
        `;
      })
      .join("");

    root.querySelectorAll("button[data-ord]").forEach((b) => {
      b.addEventListener("click", () => emit("rounds.answerClick", Number(b.dataset.ord)));
    });
  }

  function setFinalStatusList(linesHtml) {
    const root = $("finalStatusList");
    if (root) root.innerHTML = linesHtml || "";
  }
  function setFinalInputs(html) {
    const root = $("finalInputs");
    if (root) root.innerHTML = html || "";
  }
  function setFinalMapping(html) {
    const root = $("finalMapping");
    if (root) root.innerHTML = html || "";
  }

  // ROUNDS: sterowanie widokami kroków
  function setRoundsStep(step) {
    const a = $("rStepReady");
    const b = $("rStepIntro");
    const c = $("rStepRound");
    if (!a || !b || !c) return;

    a.classList.toggle("hidden", step !== "READY");
    b.classList.toggle("hidden", step !== "INTRO");
    c.classList.toggle("hidden", step !== "ROUND");
  }

  function wire() {
    $("btnBack")?.addEventListener("click", () => emit("top.back"));
    $("btnLogout")?.addEventListener("click", () => emit("top.logout"));
    $("btnAlertClose")?.addEventListener("click", () => hideAlert());

    // devices
    $("btnDevicesNext")?.addEventListener("click", () => emit("devices.next"));
    $("btnDevicesBack")?.addEventListener("click", () => emit("devices.back"));
    $("btnDevicesToAudio")?.addEventListener("click", () => emit("devices.toAudio"));
    $("btnAudioBack")?.addEventListener("click", () => emit("audio.back"));
    $("btnDevicesFinish")?.addEventListener("click", () => emit("devices.finish"));

    $("btnUnlockAudio")?.addEventListener("click", () => emit("audio.unlock"));

    $("btnCopyDisplay")?.addEventListener("click", () => emit("devices.copyDisplay"));
    $("btnCopyHost")?.addEventListener("click", () => emit("devices.copyHost"));
    $("btnCopyBuzzer")?.addEventListener("click", () => emit("devices.copyBuzzer"));

    $("btnOpenDisplay")?.addEventListener("click", () => emit("devices.openDisplay"));
    $("btnOpenHost")?.addEventListener("click", () => emit("devices.openHost"));
    $("btnOpenBuzzer")?.addEventListener("click", () => emit("devices.openBuzzer"));

    $("btnDispBlack")?.addEventListener("click", () => emit("display.black"));
    $("btnQrToggle")?.addEventListener("click", () => emit("qr.toggle"));

    // setup
    $("btnBackToDevices")?.addEventListener("click", () => emit("setup.backToDevices"));
    $("btnSaveTeams")?.addEventListener("click", () => emit("teams.save"));
    $("btnSetupNext")?.addEventListener("click", () => emit("setup.next"));
    $("btnSetupBack")?.addEventListener("click", () => emit("setup.back"));
    $("btnSetupFinish")?.addEventListener("click", () => emit("setup.finish"));

    $("btnTeamMore")?.addEventListener("click", () => {
      $("teamExtra")?.classList.toggle("hidden");
    });

    // LIVE wpis nazw + Enter -> następne pole (bez zatwierdzania)
    const a = $("teamA");
    const b = $("teamB");
    if (a && b) {
      a.addEventListener("input", () => emit("teams.change", { teamA: a.value, teamB: b.value }));
      b.addEventListener("input", () => emit("teams.change", { teamA: a.value, teamB: b.value }));

      a.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); b.focus(); }
      });
      b.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); b.blur(); }
      });
    }

    $("finalYes")?.addEventListener("change", () => emit("final.toggle", true));
    $("finalNo")?.addEventListener("change", () => emit("final.toggle", false));
    $("btnReloadQuestions")?.addEventListener("click", () => emit("final.reload"));
    $("btnConfirmFinal")?.addEventListener("click", () => emit("final.confirm"));
    $("btnEditFinal")?.addEventListener("click", () => emit("final.edit"));

    // rounds (kroki)
    $("btnBackToSetup")?.addEventListener("click", () => emit("rounds.backToSetup"));
    $("btnGameReady")?.addEventListener("click", () => emit("game.ready"));
    $("btnStartShowIntro")?.addEventListener("click", () => emit("game.startIntro"));
    $("btnStartRound")?.addEventListener("click", () => emit("rounds.start"));

    $("btnBuzzEnable")?.addEventListener("click", () => emit("buzz.enable"));
    $("btnBuzzAcceptA")?.addEventListener("click", () => emit("buzz.acceptA"));
    $("btnBuzzAcceptB")?.addEventListener("click", () => emit("buzz.acceptB"));

    $("btnPassQuestion")?.addEventListener("click", () => emit("rounds.pass"));
    $("btnStartTimer3")?.addEventListener("click", () => emit("rounds.timer3"));

    $("btnAddX")?.addEventListener("click", () => emit("rounds.addX"));
    $("btnStealTry")?.addEventListener("click", () => emit("rounds.stealTry"));
    $("btnEndRound")?.addEventListener("click", () => emit("rounds.end"));

    // final
    $("btnFinalBackToRounds")?.addEventListener("click", () => emit("final.back"));
    $("btnFinalStart")?.addEventListener("click", () => emit("final.start"));
    $("btnFinalToMapping")?.addEventListener("click", () => emit("final.toMapping"));
    $("btnFinalRevealAll")?.addEventListener("click", () => emit("final.revealAll"));
    $("btnFinalCommit")?.addEventListener("click", () => emit("final.commit"));
    $("btnFinalFinish")?.addEventListener("click", () => emit("final.finish"));
  }

  wire();

  return {
    on, emit,

    setMsg, setText, setValue, setEnabled, setImg,

    showCard,
    mountNavigation,
    setNavEnabled,

    showDevicesStep,
    showSetupStep,

    setDeviceBadges,
    setDeviceBadgesUnavailable,

    showAlert,
    setAudioStatus,

    getTeamA, getTeamB,

    setFinalHasFinal,
    setFinalConfirmed,

    setQrToggleLabel,

    setRoundsHud,
    setRoundsStep,
    setRoundQuestion,
    renderRoundAnswers,

    setFinalStatusList,
    setFinalInputs,
    setFinalMapping,

    setGameHeader,
  };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
