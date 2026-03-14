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

function parseGroqWaitMs(message: string): number | null {
  const m = String(message || "").match(/try again in ([0-9]+(\.[0-9]+)?)s/i);
  if (!m) return null;
  const sec = Number(m[1]);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return Math.ceil(sec * 1000);
}

function isGroqRateLimit(message: string): boolean {
  const s = String(message || "");
  return s.includes("Groq 429") || s.includes("rate_limit_exceeded") || /rate limit/i.test(s);
}

async function groqChat(
  groqKey: string,
  model: string,
  prompt: string,
  { temperature = 0.2, jsonMode = true }: { temperature?: number; jsonMode?: boolean } = {},
) {
  const ac = new AbortController();
  const timeoutMs = Number(Deno.env.get("GROQ_TIMEOUT_MS") || "15000");
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
  const usedList = trimmed.length ? trimmed.join(" / ") : "(brak)";

  if (lang === "pl" || lang === "uk") {
    const systemDesc =
      lang === "uk"
        ? `Сімейка — телегра у стилі Family Feud. Генеруй гру УКРАЇНСЬКОЮ (не російською). Питання різноманітні, відповіді — короткі конкретні слова.`
        : `Jesteś ekspertem ankiet teleturnieju Familiada. Twoim zadaniem jest wygenerowanie zestawu 10 pytań ankietowych.
ZASADA NR 1: To NIE jest quiz wiedzy. To gra skojarzeń i intuicji.
ZASADA NR 2: Odpowiedzi muszą być konkretnymi rzeczami/rzeczownikami, a nie przymiotnikami czy pojęciami abstrakcyjnymi.
ZASADA NR 3: Każde pytanie musi być osadzone w kontekście tematu i jego "kąta" (angle).`;

    const topicHint =
      lang === "uk"
        ? (topic
          ? `Тема гри: "${topic}". Всі 10 питань ПОВИННІ бути пов'язані з цією темою.`
          : `Придумай власну, конкретну тему з повсякденного життя. Ці теми вже ІСНУЮТЬ — твоя має бути семантично інша:\n[${usedList}]`)
        : (topic
          ? `Temat: "${topic}". Każde pytanie musi dotyczyć tego tematu. Jeśli temat to "Ubrania — w łazience", nie pytaj o garnitury, tylko o pranie, kąpiel, szlafroki, brudną bieliznę.`
          : `Wymyśl własny, KONKRETNY temat z codziennego życia (np. "Problemy z sąsiadami", "Wyprawa do lasu", "Niedzielny obiad").\nWAŻNE: poniższe tematy już ISTNIEJĄ — twój musi być INNY:\n[${usedList}]`);

    const fewShot = lang === "pl" ? `
TWOJA BAZA WIEDZY (STYL I STRUKTURA):
Pytanie: Co najczęściej pijemy do obiadu?
Odpowiedzi: Kompot (44), Woda (26), Sok (18), Herbata (12)

Pytanie: Więcej niż jedno zwierzę to...?
Odpowiedzi: Stado (38), Klucze (25), Wataha (19), Ławica (14)

Pytanie: Co robimy, gdy wejdziemy do ciemnego pomieszczenia?
Odpowiedzi: Zapalamy światło (48), Szukamy włącznika (24), Zapalamy latarkę (15), Czekamy aż wzrok się przyzwyczai (9)

Pytanie: Popularne imię dla psa?
Odpowiedzi: Burek (35), Azor (27), Reksio (19), Łatek (14)

ZASADY GENEROWANIA NA PODSTAWIE REALNYCH DANYCH:
1. Przeszukaj swoją bazę treningową pod kątem autentycznych pytań z Familiady dla tematu: "${topic}".
2. Odpowiedzi MUSZĄ odzwierciedlać polską mentalność i stereotypy (np. na pytanie o jedzenie w łazience, nikt nie powie "kawior", tylko "kanapka" lub "jabłko").
3. Unikaj odpowiedzi "technicznych" - stawiaj na te, które podałoby 100 przypadkowych przechodniów na ulicy w Polsce.
4. Każde pytanie musi być unikalne i dotyczyć innego aspektu tematu.
` : "";

    const descHint = `Opis gry (description): Napisz krótki, zabawny wstęp (2 zdania), który brzmi jak zapowiedź Karola Strasburgera. Nie używaj słowa "wygenerowano".`;

    return `${systemDesc}

${topicHint}
${fewShot}

WYTYCZNE TECHNICZNE:
- 10 pytań, każde po 4 odpowiedzi.
- Pytania formy: "Co najczęściej...", "Gdzie zazwyczaj...", "Wymień coś, co...", "Co kojarzy się z...".
- Odpowiedzi: Krótkie rzeczowniki/frazy (1-3 słowa), MAX 17 znaków.
- Punkty: Suma 80-100, nieregularne (np. 42, 27, 16, 12).
- ZERO faktów szkolnych. TYLKO skojarzenia.
- ${descHint}

Zwróć TYLKO czysty JSON:
{"title":"Tytuł w stylu teleturnieju","description":"Opis w stylu prowadzącego.","questions":[{"text":"Pytanie?","answers":[{"text":"Odpowiedź","fixed_points":43},{"text":"Odpowiedź","fixed_points":27},{"text":"Odpowiedź","fixed_points":16},{"text":"Odpowiedź","fixed_points":9}]}]}`;
  }

  const avoidClause = trimmed.length ? `Avoid these titles: ${trimmed.join(", ")}.` : "";
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

function improveTitle(title: string, effectiveTopic: string): string {
  let t = String(title || "").trim();
  const topic = String(effectiveTopic || "").trim();
  const [baseRaw, angleRaw] = topic.split("—").map((s) => s.trim());
  const base = baseRaw || topic;
  const angle = angleRaw || "";

  const tLower = t.toLowerCase();
  const baseLower = base.toLowerCase();
  const topicLower = topic.toLowerCase();

  // Jeśli tytuł jest pusty, generyczny lub identyczny z tematem
  if (!t || tLower === baseLower || tLower === topicLower || t.split(/\s+/).length <= 1) {
    if (angle) {
      // Wyciągnij sensowne słowa z angle
      const angleWords = angle
        .replace(/^[\p{P}\p{S}\s]+/gu, "")
        .replace(/\s+/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3);
      t = `${base} ${angleWords.join(" ")}`.trim();
    } else {
      t = base || t;
    }
  }

  // Usuń zbędne znaki i ogranicz długość
  t = t.replace(/[:\-–—]/g, " ").replace(/\s+/g, " ").trim();
  const words = t.split(/\s+/).filter(Boolean).slice(0, 5);
  t = words.join(" ");
  
  if (!t || t.length < 3) t = base || "Bez tytułu";
  return t;
}

function improveDescription(description: string, effectiveTopic: string): string {
  const d = String(description || "").trim();
  const topic = String(effectiveTopic || "").trim();
  const baseTopic = topic.split("—")[0].trim().toLowerCase();

  // Jeśli opis jest sensowny (nie za krótki) i nie zawiera rażących ogólników, zostawiamy
  const isGeneric =
    d.length < 40 ||
    /to (niezwykła|świetna|idealna) gra/i.test(d) ||
    /uczestnicy muszą/i.test(d) ||
    /prowadzący zadaje/i.test(d);

  // Jeśli opis zawiera słowo kluczowe z tematu i nie jest totalnym śmieciem, jest OK
  const hasKeyword = d.toLowerCase().includes(baseTopic);
  
  if (!isGeneric && hasKeyword) return d;
  if (d.length > 60 && !isGeneric) return d;

  // Fallback, ale nieco bardziej urozmaicony
  const variants = [
    `Zestaw 10 pytań o tematyce: ${topic}. Idealna rozrywka na spotkania z rodziną i przyjaciółmi. Sprawdź swoje skojarzenia!`,
    `Czy wiesz wszystko o: ${topic}? Ta gra sprawdzi Twoją intuicję i szybkość myślenia. Zaproś bliskich do wspólnej zabawy.`,
    `Emocjonująca Familiada z pytaniami o ${topic}. Krótkie odpowiedzi, zaskakujące wyniki ankiety i mnóstwo śmiechu.`,
  ];
  
  const seed = topic.length % variants.length;
  return variants[seed];
}

function randomInt(min: number, max: number): number {
  const u = new Uint32Array(1);
  crypto.getRandomValues(u);
  return min + (u[0] % (max - min + 1));
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
  const u = new Uint32Array(2);
  crypto.getRandomValues(u);

  if (lang === "en") {
    const base = [
      "Food",
      "Home",
      "School",
      "Work",
      "Vacation",
      "Sports",
      "Family",
      "Pets",
      "Shopping",
      "Cars",
      "Phone & internet",
      "Holidays",
      "Dating",
      "Health",
      "Fashion",
      "Music",
      "Movies & TV",
      "Childhood",
      "Hobbies",
      "Weather",
    ];
    const angle = [
      "first thing in the morning",
      "late at night",
      "when you're in a hurry",
      "when you're bored",
      "at a family dinner",
      "on a road trip",
      "during a party",
      "on a rainy day",
      "when you are stressed",
      "when something breaks",
      "when you lose something",
      "when guests arrive",
      "at the supermarket",
      "at school",
      "at the office",
    ];
    return `${base[u[0] % base.length]} — ${angle[u[1] % angle.length]}`;
  }

  const base = [
    "Jedzenie",
    "Dom",
    "Szkoła",
    "Praca",
    "Wakacje",
    "Sport",
    "Rodzina",
    "Zwierzęta domowe",
    "Zakupy",
    "Podróże",
    "Internet i telefon",
    "Święta",
    "Randki i związki",
    "Zdrowie",
    "Ubrania",
    "Muzyka",
    "Filmy i seriale",
    "Dzieciństwo",
    "Sąsiedzi",
    "Pogoda",
    "Hobby",
    "Nawyki",
  ];
  const angle = [
    "rano po przebudzeniu",
    "wieczorem przed snem",
    "gdy się spieszysz",
    "gdy się nudzisz",
    "na rodzinnej imprezie",
    "w pracy w poniedziałek",
    "w kolejce w sklepie",
    "w deszczowy dzień",
    "gdy coś się zepsuje",
    "gdy zgubisz coś ważnego",
    "gdy przychodzą goście",
    "w podróży autem",
    "na wakacjach",
    "w szkole na przerwie",
    "w kuchni",
    "w łazience",
  ];
  return `${base[u[0] % base.length]} — ${angle[u[1] % angle.length]}`;
}

function isLowQualityCandidate(game: any): boolean {
  const desc = String(game?.description || "").trim();
  if (desc.length < 30) return true;
  if (/to (niezwykła|świetna|idealna) gra/i.test(desc)) return true;
  if (/to miejsce/i.test(desc)) return true;
  const qs = Array.isArray(game?.questions) ? game.questions : [];
  if (qs.length !== 10) return true;

  const startCounts = new Map<string, number>();
  const answerCounts = new Map<string, number>();
  let triviaCount = 0;

  for (const q of qs) {
    const qt = String(q?.text || "").trim();
    if (qt.length < 12) return true; // Too short

    const lowerQ = qt.toLowerCase();
    
    // Catch trivia keywords
    if (/\b(stolican|stolicą|państwo|rzeka|jezioro|kontynent|rok|wiek|stulecie|naukowiec|odkrył|wynalazł|autor|napisał|stolica)\b/i.test(lowerQ)) {
       triviaCount++;
    }

    const start = lowerQ.replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/).slice(0, 2).join(" ");
    if (start) startCounts.set(start, (startCounts.get(start) || 0) + 1);
    
    // Repetitive stems
    if (/^co robi(a|ą)/i.test(qt) || /^co jest często/i.test(qt)) return true;
    if (/^czy\b/i.test(qt)) return true;

    const ans = Array.isArray(q?.answers) ? q.answers : [];
    if (ans.length < 4) return true;

    for (const a of ans) {
      const at = String(a?.text || "").trim().toLowerCase();
      if (!at) return true;
      if (/^(tak|nie|nie wiem)$/i.test(at)) return true;
      if (/\d{4}/.test(at)) return true; // Likely years
      if (at.length > 45) return true;
      answerCounts.set(at, (answerCounts.get(at) || 0) + 1);
    }
  }

  if (triviaCount >= 2) return true; // Too much trivia
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
    const targetSum =
      sum >= 80 && sum <= 100 ? (sum >= 95 ? randomInt(85, 100) : Math.round(sum)) :
      sum < 80 ? randomInt(80, 95) :
      randomInt(85, 100);

    if (sum <= 0) {
      const base = [0.42, 0.26, 0.18, 0.14].map((p) => Math.round(p * targetSum));
      let bsum = base.reduce((a, b) => a + b, 0);
      base[0] = Math.max(0, base[0] + (targetSum - bsum));
      for (let i = 0; i < 4; i++) q.answers[i].fixed_points = base[i];
      q.answers.sort((a: any, b: any) => (Number(b.fixed_points) || 0) - (Number(a.fixed_points) || 0));
      continue;
    }

    const scaled = pts.map((n: number) => Math.max(0, n) * (targetSum / sum));
    const rounded = scaled.map((n: number) => Math.max(0, Math.round(n)));
    let rsum = rounded.reduce((acc: number, n: number) => acc + n, 0);
    rounded[0] = Math.max(0, rounded[0] + (targetSum - rsum));
    rounded.sort((a: number, b: number) => b - a);
    const minOther = Math.max(3, Math.round(targetSum * 0.06));
    const minTop = Math.max(25, Math.round(targetSum * 0.40));

    let top = rounded[0];
    let o1 = rounded[1];
    let o2 = rounded[2];
    let o3 = rounded[3];

    if (o1 < minOther || o2 < minOther || o3 < minOther) {
      const n1 = Math.max(minOther, o1);
      const n2 = Math.max(minOther, o2);
      const n3 = Math.max(minOther, o3);
      const extra = (n1 + n2 + n3) - (o1 + o2 + o3);
      top = Math.max(100 - (n1 + n2 + n3), top - extra);
      o1 = n1; o2 = n2; o3 = n3;
    }

    if (top < minTop) {
      const need = minTop - top;
      const take1 = Math.min(need, Math.max(0, o1 - minOther));
      o1 -= take1; top += take1;
      const left1 = need - take1;
      const take2 = Math.min(left1, Math.max(0, o2 - minOther));
      o2 -= take2; top += take2;
      const left2 = left1 - take2;
      const take3 = Math.min(left2, Math.max(0, o3 - minOther));
      o3 -= take3; top += take3;
    }

    const total = top + o1 + o2 + o3;
    if (total !== targetSum) top = Math.max(0, top + (targetSum - total));

    const finalPts = [top, o1, o2, o3].sort((a: number, b: number) => b - a);
    if (finalPts.every((p) => p % 5 === 0)) {
      if (finalPts[0] >= minTop + 1) {
        finalPts[0] -= 1;
        finalPts[1] += 1;
      } else if (finalPts[1] >= minOther + 1) {
        finalPts[1] -= 1;
        finalPts[0] += 1;
      }
      finalPts.sort((a: number, b: number) => b - a);
    }
    for (let i = 0; i < 4; i++) q.answers[i].fixed_points = finalPts[i];
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
      const model = "llama-3.3-70b-versatile";
      const effectiveTopic = String(topic || "").trim() || pickDefaultTopic(lang);
      const rawAvoid = Array.isArray(avoidTitles) ? avoidTitles : [];
      const avoidList = Array.from(new Set(rawAvoid.map((t: any) => String(t || "").trim()).filter(Boolean))).slice(0, 200);
      const avoidSet = new Set(avoidList.map((t) => t.toLowerCase()));

      const seed = crypto.randomUUID();
      const prompt = buildGeneratePromptWithSeed(lang, effectiveTopic, avoidTitles, seed);

      let payload: any;
      try {
        payload = await groqChat(groqKey, model, prompt, { temperature: 0.65, jsonMode: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isGroqRateLimit(msg)) {
          const waitMs = parseGroqWaitMs(msg) ?? 6000;
          return new Response(JSON.stringify({ ok: false, retry: true, reason: "rate_limit", wait_ms: waitMs }), {
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: false, retry: true, reason: "groq_error" }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      const normalized = normalizeGamePayload(payload);
      if (!normalized) {
        return new Response(JSON.stringify({ ok: false, retry: true, reason: "invalid_json" }), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      const warnings: string[] = [];
      if (avoidSet.has(String(normalized.title || "").toLowerCase())) warnings.push("title_dup");
      if (!topic && /(świat|world)/i.test(String(normalized.title || ""))) warnings.push("world_default");
      if (isLowQualityCandidate(normalized)) warnings.push("low_quality");

      normalized.title = improveTitle(normalized.title, effectiveTopic);
      normalized.description = improveDescription(normalized.description ?? "", effectiveTopic);

      return new Response(JSON.stringify({
        candidate: { lang, title: normalized.title, description: normalized.description ?? "", payload: normalized, topic: effectiveTopic },
        matches: [],
        warnings,
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
    if (isGroqRateLimit(message)) {
      const waitMs = parseGroqWaitMs(message) ?? 6000;
      return new Response(JSON.stringify({ ok: false, retry: true, reason: "rate_limit", wait_ms: waitMs }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
