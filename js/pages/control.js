// js/pages/control.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { playSfx } from "../core/sfx.js";
import { validateGameReadyToPlay } from "../core/game-validate.js";

let displayChannel = null;

function ensureDisplayChannel(gameId){
  if (displayChannel) return displayChannel;
  displayChannel = sb().channel(`fam_display:${gameId}`).subscribe();
  return displayChannel;
}

async function sendToDisplay(gameId, line){
  const ch = ensureDisplayChannel(gameId);
  await ch.send({
    type: "broadcast",
    event: "DISPLAY_CMD",
    payload: { line: String(line) }
  });
}

guardDesktopOnly({ message: "Sterowanie Familiady jest dostępne tylko na komputerze." });

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");
const btnBack = document.getElementById("btnBack");
const gameLabel = document.getElementById("gameLabel");

const tabs = Array.from(document.querySelectorAll(".tab"));
const panels = Array.from(document.querySelectorAll(".panel"));

const msgDevices = document.getElementById("msgDevices");
const msgGame = document.getElementById("msgGame");

const pillHost = document.getElementById("pillHost");
const pillBuzzer = document.getElementById("pillBuzzer");
const pillDisplay = document.getElementById("pillDisplay");

const hostLink = document.getElementById("hostLink");
const buzzerLink = document.getElementById("buzzerLink");
const displayLink = document.getElementById("displayLink");

const btnCopyHost = document.getElementById("btnCopyHost");
const btnCopyBuzzer = document.getElementById("btnCopyBuzzer");
const btnCopyDisplay = document.getElementById("btnCopyDisplay");

const btnOpenHost = document.getElementById("btnOpenHost");
const btnOpenBuzzer = document.getElementById("btnOpenBuzzer");
const btnOpenDisplay = document.getElementById("btnOpenDisplay");

const btnStartGame = document.getElementById("btnStartGame");
const btnStartRound = document.getElementById("btnStartRound");
const btnResetBuzzer = document.getElementById("btnResetBuzzer");

const stRound = document.getElementById("stRound");
const stMult = document.getElementById("stMult");
const stStep = document.getElementById("stStep");

const stBuzz = document.getElementById("stBuzz");
const stTeam = document.getElementById("stTeam");
const stStrikes = document.getElementById("stStrikes");
const stSum = document.getElementById("stSum");

const btnPlay = document.getElementById("btnPlay");
const btnPass = document.getElementById("btnPass");
const btnX = document.getElementById("btnX");

const answersBox = document.getElementById("answers");
const btnRevealNext = document.getElementById("btnRevealNext");
const btnEndRound = document.getElementById("btnEndRound");

let displayWin = null;
let game = null;
let questions = [];
let answersForActive = [];
let revealQueue = [];

function setMsg(where, t) {
  where.textContent = t || "";
  if (t) setTimeout(() => (where.textContent = ""), 1400);
}

function setPill(pill, ok, text) {
  pill.classList.remove("ok", "bad");
  pill.classList.add(ok ? "ok" : "bad");
  pill.textContent = text;
}

function buildLink(file, params) {
  const u = new URL(file, location.href);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  return u.toString();
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function otherTeam(t) { return t === "A" ? "B" : "A"; }

function multiplierForRound(n) {
  if (n === 1) return 1;
  if (n === 2) return 2;
  return 3;
}

function parseArr(v) {
  try {
    if (Array.isArray(v)) return v;
    return JSON.parse(v || "[]");
  } catch { return []; }
}

async function ensureLive() {
  const { data } = await sb().from("live_state").select("game_id").eq("game_id", gameId).maybeSingle();
  if (data?.game_id) return;
  await sb().from("live_state").insert({ game_id: gameId });
}

async function loadGame() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,kind,status,share_key_display,share_key_buzzer,share_key_host")
    .eq("id", gameId)
    .single();
  if (error) throw error;
  return data;
}

async function loadQuestions() {
  const { data, error } = await sb()
    .from("questions")
    .select("id,ord,text")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function loadAnswers(qid) {
  const { data, error } = await sb()
    .from("answers")
    .select("id,ord,text,fixed_points")
    .eq("question_id", qid)
    .order("ord", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function readLive() {
  const { data, error } = await sb().from("live_state").select("*").eq("game_id", gameId).single();
  if (error) throw error;
  return data;
}

async function updateLive(patch) {
  const { error } = await sb().from("live_state").update(patch).eq("game_id", gameId);
  if (error) throw error;
}

function tabSwitch(name) {
  tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  panels.forEach(p => p.style.display = p.dataset.panel === name ? "" : "none");
}

tabs.forEach(t => t.addEventListener("click", () => tabSwitch(t.dataset.tab)));

function pingOk(seenAtIso) {
  if (!seenAtIso) return false;
  const seen = new Date(seenAtIso).getTime();
  const now = Date.now();
  return (now - seen) <= 15000;
}

async function validateGameReady(){
  const qs = await loadQuestions();
  questions = qs;

  if(!qs || qs.length < 10){
    return { ok:false, reason:`Gra musi mieć min. 10 pytań. Masz: ${qs?.length||0}.` };
  }

  for(const q of qs){
    const ans = await loadAnswers(q.id);
    if(!ans || ans.length !== 5){
      return { ok:false, reason:`Pytanie #${q.ord} musi mieć dokładnie 5 odpowiedzi.` };
    }

    if(game.kind === "fixed"){
      const sum = ans.reduce((s,a)=>s + (Number(a.fixed_points)||0), 0);
      if(sum > 100){
        return { ok:false, reason:`Pytanie #${q.ord}: suma punktów = ${sum} (max 100).` };
      }
    }
  }

  if(game.kind === "poll" && game.status !== "ready"){
    return { ok:false, reason:"Sondażowa nie jest gotowa: najpierw zamknij sondaż (status READY)." };
  }

  return { ok:true, reason:"" };
}

function pickNextQuestionId(ls) {
  const used = parseArr(ls.used_question_ids);
  for (const q of questions) {
    if (!used.includes(q.id)) return q.id;
  }
  return null;
}

function renderAnswers(ls) {
  answersBox.innerHTML = "";
  const revealed = parseArr(ls.revealed_answer_ids);
  const step = ls.step || "idle";
  const canClick = ["licytacja", "play", "steal"].includes(step);

  for (const a of answersForActive) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "aBtn";
    const rev = revealed.includes(a.id);
    if (rev) b.classList.add("revealed");
    b.disabled = !canClick || rev;

    b.innerHTML = `
      <div class="aTop"><span>#${a.ord}</span><span>${Number(a.fixed_points) || 0} pkt</span></div>
      <div class="aText">${a.text}</div>
    `;

    b.addEventListener("click", async () => {
      if (!canClick || rev) return;
      await confirmCorrect(ls, a);
    });

    answersBox.appendChild(b);
  }
}

async function confirmCorrect(ls, ans) {
  playSfx("answer_correct");

  const revealed = parseArr(ls.revealed_answer_ids);
  const mult = Number(ls.multiplier) || 1;
  const pts = (Number(ans.fixed_points) || 0) * mult;
  const newSum = (Number(ls.round_sum) || 0) + pts;

  revealed.push(ans.id);

  await updateLive({
    revealed_answer_ids: revealed,
    round_sum: newSum,
    round_points: newSum,
  });

  playSfx("ui_tick");

  const all = answersForActive.map(a => a.id);
  const allRevealed = all.every(id => revealed.includes(id));
  if (allRevealed) {
    const awardTo = ls.step === "steal"
      ? (ls.steal_team || otherTeam(ls.playing_team || ls.buzzer_winner || "A"))
      : (ls.playing_team || ls.buzzer_winner || "A");

    await awardRound(ls, awardTo);
  }
}

async function confirmStrike(ls) {
  playSfx("answer_wrong");

  const strikes = (Number(ls.strikes) || 0) + 1;
  if (strikes >= 3) {
    const stealTeam = otherTeam(ls.playing_team || ls.buzzer_winner || "A");
    await updateLive({ strikes, step: "steal", steal_team: stealTeam });
    return;
  }
  await updateLive({ strikes });
}

async function awardRound(ls, teamToAward) {
  const sum = Number(ls.round_sum) || 0;

  const patch = {
    step: "reveal_end",
    round_awarded_to: teamToAward,
  };

  if (teamToAward === "A") patch.team_a_score = (Number(ls.team_a_score) || 0) + sum;
  if (teamToAward === "B") patch.team_b_score = (Number(ls.team_b_score) || 0) + sum;

  await updateLive(patch);

  const revealed = parseArr(ls.revealed_answer_ids);
  const remaining = answersForActive.map(a => a.id).filter(id => !revealed.includes(id));
  revealQueue = remaining.slice();

  playSfx("round_transition");
}

async function revealNext() {
  const ls = await readLive();
  if (!revealQueue.length) return;

  const nextId = revealQueue.shift();
  const revealed = parseArr(ls.revealed_answer_ids);
  if (!revealed.includes(nextId)) revealed.push(nextId);

  await updateLive({ revealed_answer_ids: revealed });
  playSfx("ui_tick");
}

async function endRound() {
  const ls = await readLive();
  if (revealQueue.length) {
    setMsg(msgGame, "Najpierw odkryj pozostałe odpowiedzi.");
    return;
  }

  const nextRound = (Number(ls.round_no) || 1) + 1;
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
  });

  answersForActive = [];
  revealQueue = [];
  setMsg(msgGame, "Runda zakończona.");
}

async function startGame(gameId) {
  const chk = await validateGameReadyToPlay(gameId);
  if(!chk.ok){
    setMsg(msgGame, chk.reason);
    return;
  }

  const ls = await readLive();
  if (!pingOk(ls.seen_host_at) || !pingOk(ls.seen_buzzer_at)) {
    setMsg(msgGame, "HOST/BUZZER nie działają (brak ping).");
    return;
  }

  await updateLive({
    phase: "idle",
    step: "idle",
    round_no: 1,
    multiplier: 1,

    team_a_score: 0,
    team_b_score: 0,

    strikes: 0,
    round_sum: 0,
    round_points: 0,

    active_question_id: null,
    revealed_answer_ids: [],

    buzzer_locked: false,
    buzzer_winner: null,
    buzzer_at: null,

    playing_team: null,
    steal_team: null,
    round_awarded_to: null,

    used_question_ids: [],
  });

  playSfx("show_intro");
  setMsg(msgGame, "Start gry OK.");
}

async function startRound() {
  const chk = await validateGameReadyToPlay(gameId);
  if(!chk.ok){
    setMsg(msgGame, chk.reason);
    return;
  }

  const ls = await readLive();
  if (ls.step !== "idle") {
    setMsg(msgGame, "Runda już trwa / jest w trakcie kończenia.");
    return;
  }

  if (!pingOk(ls.seen_host_at) || !pingOk(ls.seen_buzzer_at)) {
    setMsg(msgGame, "HOST/BUZZER nie działają (brak ping).");
    return;
  }

  const qid = pickNextQuestionId(ls);
  if (!qid) {
    setMsg(msgGame, "Brak kolejnych pytań.");
    return;
  }

  answersForActive = await loadAnswers(qid);
  if (!answersForActive.length) {
    setMsg(msgGame, "Pytanie nie ma odpowiedzi.");
    return;
  }

  const used = parseArr(ls.used_question_ids);
  if (!used.includes(qid)) used.push(qid);

  const roundNo = Number(ls.round_no) || 1;
  const mult = multiplierForRound(roundNo);

  await updateLive({
    phase: "round",
    step: "await_buzz",
    active_question_id: qid,

    strikes: 0,
    round_sum: 0,
    round_points: 0,
    revealed_answer_ids: [],

    multiplier: mult,
    used_question_ids: used,

    buzzer_locked: false,
    buzzer_winner: null,
    buzzer_at: null,

    playing_team: null,
    steal_team: null,
    round_awarded_to: null,
  });

  playSfx("round_transition");
  setMsg(msgGame, `Start rundy #${roundNo}.`);
}

async function resetBuzzer() {
  await updateLive({ buzzer_locked: false, buzzer_winner: null, buzzer_at: null });
  setMsg(msgGame, "Buzzer zresetowany.");
}

async function choosePlay() {
  const ls = await readLive();
  if (ls.step !== "decision") return;
  await updateLive({ step: "play", playing_team: (ls.buzzer_winner || "A") });
}

async function choosePass() {
  const ls = await readLive();
  if (ls.step !== "decision") return;
  await updateLive({ step: "play", playing_team: otherTeam(ls.buzzer_winner || "A") });
}

async function pressX() {
  const ls = await readLive();
  if (["licytacja", "play", "steal"].includes(ls.step)) {
    if (ls.step === "steal") {
      const awardTo = ls.playing_team || otherTeam(ls.buzzer_winner || "A");
      await awardRound(ls, awardTo);
      return;
    }
    await confirmStrike(ls);
  }
}

function syncUi(ls) {
  const hostOk = pingOk(ls.seen_host_at);
  const buzOk = pingOk(ls.seen_buzzer_at);

  setPill(pillHost, hostOk, hostOk ? "HOST: OK" : "HOST: BRAK");
  setPill(pillBuzzer, buzOk, buzOk ? "BUZZER: OK" : "BUZZER: BRAK");

  const dispOk = !!displayWin && !displayWin.closed;
  setPill(pillDisplay, dispOk, dispOk ? "DISPLAY: OTWARTY" : "DISPLAY: BRAK");

  stRound.textContent = String(ls.round_no ?? "—");
  stMult.textContent = String(ls.multiplier ?? "—");
  stStep.textContent = String(ls.step ?? "—");

  stBuzz.textContent = ls.buzzer_winner || "—";
  stTeam.textContent = ls.playing_team || "—";
  stStrikes.textContent = String(ls.strikes ?? 0);
  stSum.textContent = String(ls.round_sum ?? 0);

  btnPlay.disabled = ls.step !== "decision";
  btnPass.disabled = ls.step !== "decision";

  btnRevealNext.disabled = !(ls.step === "reveal_end" && revealQueue.length > 0);
  btnEndRound.disabled = !(ls.step === "reveal_end");

  renderAnswers(ls);

  btnX.disabled = !["licytacja", "play", "steal"].includes(ls.step);
  btnResetBuzzer.disabled = !ls.active_question_id;
  btnStartRound.disabled = !(ls.step === "idle");
}

function subLive(onChange) {
  const ch = sb()
    .channel(`live_state:${gameId}`)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "live_state", filter: `game_id=eq.${gameId}` },
      (payload) => onChange(payload.new)
    )
    .subscribe();

  return () => sb().removeChannel(ch);
}

function openPopup(url, name) {
  return window.open(url, name, "noopener,noreferrer");
}

async function main() {
  if (!gameId) {
    alert("Brak parametru id w URL (control.html?id=...).");
    location.href = "builder.html";
    return;
  }

  const u = await requireAuth("index.html");
  who.textContent = u?.email || "—";

  btnLogout.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  btnBack.addEventListener("click", ()=> location.href = "builder.html");

  await ensureLive();

  game = await loadGame();
  gameLabel.textContent = `Gra: ${game.name} • typ: ${game.kind} • status: ${game.status}`;

  questions = await loadQuestions();

  const hostUrl = buildLink("host.html", { id: game.id, key: game.share_key_host });
  const buzUrl = buildLink("buzzer.html", { id: game.id, key: game.share_key_buzzer });
  const dispUrl = buildLink("display/index.html", { id: game.id, key: game.share_key_display });

  hostLink.value = hostUrl;
  buzzerLink.value = buzUrl;
  displayLink.value = dispUrl;

  btnCopyHost.addEventListener("click", async () => setMsg(msgDevices, (await copyText(hostUrl)) ? "Skopiowano link HOST." : "Nie udało się skopiować."));
  btnCopyBuzzer.addEventListener("click", async () => setMsg(msgDevices, (await copyText(buzUrl)) ? "Skopiowano link BUZZER." : "Nie udało się skopiować."));
  btnCopyDisplay.addEventListener("click", async () => setMsg(msgDevices, (await copyText(dispUrl)) ? "Skopiowano link DISPLAY." : "Nie udało się skopiować."));

  btnOpenHost.addEventListener("click", () => openPopup(hostUrl, "fam_host"));
  btnOpenBuzzer.addEventListener("click", () => openPopup(buzUrl, "fam_buzzer"));
  btnOpenDisplay.addEventListener("click", async () => {
    displayWin = openPopup(dispUrl, "fam_display");
    setMsg(msgDevices, "Otworzono display.");
  
    // 🔽 test: po 0.8s wyślij komendę
    setTimeout(async () => {
      try{
        await sendToDisplay(game.id, "MODE QR");
        await sendToDisplay(
          game.id,
          `QR HOST "${hostLink.value}" BUZZER "${buzzerLink.value}"`
        );
      }catch(e){
        console.error("[control] sendToDisplay error:", e);
      }
    }, 800);
  });

  btnStartGame.addEventListener("click", startGame);
  btnStartRound.addEventListener("click", startRound);
  btnResetBuzzer.addEventListener("click", resetBuzzer);

  btnPlay.addEventListener("click", choosePlay);
  btnPass.addEventListener("click", choosePass);
  btnX.addEventListener("click", pressX);

  btnRevealNext.addEventListener("click", revealNext);
  btnEndRound.addEventListener("click", endRound);

  let ls = await readLive();

  if (ls.active_question_id) {
    answersForActive = await loadAnswers(ls.active_question_id);
    const revealed = parseArr(ls.revealed_answer_ids);
    revealQueue = answersForActive.map(a => a.id).filter(id => !revealed.includes(id));
  }

  let lastBuzzerLock = !!ls.buzzer_locked;
  let lastStep = ls.step;

  syncUi(ls);

  subLive(async (n) => {
    try {
      ls = n;

      if (!lastBuzzerLock && ls.buzzer_locked) playSfx("buzzer_press");
      lastBuzzerLock = !!ls.buzzer_locked;

      if (ls.step !== lastStep) {
        lastStep = ls.step;

        if (ls.step === "await_buzz" && ls.buzzer_locked && ls.buzzer_winner) {
          await updateLive({ step: "licytacja" });
        }

        if (ls.step === "licytacja") {
          const any = parseArr(ls.revealed_answer_ids).length > 0 || (Number(ls.strikes) || 0) > 0;
          if (any) await updateLive({ step: "decision" });
        }
      }

      if (ls.active_question_id) {
        answersForActive = await loadAnswers(ls.active_question_id);
        const revealed = parseArr(ls.revealed_answer_ids);
        if (ls.step === "reveal_end") {
          revealQueue = answersForActive.map(a => a.id).filter(id => !revealed.includes(id));
        }
      } else {
        answersForActive = [];
        revealQueue = [];
      }

      syncUi(ls);
    } catch (e) {
      console.error("[control] live err:", e);
    }
  });

  document.addEventListener("click", () => playSfx("ui_tick"), { once: true });

  tabSwitch("devices");
}

document.addEventListener("DOMContentLoaded", () => {
  main().catch(e => {
    console.error(e);
    alert("Błąd sterowania. Sprawdź konsolę (F12).");
  });
});
