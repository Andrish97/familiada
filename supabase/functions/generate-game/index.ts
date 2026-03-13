import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { pipeline } from "https://esm.sh/@xenova/transformers@2.17.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Initialize embedding model
const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
async function generateEmbedding(text: string) {
  const result = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(result.data);
}

async function groqChat(groqKey: string, model: string, prompt: string) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data?.choices?.[0]?.message?.content || "{}");
}

function buildGeneratePrompt(lang: string, topic: string, avoidTitles: string[]) {
  const l = lang === 'uk' ? 'Ukrainian' : lang === 'en' ? 'English' : 'Polish';
  const topicClause = topic ? `Theme: "${topic}".` : `Choose a unique, fun theme.`;
  const avoidClause = avoidTitles.length ? `Avoid these titles: ${avoidTitles.join(", ")}.` : "";
  return `Generate a JSON object for a "Familiada" game in ${l}. ${topicClause} ${avoidClause}
  Format: {"title": "...", "description": "...", "questions": [{"text": "...", "answers": [...]}]}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const groqKey = Deno.env.get("GROQ_API_KEY")!;

  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'list-producer-games') {
      const { lang } = body;
      const { data, error } = await supabase.from('games').select('id, title, description, status, lang').eq('source', 'producer').eq('lang', lang).order('created_at', { ascending: false });
      if (error) throw error;
      return new Response(JSON.stringify(data), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (action === 'generate-producer-game') {
      const { lang, topic, avoidTitles = [] } = body;
      const model = "llama-3.1-8b-instant";
      const prompt = buildGeneratePrompt(lang, topic, avoidTitles);
      const payload = await groqChat(groqKey, model, prompt);

      const questionsText = payload.questions.map((q: any) => q.text).join("\n");
      const embedding = await generateEmbedding(questionsText);

      const { data, error } = await supabase.from('games').insert({
        source: 'producer',
        status: 'published',
        lang,
        title: payload.title,
        description: payload.description,
        payload,
        embedding
      }).select().single();

      if (error) throw error;
      return new Response(JSON.stringify(data), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (action === 'delete-game') {
      const { id } = body;
      const { error } = await supabase.from('games').delete().eq('id', id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (action === 'scan-all-duplicates') {
      const { data: games, error } = await supabase.from('games').select('id, embedding').in('status', ['published', 'pending']);
      if (error) throw error;

      const duplicateGroups = [];
      const checkedIds = new Set();

      for (const game of games) {
        if (checkedIds.has(game.id)) continue;

        const { data: similar } = await supabase.rpc('find_similar_games', { 
          query_embedding: game.embedding, 
          match_threshold: 0.9, 
          match_count: 5 
        });

        const group = (similar || []).filter((s: any) => s.id !== game.id);
        if (group.length > 0) {
          const fullGroup = [game, ...group];
          duplicateGroups.push(fullGroup);
          fullGroup.forEach(g => checkedIds.add(g.id));
        }
      }
      return new Response(JSON.stringify({ duplicateGroups }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
});
