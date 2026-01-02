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

  function setHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
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

  function showFinalStep(step) {
    document.querySelectorAll('.cardPanel[data-card="final"] .step[data-step]')
      .forEach((s) => s.classList.add("hidden"));
    document.querySelector(`.cardPanel[data-card="final"] .step[data-step="${step}"]`)
      ?.classList.remove("hidden");
  }

  function setRoundsStep(step) {
    document.querySelectorAll('[data-round-step]').forEach(el => {
      el.classList.toggle(
        "hidden",
        el.dataset.roundStep !== step
      );
    });
  }

  function setQrToggleLabel(isOn, hostAndBuzzerOnline = false) {
    const b = $("btnQrToggle");
    if (!b) return;
  
    // Gdy QR są pokazane:
    // - jeśli host i buzzer są już online, sensowniejsze jest "Czarny ekran"
    // - w przeciwnym razie "Schowaj QR"
    if (isOn) {
      b.textContent = hostAndBuzzerOnline ? "Czarny ekran" : "Schowaj QR";
      return;
    }
  
    b.textContent = "QR na wyświetlaczu";
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

  function renderRoundAnswers(answers, revealedSet, rootId = "roundAnswers") {
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
  function showRoundsStep(step) {
    document.querySelectorAll('.cardPanel[data-card="rounds"] .step[data-step]')
      .forEach((s) => s.classList.add("hidden"));
    document.querySelector(`.cardPanel[data-card="rounds"] .step[data-step="${step}"]`)
      ?.classList.remove("hidden");
  }

  function wire() {
    $("btnBack")?.addEventListener("click", () => emit("top.back"));
    $("btnLogout")?.addEventListener("click", () => emit("top.logout"));
    $("btnAlertClose")?.addEventListener("click", () => hideAlert());

        // auth bar – kliknięcie w status urządzeń
    const topDisplayRow = $("dotDisplay")?.parentElement;
    if (topDisplayRow) {
      topDisplayRow.addEventListener("click", () => emit("auth.showQr", "display"));
    }
    const topHostRow = $("dotHost")?.parentElement;
    if (topHostRow) {
      topHostRow.addEventListener("click", () => emit("auth.showQr", "host"));
    }
    const topBuzzerRow = $("dotBuzzer")?.parentElement;
    if (topBuzzerRow) {
      topBuzzerRow.addEventListener("click", () => emit("auth.showQr", "buzzer"));
    }

    // modal QR
    $("qrModalClose")?.addEventListener("click", () => emit("auth.qr.close"));
    $("qrModalCopy")?.addEventListener("click", () => emit("auth.qr.copy"));
    $("qrModalOpen")?.addEventListener("click", () => emit("auth.qr.open"));
    $("qrModalOverlay")?.addEventListener("click", (ev) => {
      if (ev.target && ev.target.id === "qrModalOverlay") emit("auth.qr.close");
    });

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
    
    $("btnBuzzRetry")?.addEventListener("click", () => emit("buzz.retry"));
    
    $("btnGoSteal")?.addEventListener("click", () => emit("rounds.goSteal"));
    $("btnStealMiss")?.addEventListener("click", () => emit("rounds.stealMiss"));
    $("btnGoEndRound")?.addEventListener("click", () => emit("rounds.goEnd"));
    $("btnGoEndRoundFromSteal")?.addEventListener("click", () => emit("rounds.goEnd"));


    // final (kroki)
    $("btnFinalP1StartTimer")?.addEventListener("click", () => emit("final.p1.timerStart"));
    $("btnFinalP1Next")?.addEventListener("click", () => emit("final.p1.next"));
    
    $("btnFinalP1MapPrev")?.addEventListener("click", () => emit("final.p1.mapPrev"));
    $("btnFinalP1MapNext")?.addEventListener("click", () => emit("final.p1.mapNext"));
    
    $("btnFinalRound2Back")?.addEventListener("click", () => emit("final.round2.back"));
    $("btnFinalRound2Start")?.addEventListener("click", () => emit("final.round2.start"));
    
    $("btnFinalP2StartTimer")?.addEventListener("click", () => emit("final.p2.timerStart"));
    $("btnFinalP2Next")?.addEventListener("click", () => emit("final.p2.next"));
    
    $("btnFinalP2MapPrev")?.addEventListener("click", () => emit("final.p2.mapPrev"));
    $("btnFinalP2MapNext")?.addEventListener("click", () => emit("final.p2.mapNext"));
    
    $("btnFinalFinishBack")?.addEventListener("click", () => emit("final.finish.back"));
    $("btnFinalStart")?.addEventListener("click", () => emit("final.start"));

    $("btnFinalBackToRounds")?.addEventListener("click", () => emit("final.back", "rounds"));
    
    $("btnFinalBackFromP1Entry")?.addEventListener("click", () => emit("final.backStep", "f_start"));
    $("btnFinalP1StartTimer")?.addEventListener("click", () => emit("final.p1.timer"));
    $("btnFinalToP1MapQ1")?.addEventListener("click", () => emit("final.p1.toQ", 1));
    
    $("btnFinalBackFromP1Q1")?.addEventListener("click", () => emit("final.backStep", "f_p1_entry"));
    $("btnFinalNextFromP1Q1")?.addEventListener("click", () => emit("final.p1.nextQ", 1));
    $("btnFinalBackFromP1Q2")?.addEventListener("click", () => emit("final.backStep", "f_p1_map_q1"));
    $("btnFinalNextFromP1Q2")?.addEventListener("click", () => emit("final.p1.nextQ", 2));
    $("btnFinalBackFromP1Q3")?.addEventListener("click", () => emit("final.backStep", "f_p1_map_q2"));
    $("btnFinalNextFromP1Q3")?.addEventListener("click", () => emit("final.p1.nextQ", 3));
    $("btnFinalBackFromP1Q4")?.addEventListener("click", () => emit("final.backStep", "f_p1_map_q3"));
    $("btnFinalNextFromP1Q4")?.addEventListener("click", () => emit("final.p1.nextQ", 4));
    $("btnFinalBackFromP1Q5")?.addEventListener("click", () => emit("final.backStep", "f_p1_map_q4"));
    $("btnFinalNextFromP1Q5")?.addEventListener("click", () => emit("final.p1.nextQ", 5));
    
    $("btnFinalBackFromP2Start")?.addEventListener("click", () => emit("final.backStep", "f_p1_map_q5"));
    $("btnFinalStartP2")?.addEventListener("click", () => emit("final.p2.start"));
    
    $("btnFinalBackFromP2Entry")?.addEventListener("click", () => emit("final.backStep", "f_p2_start"));
    $("btnFinalP2StartTimer")?.addEventListener("click", () => emit("final.p2.timer"));
    $("btnFinalToP2MapQ1")?.addEventListener("click", () => emit("final.p2.toQ", 1));
    
    $("btnFinalBackFromP2Q1")?.addEventListener("click", () => emit("final.backStep", "f_p2_entry"));
    $("btnFinalNextFromP2Q1")?.addEventListener("click", () => emit("final.p2.nextQ", 1));
    $("btnFinalBackFromP2Q2")?.addEventListener("click", () => emit("final.backStep", "f_p2_map_q1"));
    $("btnFinalNextFromP2Q2")?.addEventListener("click", () => emit("final.p2.nextQ", 2));
    $("btnFinalBackFromP2Q3")?.addEventListener("click", () => emit("final.backStep", "f_p2_map_q2"));
    $("btnFinalNextFromP2Q3")?.addEventListener("click", () => emit("final.p2.nextQ", 3));
    $("btnFinalBackFromP2Q4")?.addEventListener("click", () => emit("final.backStep", "f_p2_map_q3"));
    $("btnFinalNextFromP2Q4")?.addEventListener("click", () => emit("final.p2.nextQ", 4));
    $("btnFinalBackFromP2Q5")?.addEventListener("click", () => emit("final.backStep", "f_p2_map_q4"));
    $("btnFinalNextFromP2Q5")?.addEventListener("click", () => emit("final.p2.nextQ", 5));
    
    $("btnFinalBackFromEnd")?.addEventListener("click", () => emit("final.backStep", "f_p2_map_q5"));
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
    showFinalStep,

    setQrToggleLabel,

    setRoundsHud,
    setRoundsStep,
    setRoundQuestion,
    
    renderRoundAnswers,
    showRoundsStep,
    setFinalStatusList,
    setFinalInputs,
    setFinalMapping,

    setGameHeader,
    setHtml,
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
