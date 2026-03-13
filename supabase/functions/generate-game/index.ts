import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

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

// ─── GENERATE ────────────────────────────────────────────────────────────────

function buildGeneratePrompt(lang: string, index: number, topic: string, total: number, alreadyUsed: string[]): string {
  const usedList = alreadyUsed.length
    ? alreadyUsed.join(" / ")
    : "(brak)";

  const topicHint: Record<string, string> = {
    pl: topic
      ? `Temat tej gry: "${topic}". Upewnij się, że gra jest unikalna i nie pokrywa się z żadną z poniższych.`
      : `Wymyśl własny temat – coś konkretnego z codziennego życia, kultury, przyrody, jedzenia, miejsc, emocji, przedmiotów, zwierząt, pracy, rozrywki, historii, nauki, sportu...
WAŻNE: poniższe tematy już ISTNIEJĄ w bazie. Twój temat musi być semantycznie inny – nie tylko inaczej nazwany, ale naprawdę różny w treści:
[${usedList}]`,
    uk: topic
      ? `Тема гри: "${topic}". Переконайся, що гра унікальна.`
      : `Придумай власну тему. Ці теми вже ІСНУЮТЬ — твоя має бути семантично інша:
[${usedList}]`,
    en: topic
      ? `Game topic: "${topic}". Make sure the game is unique.`
      : `Invent your own topic. These topics ALREADY EXIST — yours must be semantically different, not just renamed:
[${usedList}]`,
  };

  const systemDesc: Record<string, string> = {
    pl: `Familiada to polski teleturniej w stylu "Family Feud". Prowadzący zadaje pytanie, a rodziny podają odpowiedzi, które wcześniej zebrała ankieta przeprowadzona wśród 100 losowych osób. Wygrywa ten, kto trafi w najpopularniejsze odpowiedzi z ankiety.

Twoim zadaniem jest wygenerowanie jednej pełnej gry Familiady po polsku.

Pytania mogą dotyczyć absolutnie wszystkiego – ludzi, zwierząt, przedmiotów, miejsc, jedzenia, przyrody, skojarzeń, definicji, list, rankingów, sytuacji, emocji, faktów. Niech każde pytanie w grze będzie inne w formie i podejściu. Niektóre pytania mogą być poważne, inne zabawne, zaskakujące, nostalgiczne albo abstrakcyjne.

Odpowiedzi w ankiecie to to co powiedziałby przeciętny Polak zapytany z ulicy. Konkretne, krótkie, oczywiste słowa.`,

    uk: `Сімейка (Familiada) — телегра у стилі "Family Feud". Ведучий ставить питання, а учасники вгадують найпопулярніші відповіді з опитування 100 випадкових людей.

Твоє завдання — згенерувати одну повну гру Сімейки українською мовою (НЕ російською).

Питання можуть стосуватися будь-чого. Нехай кожне питання буде різним за формою. Деякі можуть бути серйозними, інші — веселими або абстрактними.

Відповіді — це те, що сказала б звичайна людина на вулиці. Конкретні, короткі слова.`,

    en: `Family Feud is a game show where a host asks a question and contestants guess the most popular answers from a survey of 100 random people.

Your task is to generate one complete Family Feud game in English.

Questions can be about absolutely anything. Make each question different in style and approach. Some can be serious, some funny, surprising or abstract.

Answers are what an average person on the street would say. Specific, short, obvious words.`,
  };

  const descHint: Record<string, string> = {
    pl: `Opis gry (pole "description") musi mieć 2–4 zdania:
1. Co jest tematem gry i jaka jest jej atmosfera.
2. Dla kogo jest dobra (np. dla rodzin z dziećmi, dla dorosłych, dla seniorów, na imprezy, szkolne zajęcia, integrację w pracy, wieczór kawalerski/panieński...).
3. Opcjonalnie: jakiś ciekawy fakt lub wskazówka dla prowadzącego.`,
    uk: `Опис (поле "description") має містити 2–4 речення:
1. Тема та атмосфера гри.
2. Для кого підходить (для сім'ї, дорослих, дітей, вечірок...).
3. Опціонально: цікавий факт або порада ведучому.`,
    en: `The description field must have 2–4 sentences:
1. The topic and atmosphere of the game.
2. Who it's best for (families, adults, kids, parties, school, team building...).
3. Optional: a fun fact or tip for the host.`,
  };

  return `${systemDesc[lang] ?? systemDesc.en}

${topicHint[lang] ?? topicHint.en}
Gra ${index} z ${total}.

ZASADY TECHNICZNE:
- Liczba pytań: od 12 do 16 (wybierz losowo, nie zawsze tyle samo)
- Każde pytanie: 4–7 odpowiedzi
- Punkty: nieregularne liczby jak z prawdziwej ankiety (np. 43, 28, 14, 9, 6) – NIGDY 10/20/30/40/50
- Suma punktów w pytaniu: 90–110
- Odpowiedzi: maksymalnie 17 znaków
- Tytuł gry: 2–5 słów
- ${descHint[lang] ?? descHint.en}

Zwróć TYLKO czysty JSON, zero markdown, zero tekstu poza JSONem:
{"slug":"ascii-slug","meta":{"title":"Tytuł","description":"Opis gry 2-4 zdania.","lang":"${lang}"},"game":{"name":"Tytuł","type":"prepared"},"questions":[{"text":"Pytanie?","answers":[{"text":"Odpowiedź","fixed_points":43},{"text":"Odpowiedź","fixed_points":27}]}]}`;
}

// ─── SCAN ─────────────────────────────────────────────────────────────────────

function buildScanPrompt(lang: string, games: { slug: string; title: string; description: string }[]): string {
  const list = games.map((g, i) => `${i + 1}. slug="${g.slug}" | title="${g.title}" | desc="${g.description}"`).join("\n");

  const instructions: Record<string, string> = {
    pl: `Masz listę gier Familiady. Przeanalizuj ją i wskaż:

1. DUPLIKATY / BARDZO PODOBNE — pary lub grupy gier, które pokrywają ten sam temat (nawet jeśli tytuły brzmią różnie). Przykład: "Kolacja w restauracji" i "Wieczór w restauracji" to duplikat.

2. SŁABE GRY — gry z tytułem zbyt ogólnym/banalnym/nudnym, zbyt podobnym do wielu innych w tej samej bazie, lub z opisem który nic nie mówi.

Lista gier:
${list}

Zwróć TYLKO czysty JSON (zero tekstu poza JSONem):
{"issues":[{"type":"duplicate","slugs":["slug1","slug2"],"reason":"Krótkie wyjaśnienie po polsku"},{"type":"weak","slugs":["slug3"],"reason":"Krótkie wyjaśnienie"}]}

Jeśli nie ma żadnych problemów, zwróć: {"issues":[]}`,

    uk: `У тебе є список ігор Сімейки. Проаналізуй та вкажи дублікати і слабкі ігри.

Список:
${list}

Повернути ТІЛЬКИ JSON:
{"issues":[{"type":"duplicate","slugs":["slug1","slug2"],"reason":"пояснення"},{"type":"weak","slugs":["slug3"],"reason":"пояснення"}]}`,

    en: `You have a list of Family Feud games. Analyze and identify duplicates and weak games.

List:
${list}

Return ONLY JSON:
{"issues":[{"type":"duplicate","slugs":["slug1","slug2"],"reason":"explanation"},{"type":"weak","slugs":["slug3"],"reason":"explanation"}]}`,
  };

  return instructions[lang] ?? instructions.en;
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!groqKey) return respond({ error: "Brak GROQ_API_KEY" }, 500);

  let body: {
    action?: string;
    lang?: string;
    index?: number;
    total?: number;
    topic?: string;
    alreadyUsed?: string[];
    games?: { slug: string; title: string; description: string }[];
  };
  try { body = await req.json(); }
  catch { return respond({ error: "Invalid JSON" }, 400); }

  const action = body.action ?? "generate";

  // ── scan ──────────────────────────────────────────────────────────────────
  if (action === "scan") {
    const { lang = "pl", games = [] } = body;
    if (!games.length) return respond({ issues: [] });

    const prompt = buildScanPrompt(lang, games);
    let groqResp: Response;
    try {
      groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.2,
          max_tokens: 3000,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Return ONLY valid JSON, nothing else." },
            { role: "user", content: prompt },
          ],
        }),
      });
    } catch (e) {
      return respond({ error: `Groq fetch failed: ${(e as Error).message}` }, 502);
    }

    if (!groqResp.ok) {
      return respond({ error: `Groq ${groqResp.status}`, detail: await groqResp.text() }, 502);
    }

    const groqData = await groqResp.json();
    const raw = groqData?.choices?.[0]?.message?.content ?? "";
    try {
      const parsed = JSON.parse(raw.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim());
      return respond(parsed);
    } catch {
      return respond({ error: "Invalid JSON from scan model", raw: raw.slice(0, 300) }, 502);
    }
  }

  // ── generate ──────────────────────────────────────────────────────────────
  const { lang = "pl", index = 1, total = 1, topic = "", alreadyUsed = [] } = body;
  const prompt = buildGeneratePrompt(lang, index, topic, total, alreadyUsed);

  let groqResp: Response;
  try {
    groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.9,
        max_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return ONLY valid JSON, nothing else." },
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch (e) {
    return respond({ error: `Groq fetch failed: ${(e as Error).message}` }, 502);
  }

  if (!groqResp.ok) {
    const txt = await groqResp.text();
    return respond({ error: `Groq ${groqResp.status}`, detail: txt }, 502);
  }

  const groqData = await groqResp.json();
  const raw: string = groqData?.choices?.[0]?.message?.content ?? "";
  if (!raw) return respond({ error: "Groq empty response" }, 502);

  let game: Record<string, unknown>;
  try {
    game = JSON.parse(raw.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim());
  } catch {
    return respond({ error: "Invalid JSON from model", raw: raw.slice(0, 300) }, 502);
  }

  if (!Array.isArray(game.questions)) return respond({ error: "Missing questions" }, 502);

  return respond({ game });
});
