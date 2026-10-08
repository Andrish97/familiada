import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Wołana przez pg_cron (via pg_net) z guest_cleanup_expired() po każdym
// skasowanym koncie — czysta funkcja SQL nie ma dostępu do Storage API,
// więc to sprzątanie plików robi ta edge function, po fakcie usunięcia
// wierszy z DB. Autoryzacja: wołający musi mieć prawidłowy JWT
// service_role (weryfikuje to Supabase Gateway przed dotarciem tutaj).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    if (!serviceRoleKey) {
      return json({ ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }
    const body = await req.json().catch(() => ({}));
    const userId = String(body?.userId || "").trim();
    if (!userId) return json({ ok: false, error: "Missing userId" }, 400);

    await removeUserSoundsFolder(userId).catch((e) =>
      console.error("[cleanup-guest-storage] user-sounds failed:", e?.message || e)
    );
    await removeUserLogosFolder(userId).catch((e) =>
      console.error("[cleanup-guest-storage] user-logos failed:", e?.message || e)
    );

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});

async function removeUserSoundsFolder(userId: string) {
  await removeFolderRecursive("user-sounds", userId);
}

async function removeUserLogosFolder(userId: string) {
  await removeFolderRecursive("user-logos", userId);
}

// Usuwa rekurencyjnie wszystko pod prefiksem w buckecie, ze stronicowaniem
// (list zwraca max 1000 wpisów na stronę). Foldery mają id === null.
async function removeFolderRecursive(bucket: string, prefix: string) {
  const PAGE = 1000;
  for (;;) {
    // zawsze od początku: po usunięciu plików kolejne wpisy przesuwają się na start
    const { data: entries, error } = await admin.storage.from(bucket).list(prefix, { limit: PAGE, offset: 0 });
    if (error) throw error;
    if (!entries || entries.length === 0) return;

    const files: string[] = [];
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) await removeFolderRecursive(bucket, path);
      else files.push(path);
    }
    if (files.length === 0) return;
    const { error: rmError } = await admin.storage.from(bucket).remove(files);
    if (rmError) throw rmError;
    if (entries.length < PAGE) {
      // ostatnia strona; ewentualne foldery zostały już opróżnione rekurencyjnie
      return;
    }
  }
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
