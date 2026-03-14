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

function extractFirstJsonObject(text: string): any {
  const s = String(text || "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = s.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

async function groqChat(
  groqKey: string,
  model: string,
  prompt: string,
  { temperature = 0.2, jsonMode = true }: { temperature?: number; jsonMode?: boolean } = {},
) {
  const ac = new AbortController();
  const timeoutMs = Number(Deno.env.get("GROQ_TIMEOUT_MS") || "25000");
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model,
        temperature,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: "Return ONLY valid JSON. Do not add explanations or markdown." },
          { role: "user", content: prompt },
        ],
      }),
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "";
    if (jsonMode) return JSON.parse(content || "{}");
    return extractFirstJsonObject(content);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Groq timeout/error: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

function buildGeneratePrompt(lang: string, topic: string, avoidTitles: string[]) {
  const trimmed = Array.from(new Set((avoidTitles || []).map((t) => String(t || "").trim()).filter(Boolean))).slice(0, 25);
  const avoidClause = trimmed.length ? `Avoid these titles: ${trimmed.join(", ")}.` : "";
  const avoidClausePl = trimmed.length ? `Unikaj tych tytułów: ${trimmed.join(", ")}.` : "";

  if (lang !== "en") {
    const topicClausePl = topic ? `Temat: "${topic}".` : `Wybierz unikalny, zabawny temat.`;
    return `Wygeneruj obiekt JSON dla gry typu "Familiada" w języku ${lang === "uk" ? "ukraińskim" : "polskim"}. ${topicClausePl} ${avoidClausePl}
Zwróć TYLKO poprawny JSON w tym schemacie:
{
  "title": "string (krótki, unikalny, bez słowa 'Familiada')",
  "description": "string (1-2 zdania, o temacie, bez gadania że 'to gra')",
  "questions": [
    {
      "text": "string",
      "answers": [
        { "text": "string", "fixed_points": number },
        { "text": "string", "fixed_points": number },
        { "text": "string", "fixed_points": number },
        { "text": "string", "fixed_points": number }
      ]
    }
  ]
}
Wymagania:
- Dokładnie 10 pytań.
- Każde pytanie ma dokładnie 4 odpowiedzi.
- To ma być ankietowa Familiada (Family Feud), NIE trivia/quiz faktograficzny.
- Pytania różnorodne: mieszaj "Podaj…", "Wymień…", "Nazwij…", "Co ludzie…", "Co bywa…".
- Unikaj powtarzania początków typu "Co robią…" i "Co jest często…".
- Odpowiedzi to krótkie frazy (1-4 słowa), bez pełnych zdań i bez tak/nie.
- fixed_points: liczby całkowite, w każdym pytaniu suma ok. 100, najwyższe dla najpopularniejszej odpowiedzi.
Przykład stylu (NIE kopiuj dosłownie):
- Pytanie: "Podaj coś, co ludzie robią zaraz po przebudzeniu." Odpowiedzi: "kawa", "toaleta", "telefon", "przeciąganie się".`;
  }

  const topicClause = topic ? `Theme: "${topic}".` : `Choose a unique, fun theme.`;
  return `Generate a JSON object for a "Familiada" game in English. ${topicClause} ${avoidClause}
Return JSON ONLY with this schema:
{
  "title": "string (short, unique, without the word 'Familiada')",
  "description": "string (1-2 sentences)",
  "questions": [
    {
      "text": "string",
      "answers": [
        { "text": "string", "fixed_points": number },
        { "text": "string", "fixed_points": number },
        { "text": "string", "fixed_points": number },
        { "text": "string", "fixed_points": number }
      ]
    }
  ]
}
Rules:
- Exactly 10 questions.
- Each question has 4 answers.
- fixed_points are integers and should sum to ~100 per question.
- No duplicate questions/answers within the game.
- Keys must be exactly: title, description, questions, text, answers, fixed_points. Do not translate keys.
- Title must NOT start with 'Familiada' and must not contain prefixes like 'Familiada -' or 'Familiada:'.
- Questions must be survey-style (Family Feud), not trivia. Prefer "Podaj/Wymień/Nazwij coś...".
- Avoid repetitive stems like "Co robią..." or "Co jest często...".
- Answers must be short phrases (1-4 words), not full sentences and not yes/no.`;
}

function normalizeTitle(raw: any): string {
  let t = String(raw || "").trim();
  t = t.replace(/^\s*familiada\s*[-:–—]\s*/i, "");
  t = t.replace(/^\s*familiada\s+/i, "");
  t = t.replace(/\s+/g, " ").trim();
  if (!t) t = "Bez tytułu";
  if (t.length > 80) t = t.slice(0, 80).trim();
  return t;
}

function buildGeneratePromptWithSeed(lang: string, topic: string, avoidTitles: string[], seed: string) {
  const bannedWords = [
    "familiada",
    "quiz",
    "gra",
    "pytania",
    "test",
  ];
  return `${buildGeneratePrompt(lang, topic, avoidTitles)}
Additional rules:
- Do not start the title with any of: ${bannedWords.join(", ")}.
${topic ? "" : "- If topic is empty, do NOT pick a \"świat\"/world theme unless explicitly requested."}
Seed: ${seed}
Do not include the seed in JSON.`;
}

function pickDefaultTopic(lang: string): string {
  const pl = [
    "Jedzenie i gotowanie",
    "Dom i sprzątanie",
    "Szkoła",
    "Praca",
    "Wakacje",
    "Sport",
    "Rodzina",
    "Zwierzęta domowe",
    "Zakupy",
    "Samochody i podróże",
    "Internet i telefon",
    "Święta",
    "Randki i związki",
    "Zdrowie i lekarz",
    "Moda i ubrania",
    "Muzyka",
    "Filmy i seriale",
    "Dzieciństwo",
    "Kuchnia polska",
    "Sąsiedzi",
    "Pogoda",
    "Ogród",
    "Remont",
    "Hobby",
    "Nawyki i przyzwyczajenia",
  ];
  const en = [
    "Food and cooking",
    "Home chores",
    "School",
    "Work",
    "Vacation",
    "Sports",
    "Family",
    "Pets",
    "Shopping",
    "Cars and travel",
    "Internet and phone",
    "Holidays",
    "Dating",
    "Health",
    "Fashion",
    "Music",
    "Movies and TV",
    "Childhood",
    "Hobbies",
    "Weather",
  ];
  const list = lang === "en" ? en : pl;
  const u = new Uint32Array(1);
  crypto.getRandomValues(u);
  return list[u[0] % list.length];
}

function isLowQualityCandidate(game: any): boolean {
  const desc = String(game?.description || "").trim();
  if (desc.length < 40) return true;
  if (/to (niezwykła|świetna|idealna) gra/i.test(desc)) return true;
  if (/to miejsce/i.test(desc)) return true;
  const qs = Array.isArray(game?.questions) ? game.questions : [];
  if (qs.length !== 10) return true;

  const startCounts = new Map<string, number>();
  const answerCounts = new Map<string, number>();
  let tooShortQ = 0;

  for (const q of qs) {
    const qt = String(q?.text || "").trim();
    if (qt.length < 16) tooShortQ++;

    const start = qt.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/).slice(0, 2).join(" ");
    if (start) startCounts.set(start, (startCounts.get(start) || 0) + 1);
    if (/^co robi(a|ą)/i.test(qt) || /^co jest często/i.test(qt)) return true;
    if (/^czy\b/i.test(qt)) return true;
    if (/^jaka jest (stolica|najwyższa|największa)/i.test(qt)) return true;

    const ans = Array.isArray(q?.answers) ? q.answers : [];
    for (const a of ans) {
      const at = String(a?.text || "").trim().toLowerCase();
      if (!at) continue;
      if (/^(tak|nie|nie wiem)$/i.test(at)) return true;
      if (/\d{4}/.test(at)) return true;
      if (at.length > 40) return true;
      answerCounts.set(at, (answerCounts.get(at) || 0) + 1);
    }
  }

  if (tooShortQ >= 3) return true;
  for (const [, c] of startCounts) if (c >= 3) return true;
  for (const [, c] of answerCounts) if (c >= 3) return true;
  return false;
}

function normalizeGamePayload(payload: any) {
  const title = normalizeTitle(payload?.title);
  const description = String(payload?.description || "").trim();
  const questionsRaw = Array.isArray(payload?.questions) ? payload.questions : [];

  if (!title || !description) return null;

  const questions = questionsRaw
    .map((q: any) => {
      const text = String(q?.text || "").trim();
      const answersRaw = Array.isArray(q?.answers) ? q.answers : [];
      const answers = answersRaw
        .map((a: any) => ({
          text: String(a?.text || "").trim(),
          fixed_points: typeof a?.fixed_points === "number" ? a.fixed_points : Number(a?.fixed_points),
        }))
        .filter((a: any) => a.text);
      return { text, answers };
    })
    .filter((q: any) => q.text && Array.isArray(q.answers) && q.answers.length >= 4)
    .slice(0, 10)
    .map((q: any) => ({ ...q, answers: q.answers.slice(0, 4) }));

  if (questions.length !== 10) return null;

  for (const q of questions) {
    const pts = q.answers.map((a: any) => (Number.isFinite(a.fixed_points) ? a.fixed_points : 0));
    let sum = pts.reduce((acc: number, n: number) => acc + Math.max(0, n), 0);
    if (sum <= 0) {
      q.answers[0].fixed_points = 40;
      q.answers[1].fixed_points = 30;
      q.answers[2].fixed_points = 20;
      q.answers[3].fixed_points = 10;
      continue;
    }
    const scaled = pts.map((n: number) => Math.max(0, n) * (100 / sum));
    const rounded = scaled.map((n: number) => Math.max(0, Math.round(n)));
    let rsum = rounded.reduce((acc: number, n: number) => acc + n, 0);
    rounded[0] = Math.max(0, rounded[0] + (100 - rsum));
    for (let i = 0; i < 4; i++) q.answers[i].fixed_points = rounded[i];
    q.answers.sort((a: any, b: any) => (Number(b.fixed_points) || 0) - (Number(a.fixed_points) || 0));
  }

  return { title, description, questions };
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
      const effectiveTopic = String(topic || "").trim() || pickDefaultTopic(lang);
      const rawAvoid = Array.isArray(avoidTitles) ? avoidTitles : [];
      const avoidList = Array.from(
        new Set(rawAvoid.map((t: any) => String(t || "").trim()).filter(Boolean)),
      ) as string[];
      const avoidListCapped = avoidList.slice(0, 200);
      const avoidSet = new Set(avoidListCapped.map((t) => t.toLowerCase()));

      const maxAttempts = 20;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const seed = crypto.randomUUID();
        const prompt = buildGeneratePromptWithSeed(lang, effectiveTopic, avoidTitles, seed);

        let payload: any = null;
        try {
          payload = await groqChat(groqKey, model, prompt, { temperature: 0.55, jsonMode: true });
        } catch {
          payload = null;
        }

        let normalized = normalizeGamePayload(payload);
        if (!normalized) {
          payload = await groqChat(groqKey, model, prompt, { temperature: 0.2, jsonMode: false });
          normalized = normalizeGamePayload(payload);
        }
        if (!normalized) continue;

        if (avoidSet.has(String(normalized.title || "").toLowerCase())) continue;
        if (!topic && /(świat|world)/i.test(String(normalized.title || ""))) continue;
        if (isLowQualityCandidate(normalized)) continue;

        const questionsText = buildQuestionsText(normalized);
        const embedding = await generateEmbedding(questionsText, 8000);
        const embeddingLiteral = embedding ? toVectorLiteral(embedding) : null;

        if (embeddingLiteral) {
          const rejectThreshold = 0.80;
          const { data: vecMatches, error: vecErr } = await supabase.rpc("market_find_similar_embeddings", {
            p_lang: lang,
            p_embedding: embeddingLiteral,
            p_threshold: rejectThreshold,
            p_limit: 3,
          });
          if (vecErr) throw vecErr;
          const matches = Array.isArray(vecMatches) ? vecMatches : [];
          const top = matches[0];
          if (top && Number(top.similarity) >= rejectThreshold) continue;
          return new Response(JSON.stringify({
            candidate: { lang, title: normalized.title, description: normalized.description ?? "", payload: normalized },
            matches,
            attempt,
          }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
        }

        const rejectThreshold = 0.60;
        const { data: matchesRaw, error: simError } = await supabase.rpc("market_find_similar_questions", {
          p_lang: lang,
          p_questions_text: questionsText,
          p_threshold: rejectThreshold,
          p_limit: 3,
        });
        if (simError) throw simError;
        const matches = Array.isArray(matchesRaw) ? matchesRaw : [];
        const top = matches[0];
        if (top && Number(top.similarity) >= rejectThreshold) continue;

        return new Response(JSON.stringify({
          candidate: { lang, title: normalized.title, description: normalized.description ?? "", payload: normalized },
          matches,
          attempt,
        }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({
        ok: false,
        retry: true,
        reason: "low_quality_or_similarity",
        attempts: maxAttempts,
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (action === "publish-producer-game") {
      const { lang, title, description, payload } = body;
      const normalized = normalizeGamePayload({ title, description, questions: payload?.questions });
      if (!normalized) throw new Error("Invalid payload.");

      const questionsText = buildQuestionsText(normalized);
      const embedding = await generateEmbedding(questionsText, 12000);
      const embeddingLiteral = embedding ? toVectorLiteral(embedding) : null;

      const { data, error } = await supabase.from("market_games").insert({
        source_game_id: null,
        author_user_id: null,
        origin: "producer",
        title: normalized.title,
        description: normalized.description ?? "",
        lang,
        payload: normalized,
        embedding: embeddingLiteral,
        status: "published",
        moderation_note: null,
        storage_path: null,
      }).select("id, title, description, lang, payload, created_at").single();
      if (error) throw error;

      return new Response(JSON.stringify({ ok: true, game: data }), { headers: { ...CORS, "Content-Type": "application/json" } });
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
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
