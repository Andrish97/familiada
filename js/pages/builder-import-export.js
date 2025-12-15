// js/pages/builder-import-export.js
import { sb } from "../core/supabase.js";

/*
  Format:
  {
    game: { name, kind },
    questions: [
      {
        text,
        answers: [{ text, fixed_points }]
      }
    ]
  }
*/

export async function exportGame(gameId){
  const { data: game } = await sb()
    .from("games")
    .select("id,name,kind")
    .eq("id", gameId)
    .single();

  const { data: questions } = await sb()
    .from("questions")
    .select("id,ord,text")
    .eq("game_id", gameId)
    .order("ord");

  const out = { game, questions: [] };

  for(const q of questions){
    const { data: answers } = await sb()
      .from("answers")
      .select("ord,text,fixed_points")
      .eq("question_id", q.id)
      .order("ord");

    out.questions.push({
      text: q.text,
      answers
    });
  }

  return out;
}

export async function importGame(payload, ownerId){
  if(!payload?.game || !Array.isArray(payload.questions)){
    throw new Error("Zły format pliku");
  }

  const { data: game } = await sb()
    .from("games")
    .insert({
      name: payload.game.name || "Familiada",
      kind: payload.game.kind || "fixed",
      owner_id: ownerId
    })
    .select()
    .single();

  for(let qi = 0; qi < payload.questions.length; qi++){
    const q = payload.questions[qi];

    const { data: qRow } = await sb()
      .from("questions")
      .insert({
        game_id: game.id,
        ord: qi + 1,
        text: q.text
      })
      .select()
      .single();

    for(let ai = 0; ai < q.answers.length; ai++){
      const a = q.answers[ai];

      await sb().from("answers").insert({
        question_id: qRow.id,
        ord: ai + 1,
        text: a.text,
        fixed_points: Number(a.fixed_points) || 0
      });
    }
  }

  return game.id;
}
