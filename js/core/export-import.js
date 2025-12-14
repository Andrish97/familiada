import { sb } from "./supabase.js";

export async function exportGameConfig(gameId) {
  const { data: game, error: gErr } = await sb()
    .from("games")
    .select("id,name,created_at")
    .eq("id", gameId)
    .single();
  if (gErr) throw gErr;

  const { data: questions, error: qErr } = await sb()
    .from("questions")
    .select("id,ord,text,mode")
    .eq("game_id", gameId)
    .order("ord", { ascending: true });
  if (qErr) throw qErr;

  const qIds = (questions || []).map((q) => q.id);
  let answers = [];
  if (qIds.length) {
    const { data: a, error: aErr } = await sb()
      .from("answers")
      .select("id,question_id,ord,text,fixed_points")
      .in("question_id", qIds)
      .order("question_id", { ascending: true })
      .order("ord", { ascending: true });
    if (aErr) throw aErr;
    answers = a || [];
  }

  const byQ = new Map();
  for (const a of answers) {
    if (!byQ.has(a.question_id)) byQ.set(a.question_id, []);
    byQ.get(a.question_id).push({
      text: a.text,
      points: a.fixed_points ?? null,
      ord: a.ord,
    });
  }

  const payload = {
    name: game.name,
    exported_at: new Date().toISOString(),
    questions: (questions || []).map((q) => ({
      text: q.text,
      mode: q.mode,
      ord: q.ord,
      answers: (byQ.get(q.id) || []).map((x) => ({
        text: x.text,
        points: x.points,
        ord: x.ord,
      })),
    })),
  };

  return payload;
}

export function downloadJSON(obj, filename = "familiada.json") {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

