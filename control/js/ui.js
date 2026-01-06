// /familiada/js/pages/control/ui.js

// ================== KOMUNIKATY (UI) ==================
const UI_MSG = {
  DEVICE_STATUS_OK: "OK",
  DEVICE_STATUS_OFFLINE: "OFFLINE",
  DEVICE_STATUS_NONE: "—",
  DEVICE_SEEN_NONE: "brak",

  AUDIO_OK: "OK",
  AUDIO_BLOCKED: "ZABLOKOWANE",

  CONTROL_PREFIX: "Control — ",
  CONTROL_TITLE: "Control",

  QR_ON_DISPLAY: "QR na wyświetlaczu",
  QR_HIDE: "Schowaj QR",
  QR_BLACK_SCREEN: "Czarny ekran",

  DASH: "—",
  ANSWER_FALLBACK: "—",
};
// =====================================================

export function createUI() {
  const $ = (id) => document.getElementById(id);

  // prosty event-bus
  const handlers = new Map();

  function on(event, fn) {
    if (!handlers.has(event)) {
      handlers.set(event, new Set());
    }
    handlers.get(event).add(fn);
  }

  function emit(event, payload) {
    const set = handlers.get(event);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (e) {
        console.error("[ui] handler error", e);
      }
    }
  }

  function setHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function setMsg(id, text) {
    const el = typeof id === "string" ? $(id) : id;
    if (el && "textContent" in el) {
      el.textContent = text || "";
    }
  }

  function setText(target, text) {
    const el = typeof target === "string" ? document.getElementById(target) : target;
    if (el && "textContent" in el) {
      el.textContent = text ?? "";
    }
  }

  function setValue(target, value) {
    const el = typeof target === "string" ? document.getElementById(target) : target;
    if (el && "value" in el) {
      el.value = value ?? "";
    }
  }

  function setEnabled(target, enabled) {
    const el = typeof target === "string" ? document.getElementById(target) : target;
    if (el && "disabled" in el) {
      el.disabled = !enabled;
    }
  }

  function setImg(target, src) {
    const el = typeof target === "string" ? document.getElementById(target) : target;
    if (el && "src" in el) {
      el.src = src || "";
    }
  }

  function showCard(card) {
    // ukryj wszystkie panele kart
    document
      .querySelectorAll(".cardPanel[data-card]")
      .forEach((p) => p.classList.add("hidden"));

    // pokaż wybraną kartę
    document
      .querySelector(`.cardPanel[data-card="${card}"]`)
      ?.classList.remove("hidden");

    // zaktualizuj aktywną zakładkę
    document
      .querySelectorAll(".navItem[data-card]")
      .forEach((b) => b.classList.remove("active"));

    document
      .querySelector(`.navItem[data-card="${card}"]`)
      ?.classList.add("active");
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
    if (("navDevices")) $("navDevices").disabled = !flags.devices;
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
    badge(
      $("pillDisplay"),
      display.on ? "ok" : "bad",
      display.on ? UI_MSG.DEVICE_STATUS_OK : UI_MSG.DEVICE_STATUS_OFFLINE
    );
    badge(
      $("pillHost"),
      host.on ? "ok" : "bad",
      host.on ? UI_MSG.DEVICE_STATUS_OK : UI_MSG.DEVICE_STATUS_OFFLINE
    );
    badge(
      $("pillBuzzer"),
      buzzer.on ? "ok" : "bad",
      buzzer.on ? UI_MSG.DEVICE_STATUS_OK : UI_MSG.DEVICE_STATUS_OFFLINE
    );

    if ($("seenDisplay")) $("seenDisplay").textContent = display.seen || UI_MSG.DEVICE_STATUS_NONE;
    if ($("seenHost")) $("seenHost").textContent = host.seen || UI_MSG.DEVICE_STATUS_NONE;
    if ($("seenBuzzer")) $("seenBuzzer").textContent = buzzer.seen || UI_MSG.DEVICE_STATUS_NONE;

    dot($("dotDisplay"), display.on ? "ok" : "bad");
    dot($("dotHost"), host.on ? "ok" : "bad");
    dot($("dotBuzzer"), buzzer.on ? "ok" : "bad");
  }

  function setDeviceBadgesUnavailable() {
    badge($("pillDisplay"), "mid", UI_MSG.DEVICE_STATUS_NONE);
    badge($("pillHost"), "mid", UI_MSG.DEVICE_STATUS_NONE);
    badge($("pillBuzzer"), "mid", UI_MSG.DEVICE_STATUS_NONE);

    if ($("seenDisplay")) $("seenDisplay").textContent = UI_MSG.DEVICE_SEEN_NONE;
    if ($("seenHost")) $("seenHost").textContent = UI_MSG.DEVICE_SEEN_NONE;
    if ($("seenBuzzer")) $("seenBuzzer").textContent = UI_MSG.DEVICE_SEEN_NONE;

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
    el.textContent = unlocked ? UI_MSG.AUDIO_OK : UI_MSG.AUDIO_BLOCKED;
  }

  function getTeamA() { return String($("teamA")?.value ?? "").trim(); }
  function getTeamB() { return String($("teamB")?.value ?? "").trim(); }

  function getAdvancedForm() {
    const rm = $("roundMultipliers");
    const fm = $("finalMinPoints");
    const ft = $("finalTargetPoints");
    const winMoney = $("winModeMoney");
    const winLogo = $("winModeLogo");
    const winPoints = $("winModePoints");

    return {
      roundMultipliersText: rm ? rm.value : "",
      finalMinPointsText: fm ? fm.value : "",
      finalTargetText: ft ? ft.value : "",
      winMode:
        winMoney && winMoney.checked
          ? "money"
          : winLogo && winLogo.checked
          ? "logo"
          : winPoints&& winPoints.checked
          ? "points"
          : null,
    };
  }

  function setAdvancedForm(advanced) {
    const adv = advanced || {};
    const rms = Array.isArray(adv.roundMultipliers)
      ? adv.roundMultipliers.join(", ")
      : "";

    if ($("roundMultipliers")) $("roundMultipliers").value = rms;
    if ($("finalMinPoints"))
      $("finalMinPoints").value =
        typeof adv.finalMinPoints === "number" ? String(adv.finalMinPoints) : "";
    if ($("finalTargetPoints"))
      $("finalTargetPoints").value =
        typeof adv.finalTarget === "number" ? String(adv.finalTarget) : "";

    const winEnabled =
      typeof adv.winEnabled === "boolean" ? adv.winEnabled : true;

    if ($("winModeMoney")) $("winModeMoney").checked = !!winEnabled;
    if ($("winModeLogo")) $("winModeLogo").checked = !winEnabled;
  }


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
      b.textContent = hostAndBuzzerOnline ? UI_MSG.QR_BLACK_SCREEN : UI_MSG.QR_HIDE;
      return;
    }
  
    b.textContent = UI_MSG.QR_ON_DISPLAY;
  }

  function setRoundsHud(r) {
    setText("roundNo", String(r.roundNo));
    setText(
      "controlTeam",
      r.controlTeam ? (r.controlTeam === "A" ? "A" : "B") : UI_MSG.DASH
    );
    setText("bankPts", String(r.bankPts));
    setText("xA", String(r.xA));
    setText("xB", String(r.xB));
    setText("t3", r.timer3.running ? String(r.timer3.secLeft ?? 3) : UI_MSG.DASH);
  }

  function setGameHeader(name, meta) {
    setText(
      "gameLabel",
      name ? `${UI_MSG.CONTROL_PREFIX}${name}` : UI_MSG.CONTROL_TITLE
    );
    setText("gameMeta", meta || "");
  }

  function setRoundQuestion(text) {
    setText("roundQuestion", text || UI_MSG.DASH);
  }

  function renderAnswersGeneric(rootId, answers, revealedSet, eventName) {
    const root = $(rootId);
    if (!root) return;

    // normalizacja: Set lub tablica -> Set
    const revealed =
      revealedSet instanceof Set
        ? revealedSet
        : new Set(revealedSet || []);

    root.innerHTML = (answers || [])
      .map((a) => {
        const ord = a.ord ?? 0;
        const isRevealed = revealed.has(ord);
        const pts = a.fixed_points ?? a.points ?? 0;

        return `
          <button
            type="button"
            class="ansBtn ${isRevealed ? "revealed" : ""}"
            data-ord="${ord}"
          >
            <div class="ansTop">
              <span>${ord}</span>
              <span>${pts}</span>
            </div>
            <div class="ansText">${escapeHtml(a.text || UI_MSG.ANSWER_FALLBACK)}</div>
          </button>
        `;
      })
      .join("");

    root
      .querySelectorAll("button.ansBtn[data-ord]")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const ord = Number.parseInt(btn.dataset.ord || "0", 10);
          if (!Number.isFinite(ord) || !ord) return;
          // KLUCZ: używamy lokalnego emit, NIE bus.emit
          emit(eventName, ord);
        });
      });
  }


  function setAnswersMode(mode) {
    const ids = ["roundAnswers", "roundStealAnswers", "roundRevealAnswers"];
    ids.forEach((id) => {
      const el = $(id);
      if (!el) return;
      const show =
        (mode === "play" && id === "roundAnswers") ||
        (mode === "steal" && id === "roundStealAnswers") ||
        (mode === "reveal" && id === "roundRevealAnswers");
  
      if (show) {
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    });
  }

  function renderRoundAnswers(answers, revealedSet) {
    // główna rozgrywka
    setAnswersMode("play");
    renderAnswersGeneric(
      "roundAnswers",
      answers,
      revealedSet,
      "rounds.answerClick"
    );
  }
  
  function renderRoundStealAnswers(answers, revealedSet) {
    // tryb kradzieży
    setAnswersMode("steal");
    renderAnswersGeneric(
      "roundStealAnswers",
      answers,
      revealedSet,
      "rounds.stealTry"
    );
  }
  
  function renderRoundRevealAnswers(answers, revealedSet) {
    // odsłanianie brakujących odpowiedzi
    setAnswersMode("reveal");
    renderAnswersGeneric(
      "roundRevealAnswers",
      answers,
      revealedSet,
      "rounds.revealClick"
    );
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

    // --- Dodatkowe ustawienia (mnożniki, progi, tryb końca gry) ---
    const advInputs = [
      "roundMultipliers",
      "finalMinPoints",
      "finalTargetPoints",
    ];
    advInputs.forEach((id) => {
      const el = $(id);
      if (el) {
        el.addEventListener("change", () => emit("advanced.change"));
      }
    });

    const winMoney = $("winModeMoney");
    const winLogo = $("winModeLogo");
    if (winMoney) {
      winMoney.addEventListener("change", () => emit("advanced.change"));
    }
    if (winLogo) {
      winLogo.addEventListener("change", () => emit("advanced.change"));
    }

    $("btnAdvancedReset")?.addEventListener("click", () =>
      emit("advanced.reset")
    );

    $("finalYes")?.addEventListener("change", () => emit("final.toggle", true));
    $("finalNo")?.addEventListener("change", () => emit("final.toggle", false));
    $("btnReloadQuestions")?.addEventListener("click", () => emit("final.reload"));
    $("btnConfirmFinal")?.addEventListener("click", () => emit("final.confirm"));
    $("btnEditFinal")?.addEventListener("click", () => emit("final.edit"));

    // rounds (kroki)
    $("btnGameReady")?.addEventListener("click", () => emit("game.ready"));
    $("btnStartShowIntro")?.addEventListener("click", () => emit("game.startIntro"));
    $("btnStartRound")?.addEventListener("click", () => emit("rounds.start"));

    $("btnBuzzAcceptA")?.addEventListener("click", () => emit("buzz.acceptA"));
    $("btnBuzzAcceptB")?.addEventListener("click", () => emit("buzz.acceptB"));
    $("btnBuzzRetry")?.addEventListener("click", () => emit("buzz.retry"));

    $("btnPassQuestion")?.addEventListener("click", () => emit("rounds.pass"));
    $("btnStartTimer3")?.addEventListener("click", () => emit("rounds.timer3"));
    $("btnAddX")?.addEventListener("click", () => emit("rounds.addX"));
    $("btnGoEndRound")?.addEventListener("click", () => emit("rounds.goEnd"));
    $("btnShowGameEnd")?.addEventListener("click", () => emit("rounds.gameEndShow"));


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
    renderRoundStealAnswers,
    renderRoundRevealAnswers,
    
    showRoundsStep,
    setFinalStatusList,
    setFinalInputs,
    setFinalMapping,

    setGameHeader,
    setHtml,

    getAdvancedForm,
    setAdvancedForm,
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
