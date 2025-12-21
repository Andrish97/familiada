// js/pages/builder-import-export.js
import { sb } from "../core/supabase.js";

/* ===== helpers ===== */
const safeName = (s) => (String(s ?? "Gra").trim() || "Gra").slice(0, 80);

const safeType = (k) => {
  const v = String(k || "");
  if (v === "poll_text" || v === "poll_points" || v === "prepared") return v;
  // fallback — jak ktoś wklei syf, zróbmy najbezpieczniej:
  return "poll_text";
};

const safeQText = (s, i) => (String(s ?? `Pytanie ${i + 1}`).trim() || `Pytanie ${i + 1}`).slice(0, 200);
const safeAText = (s, j) => (String(s ?? `ODP ${j + 1}`).trim() || `ODP ${j + 1}`).slice(0, 17);

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

export async function importGame(payload, ownerId) {
  if (!payload?.game || !Array.isArray(payload.questions)) {
    throw new Error("Zły format pliku (brak game / questions).");
  }

  const type = safeType(payload.game.type);
  const name = safeName(payload.game.name);

  // 1) tworzymy grę (zawsze nowa)
  const { data: game, error: gErr } = await sb()
    .from("games")
    .insert({
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

  // 2) pytania + odpowiedzi (bez twardych limitów; to transporter)
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
