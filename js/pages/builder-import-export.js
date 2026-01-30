// js/pages/builder-import-export.js
import { sb } from "../core/supabase.js";

/* ===== helpers ===== */
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

/*
  FORMAT:
  {
    game: { name, type }, // type: poll_text | poll_points | prepared
    questions: [
      { text, answers: [{ text, fixed_points }] }
    ]
  }
*/

export async function exportGame(gameId) {
  const { data: game, error: gErr } = await sb()
    .from("games")
    .select("id,name,type")
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
    game: { name: game?.name ?? "Gra", type: safeType(game?.type) },
    questions: [],
  };

  for (const q of questions || []) {
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
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json",
  });
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
   POLL IMPORT FROM URL (open/closed) + optional vote seeding
========================================================= */

async function fetchJsonFromUrl(url) {
  const u = String(url || "").trim();
  if (!u) throw new Error("Brak URL do JSON.");

  const ok =
    /^https?:\/\//i.test(u) || u.startsWith("../") || u.startsWith("./") || u.startsWith("/");
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

function normText(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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
  for (const r of data || []) {
    if (!map.has(r.question_id)) map.set(r.question_id, []);
    map.get(r.question_id).push(r);
  }
  return map;
}

/**
 * Pobierz poll key z games (różne nazwy kolumn — próbujemy po kolei)
 */
async function getPollKeyForGame(gameId) {
  const candidates = ["share_key_poll", "poll_key", "key_poll", "share_key"];
  for (const col of candidates) {
    const { data, error } = await sb().from("games").select(col).eq("id", gameId).single();
    if (!error && data && data[col]) return String(data[col]);
    // jeśli błąd "column does not exist" — próbujemy kolejny
  }
  return null;
}

async function ensurePollSession({ gameId, isOpen }) {
  const qs = await listQuestions(gameId);
  if (!qs.length) throw new Error("DEMO: gra nie ma pytań (nie da się zrobić poll_sessions).");

  const firstOrd = Number(qs[0].ord) || 1;

  // tworzymy pojedynczą sesję “sterującą” (jak u Ciebie w UI),
  // ale z wypełnionym question_ord / question_id
  const { error } = await sb()
    .from("poll_sessions")
    .insert({
      game_id: gameId,
      question_ord: firstOrd,
      question_id: qs[0].id,
      is_open: !!isOpen,
      closed_at: isOpen ? null : new Date().toISOString(),
    });

  if (error) throw error;
  return qs;
}

async function importPollFromUrlInternal(url, ownerId) {
  const src = await fetchJsonFromUrl(url);
  if (!src?.game || !Array.isArray(src?.questions)) {
    throw new Error("JSON: brak game / questions.");
  }

  const type = hardType(src.game.type);
  const pollStatus = hardStatus(src.game.status);
  const name = String(src.game.name ?? "DEMO").trim() || "DEMO";

  // 1) payload pod importGame
  const payload = {
    game: { name, type },
    questions: [],
  };

  if (type === "poll_text") {
    payload.questions = src.questions.map((q) => ({
      text: String(q?.text ?? ""),
      answers: [],
    }));
  } else {
    payload.questions = src.questions.map((q) => ({
      text: String(q?.text ?? ""),
      answers: (Array.isArray(q?.answers) ? q.answers : []).map((a) => ({
        text: String(a?.text ?? ""),
        fixed_points: pollStatus === "closed" ? Number(a?.fixed_points ?? 0) : 0,
      })),
    }));
  }

  // 2) import definicji gry
  const gameId = await importGame(payload, ownerId);

  // 3) poll_sessions zawsze (open i closed)
  const isOpen = pollStatus === "open";
  const qs = await ensurePollSession({ gameId, isOpen });

  // 4) status gry
  if (isOpen) {
    await setGameStatus(gameId, "poll_open");
  } else {
    // “zamknięte”: zostaje draft (albo jak masz inny status – zmień tutaj)
    // ale poll_sessions istnieje (is_open=false), więc UI nie powinno “gubić” gry
    await setGameStatus(gameId, "draft");
    return gameId;
  }

  // 5) seed głosów tylko dla OPEN (jeśli są w JSON)
  const votes = Array.isArray(src.votes) ? src.votes : [];
  if (!votes.length) return gameId;

  const pollKey = await getPollKeyForGame(gameId);
  if (!pollKey) {
    console.warn("[DEMO] Brak poll key w games — pomijam seed głosów.");
    return gameId;
  }

  if (type === "poll_text") {
    for (const v of votes) {
      const arr = Array.isArray(v?.answers_raw) ? v.answers_raw : [];
      const items = [];

      for (let i = 0; i < qs.length; i++) {
        const raw = String(arr[i] ?? "").trim().slice(0, 17);
        if (!raw) continue;

        items.push({
          question_id: qs[i].id,
          answer_raw: raw,
          answer_norm: normText(raw),
        });
      }

      if (!items.length) continue;

      const voter = crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`;

      const { error } = await sb().rpc("poll_text_submit_batch", {
        p_game_id: gameId,
        p_items: items,
        p_key: pollKey,
        p_voter_token: voter,
      });

      if (error) throw error;
    }

    return gameId;
  }

  // poll_points
  const aMap = await listAnswersForQuestions(qs.map((q) => q.id));

  for (const v of votes) {
    const picks = Array.isArray(v?.picks) ? v.picks : [];
    const items = [];

    for (let i = 0; i < qs.length; i++) {
      const answers = aMap.get(qs[i].id) || [];
      const idx = Number(picks[i]);
      if (!Number.isFinite(idx)) continue;

      const a = answers[idx];
      if (!a) continue;

      items.push({ question_id: qs[i].id, answer_id: a.id });
    }

    if (!items.length) continue;

    const voter = crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const { error } = await sb().rpc("poll_points_vote_batch", {
      p_game_id: gameId,
      p_items: items,
      p_key: pollKey,
      p_voter_token: voter,
    });

    if (error) throw error;
  }

  return gameId;
}

export async function importPollFromUrl(url) {
  const ownerId = await currentUserId();
  return await importPollFromUrlInternal(url, ownerId);
}
