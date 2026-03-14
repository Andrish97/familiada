import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

let extractorPromise: Promise<any> | null = null;
async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = import("https://esm.sh/@xenova/transformers@2.17.1")
      .then((m) => m.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2"));
  }
  return await extractorPromise;
}

function buildQuestionsText(payload: any): string {
  const qs = payload?.questions || [];
  if (!Array.isArray(qs)) return "";
  return qs.map((q: any) => String(q?.text || "").trim()).filter(Boolean).join("\n");
}

async function generateEmbedding(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const result = await extractor(text, { pooling: "mean", normalize: true });
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
      let query = supabase
        .from("market_games")
        .select("id, title, description, lang, payload, created_at")
        .eq("origin", "producer")
        .eq("status", "published")
        .order("created_at", { ascending: false });

      if (lang && lang !== "all") query = query.eq("lang", lang);

      const { data, error } = await query;
      if (error) throw error;
      return new Response(JSON.stringify(data), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (action === 'generate-producer-game') {
      const { lang, topic, avoidTitles = [] } = body;
      const model = "llama-3.1-8b-instant";
      const prompt = buildGeneratePrompt(lang, topic, avoidTitles);
      const payload = await groqChat(groqKey, model, prompt);

      const questionsText = buildQuestionsText(payload);
      const embedding = await generateEmbedding(questionsText);

      const { data, error } = await supabase.from("market_games").insert({
        source_game_id: null,
        author_user_id: null,
        origin: "producer",
        title: payload.title,
        description: payload.description ?? "",
        lang,
        payload,
        embedding,
        status: "published",
        moderation_note: null,
        storage_path: null,
      }).select("id, title, description, lang, payload, created_at").single();
      if (error) throw error;

      const { data: vecMatches, error: vecErr } = await supabase.rpc("market_find_similar_embeddings", {
        p_lang: data.lang,
        p_embedding: embedding,
        p_threshold: 0.78,
        p_limit: 8,
      });
      if (vecErr) throw vecErr;

      const filtered = (vecMatches || []).filter((m: any) => m.id !== data.id);
      return new Response(JSON.stringify({ game: data, matches: filtered }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (action === 'delete-game') {
      const { id } = body;
      const { error } = await supabase.from("market_games").delete().eq("id", id).eq("origin", "producer");
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (action === 'scan-all-duplicates') {
      return new Response(JSON.stringify({ duplicateGroups: [] }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (action === "check-uniqueness") {
      const { id } = body;
      const { data: g, error: gErr } = await supabase
        .from("market_games")
        .select("id, lang, payload, embedding")
        .eq("id", id)
        .single();
      if (gErr) throw gErr;

      let embedding: number[] | null = g.embedding ?? null;
      if (!embedding) {
        const questionsText = buildQuestionsText(g.payload);
        embedding = await generateEmbedding(questionsText);
        const { error: upErr } = await supabase.from("market_games").update({ embedding }).eq("id", g.id);
        if (upErr) throw upErr;
      }

      const { data: matches, error: simError } = await supabase.rpc("market_find_similar_embeddings", {
        p_lang: g.lang,
        p_embedding: embedding,
        p_threshold: 0.78,
        p_limit: 8,
      });
      if (simError) throw simError;

      const filtered = (matches || []).filter((m: any) => m.id !== g.id);
      return new Response(JSON.stringify({ ok: true, matches: filtered }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (action === "embed-missing") {
      const { lang, limit } = body;
      const batchSize = Math.max(1, Math.min(50, Number(limit) || 20));

      let query = supabase
        .from("market_games")
        .select("id, lang, questions_text, payload")
        .is("embedding", null)
        .in("status", ["published", "pending"])
        .order("created_at", { ascending: true })
        .limit(batchSize);

      if (lang && lang !== "all") query = query.eq("lang", lang);

      const { data: rows, error: selErr } = await query;
      if (selErr) throw selErr;

      let processed = 0;
      for (const row of rows || []) {
        const text = String(row.questions_text || "") || buildQuestionsText(row.payload);
        if (!text) continue;
        const emb = await generateEmbedding(text);
        const { error: upErr } = await supabase.from("market_games").update({ embedding: emb }).eq("id", row.id);
        if (upErr) throw upErr;
        processed++;
      }

      return new Response(JSON.stringify({ ok: true, processed }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: CORS });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: CORS });
  }
});
