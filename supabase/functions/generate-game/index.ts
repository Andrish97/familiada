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

function buildPrompt(lang: string, index: number, topic: string, total: number, alreadyUsed: string[]): string {

  const topicHint: Record<string, string> = {
    pl: topic
      ? `Temat tej gry: "${topic}".`
      : `Wymyśl własny temat – coś z codziennego życia, kultury, przyrody, jedzenia, miejsc, emocji, przedmiotów, zwierząt, pracy, rozrywki... Bądź kreatywny. Nie powtarzaj: [${alreadyUsed.join(", ")}].`,
    uk: topic
      ? `Тема гри: "${topic}".`
      : `Придумай власну тему – щось із повсякденного життя, культури, природи, їжі, місць, емоцій, тварин, роботи, розваг... Будь креативним. Не повторювати: [${alreadyUsed.join(", ")}].`,
    en: topic
      ? `Game topic: "${topic}".`
      : `Invent your own topic – something from everyday life, culture, nature, food, places, emotions, objects, animals, work, entertainment... Be creative. Do not repeat: [${alreadyUsed.join(", ")}].`,
  };

  const systemDesc: Record<string, string> = {
    pl: `Familiada to polski teleturniej w stylu "Family Feud". Prowadzący zadaje pytanie, a rodziny podają odpowiedzi, które wcześniej zebrała ankieta przeprowadzona wśród 100 losowych osób. Wygrywa ten, kto trafi w najpopularniejsze odpowiedzi z ankiety.

Twoim zadaniem jest wygenerowanie jednej pełnej gry Familiady po polsku.

Pytania mogą dotyczyć absolutnie wszystkiego – ludzi, zwierząt, przedmiotów, miejsc, jedzenia, przyrody, skojarzeń, definicji, list, rankingów, sytuacji, emocji, faktów. Niech każde pytanie w grze będzie inne w formie i podejściu. Niektóre pytania mogą być poważne, inne zabawne, zaskakujące, nostalgiczne albo abstrakcyjne.

Odpowiedzi w ankiecie to to co powiedziałby przeciętny Polak zapytany z ulicy. Konkretne, krótkie, oczywiste słowa.`,

    uk: `Сімейка (Familiada) — телегра у стилі "Family Feud". Ведучий ставить питання, а учасники вгадують найпопулярніші відповіді з опитування 100 випадкових людей.

Твоє завдання — згенерувати одну повну гру Сімейки українською мовою (НЕ російською).

Питання можуть стосуватися будь-чого — людей, тварин, предметів, місць, їжі, природи, асоціацій, списків, ситуацій, емоцій, фактів. Нехай кожне питання буде різним за формою. Деякі можуть бути серйозними, інші — веселими, несподіваними або абстрактними.

Відповіді — це те, що сказала б звичайна людина на вулиці. Конкретні, короткі, очевидні слова.`,

    en: `Family Feud is a game show where a host asks a question and contestants guess the most popular answers from a survey of 100 random people.

Your task is to generate one complete Family Feud game in English.

Questions can be about absolutely anything – people, animals, objects, places, food, nature, associations, definitions, lists, rankings, situations, emotions, facts. Make each question different in style and approach. Some can be serious, some funny, surprising, nostalgic or abstract.

Answers are what an average person on the street would say. Specific, short, obvious words.`,
  };

  return `${systemDesc[lang] ?? systemDesc.en}

${topicHint[lang] ?? topicHint.en}
Gra ${index} z ${total}.

ZASADY TECHNICZNE:
- Dokładnie 10 pytań
- Każde pytanie: 3–6 odpowiedzi
- Punkty: nieregularne liczby jak z prawdziwej ankiety (np. 43, 28, 14, 9) – nie 10/20/30/40
- Suma punktów w pytaniu: 80–100 (bardziej 100 niz 80)
- Odpowiedzi: maksymalnie 17 znaków
- Tytuł gry: 2–4 słowa

Zwróć TYLKO czysty JSON, zero markdown, zero tekstu poza JSONem:
{"slug":"ascii-slug","meta":{"title":"Tytuł","description":"Jedno zdanie.","lang":"${lang}"},"game":{"name":"Tytuł","type":"prepared"},"questions":[{"text":"Pytanie?","answers":[{"text":"Odpowiedź","fixed_points":43},{"text":"Odpowiedź","fixed_points":27}]}]}`;
}

// `serve` jest globalnie wstrzyknięte przez Supabase edge runtime
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!groqKey) return respond({ error: "Brak GROQ_API_KEY" }, 500);

  let body: { lang?: string; index?: number; total?: number; topic?: string; alreadyUsed?: string[] };
  try { body = await req.json(); }
  catch { return respond({ error: "Invalid JSON" }, 400); }

  const { lang = "pl", index = 1, total = 1, topic = "", alreadyUsed = [] } = body;

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
          { role: "system", content: "Return ONLY valid JSON, nothing else." },
          { role: "user", content: buildPrompt(lang, index, topic, total, alreadyUsed) },
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