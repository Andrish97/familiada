import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ─── Groq call ────────────────────────────────────────────────────────────────

async function groqChat(groqKey: string, model: string, prompt: string, temperature: number, maxTokens: number) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return ONLY valid JSON, nothing else." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? "";
  if (!raw) throw new Error("Groq empty response");
  return JSON.parse(raw.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim());
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

function buildGeneratePrompt(lang: string, index: number, topic: string, total: number, alreadyUsed: string[]): string {
  const l = lang === 'uk' ? 'Ukrainian' : lang === 'en' ? 'English' : 'Polish';
  const topicClause = topic ? `The theme of this game is: "${topic}".` : `Choose a unique, fun, and engaging theme.`;
  const avoidClause = alreadyUsed.length ? `Avoid these themes/titles: ${alreadyUsed.join(", ")}.` : "";

  return `Generate a JSON object for a "Familiada" (Family Feud) game in ${l}.
This is game #${index} out of ${total}. ${topicClause} ${avoidClause}

Rules:
1. Return ONLY a valid JSON object.
2. The object must have:
   - "meta": { "title": "Title", "description": "Opis 2-4 zdania.", "lang": "${lang}" }
   - "game": { "name": "Title", "type": "prepared" }
   - "questions": Array of 5-6 questions.
3. Each question object: { "text": "...", "answers": [ { "text": "...", "fixed_points": 35 }, ... ] }
4. Answers points must be descending and total ~100 per question.
5. All text in ${l}.`;
}

function buildScanPrompt(lang: string, games: any[]): string {
  const gamesList = games.map(g => `Slug: ${g.slug}\nTitle: ${g.title}`).join("\n---\n");
  return `Identify weak or duplicate games in this list (${lang}):\n${gamesList}\nReturn JSON: {"issues": [{"type": "weak", "slugs": ["..."], "reason": "..."}]}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const groqKey = Deno.env.get("GROQ_API_KEY") ?? "";

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "enqueue");

    // ── enqueue (Frontend adds to queue) ─────────────────────────────────────
    if (action === "enqueue") {
      const { lang = "pl", total = 1, topic = "", alreadyUsed = [] } = body;
      const { data, error } = await supabase.from("game_gen_queue").insert({
        lang, topic, total_games: Number(total), already_used: alreadyUsed, status: 'pending'
      }).select().single();
      if (error) return respond({ error: error.message }, 500);
      return respond({ ok: true, jobId: data.id });
    }

    // ── list-games (List files in storage) ────────────────────────────────────
    if (action === "list-games") {
      const { lang = "pl" } = body;
      const prefix = `marketplace/${lang}`;
      const { data: files, error } = await supabase.storage.from("marketplace").list(prefix, { limit: 1000 });
      if (error) return respond({ error: error.message }, 500);

      const games = (files || []).filter((f: any) => f.name.endsWith(".json")).map((f: any) => {
        const m = f.name.match(/^(\d+)-(.+)\.json$/);
        const slug = m?.[2] ?? f.name.replace(".json", "");
        return {
          num: m ? parseInt(m[1]) : 999,
          filename: f.name,
          title: slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
          slug, sha: f.id, lang, indexKey: `${prefix}/${f.name}`
        };
      });
      games.sort((a: any, b: any) => a.num - b.num);
      return respond({ games });
    }

    // ── batch-commit ──────────────────────────────────────────────────────────
    if (action === "batch-commit") {
      const { lang, deletes = [], adds = [], remaining = [] } = body;
      const prefix = `marketplace/${lang}`;
      const sorted = remaining.slice().sort((a: any, b: any) => parseInt(a.filename) - parseInt(b.filename));
      let counter = 1;
      const tasks: any[] = [];

      for (const g of sorted) {
        const newFilename = `${String(counter++).padStart(3, "0")}-${g.slug}.json`;
        if (newFilename !== g.filename) {
          tasks.push((async () => {
            await supabase.storage.from("marketplace").copy(`${prefix}/${g.filename}`, `${prefix}/${newFilename}`);
            await supabase.storage.from("marketplace").remove([`${prefix}/${g.filename}`]);
          })());
        }
      }
      if (deletes.length) tasks.push(supabase.storage.from("marketplace").remove(deletes.map((d: any) => `${prefix}/${d.filename}`)));
      for (const a of adds) {
        const filename = `${String(counter++).padStart(3, "0")}-${a.slug}.json`;
        tasks.push(supabase.storage.from("marketplace").upload(`${prefix}/${filename}`, a.content, { contentType: "application/json", upsert: true }));
      }
      await Promise.all(tasks);
      return respond({ ok: true });
    }

    // ── get-game ──────────────────────────────────────────────────────────────
    if (action === "get-game") {
      const { lang, filename } = body;
      const { data, error } = await supabase.storage.from("marketplace").download(`marketplace/${lang}/${filename}`);
      if (error) return respond({ error: error.message }, 500);
      return respond({ data: JSON.parse(await data.text()) });
    }

    return respond({ error: "Unknown action" }, 400);
  } catch (e) {
    return respond({ error: String(e) }, 500);
  }
});
