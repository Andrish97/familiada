// js/pages/control.js (module)
// Setup + rundy (AUTO kolejne pytanie) + walidacja min. 3 pytania rund

import { sb } from "../core/supabase.js";
import { requireAuth } from "../core/auth.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("game");

let client = null;
let displayWin = null;

let gameRow = null;
let questions = [];
let answersForActive = [];
let revealQueue = [];
let links = { hostUrl: "", buzzerUrl: "" };

const el = (s) => document.querySelector(s);

const ui = {
  gameName: el(".ctl-game-name"),
  login: el(".ctl-login"),
  live: el(".ctl-live"),
  err: el(".ctl-error"),

  hostPill: el(".ctl-host-pill"),
  buzzerPill: el(".ctl-buzzer-pill"),
  displayPill: el(".ctl-display-pill"),

  hostLink: el(".ctl-host-link"),
  buzzerLink: el(".ctl-buzzer-link"),

  btnOpenDisplay: el(".ctl-open-display"),
  btnCopyHost: el(".ctl-copy-host"),
  btnCopyBuzzer: el(".ctl-copy-buzzer"),
  btnShowSetup: el(".ctl-show-setup"),
  btnHideSetup: el(".ctl-hide-setup"),

  btnStartGame: el(".ctl-start-game"),
  btnStartRound: el(".ctl-start-round"),
  btnResetBuzzer: el(".ctl-reset-buzzer"),

  roundNo: el(".ctl-round-no"),
  mult: el(".ctl-mult"),
  step: el(".ctl-step"),

  selQ: el(".ctl-question-select"),
  btnReloadQ: el(".ctl-load-questions"),

  teamA: el(".ctl-team-a"),
  teamB: el(".ctl-team-b"),
  btnSaveTeams: el(".ctl-save-teams"),

  buzzWinner: el(".ctl-buzz-winner"),
  playingTeam: el(".ctl-playing-team"),
  strikes: el(".ctl-strikes"),
  roundSum: el(".ctl-round-sum"),

  btnPlay: el(".ctl-play"),
  btnPass: el(".ctl-pass"),

  answersBox: el(".ctl-answers"),

  btnRevealNext: el(".ctl-reveal-next"),
  btnEndRound: el(".ctl-end-round"),
};

function setError(msg) {
  ui.err.textContent = msg || "";
}

function pillSet(pillEl, ok, text) {
  pillEl.classList.remove("ok", "bad");
  pillEl.classList.add(ok ? "ok" : "bad");
  pillEl.textContent = text;
}

function buildLink(file, params) {
  const base = new URL(file, location.href);
  Object.entries(params).forEach(([k, v]) => base.searchParams.set(k, String(v)));
  return base.toString();
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function renderQR(holderId, text) {
  const holder = document.getElementById(holderId);
  holder.innerHTML = "";
  new QRCode(holder, { text, width: 132, height: 132, correctLevel: QRCode.CorrectLevel.M });
}

function postToDisplay(msg) {
  if (!displayWin || displayWin.closed) {
    pillSet(ui.displayPill, false, "Rzutnik nieotwarty");
    return false;
  }
  displayWin.postMessage(msg, location.origin);
  pillSet(ui.displayPill, true, "Rzutnik otwarty");
  return true;
}

function otherTeam(t) {
  return t === "A" ? "B" : "A";
}

function multiplierForRound(roundNo) {
  if (roundNo === 1) return 1;
  if (roundNo === 2) return 2;
  return 3;
}

function parseJsonbArray(v) {
  try {
    if (Array.isArray(v)) return v;
    return JSON.parse(v || "[]");
  } catch {
    return [];
  }
}

async function ensureLiveState() {
  const { data, error } = await client
    .from("live_state")
    .select("game_id")
    .eq("game_id", gameId)
    .maybeSingle();

  if (!error && data?.game_id) return;

  const ins = await client.from("live_state").insert({ game_id: gameId });
  if (ins.error) throw ins.error;
}

async function loadGame() {
  const { data, error } = await client
    .from("games")
    .select("id,name,share_key_display,share_key_remote,share_key_buzzer")
    .eq("id", gameId)
    .single();
  if (error) throw error;
  return data;
}

async function loadQuestions() {
  const { data, error } = await client
    .from("questions")
    .select("id,ord,text,mode")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function loadAnswersByQuestion(qid) {
  const { data, error } = await client
    .from("answers")
    .select("id,ord,text,fixed_points")
    .eq("question_id", qid)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function readLive() {
  const { data, error } = await client
    .from("live_state")
    .select("*")
    .eq("game_id", gameId)
    .single();
  if (error) throw error;
  return data;
}

async function updateLive(patch) {
  const { error } = await client.from("live_state").update(patch).eq("game_id", gameId);
  if (error) throw error;
}

function renderQuestionSelect() {
  ui.selQ.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "AUTO (kolejne niewykorzystane)";
  ui.selQ.appendChild(opt0);

  questions.forEach((q) => {
    const opt = document.createElement("option");
    opt.value = q.id;
    opt.textContent = `${q.ord}. ${q.text}`;
    ui.selQ.appendChild(opt);
  });
}

async function validateBeforeStart() {
  // wymagania: min 3 pytania rund + każde z nich ma min 1 odpowiedź
  const qs = await loadQuestions();
  questions = qs;
  renderQuestionSelect();

  if (qs.length < 3) {
    return { ok: false, reason: "Za mało pytań: minimum 3 pytania rund (×1, ×2, ×3)." };
  }

  // sprawdzamy pierwsze 3 pytania wg ord (rundy)
  const firstThree = qs.slice(0, 3);
  for (const q of firstThree) {
    const ans = await loadAnswersByQuestion(q.id);
    if (!ans.length) {
      return { ok: false, reason: `Pytanie #${q.ord} nie ma żadnych odpowiedzi.` };
    }
  }

  return { ok: true, reason: "" };
}

function pickNextQuestionId(ls) {
  const used = parseJsonbArray(ls?.used_question_ids);
  const allIds = questions.map((q) => q.id);

  // pierwsze niewykorzystane
  for (const id of allIds) {
    if (!used.includes(id)) return id;
  }
  return null;
}

function parseRevealed(ls) {
  return parseJsonbArray(ls?.revealed_answer_ids);
}

function setRevealedPatch(ids) {
  return { revealed_answer_ids: ids };
}

function renderAnswerButtons(ls) {
  const revealed = parseRevealed(ls);
  ui.answersBox.innerHTML = "";

  const step = ls?.step || "idle";
  const canClick = step === "licytacja" || step === "play" || step === "steal";

  answersForActive.forEach((a) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ctl-answer-btn";

    const isRev = revealed.includes(a.id);
    if (isRev) btn.classList.add("revealed");
    btn.disabled = !canClick || isRev;

    btn.innerHTML = `
      <div class="ctl-answer-top">
        <span>#${a.ord}</span>
        <span>${typeof a.fixed_points === "number" ? a.fixed_points : 0} pkt</span>
      </div>
      <div class="ctl-answer-text">${a.text}</div>
    `;

    btn.addEventListener("click", async () => {
      if (!canClick || isRev) return;
      await confirmCorrectAnswer(ls, a);
    });

    ui.answersBox.appendChild(btn);
  });

  const xBtn = document.createElement("button");
  xBtn.type = "button";
  xBtn.className = "ctl-answer-btn bad";
  xBtn.innerHTML = `
    <div class="ctl-answer-top"><span>X</span><span>—</span></div>
    <div class="ctl-answer-text">BŁĄD / CZAS</div>
  `;
  xBtn.disabled = !canClick;

  xBtn.addEventListener("click", async () => {
    if (!canClick) return;

    // specjal: nietrafiona kradzież — X w steal = przyznaj grającej
    const fresh = await readLive();
    if (fresh.step === "steal") {
      const awardTo = fresh.playing_team || otherTeam(fresh.buzzer_winner || "A");
      await awardAndPrepareReveal(fresh, awardTo);
      return;
    }

    await confirmStrike(ls);
  });

  ui.answersBox.appendChild(xBtn);
}

async function confirmCorrectAnswer(ls, ans) {
  const revealed = parseRevealed(ls);
  const mult = typeof ls?.multiplier === "number" ? ls.multiplier : 1;

  const pts = (typeof ans.fixed_points === "number" ? ans.fixed_points : 0) * mult;
  const newSum = (typeof ls.round_sum === "number" ? ls.round_sum : 0) + pts;

  revealed.push(ans.id);

  await updateLive({
    round_sum: newSum,
    round_points: newSum,
    ...setRevealedPatch(revealed),
  });

  const all = answersForActive.map((a) => a.id);
  const allRevealed = all.every((id) => revealed.includes(id));
  if (allRevealed) {
    const awardTo =
      ls.step === "steal"
        ? (ls.steal_team || otherTeam(ls.playing_team || ls.buzzer_winner || "A"))
        : (ls.playing_team || ls.buzzer_winner || "A");

    await awardAndPrepareReveal(ls, awardTo);
  } else {
    // jeśli to była poprawna odpowiedź w steal, to też od razu przyznajemy całą rundę kradnącej
    if (ls.step === "steal" && !ls.round_awarded_to) {
      const awardTo = ls.steal_team || otherTeam(ls.playing_team || ls.buzzer_winner || "A");
      await awardAndPrepareReveal(ls, awardTo);
    }
  }
}

async function confirmStrike(ls) {
  const strikes = (typeof ls.strikes === "number" ? ls.strikes : 0) + 1;

  if (strikes >= 3) {
    const stealTeam = otherTeam(ls.playing_team || ls.buzzer_winner || "A");
    await updateLive({
      strikes,
      step: "steal",
      steal_team: stealTeam,
    });
    return;
  }

  await updateLive({ strikes });
}

async function awardAndPrepareReveal(ls, teamToAward) {
  const sum = typeof ls.round_sum === "number" ? ls.round_sum : 0;

  let patch = {
    step: "reveal_end",
    round_awarded_to: teamToAward,
  };

  if (teamToAward === "A") patch.team_a_score = (ls.team_a_score || 0) + sum;
  if (teamToAward === "B") patch.team_b_score = (ls.team_b_score || 0) + sum;

  await updateLive(patch);

  const revealed = parseRevealed(ls);
  const remaining = answersForActive
    .map((a) => a.id)
    .filter((id) => !revealed.includes(id));

  revealQueue = remaining.slice();
}

async function revealNext(ls) {
  if (!revealQueue.length) return;

  const nextId = revealQueue.shift();
  const revealed = parseRevealed(ls);

  if (!revealed.includes(nextId)) revealed.push(nextId);
  await updateLive({ ...setRevealedPatch(revealed) });
}

async function endRoundReset(ls) {
  const nextRound = (typeof ls.round_no === "number" ? ls.round_no : 1) + 1;
  const nextMult = multiplierForRound(nextRound);

  await updateLive({
    phase: "idle",
    step: "idle",
    round_no: nextRound,
    multiplier: nextMult,

    active_question_id: null,
    strikes: 0,
    round_sum: 0,
    round_points: 0,
    revealed_answer_ids: [],
    buzzer_locked: false,
    buzzer_winner: null,
    buzzer_at: null,

    playing_team: null,
    steal_team: null,
    round_awarded_to: null,

    timer_kind: "none",
    timer_seconds_left: 0,
    timer_running: false,
    timer_updated_at: null,
  });

  revealQueue = [];
}

async function resetBuzzerOnly() {
  await updateLive({
    buzzer_locked: false,
    buzzer_winner: null,
    buzzer_at: null,
  });
}

function refreshUI(ls, setupOk) {
  ui.live.textContent = ls?.updated_at
    ? `Live: ${new Date(ls.updated_at).toLocaleTimeString()}`
    : "Live: —";

  const hostOk = !!ls?.host_ready;
  const buzOk = !!ls?.buzzer_ready;

  pillSet(ui.hostPill, hostOk, hostOk ? "HOST: OK" : "HOST: BRAK");
  pillSet(ui.buzzerPill, buzOk, buzOk ? "BUZZER: OK" : "BUZZER: BRAK");

  ui.btnStartGame.disabled = !(hostOk && buzOk && setupOk.ok);
  ui.btnStartRound.disabled = !(hostOk && buzOk && setupOk.ok && ls?.step === "idle");

  ui.btnResetBuzzer.disabled = !ls?.active_question_id;

  ui.roundNo.textContent = String(ls?.round_no ?? "—");
  ui.mult.textContent = String(ls?.multiplier ?? "—");
  ui.step.textContent = String(ls?.step ?? "—");

  ui.buzzWinner.textContent = ls?.buzzer_winner || "—";
  ui.playingTeam.textContent = ls?.playing_team || "—";
  ui.strikes.textContent = String(ls?.strikes ?? 0);
  ui.roundSum.textContent = String(ls?.round_sum ?? 0);

  const canDecision = ls?.step === "decision";
  ui.btnPlay.disabled = !canDecision;
  ui.btnPass.disabled = !canDecision;

  const inReveal = ls?.step === "reveal_end";
  ui.btnRevealNext.disabled = !(inReveal && revealQueue.length > 0);
  ui.btnEndRound.disabled = !inReveal;

  renderAnswerButtons(ls);
}

function subscribeLive(onChange) {
  const channel = client
    .channel(`live_state:${gameId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "live_state", filter: `game_id=eq.${gameId}` },
      (payload) => onChange(payload.new)
    )
    .subscribe();

  return () => client.removeChannel(channel);
}

async function startGame() {
  const check = await validateBeforeStart();
  if (!check.ok) {
    setError(check.reason);
    return;
  }

  const ls = await readLive();
  if (!ls.host_ready || !ls.buzzer_ready) {
    setError("Nie można wystartować: HOST i BUZZER muszą być odpalone.");
    return;
  }

  await updateLive({
    phase: "idle",
    step: "idle",
    round_no: 1,
    multiplier: 1,

    team_a_score: 0,
    team_b_score: 0,
    round_sum: 0,
    round_points: 0,
    strikes: 0,

    active_question_id: null,
    revealed_answer_ids: [],
    buzzer_locked: false,
    buzzer_winner: null,
    buzzer_at: null,

    playing_team: null,
    steal_team: null,
    round_awarded_to: null,

    used_question_ids: [], // NOWE: reset użytych
  });

  setError("Start OK.");
  setTimeout(() => setError(""), 800);
}

async function startRound() {
  setError("");

  const check = await validateBeforeStart();
  if (!check.ok) {
    setError(check.reason);
    return;
  }

  const ls = await readLive();
  if (ls.step !== "idle") {
    setError("Nie można: runda już trwa albo jest w trakcie kończenia.");
    return;
  }

  // jeśli operator wybrał ręcznie pytanie, używamy tego.
  // jeśli zostawił AUTO, bierzemy pierwsze niewykorzystane
  let qid = ui.selQ.value || "";
  if (!qid) {
    qid = pickNextQuestionId(ls);
  }
  if (!qid) {
    setError("Brak kolejnych pytań (wszystkie już wykorzystane).");
    return;
  }

  const used = parseJsonbArray(ls.used_question_ids);
  if (!used.includes(qid)) used.push(qid);

  const roundNo = typeof ls.round_no === "number" ? ls.round_no : 1;
  const mult = multiplierForRound(roundNo);

  answersForActive = await loadAnswersByQuestion(qid);
  if (!answersForActive.length) {
    setError("Wybrane pytanie nie ma odpowiedzi.");
    return;
  }

  revealQueue = [];

  await updateLive({
    phase: "round",
    step: "await_buzz",
    active_question_id: qid,
    strikes: 0,
    round_sum: 0,
    round_points: 0,
    revealed_answer_ids: [],
    multiplier: mult,

    buzzer_locked: false,
    buzzer_winner: null,
    buzzer_at: null,

    playing_team: null,
    steal_team: null,
    round_awarded_to: null,

    used_question_ids: used,
  });
}

async function onBuzzerLocked(ls) {
  if (ls.step !== "await_buzz") return;
  if (!ls.buzzer_locked || !ls.buzzer_winner) return;
  await updateLive({ step: "licytacja" });
}

async function afterLicytacjaToDecision(ls) {
  await updateLive({ step: "decision" });
}

async function choosePlay(ls) {
  const winner = ls.buzzer_winner || "A";
  await updateLive({ step: "play", playing_team: winner, steal_team: null });
}

async function choosePass(ls) {
  const winner = ls.buzzer_winner || "A";
  await updateLive({ step: "play", playing_team: otherTeam(winner), steal_team: null });
}

async function ensureAnswersLoaded(ls) {
  const qid = ls.active_question_id;
  if (!qid) {
    answersForActive = [];
    return;
  }
  if (!answersForActive.length) {
    answersForActive = await loadAnswersByQuestion(qid);
  }
}

async function saveTeamNames() {
  const a = (ui.teamA.value || "").trim();
  const b = (ui.teamB.value || "").trim();
  if (!a || !b) {
    setError("Podaj obie nazwy drużyn.");
    return;
  }
  await updateLive({ team_a_name: a, team_b_name: b });
}

async function main() {
  if (!gameId) {
    setError("Brak parametru ?game=... w URL.");
    return;
  }

  await requireAuth("index.html");
  ui.login.textContent = "Zalogowany";

  client = sb();
  await ensureLiveState();

  gameRow = await loadGame();
  ui.gameName.textContent = `Gra: ${gameRow.name}`;

  links.hostUrl = buildLink("host.html", { game: gameRow.id, kind: "remote", key: gameRow.share_key_remote });
  links.buzzerUrl = buildLink("buzzer.html", { game: gameRow.id, kind: "buzzer", key: gameRow.share_key_buzzer });
  const displayUrl = buildLink("display.html", { game: gameRow.id, kind: "display", key: gameRow.share_key_display });

  ui.hostLink.value = links.hostUrl;
  ui.buzzerLink.value = links.buzzerUrl;
  renderQR("qr-host", links.hostUrl);
  renderQR("qr-buzzer", links.buzzerUrl);

  ui.btnCopyHost.addEventListener("click", async () => {
    const ok = await copyToClipboard(links.hostUrl);
    setError(ok ? "Skopiowano link HOST." : "Nie udało się skopiować linku HOST.");
    setTimeout(() => setError(""), 1200);
  });

  ui.btnCopyBuzzer.addEventListener("click", async () => {
    const ok = await copyToClipboard(links.buzzerUrl);
    setError(ok ? "Skopiowano link BUZZER." : "Nie udało się skopiować linku BUZZER.");
    setTimeout(() => setError(""), 1200);
  });

  ui.btnOpenDisplay.addEventListener("click", () => {
    displayWin = window.open(displayUrl, "familiada_display", "noopener,noreferrer");
    pillSet(ui.displayPill, true, "Rzutnik otwarty");
    setTimeout(() => postToDisplay({ type: "SETUP_LINKS", payload: links }), 300);
  });

  ui.btnShowSetup.addEventListener("click", () => {
    if (!postToDisplay({ type: "SHOW_SETUP_QR" })) setError("Najpierw otwórz ekran rzutnika.");
  });

  ui.btnHideSetup.addEventListener("click", () => {
    if (!postToDisplay({ type: "HIDE_SETUP_QR" })) setError("Najpierw otwórz ekran rzutnika.");
  });

  // pytania
  async function reloadQuestions() {
    questions = await loadQuestions();
    renderQuestionSelect();
  }
  ui.btnReloadQ.addEventListener("click", reloadQuestions);
  await reloadQuestions();

  ui.btnSaveTeams.addEventListener("click", async () => {
    try {
      setError("");
      await saveTeamNames();
    } catch (e) {
      console.error(e);
      setError(e?.message || "Błąd zapisu nazw.");
    }
  });

  ui.btnStartGame.addEventListener("click", async () => {
    try {
      setError("");
      await startGame();
    } catch (e) {
      console.error(e);
      setError(e?.message || "Błąd startu gry.");
    }
  });

  ui.btnStartRound.addEventListener("click", async () => {
    try {
      setError("");
      await startRound();
    } catch (e) {
      console.error(e);
      setError(e?.message || "Błąd startu rundy.");
    }
  });

  ui.btnResetBuzzer.addEventListener("click", async () => {
    try {
      setError("");
      await resetBuzzerOnly();
    } catch (e) {
      console.error(e);
      setError(e?.message || "Błąd resetu buzzera.");
    }
  });

  ui.btnPlay.addEventListener("click", async () => {
    try {
      const ls = await readLive();
      await choosePlay(ls);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Błąd decyzji GRAJ.");
    }
  });

  ui.btnPass.addEventListener("click", async () => {
    try {
      const ls = await readLive();
      await choosePass(ls);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Błąd decyzji PAS.");
    }
  });

  ui.btnRevealNext.addEventListener("click", async () => {
    try {
      const ls = await readLive();
      await revealNext(ls);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Błąd odkrywania.");
    }
  });

  ui.btnEndRound.addEventListener("click", async () => {
    try {
      const ls = await readLive();
      if (revealQueue.length) {
        setError("Najpierw odkryj wszystkie pozostałe odpowiedzi.");
        return;
      }
      await endRoundReset(ls);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Błąd końca rundy.");
    }
  });

  // stan + walidacja
  let setupOk = await validateBeforeStart();
  if (!setupOk.ok) setError(setupOk.reason);

  const initial = await readLive();
  ui.teamA.value = initial.team_a_name || "";
  ui.teamB.value = initial.team_b_name || "";

  await ensureAnswersLoaded(initial);

  if (initial.step === "reveal_end") {
    const revealed = parseRevealed(initial);
    const remaining = answersForActive.map((a) => a.id).filter((id) => !revealed.includes(id));
    revealQueue = remaining.slice();
  }

  refreshUI(initial, setupOk);

  subscribeLive(async (ls) => {
    try {
      // odśwież setup warunków przy większych zmianach (tanie: i tak małe dane)
      setupOk = await validateBeforeStart();

      if (ls?.step === "await_buzz" && ls?.buzzer_locked && ls?.buzzer_winner) {
        await onBuzzerLocked(ls);
        const ls2 = await readLive();
        await ensureAnswersLoaded(ls2);
        refreshUI(ls2, setupOk);
        return;
      }

      if (ls?.step === "licytacja") {
        const revealed = parseRevealed(ls);
        const hasAny = revealed.length > 0 || (ls.strikes || 0) > 0;
        if (hasAny) {
          await afterLicytacjaToDecision(ls);
          const ls2 = await readLive();
          await ensureAnswersLoaded(ls2);
          refreshUI(ls2, setupOk);
          return;
        }
      }

      await ensureAnswersLoaded(ls);

      if (ls?.step === "reveal_end") {
        const revealed = parseRevealed(ls);
        const remaining = answersForActive.map((a) => a.id).filter((id) => !revealed.includes(id));
        revealQueue = remaining.slice();
      }

      refreshUI(ls, setupOk);
    } catch (e) {
      console.error("[control] refresh error:", e);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  main().catch((e) => {
    console.error(e);
    setError(e?.message || "Błąd krytyczny.");
  });
});
