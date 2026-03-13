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

async function groqChat(groqKey: string, model: string, prompt: string) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return ONLY valid JSON, nothing else." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data?.choices?.[0]?.message?.content || "{}");
}

function buildGeneratePrompt(lang: string, index: number, total: number, topic: string, alreadyUsed: string[]) {
  const l = lang === 'uk' ? 'Ukrainian' : lang === 'en' ? 'English' : 'Polish';
  const topicClause = topic ? `The theme of this game is: "${topic}".` : `Choose a unique, fun theme.`;
  const avoidClause = alreadyUsed.length ? `Avoid these titles: ${alreadyUsed.join(", ")}.` : "";

  return `Generate a JSON object for a "Familiada" (Family Feud) game in ${l}.
This is game #${index} out of ${total}. ${topicClause} ${avoidClause}
JSON format:
{
  "meta": { "title": "...", "description": "...", "lang": "${lang}" },
  "game": { "name": "...", "type": "prepared" },
  "questions": [
    { "text": "...", "answers": [ {"text": "...", "fixed_points": 35}, ... ] }
  ]
}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const groqKey = Deno.env.get("GROQ_API_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ── enqueue ───────────────────────────────────────────────────────────────
    if (action === "enqueue") {
      const { lang = "pl", total = 1, topic = "", alreadyUsed = [] } = body;
      const { data, error } = await supabase.from("game_gen_queue").insert({
        lang, topic, total_games: Number(total), already_used: alreadyUsed, status: 'pending'
      }).select().single();
      if (error) return respond({ error: error.message }, 500);
      return respond({ ok: true, jobId: data.id });
    }

    // ── process-step (ONE game + recursive trigger) ───────────────────────────
    if (action === "process-step") {
      const { jobId } = body;
      const { data: job, error: getErr } = await supabase.from("game_gen_queue").select("*").eq("id", jobId).single();
      if (getErr || !job || job.status === "completed") return respond({ ok: true });

      await supabase.from("game_gen_queue").update({ status: "processing" }).eq("id", jobId);

      try {
        const results = Array.isArray(job.results) ? job.results : [];
        const alreadyUsed = Array.isArray(job.already_used) ? job.already_used : [];
        
        if (results.length < job.total_games) {
          const model = job.total_games > 1 ? "llama-3.1-8b-instant" : "llama-3.3-70b-versatile";
          const prompt = buildGeneratePrompt(job.lang, results.length + 1, job.total_games, job.topic, alreadyUsed);
          const game = await groqChat(groqKey, model, prompt);
          
          results.push(game);
          if (game.meta?.title) alreadyUsed.push(game.meta.title);

          await supabase.from("game_gen_queue").update({ 
            processed_games: results.length, results, already_used: alreadyUsed 
          }).eq("id", jobId);

          if (results.length < job.total_games) {
            // Trigger next step asynchronously
            fetch(`${supabaseUrl}/functions/v1/generate-game`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
              body: JSON.stringify({ action: 'process-step', jobId })
            }).catch(() => {});
          } else {
            await supabase.from("game_gen_queue").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", jobId);
          }
        }
        return respond({ ok: true });
      } catch (err) {
        await supabase.from("game_gen_queue").update({ status: "failed", last_error: String(err) }).eq("id", jobId);
        return respond({ error: String(err) }, 500);
      }
    }

    // ── list-games ────────────────────────────────────────────────────────────
    if (action === "list-games") {
      const { lang = "pl" } = body;
      const { data: files, error } = await supabase.storage.from("marketplace").list(`marketplace/${lang}`, { limit: 1000 });
      if (error) return respond({ error: error.message }, 500);
      const games = (files || []).filter((f: any) => f.name.endsWith(".json")).map((f: any) => {
        const m = f.name.match(/^(\d+)-(.+)\.json$/);
        const slug = m?.[2] ?? f.name.replace(".json", "");
        return {
          num: m ? parseInt(m[1]) : 999,
          filename: f.name,
          title: slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
          slug, lang, indexKey: `marketplace/${lang}/${f.name}`
        };
      });
      games.sort((a: any, b: any) => a.num - b.num);
      return respond({ games });
    }

    // ── batch-commit ──────────────────────────────────────────────────────────
    if (action === "batch-commit") {
      const { lang, deletes = [], adds = [], remaining = [] } = body;
      const prefix = `marketplace/${lang}`;
      let counter = 1;
      const tasks: any[] = [];
      for (const g of remaining.sort((a:any,b:any)=>parseInt(a.filename)-parseInt(b.filename))) {
        const newFile = `${String(counter++).padStart(3, "0")}-${g.slug}.json`;
        if (newFile !== g.filename) {
          tasks.push(supabase.storage.from("marketplace").copy(`${prefix}/${g.filename}`, `${prefix}/${newFile}`));
          tasks.push(supabase.storage.from("marketplace").remove([`${prefix}/${g.filename}`]));
        }
      }
      if (deletes.length) tasks.push(supabase.storage.from("marketplace").remove(deletes.map((d: any) => `${prefix}/${d.filename}`)));
      for (const a of adds) {
        tasks.push(supabase.storage.from("marketplace").upload(`${prefix}/${String(counter++).padStart(3, "0")}-${a.slug}.json`, a.content, { contentType: "application/json", upsert: true }));
      }
      await Promise.all(tasks);
      return respond({ ok: true });
    }

    return respond({ error: "Unknown action" }, 400);
  } catch (e) {
    return respond({ error: String(e) }, 500);
  }
});
