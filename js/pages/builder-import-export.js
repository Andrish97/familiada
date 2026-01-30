// js/pages/builder-import-export.js
import { sb } from "../core/supabase.js";

/* =========================================================
   Helpers (safe)
========================================================= */

const safeName = (s) => (String(s ?? "Gra").trim() || "Gra").slice(0, 80);

const safeType = (k) => {
  const v = String(k || "");
  if (v === "poll_text" || v === "poll_points" || v === "prepared") return v;
  return "poll_text";
};

const safeQText = (s, i) =>
  (String(s ?? `Pytanie ${i + 1}`).trim() || `Pytanie ${i + 1}`).slice(0, 200);

const safeAText = (s, j) =>
  (String(s ?? `ODP ${j + 1}`).trim() || `ODP ${j + 1}`).slice(0, 17);

const safePts = (v) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.floor(x)));
};

function normText(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/* =========================================================
   Export gry (games/questions/answers)
========================================================= */

export async function exportGame(gameId) {
  const { data: game, error: gErr } = await sb()
    .from("games")
    .select("id,name,type,status")
    .eq("id", gameId)
    .single();
  if (gErr) throw gErr;

  const { data: questions, error: qErr } = await sb()
    .from("questions")
    .select("id,ord,text")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });
  if (qErr) throw qErr;

  const out = {
    game: {
      name: game?.name ?? "Gra",
      type: safeType(game?.type),
      status: String(game?.status || "draft"),
    },
    questions: [],
  };

  for (const q of (questions || [])) {
    const { data: answers, error: aErr } = await sb()
      .from("answers")
      .select("ord,text,fixed_points")
      .eq("question_id", q.id)
      .order("ord", { ascending: true });
    if (aErr) throw aErr;

    out.questions.push({
      text: q.text,
      answers: (answers || []).map((a) => ({
        text: a.text,
        fixed_points: Number(a.fixed_points) || 0,
      })),
    });
  }

  return out;
}

/* =========================================================
   Import gry (transporter)
========================================================= */

export async function importGame(payload, ownerId) {
  if (!payload?.game || !Array.isArray(payload.questions)) {
    throw new Error("Zły format pliku (brak game / questions).");
  }

  const type = safeType(payload.game.type);
  const name = safeName(payload.game.name);

  const { data: game, error: gErr } = await sb()
    .from("games")
    .insert(
      {
        name,
        type,
        status: "draft",
        owner_id: ownerId,
      },
      { defaultToNull: false }
    )
    .select("id")
    .single();
  if (gErr) throw gErr;

  const qs = payload.questions || [];
  for (let qi = 0; qi < qs.length; qi++) {
    const srcQ = qs[qi] || {};
    const qText = safeQText(srcQ.text, qi);

    const { data: qRow, error: qInsErr } = await sb()
      .from("questions")
      .insert({
        game_id: game.id,
        ord: qi + 1,
        text: qText,
      })
      .select("id")
      .single();
    if (qInsErr) throw qInsErr;

    const srcA = Array.isArray(srcQ.answers) ? srcQ.answers : [];
    const rows = srcA.map((a, ai) => ({
      question_id: qRow.id,
      ord: ai + 1,
      text: safeAText(a?.text, ai),
      fixed_points: safePts(a?.fixed_points),
    }));

    if (rows.length) {
      const { error: aInsErr } = await sb().from("answers").insert(rows);
      if (aInsErr) throw aInsErr;
    }
  }

  return game.id;
}

export function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* =========================================================
   Poll import from URL
   JSON:
     game: { name, type: "poll_text"|"poll_points", status: "open"|"closed" }
     questions:
       - poll_text open:   [{text}, ...]
       - poll_text closed: [{text, answers:[{text,fixed_points},...]}, ...]   (wyniki po zamknięciu)
       - poll_points open: [{text, answers:[{text}...]}, ...]
       - poll_points closed:[{text, answers:[{text,fixed_points}...]}, ...]
     votes (tylko gdy status="open"):
       - poll_text:  votes:[{answers_raw:[...]}]
       - poll_points:votes:[{picks:[...]}]  // indeksy odpowiedzi per pytanie (0-based!)
========================================================= */

async function fetchJsonFromUrl(url) {
  const u = String(url || "").trim();
  if (!u) throw new Error("Brak URL do JSON.");

  const ok =
    /^https?:\/\//i.test(u) ||
    u.startsWith("../") ||
    u.startsWith("./") ||
    u.startsWith("/");

  if (!ok) throw new Error("Podaj link http(s) albo ścieżkę względną do JSON.");

  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) throw new Error(`Nie udało się pobrać JSON (HTTP ${res.status}).`);

  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    throw new Error("Błędny JSON (nie da się sparsować).");
  }
}

async function currentUserId() {
  const { data, error } = await sb().auth.getUser();
  if (error) throw error;
  const uid = data?.user?.id;
  if (!uid) throw new Error("Brak zalogowanego użytkownika.");
  return uid;
}

function hardType(v) {
  const t = String(v || "").trim();
  if (t === "poll_text" || t === "poll_points") return t;
  throw new Error("JSON: game.type musi być 'poll_text' albo 'poll_points'.");
}

function hardStatus(v) {
  const s = String(v || "").toLowerCase().trim();
  if (s === "open" || s === "closed") return s;
  return "open";
}

async function setGameStatus(gameId, status) {
  const { error } = await sb().from("games").update({ status }).eq("id", gameId);
  if (error) throw error;
}

async function getPollKey(gameId) {
  const { data, error } = await sb()
    .from("games")
    .select("share_key_poll")
    .eq("id", gameId)
    .single();

  if (error) throw error;
  const key = String(data?.share_key_poll || "").trim();
  if (!key) throw new Error("Brak share_key_poll w tabeli games (nie da się otworzyć sondażu).");
  return key;
}

async function listQuestions(gameId) {
  const { data, error } = await sb()
    .from("questions")
    .select("id,ord")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function listAnswersForQuestions(qIds) {
  if (!qIds?.length) return new Map();

  const { data, error } = await sb()
    .from("answers")
    .select("id,question_id,ord")
    .in("question_id", qIds)
    .order("ord", { ascending: true });

  if (error) throw error;

  const map = new Map();
  for (const r of (data || [])) {
    if (!map.has(r.question_id)) map.set(r.question_id, []);
    map.get(r.question_id).push(r);
  }
  return map;
}

async function openPollRuntime(gameId, key) {
  // używamy Twojego RPC — on ustawia poll_sessions i status runtime
  const { error } = await sb().rpc("poll_open", { p_game_id: gameId, p_key: key });
  if (error) throw error;
}

async function seedVotesPollText({ gameId, key, votes, qs }) {
  for (const v of votes) {
    const arr = Array.isArray(v?.answers_raw) ? v.answers_raw : [];
    const items = [];

    for (let i = 0; i < qs.length; i++) {
      const raw = String(arr[i] ?? "").trim().slice(0, 200);
      if (!raw) continue;

      items.push({
        question_id: qs[i].id,
        answer_raw: raw,
        answer_norm: normText(raw).slice(0, 200),
      });
    }

    if (!items.length) continue;

    const voter =
      crypto?.randomUUID?.() ||
      `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const { error } = await sb().rpc("poll_text_submit_batch", {
      p_game_id: gameId,
      p_key: key,
      p_voter_token: voter,
      p_items: items,
    });
    if (error) throw error;
  }
}

async function seedVotesPollPoints({ gameId, key, votes, qs }) {
  const aMap = await listAnswersForQuestions(qs.map((q) => q.id));

  for (const v of votes) {
    const picks = Array.isArray(v?.picks) ? v.picks : [];
    const items = [];

    for (let i = 0; i < qs.length; i++) {
      const answers = aMap.get(qs[i].id) || [];
      const idx = Number(picks[i]);
      if (!Number.isFinite(idx)) continue;

      const a = answers[idx]; // picks[] jest 0-based (jak w Twoich demo JSON-ach)
      if (!a) continue;

      items.push({ question_id: qs[i].id, answer_id: a.id });
    }

    if (!items.length) continue;

    const voter =
      crypto?.randomUUID?.() ||
      `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const { error } = await sb().rpc("poll_points_vote_batch", {
      p_game_id: gameId,
      p_key: key,
      p_voter_token: voter,
      p_items: items,
    });

    if (error) throw error;
  }
}

async function importPollFromUrlInternal(url, ownerId) {
  const src = await fetchJsonFromUrl(url);

  if (!src?.game || !Array.isArray(src?.questions)) {
    throw new Error("JSON: brak game / questions.");
  }

  const type = hardType(src.game.type);
  const pollStatus = hardStatus(src.game.status);
  const name = safeName(src.game.name ?? "DEMO");

  /* ===============================
     1) payload pod importGame (open/closed różnią się detalami)
  =============================== */

  const payload = { game: { name, type }, questions: [] };

  if (type === "poll_text") {
    if (pollStatus === "open") {
      // OPEN poll_text: pytania bez answers
      payload.questions = src.questions.map((q) => ({
        text: String(q?.text ?? ""),
        answers: [],
      }));
    } else {
      // CLOSED poll_text: trzymamy wyniki jako answers + fixed_points
      payload.questions = src.questions.map((q) => ({
        text: String(q?.text ?? ""),
        answers: (Array.isArray(q?.answers) ? q.answers : []).map((a) => ({
          text: String(a?.text ?? ""),
          fixed_points: safePts(a?.fixed_points),
        })),
      }));
    }
  } else {
    // poll_points
    if (pollStatus === "open") {
      payload.questions = src.questions.map((q) => ({
        text: String(q?.text ?? ""),
        answers: (Array.isArray(q?.answers) ? q.answers : []).map((a) => ({
          text: String(a?.text ?? ""),
          fixed_points: 0,
        })),
      }));
    } else {
      payload.questions = src.questions.map((q) => ({
        text: String(q?.text ?? ""),
        answers: (Array.isArray(q?.answers) ? q.answers : []).map((a) => ({
          text: String(a?.text ?? ""),
          fixed_points: safePts(a?.fixed_points),
        })),
      }));
    }
  }

  /* ===============================
     2) import definicji gry
  =============================== */

  const gameId = await importGame(payload, ownerId);

  /* ===============================
     3) status CLOSED: ustawiamy poll_closed i kończymy
  =============================== */

  if (pollStatus !== "open") {
    await setGameStatus(gameId, "poll_closed");
    return gameId;
  }

  /* ===============================
     4) OPEN: otwórz runtime przez RPC poll_open
  =============================== */

  const key = await getPollKey(gameId);
  await openPollRuntime(gameId, key);
  await setGameStatus(gameId, "poll_open");

  /* ===============================
     5) seed głosów (tylko OPEN, jeśli JSON ma votes)
  =============================== */

  const votes = Array.isArray(src.votes) ? src.votes : [];
  if (!votes.length) return gameId;

  const qs = await listQuestions(gameId);
  if (!qs.length) return gameId;

  if (type === "poll_text") {
    await seedVotesPollText({ gameId, key, votes, qs });
  } else {
    await seedVotesPollPoints({ gameId, key, votes, qs });
  }

  return gameId;
}

export async function importPollFromUrl(url) {
  const ownerId = await currentUserId();
  return await importPollFromUrlInternal(url, ownerId);
}
