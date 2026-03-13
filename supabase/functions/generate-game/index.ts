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
  const groqKey = Deno.env.get("GROQ_API_KEY") ?? "";

  try {
    const body = await req.json();
    const { lang, index, total, topic, alreadyUsed = [] } = body;
    const model = total > 1 ? "llama-3.1-8b-instant" : "llama-3.3-70b-versatile";
    const prompt = buildGeneratePrompt(lang, index, total, topic, alreadyUsed);
    const game = await groqChat(groqKey, model, prompt);
    return respond({ game });

  } catch (e) {
    return respond({ error: String(e) }, 500);
  }
});
