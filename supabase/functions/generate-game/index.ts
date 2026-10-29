import { timingSafeEqual } from "../_shared/internal-auth.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { checkGameUniqueness, indexSemanticQuestions, isExactCopyError } from "./uniqueness.ts";

// Wołają tylko serwery: Worker (/_admin_api/generator/*, panel admina za
// Cloudflare Access) i cron w bazie (invoke_embed_missing_market_games).
// Bez nagłówków CORS -- przeglądarka nie ma tu wstępu.
const CORS: Record<string, string> = {};



// Sekret GENERATE_GAME_SECRET (env funkcji) w nagłówku X-Internal-Secret;
// brak sekretu w env = odmowa każdego żądania.
function authorizeInternal(req: Request): Response | null {
  const secret = (Deno.env.get("GENERATE_GAME_SECRET") || "").trim();
  if (!secret) return new Response(JSON.stringify({ error: "not_configured" }), { status: 503 });
  const given = req.headers.get("x-internal-secret") || "";
  if (!timingSafeEqual(given, secret)) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  return null;
}

// ─── Groq ─────────────────────────────────────────────────────────────────────

function extractFirstJsonObject(text: string): any {
  const s = String(text || "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

function parseGroqWaitMs(message: string): number | null {
  const m = String(message || "").match(/try again in ([0-9]+(\.[0-9]+)?)s/i);
  if (!m) return null;
  const sec = Number(m[1]);
  return Number.isFinite(sec) && sec > 0 ? Math.ceil(sec * 1000) : null;
}

function isGroqRateLimit(message: string): boolean {
  const s = String(message || "");
  return s.includes("Groq 429") || s.includes("rate_limit_exceeded") || /rate limit/i.test(s);
}

async function groqChat(
  groqKey: string,
  model: string,
  prompt: string,
  { temperature = 0.7 }: { temperature?: number } = {},
) {
  const ac = new AbortController();
  const timeoutMs = Number(Deno.env.get("GROQ_TIMEOUT_MS") || "20000");
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model,
        temperature,
        messages: [
          { role: "system", content: "Jesteś kreatywnym autorem pytań do teleturnieju. Piszesz naturalnie, z humorem, po ludzku. Na końcu swojej odpowiedzi zawsze zwracasz poprawny JSON." },
          { role: "user", content: prompt },
        ],
      }),
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = extractFirstJsonObject(content);
    if (!parsed) throw new Error("No JSON in response");
    return parsed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Groq error: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(lang: string, topic: string): string {
  const seed = crypto.randomUUID().slice(0, 8);
  const hasTopic = topic.trim().length > 0;

  if (lang === "pl") {
    const topicLine = hasTopic
      ? `Temat: "${topic}".`
      : `Sam wybierz temat — cokolwiek: codzienność, przyroda, historia, sport, jedzenie, podróże, zwierzęta, filmy, muzyka, technika, praca, szkoła, rodzina, miasto, wakacje... co chcesz. Ważne żeby temat pozwalał zadać wiele różnych pytań. Zapisz go w polu "topic".`;

    return `Piszesz pytania do Familijnej — drużynowej gry ankietowej.

${topicLine}

Jak działa gra: ankietowano 100 losowych Polaków. Drużyny zgadują co powiedzieli — wygrywa ten kto trafia w najpopularniejsze odpowiedzi, nie ten kto "ma rację". Pytania brzmią jak rozmowa, nie jak egzamin.

Złota zasada: gdybyś zapytał 10 przypadkowych osób na ulicy — czy każda miałaby swoją odpowiedź? Jeśli tak, to świetne pytanie. Jeśli tylko jedna odpowiedź jest prawidłowa — złe pytanie.

Dobre pytania:
- "Wymień coś, co zawsze masz w portfelu." (każdy ma swoje)
- "Podaj powód dla którego ktoś się spóźnia." (każdy zna kilka)
- "Co robi Polak w deszczową niedzielę?" (każdy coś innego)
- "Wymień coś czego szukasz w ciemnym pokoju." (obrazowe, zabawne)
- "Co jest pierwsze co robisz rano?" (osobiste, życiowe)
- "Podaj coś co jest w każdym polskim domu." (konkretne, bliskie)

Złe pytania (nie rób tego):
- "Wymień stolicę Francji." (jedna odpowiedź = nie familiadowe)
- "Podaj rok wybuchu II wojny." (trivia, nie ankieta)
- "Wymień gatunki ssaków." (szkolna wiedza)

Odpowiedzi: krótkie (1–4 słowa), potoczne, od najpopularniejszej. Pierwsza ~35–45 pkt, ostatnia ~3–8 pkt, suma ~100. Dawaj 5–6 odpowiedzi na pytanie — im więcej tym lepsza gra, minimum 4.

Pytania: 12–15, każde o innym aspekcie tematu, żadnych powtórzeń.

Tytuł: 2–5 słów, żywy, konkretny, nie zaczyna się od "Familijna" ani "Familiada".
Opis: 2–3 zdania zachęcające, mogą być z nutą humoru.

Zwróć JSON:
{"topic":"...","title":"...","description":"...","questions":[{"text":"...","answers":[{"text":"...","fixed_points":0}]}]}
Seed: ${seed}`;
  }

  if (lang === "uk") {
    const topicLine = hasTopic
      ? `Тема: "${topic}".`
      : `Сам обери тему — будь-що: побут, природа, їжа, спорт, кіно, музика, подорожі, робота, школа, тварини, технології... Головне щоб на тему можна було скласти багато різних анкетних питань. Запиши у поле "topic".`;

    return `Ти пишеш питання для Сімейки — українського аналогу Family Feud.

${topicLine}

Як працює гра: 100 звичайних людей відповіли на питання. Команди вгадують найпопулярніші відповіді — перемагає той хто вгадав що сказала більшість, не той хто "правий". Питання звучать як жива розмова, не як іспит.

Золоте правило: якщо запитати 10 випадкових людей — чи кожен дасть свою відповідь? Якщо так — чудове питання.

Хороші питання:
- "Назви щось що завжди маєш у гаманці."
- "Що робиш у дощову неділю?"
- "Назви причину через яку хтось запізнюється."
- "Що перше робиш вранці?"
- "Що є в кожному українському домі?"

Погані питання (уникай): одна правильна відповідь, факти, дати, шкільні знання.

Відповіді: короткі (1–4 слова), розмовні, від найпопулярнішої. Перша ~35–45 очок, остання ~3–8, сума ~100. Давай 5–6 відповідей — мінімум 4.

Питань: 12–15, кожне про інший аспект теми.
Назва: 2–5 слів, жива, конкретна, не починається з "Сімейка".
Опис: 2–3 речення, запрошуючі, можна з гумором.

Поверни JSON:
{"topic":"...","title":"...","description":"...","questions":[{"text":"...","answers":[{"text":"...","fixed_points":0}]}]}
Seed: ${seed}`;
  }

  // en
  const topicLine = hasTopic
    ? `Topic: "${topic}".`
    : `Pick any topic you like — daily life, nature, food, sports, travel, animals, movies, music, work, school, technology, history... anything that lets you ask many different survey questions. Write it in the "topic" field.`;

  return `You're writing questions for Family Feud.

${topicLine}

How it works: 100 random people were surveyed. Teams guess the most popular answers — the winner matches what most people said, not who is "right". Questions feel like conversation, not a quiz.

Golden rule: if you asked 10 random people on the street — would each one have their own answer? If yes, great question.

Good questions:
- "Name something you always have in your wallet."
- "What do you do on a rainy Sunday?"
- "Name a reason someone is late."
- "What's the first thing you do in the morning?"
- "Name something found in every home."

Bad questions (avoid): one correct answer, facts, dates, trivia, school knowledge.

Answers: short (1–4 words), casual, most to least popular. First ~35–45 pts, last ~3–8 pts, sum ~100. Give 5–6 answers — minimum 4.

Questions: 12–15, each covering a different aspect of the topic.
Title: 2–5 words, lively and specific, does NOT start with "Familijna" or "Familiada".
Description: 2–3 sentences, warm, can be lightly humorous.

Return JSON:
{"topic":"...","title":"...","description":"...","questions":[{"text":"...","answers":[{"text":"...","fixed_points":0}]}]}
Seed: ${seed}`;
}

// ─── Normalizacja payload ─────────────────────────────────────────────────────

function normalizeTitle(raw: any): string {
  let t = String(raw || "").trim();
  t = t.replace(/^\s*familiada\s*[-:–—]\s*/i, "").replace(/^\s*familiada\s+/i, "").trim();
  if (t.length > 80) t = t.slice(0, 80).trim();
  return t || "Bez tytułu";
}

function normalizePoints(answers: any[]): any[] {
  const pts = answers.map((a) => Math.max(0, Number(a?.fixed_points) || 0));
  const sum = pts.reduce((s, n) => s + n, 0);

  let normalized: number[];
  if (sum > 0) {
    const target = 100;
    const scaled = pts.map((n) => Math.round(n * target / sum));
    const diff = target - scaled.reduce((s, n) => s + n, 0);
    scaled[0] = Math.max(0, scaled[0] + diff);
    normalized = scaled;
  } else {
    // Fallback: typowy rozkład punktów w grze ankietowej
    normalized = [42, 26, 16, 9, 5, 2].slice(0, answers.length);
  }

  // Upewnij się że każda odpowiedź ma min 1 pkt i są posortowane malejąco
  normalized = normalized.map((n) => Math.max(1, n));
  normalized.sort((a, b) => b - a);

  return answers.map((a, i) => ({ ...a, fixed_points: normalized[i] ?? 1 }));
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
        .map((a: any) => ({ text: String(a?.text || "").trim(), fixed_points: Number(a?.fixed_points) || 0 }))
        .filter((a: any) => a.text && a.text.length > 0)
        .slice(0, 6);
      if (answers.length < 3) return null;
      return { text, answers: normalizePoints(answers) };
    })
    .filter(Boolean)
    .slice(0, 15) as any[];

  if (questions.length < 10) return null;

  return { title, description, questions };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const denied = authorizeInternal(req);
  if (denied) return denied;
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const groqKey = Deno.env.get("GROQ_API_KEY")!;

  try {
    const body = await req.json();
    const { action } = body;
    // Starszy panel nie może dostać nowego formatu jako listy procentowych DUP.
    if (["check-uniqueness", "check-candidate", "publish-producer-game"].includes(action) && body.uniqueness_protocol !== 2)
      return new Response(JSON.stringify({ ok: false, error: "Odśwież panel przed sprawdzaniem lub publikacją gry." }), { status: 409, headers: { ...CORS, "Content-Type": "application/json" } });

    // ── Lista gier producenta ──────────────────────────────────────────────────
    if (action === "list-producer-games") {
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
      return new Response(JSON.stringify(data), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── Generuj grę ───────────────────────────────────────────────────────────
    if (action === "generate-producer-game") {
      const { lang = "pl", topic } = body;
      const effectiveTopic = String(topic || "").trim();
      const model = "llama-3.3-70b-versatile";
      const prompt = buildPrompt(lang, effectiveTopic);

      let payload: any;
      try {
        payload = await groqChat(groqKey, model, prompt, { temperature: 0.9 });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isGroqRateLimit(msg)) {
          const waitMs = parseGroqWaitMs(msg) ?? 6000;
          return new Response(JSON.stringify({ ok: false, retry: true, reason: "rate_limit", wait_ms: waitMs }), {
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: false, retry: true, reason: "groq_error", detail: msg }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      const normalized = normalizeGamePayload(payload);
      if (!normalized) {
        return new Response(JSON.stringify({ ok: false, retry: true, reason: "invalid_payload" }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        candidate: {
          lang,
          title: normalized.title,
          description: normalized.description,
          payload: normalized,
          topic: effectiveTopic,
        },
        warnings: [],
      }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── Publikuj grę ──────────────────────────────────────────────────────────
    if (action === "publish-producer-game") {
      const { lang, title, description, payload } = body;
      const normalized = normalizeGamePayload({ title, description, questions: payload?.questions });
      if (!normalized) throw new Error("Invalid payload.");

      const { data, error } = await supabase.from("market_games").insert({
        source_game_id: null,
        author_user_id: null,
        origin: "producer",
        title: normalized.title,
        description: normalized.description ?? "",
        lang,
        payload: normalized,
        status: "published",
        moderation_note: null,
        storage_path: null,
      }).select("id, title, description, lang, payload, created_at").single();

      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, game: data }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── Aktualizuj grę ────────────────────────────────────────────────────────
    if (action === "update-producer-game") {
      const { id, title, description, lang, payload } = body;
      const normalized = normalizeGamePayload({ title, description, questions: payload?.questions });
      if (!normalized) throw new Error("Invalid payload.");

      const { data, error } = await supabase.from("market_games")
        .update({ title: normalized.title, description: normalized.description, lang, payload: normalized, embedding: null })
        .eq("id", id).eq("origin", "producer")
        .select("id, title, description, lang, payload").single();

      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, game: data }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── Usuń grę ──────────────────────────────────────────────────────────────
    if (action === "delete-game") {
      const { id } = body;
      const { error } = await supabase.from("market_games").delete().eq("id", id).eq("origin", "producer");
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Pełny raport: zawsze dokładne i tekstowe + dostępne porównanie znaczenia.
    if (action === "check-uniqueness") {
      const report = await checkGameUniqueness(supabase, key => Deno.env.get(key), { id: body.id });
      return new Response(JSON.stringify(report), { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (action === "check-candidate") {
      const normalized = normalizeGamePayload({ title: body.title, description: body.description, questions: body.payload?.questions });
      if (!normalized) throw new Error("Invalid payload.");
      const report = await checkGameUniqueness(supabase, key => Deno.env.get(key), { payload: normalized, lang: body.lang });
      return new Response(JSON.stringify(report), { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (action === "embed-missing") {
      const result = await indexSemanticQuestions(supabase, key => Deno.env.get(key), { limit: Number(body.limit) || 5 });
      return new Response(JSON.stringify(result), { headers: { ...CORS, "Content-Type": "application/json" }, status: result.ok ? 200 : 503 });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: CORS });

  } catch (e) {
    if (isExactCopyError(e)) return new Response(JSON.stringify({ ok: false, error: "duplicate_content" }), { status: 409, headers: { ...CORS, "Content-Type": "application/json" } });
    const message = e instanceof Error ? e.message : String(e);
    if (isGroqRateLimit(message)) {
      const waitMs = parseGroqWaitMs(message) ?? 6000;
      return new Response(JSON.stringify({ ok: false, retry: true, reason: "rate_limit", wait_ms: waitMs }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: CORS });
  }
});
