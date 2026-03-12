// supabase/functions/generate-game/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

function buildPrompt(lang: string, index: number, topic: string, total: number, alreadyUsed: string[]): string {
  const instructions: Record<string, string> = {
    pl: `Jesteś generatorem pytań do teleturnieju Familiada po POLSKU.
Pytania bezosobowe: "Wymień coś co...", "Podaj powód dla którego...", "Co najczęściej..."
NIE pytaj w 1 osobie. Odpowiedzi i pytania TYLKO po polsku.`,
    uk: `Ти генератор питань для телегри Сімейка (Familiada) УКРАЇНСЬКОЮ.
Питання безособові: "Назвіть щось що...", "Вкажіть причину чому...", "Що найчастіше..."
НЕ питай від першої особи. Всі відповіді та питання ТІЛЬКИ українською.`,
    en: `You are a generator of questions for the Family Feud game in ENGLISH.
Questions should be survey-style: "Name something people...", "Give a reason why...", "What is most often..."
Do NOT ask in first person. All answers and questions ONLY in English.`,
  };

  const topicHint: Record<string, string> = {
    pl: topic ? `Temat tej gry: "${topic}".` : `Wybierz ORYGINALNY temat codzienny. Nie powtarzaj: [${alreadyUsed.join(", ")}].`,
    uk: topic ? `Тема цієї гри: "${topic}".` : `Обери ОРИГІНАЛЬНУ повсякденну тему. Не повторювати: [${alreadyUsed.join(", ")}].`,
    en: topic ? `Topic for this game: "${topic}".` : `Choose an ORIGINAL everyday topic. Do not repeat: [${alreadyUsed.join(", ")}].`,
  };

  const instruction = instructions[lang] ?? instructions.en;
  const hint = topicHint[lang] ?? topicHint.en;

  return `${instruction}

${hint}
Game number ${index} of ${total}.

RULES:
- Exactly 10 questions
- Each question: 3-6 answers (usually 4-5)
- Points: irregular numbers (e.g. 43, 27, 16, 9) — not always round
- Sum of points per question: 60-95 (NOT necessarily 100)
- Answers: max 17 characters
- Title: 2-4 words

Return ONLY raw JSON (no markdown, no backticks, no explanation):
{"slug":"short-ascii-slug","meta":{"title":"Game Title","description":"One sentence.","lang":"${lang}"},"game":{"name":"Game Title","type":"prepared"},"questions":[{"text":"Question?","answers":[{"text":"Answer","fixed_points":43},{"text":"Answer","fixed_points":27}]}]}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  // ── Klucz Groq ──────────────────────────────────────────────
  // Self-hosted: ustaw w supabase/functions/.env jako GROQ_API_KEY=gsk_...
  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!groqKey) {
    return respond({ error: "Brak GROQ_API_KEY w zmiennych środowiskowych funkcji." }, 500);
  }

  // ── Body ─────────────────────────────────────────────────────
  let body: { lang?: string; index?: number; total?: number; topic?: string; alreadyUsed?: string[] };
  try { body = await req.json(); }
  catch { return respond({ error: "Invalid JSON body" }, 400); }

  const { lang = "pl", index = 1, total = 1, topic = "", alreadyUsed = [] } = body;

  if (!["pl", "uk", "en"].includes(lang)) {
    return respond({ error: `Nieobsługiwany język: ${lang}` }, 400);
  }

  // ── Groq API ─────────────────────────────────────────────────
  let groqResp: Response;
  try {
    groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.85,
        max_tokens: 2500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a JSON generator. Return ONLY valid JSON, nothing else." },
          { role: "user", content: buildPrompt(lang, index, topic, total, alreadyUsed) },
        ],
      }),
    });
  } catch (e) {
    return respond({ error: `Groq connection failed: ${(e as Error).message}` }, 502);
  }

  if (!groqResp.ok) {
    const errText = await groqResp.text();
    console.error("Groq error", groqResp.status, errText);
    return respond({ error: `Groq ${groqResp.status}`, detail: errText }, 502);
  }

  const groqData = await groqResp.json();
  const raw: string = groqData?.choices?.[0]?.message?.content ?? "";

  if (!raw) {
    return respond({ error: "Groq returned empty response", debug: groqData }, 502);
  }

  let game: Record<string, unknown>;
  try {
    const clean = raw.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim();
    game = JSON.parse(clean);
  } catch (e) {
    console.error("JSON parse failed:", raw.slice(0, 200));
    return respond({ error: "Model returned invalid JSON", raw: raw.slice(0, 500) }, 502);
  }

  if (!Array.isArray(game.questions) || game.questions.length === 0) {
    return respond({ error: "Missing questions in response", raw: raw.slice(0, 500) }, 502);
  }

  return respond({ game });
});
