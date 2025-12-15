// js/pages/control.js (module)
// Rundy: start -> buzzer -> licytacja (odpowiedź/X) -> decyzja GRAJ/PAS -> gra -> 3X => kradzież -> odkrywanie reszty -> reset planszy

import { sb } from "../core/supabase.js";
import { requireAuth } from "../core/auth.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("game");

let client = null;
let displayWin = null;

let gameRow = null;
let questions = [];
let answersForActive = [];

let revealQueue = []; // ids odpowiedzi do odkrycia na końcu (po jednej)
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

function parseRevealed(ls) {
  let revealed = [];
  try {
    if (Array.isArray(ls?.revealed_answer_ids)) revealed = ls.revealed_answer_ids;
    else revealed = JSON.parse(ls?.revealed_answer_ids || "[]");
  } catch {
    revealed = [];
  }
  return revealed;
}

function setRevealedPatch(ids) {
  // supabase-js potrafi przyjąć tablicę do jsonb
  return { revealed_answer_ids: ids };
}

function renderQuestionSelect() {
  ui.selQ.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "— wybierz pytanie —";
  ui.selQ.appendChild(opt0);

  questions.forEach((q) => {
    const opt = document.createElement("option");
    opt.value = q.id;
    opt.textContent = `${q.ord}. ${q.text}`;
    ui.selQ.appendChild(opt);
  });
}

function renderAnswerButtons(ls) {
  const revealed = parseRevealed(ls);
  ui.answersBox.innerHTML = "";

  const step = ls?.step || "idle";

  // przycisk X zawsze dostępny w licytacji/play/steal
  const canClick =
    step === "licytacja" || step === "play" || step === "steal";

  // answer buttons
  answersForActive.forEach((a) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ctl-answer-btn";
    const isRev = revealed.includes(a.id);
    if (isRev) btn.classList.add("revealed");
    if (!canClick || isRev) btn.disabled = true;

    btn.innerHTML = `
      <div class="ctl-answer-top">
        <span>#${a.ord}</span>
        <span>${typeof a.fixed_points === "number" ? a.fixed_points : 0} pkt</span>
      </div>
      <div class="ctl-answer-text">${a.text}</div>
    `;

    btn.addEventListener("click", async () => {
      if (!canClick) return;
      if (isRev) return;
      await confirmCorrectAnswer(ls, a);
    });

    ui.answersBox.appendChild(btn);
  });

  // X / CZAS
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
    await confirmStrike(ls);
  });

  ui.answersBox.appendChild(xBtn);
}

async function confirmCorrectAnswer(ls, ans) {
  // odkrywamy odpowiedź + dodajemy punkty do sumy rundy (z mnożnikiem)
  const revealed = parseRevealed(ls);
  const mult = typeof ls?.multiplier === "number" ? ls.multiplier : 1;

  const pts = (typeof ans.fixed_points === "number" ? ans.fixed_points : 0) * mult;
  const newSum = (typeof ls.round_sum === "number" ? ls.round_sum : 0) + pts;

  revealed.push(ans.id);

  await updateLive({
    round_sum: newSum,
    round_points: newSum, // zostawiamy też kompatybilność z Twoim display
    ...setRevealedPatch(revealed),
  });

  // auto: jeśli wszystkie odkryte => kończ rundę
  const all = answersForActive.map((a) => a.id);
  const allRevealed = all.every((id) => revealed.includes(id));
  if (allRevealed) {
    await awardAndPrepareReveal(ls, ls.playing_team || ls.buzzer_winner || "A");
  }
}

async function confirmStrike(ls) {
  const strikes = (typeof ls.strikes === "number" ? ls.strikes : 0) + 1;

  // po 3 X -> kradzież (steal)
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
  // przyznaj punkty rundy drużynie + przejdź w reveal_end (odkrywanie reszty)
  const sum = typeof ls.round_sum === "number" ? ls.round_sum : 0;

  let patch = {
    step: "reveal_end",
    round_awarded_to: teamToAward,
  };

  if (teamToAward === "A") patch.team_a_score = (ls.team_a_score || 0) + sum;
  if (teamToAward === "B") patch.team_b_score = (ls.team_b_score || 0) + sum;

  await updateLive(patch);

  // ustaw kolejkę odkrywania reszty (lokalnie)
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

  // gdy skończone -> pozwól zakończyć rundę (reset planszy)
  if (!revealQueue.length) {
    // nic więcej — operator kliknie "Zakończ rundę"
  }
}

async function endRoundReset(ls) {
  // reset planszy po rundzie: usuń aktywne pytanie i odkrycia, zostaw wyniki drużyn
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

function refreshUI(ls) {
  ui.live.textContent = ls?.updated_at
    ? `Live: ${new Date(ls.updated_at).toLocaleTimeString()}`
    : "Live: —";

  const hostOk = !!ls?.host_ready;
  const buzOk = !!ls?.buzzer_ready;

  pillSet(ui.hostPill, hostOk, hostOk ? "HOST: OK" : "HOST: BRAK");
  pillSet(ui.buzzerPill, buzOk, buzOk ? "BUZZER: OK" : "BUZZER: BRAK");

  ui.btnStartGame.disabled = !(hostOk && buzOk);

  // runda meta
  ui.roundNo.textContent = String(ls?.round_no ?? "—");
  ui.mult.textContent = String(ls?.multiplier ?? "—");
  ui.step.textContent = String(ls?.step ?? "—");

  ui.buzzWinner.textContent = ls?.buzzer_winner || "—";
  ui.playingTeam.textContent = ls?.playing_team || "—";
  ui.strikes.textContent = String(ls?.strikes ?? 0);
  ui.roundSum.textContent = String(ls?.round_sum ?? 0);

  const hasActiveQ = !!ls?.active_question_id;

  // start rundy możliwy gdy jest idle i mamy setup
  const canStartRound = hostOk && buzOk && (ls?.step === "idle");
  ui.btnStartRound.disabled = !canStartRound;

  // reset buzzera: przydatny gdy coś poszło nie tak
  ui.btnResetBuzzer.disabled = !hasActiveQ;

  // decyzja GRAJ/PAS tylko po licytacji (czyli po potwierdzeniu pierwszej odpowiedzi)
  const canDecision = ls?.step === "decision";
  ui.btnPlay.disabled = !canDecision;
  ui.btnPass.disabled = !canDecision;

  // odkrywanie reszty i reset rundy
  const inReveal = ls?.step === "reveal_end";
  ui.btnRevealNext.disabled = !(inReveal && revealQueue.length > 0);
  ui.btnEndRound.disabled = !inReveal;

  // render odpowiedzi
  renderAnswerButtons(ls);
}

function subscribeLive(onChange) {
  const channel = client
    .channel(`live_state:${gameId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "live_state", filter: `game_id=eq.${gameId}` },
      (payload) => {
        onChange(payload.new);
      }
    )
    .subscribe();

  return () => client.removeChannel(channel);
}

async function startGame() {
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
  });
}

async function startRound() {
  setError("");

  const ls = await readLive();
  if (ls.step !== "idle") {
    setError("Nie można: runda już trwa albo jest w trakcie kończenia.");
    return;
  }

  const qid = ui.selQ.value || "";
  if (!qid) {
    setError("Wybierz pytanie do rundy.");
    return;
  }

  const roundNo = typeof ls.round_no === "number" ? ls.round_no : 1;
  const mult = multiplierForRound(roundNo);

  // wczytaj odpowiedzi do UI
  answersForActive = await loadAnswersByQuestion(qid);

  // reset kolejki
  revealQueue = [];

  // start rundy: aktywne pytanie, reset sumy/strikes/odkryć, odblokuj buzzer
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
  });
}

async function onBuzzerLocked(ls) {
  // jeśli buzzer wpadł, przechodzimy do licytacji
  if (ls.step !== "await_buzz") return;
  if (!ls.buzzer_locked || !ls.buzzer_winner) return;

  await updateLive({
    step: "licytacja",
  });
}

async function afterLicytacjaToDecision(ls) {
  // wywołujemy ręcznie po potwierdzeniu 1. odpowiedzi/X:
  // jeśli pierwsza akcja była X -> nadal dajemy decyzję? (w praktyce tak – zwycięzca buzzera wybiera)
  await updateLive({
    step: "decision",
  });
}

async function choosePlay(ls) {
  // zwycięzca gra dalej
  const winner = ls.buzzer_winner || "A";
  await updateLive({
    step: "play",
    playing_team: winner,
    steal_team: null,
  });
}

async function choosePass(ls) {
  // zwycięzca pasuje, gra przeciwnik
  const winner = ls.buzzer_winner || "A";
  const play = otherTeam(winner);
  await updateLive({
    step: "play",
    playing_team: play,
    steal_team: null,
  });
}

async function ensureAnswersLoaded(ls) {
  const qid = ls.active_question_id;
  if (!qid) {
    answersForActive = [];
    return;
  }
  // jeśli mamy inne qid niż w pamięci, przeładuj
  if (!answersForActive.length) {
    answersForActive = await loadAnswersByQuestion(qid);
    return;
  }
}

async function saveTeamNames() {
  const a = (ui.teamA.value || "").trim();
  const b = (ui.teamB.value || "").trim();
  if (!a || !b) {
    setError("Podaj obie nazwy drużyn.");
    return;
  }
  await updateLive({
    team_a_name: a,
    team_b_name: b,
  });
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

  // linki
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

  // akcje gry
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

  ui.btnSaveTeams.addEventListener("click", async () => {
    try {
      setError("");
      await saveTeamNames();
    } catch (e) {
      console.error(e);
      setError(e?.message || "Błąd zapisu nazw.");
    }
  });

  // decyzja GRAJ/PAS
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

  // odkryj kolejne na końcu
  ui.btnRevealNext.addEventListener("click", async () => {
    try {
      const ls = await readLive();
      await revealNext(ls);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Błąd odkrywania.");
    }
  });

  // zakończ rundę / reset planszy
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

  // subskrypcja stanu
  const initial = await readLive();
  ui.teamA.value = initial.team_a_name || "";
  ui.teamB.value = initial.team_b_name || "";

  await ensureAnswersLoaded(initial);

  // jeśli jesteśmy w reveal_end po odświeżeniu operatora, odbuduj kolejkę:
  if (initial.step === "reveal_end") {
    const revealed = parseRevealed(initial);
    const remaining = answersForActive.map((a) => a.id).filter((id) => !revealed.includes(id));
    revealQueue = remaining.slice();
  }

  refreshUI(initial);

  subscribeLive(async (ls) => {
    try {
      // automaty: gdy buzzer zablokowany
      if (ls?.step === "await_buzz" && ls?.buzzer_locked && ls?.buzzer_winner) {
        await onBuzzerLocked(ls);
        // odśwież po update
        const ls2 = await readLive();
        await ensureAnswersLoaded(ls2);
        refreshUI(ls2);
        return;
      }

      // jeśli jesteśmy w licytacji i operator kliknął odpowiedź/X,
      // to po odkryciu pierwszej odpowiedzi chcemy wejść w decyzję:
      // wykrywamy to po tym, że w licytacji pojawiło się cokolwiek w revealed OR strikes>0
      if (ls?.step === "licytacja") {
        const revealed = parseRevealed(ls);
        const hasAny = revealed.length > 0 || (ls.strikes || 0) > 0;
        if (hasAny) {
          await afterLicytacjaToDecision(ls);
          const ls2 = await readLive();
          await ensureAnswersLoaded(ls2);
          refreshUI(ls2);
          return;
        }
      }

      // jeśli w steal operator trafi odpowiedź, to award robi confirmCorrectAnswer
      // jeśli w steal operator da X, to confirmStrike nie kończy automatycznie, więc tu dopinamy:
      if (ls?.step === "steal") {
        // jeżeli operator kliknie X w steal, to strikes już jest 3 i nic nie rozstrzyga.
        // Rozstrzygamy: jeśli w steal NIE odkryto żadnej nowej odpowiedzi po wejściu w steal,
        // operator musi kliknąć poprawną odpowiedź albo X.
        // Tu nic nie robimy automatycznie – decyzja jest poprzez klik.
      }

      // jeśli w steal operator trafi poprawną odpowiedź, confirmCorrectAnswer może zakończyć rundę,
      // ale kradzież powinna od razu przyznać całą rundę steal_team:
      // więc nadpisujemy: jeśli step=steal i pojawiła się nowa revealed, przyznajemy stealowi.
      if (ls?.step === "steal") {
        const revealed = parseRevealed(ls);
        const allIds = answersForActive.map((a) => a.id);
        const anyLeft = allIds.some((id) => !revealed.includes(id));

        // Jeżeli operator właśnie odkrył jakąś odpowiedź w steal,
        // to przyznajemy rundę steal_team i przechodzimy do reveal_end.
        // Wykrywamy: round_awarded_to jeszcze null i step=steal i revealed.length>0
        if (!ls.round_awarded_to && revealed.length > 0) {
          const awardTo = ls.steal_team || otherTeam(ls.playing_team || ls.buzzer_winner || "A");
          await awardAndPrepareReveal(ls, awardTo);

          const ls2 = await readLive();
          await ensureAnswersLoaded(ls2);
          refreshUI(ls2);
          return;
        }

        // Jeżeli operator kliknie X w steal (czyli brak trafienia),
        // to musi kliknąć przycisk "Zakończ rundę"? Nie. Robimy to tu:
        // jeśli w steal round_awarded_to nadal null i operator dał X => nic się nie zmienia w revealed,
        // więc nie wykryjemy. Dlatego przy X w steal powinien przyznać punkty grającej drużynie.
        // Rozwiązanie: operator w steal gdy chce "nietrafione" -> klika X, a my jeśli step=steal i strikes==3 i round_awarded_to==null
        // pozwalamy mu kliknąć "Zakończ rundę"? Też nie.
        // Zrobimy twardo: jeśli step=steal i round_awarded_to==null i ui-strikes==3, pokażemy mu nadal X i odpowiedzi.
        // A nietrafione zrobimy przez drugi klik X: (wtedy już mamy sygnał)
      }

      // standard refresh
      await ensureAnswersLoaded(ls);

      // odbudowa kolejki w reveal_end (gdy update przyjdzie z zewnątrz)
      if (ls?.step === "reveal_end") {
        const revealed = parseRevealed(ls);
        const remaining = answersForActive.map((a) => a.id).filter((id) => !revealed.includes(id));
        revealQueue = remaining.slice();
      }

      refreshUI(ls);
    } catch (e) {
      console.error("[control] refresh error:", e);
    }
  });

  // Nietrafiona kradzież (operator chce zakończyć steal bez trafienia):
  // robimy to przez DŁUGI klik na X? Nie. Prościej: dodajemy ukryty mechanizm:
  // jeśli step=steal i klikniesz X, to od razu przyznajemy rundę grającej drużynie i przechodzimy do reveal_end.
  // Implementujemy to przez podmianę handlera X dopiero gdy step=steal:
  // (najprościej: wykrywa to confirmStrike – ale ona nie wie o steal. Więc dorabiamy globalny listener na klik w X w steal.)
  // -> zrobione w renderAnswerButtons: X w steal idzie do confirmStrike, ale strikes już 3.
  // Dlatego tu dorobimy „hotfix” w czasie rzeczywistym: na UI, w steal, X jest nadal aktywne, ale traktujemy je jako "nietrafione".
  // Robimy to poprzez delegację: jeśli step=steal i klikniesz X, od razu award dla playing_team.
  ui.answersBox.addEventListener("click", async (ev) => {
    const ls = await readLive();
    if (ls.step !== "steal") return;

    const btn = ev.target.closest(".ctl-answer-btn.bad");
    if (!btn) return;

    // nietrafiona kradzież -> punkty dla grającej
    const awardTo = ls.playing_team || otherTeam(ls.buzzer_winner || "A");
    await awardAndPrepareReveal(ls, awardTo);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  main().catch((e) => {
    console.error(e);
    setError(e?.message || "Błąd krytyczny.");
  });
});
