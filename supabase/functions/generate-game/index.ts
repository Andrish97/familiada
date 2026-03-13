// test 
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

// ─── GitHub helpers ───────────────────────────────────────────────────────────

function ghHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" };
}

function ghBase(repo: string) {
  return `https://api.github.com/repos/${repo}/contents`;
}

function ghDecode(content: string) {
  return new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\n/g, "")), c => c.charCodeAt(0)));
}

function ghEncode(text: string) {
  return btoa(unescape(encodeURIComponent(text)));
}

function ghSignal(ms = 10000) {
  return AbortSignal.timeout(ms);
}

async function ghGet(token: string, repo: string, path: string) {
  const res = await fetch(`${ghBase(repo)}/${path}`, { headers: ghHeaders(token), signal: ghSignal() });
  if (!res.ok) { if (res.status === 404) return null; throw new Error(`GitHub GET ${path}: ${res.status}`); }
  return res.json();
}

async function ghPut(token: string, repo: string, branch: string, path: string, content: string, message: string, sha?: string) {
  const body: Record<string, unknown> = { message, content: ghEncode(content), branch };
  if (sha) body.sha = sha;
  const res = await fetch(`${ghBase(repo)}/${path}`, {
    method: "PUT", headers: ghHeaders(token), body: JSON.stringify(body), signal: ghSignal(),
  });
  if (!res.ok) throw new Error(`GitHub PUT ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function ghDelete(token: string, repo: string, branch: string, path: string, message: string, sha: string) {
  const res = await fetch(`${ghBase(repo)}/${path}`, {
    method: "DELETE", headers: ghHeaders(token),
    body: JSON.stringify({ message, sha, branch }),
    signal: ghSignal(),
  });
  if (!res.ok) throw new Error(`GitHub DELETE ${path}: ${res.status}`);
}

// ─── Git Trees API (batch commit) ────────────────────────────────────────────

async function ghGetRef(token: string, repo: string, branch: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/${branch}`, { headers: ghHeaders(token), signal: ghSignal() });
  if (!res.ok) throw new Error(`GitHub ref: ${res.status}`);
  return res.json();
}

async function ghGetCommit(token: string, repo: string, sha: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/git/commits/${sha}`, { headers: ghHeaders(token), signal: ghSignal() });
  if (!res.ok) throw new Error(`GitHub commit: ${res.status}`);
  return res.json();
}

async function ghCreateBlob(token: string, repo: string, content: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/git/blobs`, {
    method: "POST", headers: ghHeaders(token), signal: ghSignal(),
    body: JSON.stringify({ content: ghEncode(content), encoding: "base64" }),
  });
  if (!res.ok) throw new Error(`GitHub blob: ${res.status}`);
  return (await res.json()).sha;
}

async function ghCreateTree(token: string, repo: string, baseTree: string, items: { path: string; sha: string | null }[]) {
  const tree = items.map(i => i.sha === null
    ? { path: i.path, mode: "100644", type: "blob", sha: null }
    : { path: i.path, mode: "100644", type: "blob", sha: i.sha });
  const res = await fetch(`https://api.github.com/repos/${repo}/git/trees`, {
    method: "POST", headers: ghHeaders(token), signal: ghSignal(20000),
    body: JSON.stringify({ base_tree: baseTree, tree }),
  });
  if (!res.ok) throw new Error(`GitHub tree: ${res.status} ${await res.text()}`);
  return (await res.json()).sha;
}

async function ghCreateCommit(token: string, repo: string, message: string, treeSha: string, parentSha: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/git/commits`, {
    method: "POST", headers: ghHeaders(token), signal: ghSignal(),
    body: JSON.stringify({ message, tree: treeSha, parents: [parentSha] }),
  });
  if (!res.ok) throw new Error(`GitHub commit create: ${res.status}`);
  return (await res.json()).sha;
}

async function ghUpdateRef(token: string, repo: string, branch: string, sha: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH", headers: ghHeaders(token), signal: ghSignal(),
    body: JSON.stringify({ sha }),
  });
  if (!res.ok) throw new Error(`GitHub updateRef: ${res.status}`);
}

async function ghBatchCommit(
  token: string, repo: string, branch: string, message: string,
  deletePaths: string[], upserts: { path: string; content: string }[]
) {
  const ref = await ghGetRef(token, repo, branch);
  const parentSha: string = ref.object.sha;
  const commit = await ghGetCommit(token, repo, parentSha);
  const baseTree: string = commit.tree.sha;

  const items: { path: string; sha: string | null }[] = deletePaths.map(p => ({ path: p, sha: null }));
  for (const u of upserts) {
    const blobSha = await ghCreateBlob(token, repo, u.content);
    items.push({ path: u.path, sha: blobSha });
  }

  const treeSha = await ghCreateTree(token, repo, baseTree, items);
  const newCommitSha = await ghCreateCommit(token, repo, message, treeSha, parentSha);
  await ghUpdateRef(token, repo, branch, newCommitSha);
}

// ─── Index ────────────────────────────────────────────────────────────────────

async function readIndex(token: string, repo: string): Promise<{ data: string[]; sha: string | null }> {
  const res = await ghGet(token, repo, "marketplace/index.json");
  if (!res) return { data: [], sha: null };
  return { data: JSON.parse(ghDecode(res.content)), sha: res.sha };
}

async function writeIndex(token: string, repo: string, branch: string, data: string[], sha: string | null, msg: string) {
  const current = await ghGet(token, repo, "marketplace/index.json");
  const currentSha = current?.sha ?? sha;
  await ghPut(token, repo, branch, "marketplace/index.json", JSON.stringify(data, null, 2) + "\n", msg, currentSha ?? undefined);
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

// ─── Groq call ────────────────────────────────────────────────────────────────

async function groqChat(groqKey: string, prompt: string, temperature: number, maxTokens: number, timeoutMs = 22000) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    signal: ghSignal(timeoutMs),
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

function buildDupeScanPrompt(lang: string, games: { slug: string; title: string }[]): string {
  const list = games.map((g, i) => `${i + 1}. slug="${g.slug}" title="${g.title}"`).join("\n");
  const instructions: Record<string, string> = {
    pl: `Masz listę ${games.length} tytułów gier Familiady. Znajdź TYLKO pary/grupy które są NIEMAL IDENTYCZNE tematycznie — czyli pokrywają się w co najmniej 90% zakresu (np. dwie gry dosłownie o "polskiej kuchni domowej"). Gry z podobnej kategorii (np. "jedzenie" i "gotowanie") to NIE duplikat. Flaguj tylko oczywiste, niemal identyczne tematy.

Lista:
${list}

WAŻNE: używaj DOKŁADNIE tych slugów ze listy. Nie szukaj słabych gier — tylko duplikaty tematyczne ≥90%.
Zwróć TYLKO JSON: {"issues":[{"type":"duplicate","slugs":["slug1","slug2"],"reason":"wyjaśnienie"}]}
Jeśli brak: {"issues":[]}`,
    uk: `Знайди лише майже ідентичні дублікати (≥90% збігу теми) серед ${games.length} ігор. Схожі категорії — не дублікат.\n\nСписок:\n${list}\n\nJSON: {"issues":[{"type":"duplicate","slugs":["s1","s2"],"reason":"..."}]}`,
    en: `Find only near-identical topic duplicates (≥90% overlap) among ${games.length} games. Similar categories are NOT duplicates.\n\nList:\n${list}\n\nJSON: {"issues":[{"type":"duplicate","slugs":["s1","s2"],"reason":"..."}]}`,
  };
  return instructions[lang] ?? instructions.en;
}

function buildScanPrompt(lang: string, games: { slug: string; title: string; description: string }[]): string {
  const list = games.map((g, i) => `${i + 1}. slug="${g.slug}" | title="${g.title}" | desc="${g.description}"`).join("\n");
  const instructions: Record<string, string> = {
    pl: `Masz listę ${games.length} gier Familiady (teleturniej Family Feud). Każda gra ma slug, tytuł i opis.

ZADANIE — SŁABE GRY: flaguj gry które są zbyt ogólne, banalne lub mają nieatrakcyjny temat dla teleturnieju rodzinnego. Sprawdź opis — jeśli brzmi nudno, bez konkretnego pomysłu lub jest zbyt abstrakcyjny, to słaba gra. Duplikatów nie szukaj.

Lista:
${list}

WAŻNE: używaj DOKŁADNIE tych slugów które widzisz na liście. Nie modyfikuj slugów.
Zwróć TYLKO JSON:
{"issues":[{"type":"duplicate","slugs":["slug1","slug2"],"reason":"wyjaśnienie po polsku"},{"type":"weak","slugs":["slug3"],"reason":"wyjaśnienie"}]}
Jeśli brak problemów: {"issues":[]}`,
    uk: `Проаналізуй ${games.length} ігор. Знайди дублікати (схожа тема) та слабкі ігри (нецікаві, банальні).\n\nСписок:\n${list}\n\nВикористовуй ТОЧНІ slug зі списку. JSON: {"issues":[{"type":"duplicate","slugs":["s1","s2"],"reason":"..."},{"type":"weak","slugs":["s3"],"reason":"..."}]}`,
    en: `Analyze ${games.length} games. Find duplicates (same topic) and weak games (boring, too generic, unattractive for families).\n\nList:\n${list}\n\nUse EXACT slugs from the list. JSON: {"issues":[{"type":"duplicate","slugs":["s1","s2"],"reason":"..."},{"type":"weak","slugs":["s3"],"reason":"..."}]}`,
  };
  return instructions[lang] ?? instructions.en;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  try {
  const groqKey  = Deno.env.get("GROQ_API_KEY")  ?? "";
  const ghToken  = Deno.env.get("GITHUB_TOKEN")  ?? "";
  const ghRepo   = Deno.env.get("GITHUB_REPO")   ?? "";
  const ghBranch = Deno.env.get("GITHUB_BRANCH") ?? "main";

  if (!groqKey) return respond({ error: "Brak GROQ_API_KEY" }, 500);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return respond({ error: "Invalid JSON" }, 400); }

  const action = String(body.action ?? "generate");

  // ── list-games ──────────────────────────────────────────────────────────────
  if (action === "list-games") {
    if (!ghToken || !ghRepo) return respond({ error: "Brak GITHUB_TOKEN lub GITHUB_REPO w secrets" }, 500);
    const lang = String(body.lang ?? "pl");
    const dirRes = await ghGet(ghToken, ghRepo, `marketplace/${lang}`);
    if (!dirRes || !Array.isArray(dirRes)) return respond({ games: [] });

    const games = dirRes
      .filter((f: { name: string }) => f.name.endsWith(".json"))
      .map((f: { name: string; sha: string }) => {
        const m = f.name.match(/^(\d+)-(.+)\.json$/);
        const num = m ? parseInt(m[1]) : 999;
        const slug = m?.[2] ?? "";
        const title = slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
        return { num, filename: f.name, title, description: "", slug, sha: f.sha, lang, indexKey: `${lang}/${f.name.replace(".json", "")}`, data: null };
      });
    games.sort((a: { num: number }, b: { num: number }) => a.num - b.num);
    return respond({ games });
  }

  // ── get-game ─────────────────────────────────────────────────────────────────
  if (action === "get-game") {
    if (!ghToken || !ghRepo) return respond({ error: "Brak GitHub secrets" }, 500);
    const { lang, filename } = body as { lang: string; filename: string };
    if (!lang || !filename) return respond({ error: "Brak wymaganych pól" }, 400);
    const fRes = await ghGet(ghToken, ghRepo, `marketplace/${lang}/${filename}`);
    if (!fRes) return respond({ error: "Nie znaleziono" }, 404);
    const data = JSON.parse(ghDecode(fRes.content));
    return respond({ data });
  }

  // ── batch-commit (delete + add + auto-renumber, 1 commit) ────────────────────
  if (action === "batch-commit") {
    if (!ghToken || !ghRepo) return respond({ error: "Brak GitHub secrets" }, 500);
    const { lang, deletes = [], adds = [], remaining = [] } = body as {
      lang: string;
      deletes: { filename: string; indexKey: string; slug: string; sha: string }[];
      adds: { slug: string; content: string }[];
      remaining: { filename: string; indexKey: string; slug: string; sha: string }[];
    };
    if (!lang) return respond({ error: "Brak lang" }, 400);

    // sort remaining by current number
    const sorted = remaining.slice().sort((a, b) => parseInt(a.filename) - parseInt(b.filename));

    let counter = 1;
    const renames: { oldPath: string; newPath: string; blobSha: string; oldKey: string; newKey: string }[] = [];
    for (const g of sorted) {
      const newNum = String(counter++).padStart(3, "0");
      const newFilename = `${newNum}-${g.slug}.json`;
      if (newFilename !== g.filename) {
        renames.push({ oldPath: `marketplace/${lang}/${g.filename}`, newPath: `marketplace/${lang}/${newFilename}`, blobSha: g.sha, oldKey: g.indexKey, newKey: `${lang}/${newNum}-${g.slug}` });
      }
    }

    const newFiles: { path: string; content: string; key: string }[] = [];
    for (const a of adds as GameAdd[]) {
      const newNum = String(counter++).padStart(3, "0");
      const slug = a.slug || `game-${newNum}`;
      newFiles.push({ path: `marketplace/${lang}/${newNum}-${slug}.json`, content: a.content, key: `${lang}/${newNum}-${slug}` });
    }

    // update index
    const { data: currentIdx } = await readIndex(ghToken, ghRepo);
    const deleteKeys = new Set(deletes.map(f => f.indexKey));
    const renameMap = new Map(renames.map(r => [r.oldKey, r.newKey]));
    const newIdx = [
      ...currentIdx.filter(k => !deleteKeys.has(k)).map(k => renameMap.get(k) ?? k),
      ...newFiles.map(f => f.key),
    ];

    // build tree
    const ref = await ghGetRef(ghToken, ghRepo, ghBranch);
    const parentSha: string = ref.object.sha;
    const baseTree: string = (await ghGetCommit(ghToken, ghRepo, parentSha)).tree.sha;

    const treeItems: { path: string; mode: string; type: string; sha: string | null }[] = [
      ...deletes.map(f => ({ path: `marketplace/${lang}/${f.filename}`, mode: "100644", type: "blob", sha: null })),
      ...renames.map(r => ({ path: r.oldPath, mode: "100644", type: "blob", sha: null })),
      ...renames.map(r => ({ path: r.newPath, mode: "100644", type: "blob", sha: r.blobSha })),
    ];

    const newFileShas = await Promise.all(newFiles.map(f => ghCreateBlob(ghToken, ghRepo, f.content)));
    newFiles.forEach((f, i) => treeItems.push({ path: f.path, mode: "100644", type: "blob", sha: newFileShas[i] }));

    const idxSha = await ghCreateBlob(ghToken, ghRepo, JSON.stringify(newIdx, null, 2) + "\n");
    treeItems.push({ path: "marketplace/index.json", mode: "100644", type: "blob", sha: idxSha });

    const res2 = await fetch(`https://api.github.com/repos/${ghRepo}/git/trees`, {
      method: "POST", headers: ghHeaders(ghToken), signal: ghSignal(20000),
      body: JSON.stringify({ base_tree: baseTree, tree: treeItems }),
    });
    if (!res2.ok) throw new Error(`tree: ${res2.status}`);
    const treeSha = (await res2.json()).sha;
    const parts = [];
    if (deletes.length) parts.push(`remove ${deletes.length}`);
    if (newFiles.length) parts.push(`add ${newFiles.length}`);
    const commitMsg = `chore: ${parts.join(", ")} game(s) in ${lang}`;
    const newCommitSha = await ghCreateCommit(ghToken, ghRepo, commitMsg, treeSha, parentSha);
    await ghUpdateRef(ghToken, ghRepo, ghBranch, newCommitSha);

    return respond({ ok: true, deleted: deletes.length, added: newFiles.length, renamed: renames.length });
  }

  // ── batch-delete (z auto-renumeracją) ────────────────────────────────────────
  if (action === "batch-delete") {
    if (!ghToken || !ghRepo) return respond({ error: "Brak GitHub secrets" }, 500);
    type GameRef = { filename: string; indexKey: string; slug: string; sha: string };
    const { lang, files, remaining } = body as { lang: string; files: GameRef[]; remaining: GameRef[] };
    if (!lang || !Array.isArray(files) || !files.length) return respond({ error: "Brak wymaganych pól" }, 400);

    const deleteSet = new Set(files.map(f => f.filename));
    const sorted = (remaining || []).slice().sort((a, b) => {
      const na = parseInt(a.filename), nb = parseInt(b.filename);
      return na - nb;
    });

    // oblicz nowe nazwy plików
    const renames: { oldPath: string; newPath: string; blobSha: string; newKey: string }[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const g = sorted[i];
      const newNum = String(i + 1).padStart(3, "0");
      const newFilename = `${newNum}-${g.slug}.json`;
      if (newFilename !== g.filename) {
        renames.push({
          oldPath: `marketplace/${lang}/${g.filename}`,
          newPath: `marketplace/${lang}/${newFilename}`,
          blobSha: g.sha,
          newKey: `${lang}/${newNum}-${g.slug}`,
        });
      }
    }

    // buduj nowy index
    const { data: currentIdx } = await readIndex(ghToken, ghRepo);
    const deleteKeys = new Set(files.map(f => f.indexKey));
    const renameMap = new Map(renames.map(r => {
      const old = sorted.find(g => `marketplace/${lang}/${g.filename}` === r.oldPath);
      return [old?.indexKey ?? "", r.newKey];
    }));
    const newIdx = currentIdx
      .filter(k => !deleteKeys.has(k))
      .map(k => renameMap.get(k) ?? k);

    // tree items: usuń stare, dodaj nowe (reuse blob sha), zaktualizuj index
    const deletePaths = [
      ...files.map(f => `marketplace/${lang}/${f.filename}`),
      ...renames.map(r => r.oldPath),
    ];
    const upserts = [
      ...renames.map(r => ({ path: r.newPath, sha: r.blobSha })),
      { path: "marketplace/index.json", sha: null as unknown as string, content: JSON.stringify(newIdx, null, 2) + "\n" },
    ];

    // batch commit — blob dla index.json tworzymy, reszta reuse sha
    const ref = await ghGetRef(ghToken, ghRepo, ghBranch);
    const parentSha: string = ref.object.sha;
    const commitData = await ghGetCommit(ghToken, ghRepo, parentSha);
    const baseTree: string = commitData.tree.sha;

    const treeItems: { path: string; mode: string; type: string; sha: string | null }[] = [
      ...deletePaths.map(p => ({ path: p, mode: "100644", type: "blob", sha: null })),
      ...renames.map(r => ({ path: r.newPath, mode: "100644", type: "blob", sha: r.blobSha })),
    ];
    // index.json jako nowy blob
    const idxBlobSha = await ghCreateBlob(ghToken, ghRepo, JSON.stringify(newIdx, null, 2) + "\n");
    treeItems.push({ path: "marketplace/index.json", mode: "100644", type: "blob", sha: idxBlobSha });

    const res2 = await fetch(`https://api.github.com/repos/${ghRepo}/git/trees`, {
      method: "POST", headers: ghHeaders(ghToken), signal: ghSignal(20000),
      body: JSON.stringify({ base_tree: baseTree, tree: treeItems }),
    });
    if (!res2.ok) throw new Error(`tree: ${res2.status}`);
    const treeSha = (await res2.json()).sha;

    const msg = renames.length
      ? `chore: remove ${files.length} + renumber ${lang} (1 commit)`
      : `chore: remove ${files.length} game(s) from ${lang}`;
    const newCommitSha = await ghCreateCommit(ghToken, ghRepo, msg, treeSha, parentSha);
    await ghUpdateRef(ghToken, ghRepo, ghBranch, newCommitSha);

    return respond({ ok: true, deleted: files.length, renamed: renames.length });
  }

  // ── delete-game ─────────────────────────────────────────────────────────────
  if (action === "delete-game") {
    if (!ghToken || !ghRepo) return respond({ error: "Brak GitHub secrets" }, 500);
    const { lang, filename, sha, indexKey } = body as { lang: string; filename: string; sha: string; indexKey: string };
    if (!lang || !filename || !sha) return respond({ error: "Brak wymaganych pól" }, 400);
    await ghDelete(ghToken, ghRepo, ghBranch, `marketplace/${lang}/${filename}`, `chore: remove game ${indexKey}`, sha);
    const { data: idx } = await readIndex(ghToken, ghRepo);
    await writeIndex(ghToken, ghRepo, ghBranch, idx.filter(k => k !== indexKey), null, `chore: remove ${indexKey} from index`);
    return respond({ ok: true });
  }

  // ── renumber ─────────────────────────────────────────────────────────────────
  if (action === "renumber") {
    if (!ghToken || !ghRepo) return respond({ error: "Brak GitHub secrets" }, 500);
    const { lang, games } = body as { lang: string; games: { num: number; filename: string; sha: string; slug: string; indexKey: string }[] };
    if (!lang || !Array.isArray(games)) return respond({ error: "Brak wymaganych pól" }, 400);

    const renames = games
      .sort((a, b) => a.num - b.num)
      .map((g, i) => ({ g, newNum: i + 1, newFilename: `${String(i + 1).padStart(3, "0")}-${g.slug}.json` }))
      .filter(({ g, newFilename }) => g.filename !== newFilename);

    if (!renames.length) return respond({ ok: true, renamed: 0 });

    let { data: currentIndex } = await readIndex(ghToken, ghRepo);

    for (const { g, newFilename } of renames) {
      const fRes = await ghGet(ghToken, ghRepo, `marketplace/${lang}/${g.filename}`);
      if (!fRes) continue;
      const content = ghDecode(fRes.content);
      await ghPut(ghToken, ghRepo, ghBranch, `marketplace/${lang}/${newFilename}`, content,
        `chore: renumber ${g.indexKey} → ${lang}/${newFilename.replace(".json", "")}`);
      await ghDelete(ghToken, ghRepo, ghBranch, `marketplace/${lang}/${g.filename}`,
        `chore: remove old ${g.filename} after renumber`, fRes.sha);
      const newKey = `${lang}/${newFilename.replace(".json", "")}`;
      currentIndex = currentIndex.map(k => k === g.indexKey ? newKey : k);
    }

    await writeIndex(ghToken, ghRepo, ghBranch, currentIndex, null, "chore: update index after renumber");
    return respond({ ok: true, renamed: renames.length });
  }

  // ── scan ─────────────────────────────────────────────────────────────────────
  if (action === "scan") {
    if (!groqKey) return respond({ error: "Brak GROQ_API_KEY" }, 500);
    const { lang = "pl", games = [], mode = "full" } = body as { lang: string; games: { slug: string; title: string; description: string }[]; mode?: string };
    if (!Array.isArray(games) || !games.length) return respond({ issues: [] });
    const prompt = mode === "duplicates" ? buildDupeScanPrompt(String(lang), games) : buildScanPrompt(String(lang), games);
    const result = await groqChat(groqKey, prompt, 0.2, 4000, 28000);
    return respond(result);
  }

  // ── save-games (1 commit via Trees API) ──────────────────────────────────────
  if (action === "save-games") {
    if (!ghToken || !ghRepo) return respond({ error: "Brak GITHUB_TOKEN lub GITHUB_REPO w secrets" }, 500);
    const { lang, games: gamesToSave } = body as { lang: string; games: Record<string, unknown>[] };
    if (!lang || !Array.isArray(gamesToSave) || !gamesToSave.length) return respond({ error: "Brak wymaganych pól" }, 400);

    // determine next number
    let nextNum = 1;
    try {
      const dirRes = await ghGet(ghToken, ghRepo, `marketplace/${lang}`);
      if (Array.isArray(dirRes)) {
        const nums = dirRes
          .filter((f: { name: string }) => f.name.match(/^\d+-.+\.json$/))
          .map((f: { name: string }) => parseInt(f.name));
        if (nums.length) nextNum = Math.max(...nums) + 1;
      }
    } catch { /* start from 1 */ }

    const saved: { indexKey: string; filename: string }[] = [];
    const { data: currentIndex } = await readIndex(ghToken, ghRepo);
    const gameContents: { path: string; content: string }[] = [];

    for (let i = 0; i < gamesToSave.length; i++) {
      const game = { ...gamesToSave[i] };
      const rawSlug = String(game.slug ?? (game.meta as Record<string,unknown>)?.title ?? `game-${nextNum + i}`);
      const gameSlug = slugify(rawSlug) || `game-${String(nextNum + i).padStart(3, "0")}`;
      const num = String(nextNum + i).padStart(3, "0");
      const filename = `${num}-${gameSlug}.json`;
      const indexKey = `${lang}/${num}-${gameSlug}`;
      delete game.slug;
      gameContents.push({ path: `marketplace/${lang}/${filename}`, content: JSON.stringify(game, null, 2) + "\n" });
      if (!currentIndex.includes(indexKey)) currentIndex.push(indexKey);
      saved.push({ indexKey, filename });
    }

    // wszystko w 1 commicie
    const ref = await ghGetRef(ghToken, ghRepo, ghBranch);
    const parentSha: string = ref.object.sha;
    const commitData = await ghGetCommit(ghToken, ghRepo, parentSha);
    const baseTree: string = commitData.tree.sha;

    // utwórz blob dla każdej gry + index
    const allContents = [...gameContents, { path: "marketplace/index.json", content: JSON.stringify(currentIndex, null, 2) + "\n" }];
    const blobShas = await Promise.all(allContents.map(({ content }) => ghCreateBlob(ghToken, ghRepo, content)));
    const treeItems = allContents.map(({ path }, i) => ({ path, mode: "100644", type: "blob", sha: blobShas[i] }));

    const res2 = await fetch(`https://api.github.com/repos/${ghRepo}/git/trees`, {
      method: "POST", headers: ghHeaders(ghToken), signal: ghSignal(20000),
      body: JSON.stringify({ base_tree: baseTree, tree: treeItems }),
    });
    if (!res2.ok) throw new Error(`tree: ${res2.status}`);
    const treeSha = (await res2.json()).sha;
    const newCommitSha = await ghCreateCommit(ghToken, ghRepo, `feat: add ${saved.length} game(s) to ${lang}`, treeSha, parentSha);
    await ghUpdateRef(ghToken, ghRepo, ghBranch, newCommitSha);

    return respond({ ok: true, saved: saved.map((s, i) => ({ ...s, sha: blobShas[i] })) });
  }

  // ── generate (Groq only, no GitHub) ──────────────────────────────────────────
  {
    const { lang = "pl", index = 1, total = 1, topic = "", alreadyUsed = [] } = body as {
      lang?: string; index?: number; total?: number; topic?: string; alreadyUsed?: string[];
    };

    const prompt = buildGeneratePrompt(String(lang), Number(index), String(topic), Number(total), alreadyUsed as string[]);
    let game: Record<string, unknown>;
    try {
      game = await groqChat(groqKey, prompt, 0.9, 4000);
    } catch (e) {
      return respond({ error: `Groq failed: ${(e as Error).message}` }, 502);
    }
    if (!Array.isArray(game.questions)) return respond({ error: "Missing questions" }, 502);
    return respond({ game });
  }
  } catch (e) {
    return respond({ error: `Unexpected error: ${(e as Error).message}` }, 500);
  }
});
