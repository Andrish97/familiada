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

function buildScanPrompt(lang: string, games: any[]): string {
  const gamesList = games.map(g => `Slug: ${g.slug}\nTitle: ${g.title}\nDescription: ${g.description}`).join("\n---\n");
  return `Oto lista gier Familiady (${lang}). Twoim zadaniem jest ocenić ich jakość i zidentyfikować "słabe" gry (nudne tematy, błędy logiczne, zbyt krótkie opisy).

Lista gier:
${gamesList}

Zwróć JSON: {"issues": [{"type": "weak", "slugs": ["slug1", "slug2"], "reason": "powód"}]}`;
}

function buildDupeScanPrompt(lang: string, games: any[]): string {
  const titles = games.map(g => `[${g.slug}] ${g.title}`).join("\n");
  return `Oto lista tytułów gier Familiady (${lang}). Zidentyfikuj grupy gier, które dotyczą tego samego tematu (duplikaty tematyczne), nawet jeśli mają nieco inne tytuły.

Tytuły:
${titles}

Zwróć JSON: {"issues": [{"type": "duplicate", "slugs": ["slug1", "slug2"], "reason": "te same tematy"}]}`;
}

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

  // Initialize client with service_role to bypass RLS for internal logic,
  // but we will also check the user's identity if provided.
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

      // Get user identity from Authorization header
      const authHeader = req.headers.get("Authorization");
      let userId: string | undefined;
      
      if (authHeader) {
        const { data: { user } } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
          global: { headers: { Authorization: authHeader } }
        }).auth.getUser();
        userId = user?.id;
      }

      const { data, error } = await supabase
        .from("game_gen_queue")
        .insert({
          lang,
          topic,
          total_games: total,
          already_used: alreadyUsed,
          status: 'pending',
          created_by: userId // explicitly set to ensure NOT NULL constraint is satisfied
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
      await supabase.from("game_gen_queue").update({ 
        status: "processing", 
        started_at: new Date().toISOString(), 
        attempts: job.attempts + 1,
        processed_games: 0 // Reset progress on restart
      }).eq("id", jobId);

      try {
        const results = [];
        const alreadyUsed = [...(job.already_used || [])];

        for (let i = 0; i < job.total_games; i++) {
          const prompt = buildGeneratePrompt(job.lang, i + 1, job.topic, job.total_games, alreadyUsed);
          const game = await groqChat(groqKey, prompt, 0.9, 4000);
          
          if (!game.questions) throw new Error(`Invalid game generated at index ${i}`);
          
          results.push(game);
          if (game.meta?.title) alreadyUsed.push(game.meta.title);
          
          // Update progress and intermediate results in DB after each game
          await supabase.from("game_gen_queue").update({ 
            processed_games: i + 1,
            results: results
          }).eq("id", jobId);
          
          // Small delay between LLM calls to be safe
          if (i < job.total_games - 1) await new Promise(r => setTimeout(r, 500));
        }

        // 3. Mark job as completed
        // Note: We no longer save to Storage directly here. 
        // The UI will do it after user approval.
        await supabase.from("game_gen_queue").update({
          status: "completed",
          completed_at: new Date().toISOString()
        }).eq("id", jobId);

        return respond({ ok: true, total: results.length });

      } catch (err) {
        // Mark job as failed
        await supabase.from("game_gen_queue").update({
          status: "failed",
          last_error: (err as Error).message
        }).eq("id", jobId);
        throw err;
      }
    }

    // ── list-games (List JSON files in storage with sorting) ─────────────────
    if (action === "list-games") {
      const { lang = "pl" } = body as { lang?: string };
      const prefix = `marketplace/${lang}`;
      const { data: files, error } = await supabase.storage.from("marketplace").list(prefix, { limit: 1000 });
      if (error) return respond({ error: error.message }, 500);

      const games = (files || [])
        .filter((f: { name: string }) => f.name.endsWith(".json"))
        .map((f: { name: string; id: string }) => {
          const m = f.name.match(/^(\d+)-(.+)\.json$/);
          const num = m ? parseInt(m[1]) : 999;
          const slug = m?.[2] ?? "";
          const title = slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
          return {
            num,
            filename: f.name,
            title,
            description: "",
            slug,
            sha: f.id,
            lang,
            indexKey: `${prefix}/${f.name}`,
            data: null
          };
        });
      
      games.sort((a: { num: number }, b: { num: number }) => a.num - b.num);
      return respond({ games });
    }

    // ── batch-commit (Handles renumbering + additions + deletions) ────────────
    if (action === "batch-commit") {
      const { lang, deletes = [], adds = [], remaining = [] } = body as {
        lang: string;
        deletes: { filename: string; indexKey: string; slug: string; sha: string }[];
        adds: { slug: string; content: string }[];
        remaining: { filename: string; indexKey: string; slug: string; sha: string }[];
      };

      if (!lang) return respond({ error: "Missing lang" }, 400);
      const prefix = `marketplace/${lang}`;

      // 1. Sort remaining by current number
      const sorted = remaining.slice().sort((a, b) => parseInt(a.filename) - parseInt(b.filename));

      let counter = 1;
      const tasks: Promise<any>[] = [];

      // 2. Handle renames for remaining files
      for (const g of sorted) {
        const newNum = String(counter++).padStart(3, "0");
        const newFilename = `${newNum}-${g.slug}.json`;
        if (newFilename !== g.filename) {
          const oldPath = `${prefix}/${g.filename}`;
          const newPath = `${prefix}/${newFilename}`;
          
          // In Storage we have to copy and then delete
          tasks.push((async () => {
            const { error: cpErr } = await supabase.storage.from("marketplace").copy(oldPath, newPath);
            if (cpErr) throw cpErr;
            const { error: rmErr } = await supabase.storage.from("marketplace").remove([oldPath]);
            if (rmErr) throw rmErr;
          })());
        }
      }

      // 3. Handle deletions
      if (deletes.length > 0) {
        const pathsToDelete = deletes.map(d => `${prefix}/${d.filename}`);
        tasks.push(supabase.storage.from("marketplace").remove(pathsToDelete));
      }

      // 4. Handle new additions
      for (const a of adds) {
        const newNum = String(counter++).padStart(3, "0");
        const slug = a.slug || `game-${newNum}`;
        const filename = `${newNum}-${slug}.json`;
        const path = `${prefix}/${filename}`;
        
        tasks.push(supabase.storage.from("marketplace").upload(path, a.content, {
          contentType: "application/json",
          upsert: true
        }));
      }

      try {
        await Promise.all(tasks);
        return respond({ ok: true, deleted: deletes.length, added: adds.length });
      } catch (err) {
        return respond({ error: (err as Error).message }, 500);
      }
    }

    // ── get-game (Fetch a single game file from storage) ──────────────────────
    if (action === "get-game") {
      const { lang, filename } = body as { lang: string; filename: string };
      if (!lang || !filename) return respond({ error: "Missing lang or filename" }, 400);

      const path = `marketplace/${lang}/${filename}`;
      const { data, error } = await supabase.storage.from("marketplace").download(path);
      if (error) return respond({ error: error.message }, 500);

      const text = await data.text();
      return respond({ data: JSON.parse(text) });
    }

    // ── scan (AI scan for duplicates or weak games) ───────────────────────────
    if (action === "scan") {
      const { lang = "pl", mode = "duplicates", games = [] } = body as {
        lang?: string; mode?: string; games?: any[];
      };

      const prompt = mode === "duplicates"
        ? buildDupeScanPrompt(String(lang), games)
        : buildScanPrompt(String(lang), games);

      const result = await groqChat(groqKey, prompt, 0.2, 4000, 28000);
      return respond(result);
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
