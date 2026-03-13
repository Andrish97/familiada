import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { pipeline } from "https://esm.sh/@xenova/transformers@2.17.1";

// This is a one-off script to migrate games from Storage to the new 'games' table.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Embedding pipeline
const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

async function generateEmbedding(text: string) {
  const result = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(result.data);
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

    const jsonFiles = files.filter(f => f.name.endsWith('.json'));
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
        embedding: embedding
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
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
