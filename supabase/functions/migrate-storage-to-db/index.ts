import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

// This is a one-off script to migrate games from Storage to the new 'games' table.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (const x of vec) sumSq += x * x;
  const norm = Math.sqrt(sumSq) || 1;
  return vec.map((x) => x / norm);
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  const token = Deno.env.get("HUGGINGFACE_API_TOKEN") || "";
  if (!token) return null;

  const res = await fetch(
    "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
    },
  );

  if (!res.ok) throw new Error(`hf_embeddings_${res.status}:${await res.text().catch(() => "")}`);
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
}

serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { lang = 'pl' } = await req.json();
    const prefix = `marketplace/${lang}`;

    // 1. List all files
    const { data: files, error: listError } = await supabase.storage.from("marketplace").list(prefix);
    if (listError) throw listError;

    const jsonFiles = files.filter((f: any) => f.name.endsWith('.json'));
    let migratedCount = 0;

    for (const file of jsonFiles) {
      // 2. Download file content
      const { data: blob, error: downloadError } = await supabase.storage.from("marketplace").download(`${prefix}/${file.name}`);
      if (downloadError) {
        console.error(`Failed to download ${file.name}:`, downloadError);
        continue;
      }
      const payload = JSON.parse(await blob.text());

      // 3. Generate embedding
      const questionsText = payload.questions.map((q: any) => q.text).join("\n");
      const embedding = await generateEmbedding(questionsText);

      // 4. Insert into new table
      const { error: insertError } = await supabase.from('games').insert({
        source: 'producer',
        status: 'published',
        lang: lang,
        title: payload.meta?.title || file.name.replace('.json', ''),
        description: payload.meta?.description || '',
        payload: payload,
        embedding: embedding ?? null
      });

      if (insertError) {
        console.error(`Failed to insert ${file.name}:`, insertError);
      } else {
        migratedCount++;
      }
    }

    return new Response(JSON.stringify({ ok: true, migrated: migratedCount, total: jsonFiles.length }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
