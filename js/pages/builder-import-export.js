// js/pages/builder-import-export.js
import { sb } from "../core/supabase.js";
import { RULES } from "../core/game-validate.js";

// helpers
const clip = (s, n) => String(s ?? "").slice(0, n);
const safeName = (s) => (String(s ?? "Familiada").trim() || "Familiada").slice(0, 80);
const safeKind = (k) => (k === "poll" ? "poll" : "fixed");
const safeQText = (s, i) => (String(s ?? `Pytanie ${i + 1}`).trim() || `Pytanie ${i + 1}`).slice(0, 200);
const safeAText = (s, j) => (String(s ?? `ODP ${j + 1}`).trim() || `ODP ${j + 1}`).slice(0, 17);
const safePts = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.floor(n)));
};

/*
  FORMAT (jedyny wspierany):
  {
    game: { name, kind }, // kind: "fixed" | "poll"
    questions: [
      { text, answers: [{ text, fixed_points }] } // fixed_points tylko sensowne dla fixed
    ]
  }
*/

export async function exportGame(gameId) {
  const { data: game, error: gErr } = await sb()
    .from("games")
    .select("id,name,kind")
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
    game: { name: game?.name ?? "Familiada", kind: safeKind(game?.kind) },
    questions: [],
  };

  // eksportujemy dokładnie 10 pierwszych (żeby testy były powtarzalne)
  const qs = (questions || []).slice(0, RULES.QN);

  for (const q of qs) {
    const { data: answers, error: aErr } = await sb()
      .from("answers")
      .select("ord,text,fixed_points")
      .eq("question_id", q.id)
      .order("ord", { ascending: true });
    if (aErr) throw aErr;

    out.questions.push({
      text: q.text,
      answers: (answers || []).slice(0, RULES.AN).map((a) => ({
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

  const kind = safeKind(payload.game.kind);
  const name = safeName(payload.game.name);

  // normalizacja do 10 pytań × 5 odpowiedzi
  const normalizedQuestions = [];
  for (let i = 0; i < RULES.QN; i++) {
    const srcQ = payload.questions[i] || {};
    const qText = safeQText(srcQ.text, i);

    const srcA = Array.isArray(srcQ.answers) ? srcQ.answers : [];
    const answers = [];
    for (let j = 0; j < RULES.AN; j++) {
      const a = srcA[j] || {};
      const aText = safeAText(a.text, j);

      // fixed: bierzemy fixed_points z pliku (clamp 0..100)
      // poll: ignorujemy punkty z pliku -> ustawiamy 0 (policzą się po zamknięciu)
      const fp = kind === "fixed" ? safePts(a.fixed_points) : 0;

      answers.push({ text: aText, fixed_points: fp });
    }

    normalizedQuestions.push({ text: qText, answers });
  }

  // tworzymy grę
  const { data: game, error: gErr } = await sb()
    .from("games")
    .insert({
      name,
      kind,
      status: "draft",
      owner_id: ownerId,
    })
    .select("id")
    .single();
  if (gErr) throw gErr;

  // wrzucamy pytania + odpowiedzi
  for (let qi = 0; qi < normalizedQuestions.length; qi++) {
    const q = normalizedQuestions[qi];

    const { data: qRow, error: qInsErr } = await sb()
      .from("questions")
      .insert({
        game_id: game.id,
        ord: qi + 1,
        text: q.text,
        mode: kind === "poll" ? "poll" : "fixed",
      })
      .select("id")
      .single();
    if (qInsErr) throw qInsErr;

    const rows = q.answers.map((a, ai) => ({
      question_id: qRow.id,
      ord: ai + 1,
      text: a.text,
      fixed_points: a.fixed_points,
    }));

    const { error: aInsErr } = await sb().from("answers").insert(rows);
    if (aInsErr) throw aInsErr;
  }

  return game.id;
}

// mały helper do pobrania JSON jako plik
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
