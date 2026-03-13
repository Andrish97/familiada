import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

/**
 * Familiada Game Generator Worker
 * 
 * This is a standalone script that processes the game generation queue.
 * It can be run using Deno:
 * deno run --allow-net --allow-env supabase/worker.ts
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GROQ_API_KEY) {
  console.error("Missing environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or GROQ_API_KEY");
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function groqChat(model: string, prompt: string) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return ONLY valid JSON, nothing else." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "";
  return JSON.parse(raw);
}

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

async function processQueue() {
  console.log(`[${new Date().toISOString()}] Checking queue...`);

  // Pick one pending or failed job
  const { data: job, error: fetchError } = await supabase
    .from("game_gen_queue")
    .select("*")
    .or("status.eq.pending,status.eq.failed")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (fetchError || !job) {
    return;
  }

  console.log(`[${new Date().toISOString()}] Processing job ${job.id} (${job.lang}, ${job.total_games} games)`);

  // Mark as processing
  await supabase
    .from("game_gen_queue")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", job.id);

  try {
    const results = Array.isArray(job.results) ? job.results : [];
    const alreadyUsed = Array.isArray(job.already_used) ? job.already_used : [];

    while (results.length < job.total_games) {
      const nextIdx = results.length;
      console.log(`[${new Date().toISOString()}] Generating game ${nextIdx + 1}/${job.total_games}...`);

      const model = job.total_games > 1 ? "llama-3.1-8b-instant" : "llama-3.3-70b-versatile";
      const prompt = buildGeneratePrompt(job.lang, nextIdx + 1, job.topic, job.total_games, alreadyUsed);
      
      const game = await groqChat(model, prompt);
      
      results.push(game);
      if (game.meta?.title) alreadyUsed.push(game.meta.title);

      // Update progress
      await supabase
        .from("game_gen_queue")
        .update({ 
          processed_games: results.length, 
          results: results,
          already_used: alreadyUsed
        })
        .eq("id", job.id);
      
      console.log(`[${new Date().toISOString()}] Progress: ${results.length}/${job.total_games}`);
    }

    // Mark as completed
    await supabase
      .from("game_gen_queue")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", job.id);

    console.log(`[${new Date().toISOString()}] Job ${job.id} completed!`);

  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error processing job ${job.id}:`, err);
    await supabase
      .from("game_gen_queue")
      .update({ status: "failed", last_error: String(err) })
      .eq("id", job.id);
  }
}

// Run loop
console.log("Game Generator Worker started.");
setInterval(processQueue, 10000); // Check every 10 seconds
processQueue(); // Run immediately
