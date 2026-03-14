import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildQuestionsText(payload: any): string {
  const qs = payload?.questions || [];
  if (!Array.isArray(qs)) return "";
  return qs.map((q: any) => String(q?.text || "").trim()).filter(Boolean).join("\n");
}

function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (const x of vec) sumSq += x * x;
  const norm = Math.sqrt(sumSq) || 1;
  return vec.map((x) => x / norm);
}

function truncateForEmbedding(text: string): string {
  const t = String(text || "").trim();
  if (!t) return "";
  const max = 6000;
  return t.length > max ? t.slice(0, max) : t;
}

function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

async function generateEmbedding(text: string, timeoutMs = 12000): Promise<number[] | null> {
  const token = Deno.env.get("HUGGINGFACE_API_TOKEN") || "";
  if (!token) return null;

  const input = truncateForEmbedding(text);
  if (!input) return null;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(
      "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: input, options: { wait_for_model: true } }),
        signal: ac.signal,
      },
    );

    if (!res.ok) return null;
    const data = await res.json();

    if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
    const rows = data as number[][];
    if (!rows.length || !Array.isArray(rows[0]) || rows[0].length !== 384) return null;

    const sums = new Array<number>(384).fill(0);
    for (const row of rows) {
      for (let i = 0; i < 384; i++) sums[i] += row[i] || 0;
    }
    const mean = sums.map((x) => x / rows.length);
    return l2Normalize(mean);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
      const embedding = await generateEmbedding(questionsText, 12000);
      const embeddingLiteral = embedding ? toVectorLiteral(embedding) : null;

      const { data, error } = await supabase.from("market_games").insert({
        source_game_id: null,
        author_user_id: null,
        origin: "producer",
        title: payload.title,
        description: payload.description ?? "",
        lang,
        payload,
        embedding: embeddingLiteral,
        status: "published",
        moderation_note: null,
        storage_path: null,
      }).select("id, title, description, lang, payload, created_at").single();
      if (error) throw error;

      if (embedding) {
        const { data: vecMatches, error: vecErr } = await supabase.rpc("market_find_similar_embeddings", {
          p_lang: data.lang,
          p_embedding: embeddingLiteral,
          p_threshold: 0.78,
          p_limit: 8,
        });
        if (vecErr) throw vecErr;
        const filtered = (vecMatches || []).filter((m: any) => m.id !== data.id);
        return new Response(JSON.stringify({ game: data, matches: filtered }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }

      const { data: matches, error: simError } = await supabase.rpc("market_find_similar_questions", {
        p_lang: data.lang,
        p_questions_text: questionsText,
        p_threshold: 0.45,
        p_limit: 8,
      });
      if (simError) throw simError;

      const filtered = (matches || []).filter((m: any) => m.id !== data.id);
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
        .select("id, lang, payload, embedding, questions_text")
        .eq("id", id)
        .single();
      if (gErr) throw gErr;

      const questionsText = String(g.questions_text || "") || buildQuestionsText(g.payload);

      let embeddingLiteral: string | null =
        typeof g.embedding === "string" && g.embedding.length ? g.embedding : null;

      if (!embeddingLiteral) {
        const maybe = await generateEmbedding(questionsText, 8000);
        if (maybe) {
          embeddingLiteral = toVectorLiteral(maybe);
          const { error: upErr } = await supabase.from("market_games").update({ embedding: embeddingLiteral }).eq("id", g.id);
          if (upErr) throw upErr;
        }
      }

      if (embeddingLiteral) {
        const { data: matches, error: simError } = await supabase.rpc("market_find_similar_embeddings", {
          p_lang: g.lang,
          p_embedding: embeddingLiteral,
          p_threshold: 0.78,
          p_limit: 8,
        });
        if (simError) throw simError;
        const filtered = (matches || []).filter((m: any) => m.id !== g.id);
        return new Response(JSON.stringify({ ok: true, matches: filtered, mode: "embeddings" }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }

      const { data: matches, error: simError } = await supabase.rpc("market_find_similar_questions", {
        p_lang: g.lang,
        p_questions_text: questionsText,
        p_threshold: 0.45,
        p_limit: 8,
      });
      if (simError) throw simError;
      const filtered = (matches || []).filter((m: any) => m.id !== g.id);
      return new Response(JSON.stringify({ ok: true, matches: filtered, mode: "trgm" }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (action === "embed-missing") {
      const { lang, limit } = body;
      const batchSize = Math.max(1, Math.min(50, Number(limit) || 20));

      const token = Deno.env.get("HUGGINGFACE_API_TOKEN") || "";
      if (!token) {
        return new Response(JSON.stringify({ ok: false, processed: 0, err: "missing_HUGGINGFACE_API_TOKEN" }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

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
      let attempted = 0;
      const startedAt = Date.now();
      const timeBudgetMs = 45000;
      for (const row of rows || []) {
        if (Date.now() - startedAt > timeBudgetMs) break;
        const text = String(row.questions_text || "") || buildQuestionsText(row.payload);
        if (!text) continue;
        attempted++;
        const emb = await generateEmbedding(text, 8000);
        if (emb) {
          const { error: upErr } = await supabase.from("market_games").update({ embedding: toVectorLiteral(emb) }).eq("id", row.id);
          if (upErr) throw upErr;
          processed++;
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        processed,
        attempted,
        budget_ms: timeBudgetMs,
        duration_ms: Date.now() - startedAt,
      }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: CORS });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: CORS });
  }
});
