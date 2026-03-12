// supabase/functions/generate-game/index.ts
//
// SETUP:
//   1. supabase functions deploy generate-game
//   2. supabase secrets set GROQ_API_KEY=gsk_...
//
// Klucz Groq: https://console.groq.com/keys (darmowe konto)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ─── CORS ────────────────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ─── Prompt ──────────────────────────────────────────────────────
function buildPrompt(
  lang: string,
  index: number,
  topic: string,
  total: number,
  alreadyUsed: string[],
): string {
  const langNames: Record<string, string> = {
    pl: "polskim",
    en: "English",
    de: "Deutsch",
    uk: "українській",
    fr: "français",
    es: "español",
  };
  const langName = langNames[lang] ?? lang;

  const topicHint = topic
    ? `Temat tej gry: "${topic}".`
    : `Wybierz ORYGINALNY temat – NIE powtarzaj: [${alreadyUsed.join(", ")}].`;

  return `Jesteś generatorem pytań do teleturnieju Familiada (format ankietowy).

Stwórz JEDNĄ grę w języku: ${langName}.
${topicHint}
Gra numer ${index} z ${total}.

ZASADY:
- Pytania bezosobowe/o ludzi: "Wymień coś co...", "Podaj powód dla którego...", "Co najczęściej..."
- NIE pytaj w pierwszej osobie
- Dokładnie 10 pytań
- Każde pytanie: 3–6 odpowiedzi (najczęściej 4–5)
- Punkty: nieregularne liczby (np. 43, 27, 16, 9) – NIE zawsze okrągłe
- Suma punktów na pytanie: 60–95 (nie musi być 100)
- Odpowiedzi: max 17 znaków
- Tytuł: krótki, 2–4 słowa

Zwróć TYLKO czysty JSON, bez markdown, bez \`\`\`, bez żadnego tekstu:

{
  "slug": "slug-bez-polskich-znakow",
  "meta": {
    "title": "Tytuł Gry",
    "description": "Jedno zdanie opisu.",
    "lang": "${lang}"
  },
  "game": {
    "name": "Tytuł Gry",
    "type": "prepared"
  },
  "questions": [
    {
      "text": "Treść pytania?",
      "answers": [
        {"text": "Odpowiedź", "fixed_points": 43},
        {"text": "Odpowiedź", "fixed_points": 27}
      ]
    }
  ]
}`;
}

// ─── Main handler ────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── Parse body ──────────────────────────────────────────────
  let body: {
    lang?: string;
    index?: number;
    total?: number;
    topic?: string;
    alreadyUsed?: string[];
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const {
    lang = "pl",
    index = 1,
    total = 1,
    topic = "",
    alreadyUsed = [],
  } = body;

  // ── Groq API key ────────────────────────────────────────────
  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!groqKey) {
    return json({ error: "GROQ_API_KEY not set – run: supabase secrets set GROQ_API_KEY=gsk_..." }, 500);
  }

  // ── Call Groq ───────────────────────────────────────────────
  const prompt = buildPrompt(lang, index, topic, total, alreadyUsed);

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
        response_format: { type: "json_object" },   // Groq JSON mode – gwarantuje JSON
        messages: [
          {
            role: "system",
            content: "Jesteś generatorem JSON dla gry Familiada. Zwracaj TYLKO poprawny JSON zgodny z podaną strukturą.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch (e) {
    return json({ error: `Groq fetch failed: ${(e as Error).message}` }, 502);
  }

  if (!groqResp.ok) {
    const errBody = await groqResp.json().catch(() => ({}));
    return json(
      { error: `Groq error ${groqResp.status}`, detail: errBody },
      502,
    );
  }

  const groqData = await groqResp.json();
  const raw: string = groqData.choices?.[0]?.message?.content ?? "";

  // ── Parse & validate ────────────────────────────────────────
  let game: Record<string, unknown>;
  try {
    // strip accidental markdown fences just in case
    const clean = raw.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim();
    game = JSON.parse(clean);
  } catch {
    return json({ error: "Model returned invalid JSON", raw }, 502);
  }

  // basic structure check
  if (!game.questions || !Array.isArray(game.questions)) {
    return json({ error: "Missing 'questions' array in response", raw }, 502);
  }

  return json({ game });
});
