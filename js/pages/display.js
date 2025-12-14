import { getSupabase } from "../core/supabase.js";

const $ = (s) => document.querySelector(s);

const statusLine = $("#statusLine");
const questionText = $("#questionText");
const answersGrid = $("#answersGrid");
const roundPoints = $("#roundPoints");
const strikesX = $("#strikesX");
const btnFullscreen = $("#btnFullscreen");

function setStatus(msg) {
  if (statusLine) statusLine.textContent = msg;
}

function qsParam(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

// Wymagamy id i key w URL
const gameId = qsParam("id");
const key = qsParam("key");

function applyStrikes(n) {
  const xs = strikesX?.querySelectorAll(".x") || [];
  xs.forEach((el, i) => el.classList.toggle("on", i < (n || 0)));
}

function makeAnswerTile(idx, text, points, revealed) {
  const el = document.createElement("div");
  el.className = "answer" + (revealed ? " reveal" : " hidden");
  el.innerHTML = `
    <div class="idx">${idx}</div>
    <div class="txt">${text ?? ""}</div>
    <div class="pts">${points ?? ""}</div>
  `;
  // zdejmij animację po chwili, żeby kolejne reveal też działały
  if (revealed) setTimeout(() => el.classList.remove("reveal"), 240);
  return el;
}

async function loadGamePublic(sb) {
  // w tym etapie robimy prosto: pobieramy game i sprawdzamy key w JS
  const { data: game, error } = await sb
    .from("games")
    .select("id, name, share_key_display")
    .eq("id", gameId)
    .single();

  if (error) throw error;
  if (!game || game.share_key_display !== key) {
    throw new Error("Brak dostępu (zły klucz).");
  }
  return game;
}

async function loadConfig(sb, activeQuestionId) {
  if (!activeQuestionId) {
    return { question: null, answers: [] };
  }

  const { data: q, error: qErr } = await sb
    .from("questions")
    .select("id, text, mode")
    .eq("id", activeQuestionId)
    .single();
  if (qErr) throw qErr;

  const { data: ans, error: aErr } = await sb
    .from("answers")
    .select("id, ord, text, fixed_points")
    .eq("question_id", activeQuestionId)
    .order("ord", { ascending: true });
  if (aErr) throw aErr;

  return { question: q, answers: ans || [] };
}

function renderBoard({ question, answers }, live) {
  questionText.textContent = question?.text ? question.text : "Wybierz pytanie…";
  roundPoints.textContent = String(live?.round_points ?? 0);
  applyStrikes(live?.strikes ?? 0);

  const revealedIds = new Set((live?.revealed_answer_ids || []).map(String));

  answersGrid.innerHTML = "";
  const maxTiles = Math.max(answers.length, 8); // klasycznie wygląda jak tablica (np. 8 pól)
  for (let i = 0; i < maxTiles; i++) {
    const a = answers[i];
    const revealed = a ? revealedIds.has(String(a.id)) : false;

    // punkty: fixed_points albo puste (dla poll możesz później podstawić wynik)
    const pts = a ? (a.fixed_points ?? "") : "";

    const el = makeAnswerTile(i + 1, a?.text ?? "", pts, revealed);
    answersGrid.appendChild(el);
  }
}

async function ensureLiveRow(sb) {
  const { data, error } = await sb.from("live_state").select("game_id").eq("game_id", gameId).single();
  if (!error && data) return;

  // jeśli nie ma, tworzymy
  await sb.from("live_state").insert({ game_id: gameId });
}

btnFullscreen?.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {}
});

async function main() {
  if (!gameId || !key) {
    setStatus("Brak parametrów w URL. Otwórz: display.html?id=...&key=...");
    return;
  }

  const sb = getSupabase();

  try {
    setStatus("Sprawdzam dostęp…");
    await loadGamePublic(sb);
    setStatus("OK. Ładuję stan…");

    await ensureLiveRow(sb);

    let lastLive = null;
    let lastConfig = { question: null, answers: [] };

    async function refreshAll(live) {
      lastLive = live;
      lastConfig = await loadConfig(sb, live?.active_question_id);
      renderBoard(lastConfig, lastLive);
    }

    // początkowe wczytanie
    const { data: live, error: liveErr } = await sb
      .from("live_state")
      .select("*")
      .eq("game_id", gameId)
      .single();
    if (liveErr) throw liveErr;

    await refreshAll(live);
    setStatus("Połączono (realtime).");

    // realtime: sub na zmiany live_state
    sb.channel(`live_state:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_state", filter: `game_id=eq.${gameId}` },
        async (payload) => {
          const next = payload.new;
          // jeśli zmieniło się active_question_id -> ściągnij config jeszcze raz
          const changedQuestion = String(next?.active_question_id || "") !== String(lastLive?.active_question_id || "");
          lastLive = next;

          if (changedQuestion) {
            lastConfig = await loadConfig(sb, next?.active_question_id);
          }
          renderBoard(lastConfig, next);
        }
      )
      .subscribe();

  } catch (e) {
    console.error(e);
    setStatus("Błąd: " + (e?.message || String(e)));
  }
}

document.addEventListener("DOMContentLoaded", main);

