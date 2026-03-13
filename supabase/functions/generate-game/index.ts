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

async function groqChat(groqKey: string, prompt: string, temperature: number, maxTokens: number, timeoutMs = 60000) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
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
  const usedList = alreadyUsed.length ? alreadyUsed.join(" / ") : "(brak)";

  const topicHint: Record<string, string> = {
    pl: topic
      ? `Temat tej gry: "${topic}". Upewnij się, że gra jest unikalna.`
      : `Wymyśl własny, konkretny temat z codziennego życia, kultury, przyrody, jedzenia, miejsc, emocji, zwierząt, pracy, rozrywki, historii, sportu...
WAŻNE: poniższe tematy już ISTNIEJĄ w bazie — twój musi być semantycznie inny, naprawdę różny w treści:
[${usedList}]`,
    uk: topic
      ? `Тема гри: "${topic}".`
      : `Придумай власну тему. Ці вже ІСНУЮТЬ — твоя має бути семантично інша: [${usedList}]`,
    en: topic
      ? `Game topic: "${topic}".`
      : `Invent your own topic. These ALREADY EXIST — yours must be semantically different: [${usedList}]`,
  };

  const systemDesc: Record<string, string> = {
    pl: `Familiada to polski teleturniej w stylu "Family Feud". Prowadzący zadaje pytanie, a rodziny podają odpowiedzi, które wcześniej zebrała ankieta przeprowadzona wśród 100 losowych osób.

Twoim zadaniem jest wygenerowanie jednej pełnej gry Familiady po polsku. Pytania mogą dotyczyć absolutnie wszystkiego. Niech każde pytanie w grze będzie inne w formie i podejściu — poważne, zabawne, zaskakujące, nostalgiczne, abstrakcyjne.

Odpowiedzi to co powiedziałby przeciętny Polak zapytany z ulicy. Konkretne, krótkie, oczywiste słowa.`,
    uk: `Сімейка — телегра у стилі Family Feud. Генеруй гру УКРАЇНСЬКОЮ (не російською). Питання різноманітні, відповіді — короткі конкретні слова.`,
    en: `Family Feud game. Generate one complete game in English. Questions can be about anything, varied in style.`,
  };

  const descHint: Record<string, string> = {
    pl: `Pole "description" musi mieć 2–4 zdania: (1) temat i atmosfera, (2) dla kogo jest gra (rodziny, dzieci, seniorzy, imprezy, szkoła, praca, wieczór kawalerski...), (3) opcjonalnie ciekawostka lub wskazówka dla prowadzącego.`,
    uk: `Поле "description": 2–4 речення про тему, для кого підходить, порада ведучому.`,
    en: `Field "description": 2–4 sentences about topic, who it's for (families, adults, parties, school...), optional host tip.`,
  };

  return `${systemDesc[lang] ?? systemDesc.en}

${topicHint[lang] ?? topicHint.en}
Gra ${index} z ${total}.

ZASADY TECHNICZNE:
- Liczba pytań: ${10 + Math.floor(Math.random() * 7)} (między 10 a 16)
- Każde pytanie: 4–7 odpowiedzi
- Punkty: nieregularne jak z prawdziwej ankiety (np. 43, 28, 14, 9, 6) — NIGDY równe 10/20/30/40/50
- Suma punktów w pytaniu: 90–110
- Odpowiedzi: maks. 17 znaków
- Tytuł: 2–5 słów
- ${descHint[lang] ?? descHint.en}

Zwróć TYLKO czysty JSON:
{"slug":"ascii-slug","meta":{"title":"Tytuł","description":"Opis 2-4 zdania.","lang":"${lang}"},"game":{"name":"Tytuł","type":"prepared"},"questions":[{"text":"Pytanie?","answers":[{"text":"Odpowiedź","fixed_points":43}]}]}`;
}

// ─── Slugify ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return (text || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ą/g,"a").replace(/ć/g,"c").replace(/ę/g,"e")
    .replace(/ł/g,"l").replace(/ń/g,"n").replace(/ó/g,"o")
    .replace(/ś/g,"s").replace(/ź/g,"z").replace(/ż/g,"z")
    .replace(/і/g,"i").replace(/є/g,"e").replace(/ї/g,"i")
    .replace(/[а-яёА-ЯЁ]/g, (c: string) => c.charCodeAt(0).toString(36))
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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
    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return respond({ error: "Invalid JSON" }, 400); }

    const action = String(body.action ?? "enqueue");

    // ── enqueue (Edge function only adds to queue) ─────────────────────────────
    if (action === "enqueue") {
      const { lang = "pl", total = 1, topic = "", alreadyUsed = [] } = body as {
        lang?: string; total?: number; topic?: string; alreadyUsed?: string[];
      };

      const { data, error } = await supabase
        .from("game_gen_queue")
        .insert({
          lang,
          topic,
          total_games: total,
          already_used: alreadyUsed,
          status: 'pending'
        })
        .select()
        .single();

      if (error) return respond({ error: error.message }, 500);
      return respond({ ok: true, jobId: data.id });
    }

    // ── process (Triggered by worker/cron to do the heavy lifting) ─────────────
    if (action === "process") {
      const { jobId } = body as { jobId: string };
      if (!jobId) return respond({ error: "Missing jobId" }, 400);

      // 1. Get job
      const { data: job, error: getError } = await supabase
        .from("game_gen_queue")
        .select("*")
        .eq("id", jobId)
        .single();

      if (getError || !job) return respond({ error: "Job not found" }, 404);
      if (job.status !== "pending" && job.status !== "failed") return respond({ error: "Job already processing or completed" }, 400);

      // 2. Update status to processing
      await supabase.from("game_gen_queue").update({ status: "processing", started_at: new Date().toISOString(), attempts: job.attempts + 1 }).eq("id", jobId);

      try {
        const results = [];
        const alreadyUsed = [...(job.already_used || [])];

        for (let i = 0; i < job.total_games; i++) {
          const prompt = buildGeneratePrompt(job.lang, i + 1, job.topic, job.total_games, alreadyUsed);
          const game = await groqChat(groqKey, prompt, 0.9, 4000);
          
          if (!game.questions) throw new Error(`Invalid game generated at index ${i}`);
          
          results.push(game);
          if (game.meta?.title) alreadyUsed.push(game.meta.title);
          
          // Small delay between LLM calls to be safe
          if (i < job.total_games - 1) await new Promise(r => setTimeout(r, 500));
        }

        // 3. Save to Storage and DB
        // Determine next number from existing files in Storage
        const { data: files } = await supabase.storage.from("community-games").list(`admin/${job.lang}`);
        let nextNum = 1;
        if (files) {
          const nums = files.map(f => parseInt(f.name)).filter(n => !isNaN(n));
          if (nums.length) nextNum = Math.max(...nums) + 1;
        }

        const savedGames = [];
        for (let i = 0; i < results.length; i++) {
          const game = results[i];
          const rawSlug = game.slug || game.meta?.title || `game-${nextNum + i}`;
          const slug = slugify(rawSlug);
          const numStr = String(nextNum + i).padStart(3, "0");
          const filename = `${numStr}-${slug}.json`;
          const storagePath = `admin/${job.lang}/${filename}`;

          // Upload to storage
          const { error: uploadError } = await supabase.storage
            .from("community-games")
            .upload(storagePath, JSON.stringify(game, null, 2), {
              contentType: 'application/json',
              upsert: true
            });

          if (uploadError) throw uploadError;

          // Upsert to market_games via RPC
          const { data: rpcRes, error: rpcError } = await supabase.rpc("market_admin_upsert", {
            p_storage_path: storagePath,
            p_title: game.meta?.title || slug,
            p_description: game.meta?.description || "",
            p_lang: job.lang,
            p_payload: game
          });

          if (rpcError) throw rpcError;
          savedGames.push({ storagePath, marketId: rpcRes?.[0]?.market_id });
        }

        // 4. Mark job as completed
        await supabase.from("game_gen_queue").update({
          status: "completed",
          completed_at: new Date().toISOString(),
          result: { savedGames }
        }).eq("id", jobId);

        return respond({ ok: true, savedGames });

      } catch (err) {
        // Mark job as failed
        await supabase.from("game_gen_queue").update({
          status: "failed",
          last_error: (err as Error).message
        }).eq("id", jobId);
        throw err;
      }
    }

    // ── generate (Old behavior for backward compatibility, but discouraged) ─────
    if (action === "generate") {
      const { lang = "pl", index = 1, total = 1, topic = "", alreadyUsed = [] } = body as {
        lang?: string; index?: number; total?: number; topic?: string; alreadyUsed?: string[];
      };
      const prompt = buildGeneratePrompt(String(lang), Number(index), String(topic), Number(total), alreadyUsed as string[]);
      const game = await groqChat(groqKey, prompt, 0.9, 4000);
      return respond({ game });
    }

    return respond({ error: "Unknown action" }, 400);

  } catch (e) {
    return respond({ error: `Unexpected error: ${(e as Error).message}` }, 500);
  }
});
