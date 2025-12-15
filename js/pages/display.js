// js/pages/display.js
// Uproszczony rzutnik: pobiera snapshot przez RPC get_public_snapshot(kind='display')
// + pokazuje overlay QR, sterowany z control.html przez postMessage.

(function () {
  const qs = new URLSearchParams(location.search);
  const gameId = qs.get("game");
  const kind = qs.get("kind"); // "display"
  const key = qs.get("key");

  const $ = (s) => document.querySelector(s);

  const ui = {
    teamAName: null,
    teamAScore: null,
    teamBName: null,
    teamBScore: null,
    question: null,
    sum: null,
    x1: null,
    x2: null,
    x3: null,
    rows: null,

    setupOverlay: null,
    setupHostLink: null,
    setupBuzzerLink: null,
  };

  let sb = null;
  let pollTimer = null;

  let setupLinks = { hostUrl: "", buzzerUrl: "" };

  async function callRpc(name, params) {
    const { data, error } = await sb.rpc(name, params);
    if (error) throw error;
    return data;
  }

  function safeInt(v, def = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }

  function applySnapshot(snap) {
    const g = snap?.game;
    const ls = snap?.live;
    const q = snap?.question;
    const answers = Array.isArray(snap?.answers) ? snap.answers : [];

    ui.question.textContent = q?.text || "—";

    // team names/scores bierzemy z live_state (rozszerzone kolumny)
    ui.teamAName.textContent = ls?.team_a_name || "DRUŻYNA A";
    ui.teamBName.textContent = ls?.team_b_name || "DRUŻYNA B";
    ui.teamAScore.textContent = String(safeInt(ls?.team_a_score, 0));
    ui.teamBScore.textContent = String(safeInt(ls?.team_b_score, 0));

    // suma rundy: round_sum lub round_points
    const sum = (ls && typeof ls.round_sum === "number") ? ls.round_sum : safeInt(ls?.round_points, 0);
    ui.sum.textContent = String(sum);

    // strikes
    const strikes = safeInt(ls?.strikes, 0);
    ui.x1.classList.toggle("on", strikes >= 1);
    ui.x2.classList.toggle("on", strikes >= 2);
    ui.x3.classList.toggle("on", strikes >= 3);

    // revealed ids
    let revealed = [];
    try {
      revealed = Array.isArray(ls?.revealed_answer_ids)
        ? ls.revealed_answer_ids
        : JSON.parse(ls?.revealed_answer_ids || "[]");
    } catch {
      revealed = [];
    }

    // map answers by ord (1..8)
    // answers z RPC już mają ord i fixed_points
    const byOrd = new Map();
    answers.forEach((a) => byOrd.set(Number(a.ord), a));

    ui.rows.forEach((row) => {
      const i = Number(row.getAttribute("data-i"));
      const textEl = row.querySelector(".disp-text");
      const ptsEl = row.querySelector(".disp-pts");

      const a = byOrd.get(i);
      const id = a?.id;

      const isRevealed = id && revealed.includes(id);
      row.classList.toggle("revealed", !!isRevealed);

      if (isRevealed) {
        textEl.textContent = a?.text || "—";
        // punkty w rundzie: fixed_points (na razie)
        ptsEl.textContent =
          typeof a?.fixed_points === "number" ? String(a.fixed_points) : "0";
      } else {
        textEl.textContent = "••••••••••••";
        ptsEl.textContent = "—";
      }
    });
  }

  async function poll() {
    try {
      const snap = await callRpc("get_public_snapshot", {
        p_game_id: gameId,
        p_kind: kind || "display",
        p_key: key,
      });
      applySnapshot(snap);
    } catch (e) {
      console.error(e);
      ui.question.textContent = "Błąd połączenia z grą.";
    }
  }

  function renderSetupQR() {
    // qrcodejs
    const hostBox = document.getElementById("qr-setup-host");
    const buzBox = document.getElementById("qr-setup-buzzer");
    if (!hostBox || !buzBox) return;

    hostBox.innerHTML = "";
    buzBox.innerHTML = "";

    if (setupLinks.hostUrl) {
      new QRCode(hostBox, { text: setupLinks.hostUrl, width: 172, height: 172, correctLevel: QRCode.CorrectLevel.M });
      ui.setupHostLink.textContent = setupLinks.hostUrl;
    } else {
      ui.setupHostLink.textContent = "—";
    }

    if (setupLinks.buzzerUrl) {
      new QRCode(buzBox, { text: setupLinks.buzzerUrl, width: 172, height: 172, correctLevel: QRCode.CorrectLevel.M });
      ui.setupBuzzerLink.textContent = setupLinks.buzzerUrl;
    } else {
      ui.setupBuzzerLink.textContent = "—";
    }
  }

  function showSetup(on) {
    ui.setupOverlay.style.display = on ? "flex" : "none";
    if (on) renderSetupQR();
  }

  async function main() {
    ui.teamAName = $(".disp-a .disp-team-name");
    ui.teamAScore = $(".disp-a .disp-team-score");
    ui.teamBName = $(".disp-b .disp-team-name");
    ui.teamBScore = $(".disp-b .disp-team-score");
    ui.question = $(".disp-question");
    ui.sum = $(".disp-sum-val");
    ui.x1 = $(".disp-x1");
    ui.x2 = $(".disp-x2");
    ui.x3 = $(".disp-x3");
    ui.rows = Array.from(document.querySelectorAll(".disp-row"));

    ui.setupOverlay = $(".disp-setup");
    ui.setupHostLink = $(".disp-setup-host-link");
    ui.setupBuzzerLink = $(".disp-setup-buzzer-link");

    if (!gameId || !key) {
      ui.question.textContent = "Brak parametrów URL (game/key).";
      return;
    }

    if (!window.supabaseClient) {
      ui.question.textContent = "Brak window.supabaseClient (sprawdź auth.js).";
      return;
    }
    sb = window.supabaseClient;

    // listen to control messages
    window.addEventListener("message", (ev) => {
      if (ev.origin !== location.origin) return;
      const msg = ev.data;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "SETUP_LINKS") {
        setupLinks = msg.payload || setupLinks;
        if (ui.setupOverlay.style.display !== "none") renderSetupQR();
      }
      if (msg.type === "SHOW_SETUP_QR") showSetup(true);
      if (msg.type === "HIDE_SETUP_QR") showSetup(false);
    });

    // start polling
    await poll();
    pollTimer = setInterval(poll, 500);
  }

  document.addEventListener("DOMContentLoaded", () => {
    main().catch((e) => {
      console.error(e);
      const q = document.querySelector(".disp-question");
      if (q) q.textContent = e?.message || "Błąd krytyczny.";
    });
  });

  window.addEventListener("beforeunload", () => {
    if (pollTimer) clearInterval(pollTimer);
  });
})();
