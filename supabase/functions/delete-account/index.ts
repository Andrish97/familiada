import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const sb = createClient(supabaseUrl, supabaseAnonKey);
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
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ ok: false, error: "Missing Bearer token" }, 401);

    const { data: userData, error: authError } = await sb.auth.getUser(token);
    if (authError || !userData?.user) {
      return json({ ok: false, error: "Invalid JWT" }, 401);
    }

    const userId = userData.user.id;

    // Najpierw baza (jedno źródło prawdy kasowania, używane też przez gości).
    // Funkcja usuwa rekordy powiązane z user_id i e-mailem, a finalnie auth.users/profiles.
    // Błąd bazy = nic nie ginie (pliki zostają razem z kontem).
    const { error: deleteError } = await admin.rpc("delete_user_everything", { p_user_id: userId });
    if (deleteError) throw deleteError;

    // Storage nie jest objęty kaskadą DB — pliki w bucketach kasujemy po bazie.
    // Niepowodzenie tego kroku nie cofa usunięcia konta.
    await cleanupUserStorage(userId);

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});

// Usuwa wszystkie pliki danego użytkownika z bucketów user-sounds i user-logos.
// user-sounds: {userId}/{gameId}/{sfxKey} (dwa poziomy folderów)
// user-logos:  {userId}/{filename}        (jeden poziom)
async function cleanupUserStorage(userId: string) {
  await removeUserSoundsFolder(userId).catch((e) =>
    console.error("[delete-account] cleanup user-sounds failed:", e?.message || e)
  );
  await removeUserLogosFolder(userId).catch((e) =>
    console.error("[delete-account] cleanup user-logos failed:", e?.message || e)
  );
}

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
