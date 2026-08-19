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
  const { data: gameFolders, error: listError } = await admin.storage
    .from("user-sounds")
    .list(userId, { limit: 1000 });
  if (listError) throw listError;
  if (!gameFolders || gameFolders.length === 0) return;

  for (const entry of gameFolders) {
    if (entry.id !== null) {
      await admin.storage.from("user-sounds").remove([`${userId}/${entry.name}`]);
      continue;
    }
    const subPath = `${userId}/${entry.name}`;
    const { data: files } = await admin.storage.from("user-sounds").list(subPath, { limit: 1000 });
    if (files && files.length > 0) {
      const paths = files.map((f) => `${subPath}/${f.name}`);
      await admin.storage.from("user-sounds").remove(paths);
    }
  }
}

async function removeUserLogosFolder(userId: string) {
  const { data: files, error: listError } = await admin.storage
    .from("user-logos")
    .list(userId, { limit: 1000 });
  if (listError) throw listError;
  if (!files || files.length === 0) return;
  const paths = files.map((f) => `${userId}/${f.name}`);
  await admin.storage.from("user-logos").remove(paths);
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
