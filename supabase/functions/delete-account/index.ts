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

    // Storage nie jest objęty kaskadą DB — pliki w bucketach trzeba skasować osobno.
    // Robimy to przed usunięciem wierszy z DB, ale niepowodzenie tego kroku nie
    // blokuje usunięcia konta (nie zostawiamy użytkownika w stanie "częściowo usunięty").
    await cleanupUserStorage(userId);

    // Jedno źródło prawdy kasowania (DB function), używane też przez cleanup gości.
    // Funkcja usuwa rekordy powiązane z user_id i finalnie auth.users/profiles.
    const { error: deleteError } = await admin.rpc("delete_user_everything", { p_user_id: userId });
    if (deleteError) throw deleteError;

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});

// Usuwa wszystkie pliki danego użytkownika z bucketów user-sounds i user-logos.
// user-sounds: {userId}/{gameId}/{sfxKey} (dwa poziomy folderów)
// user-logos:  {userId}/{filename}        (jeden poziom)
// Błędy pojedynczych bucketów są logowane, ale nie przerywają usuwania konta.
async function cleanupUserStorage(userId: string) {
  await removeUserSoundsFolder(userId).catch((e) =>
    console.error("[delete-account] cleanup user-sounds failed:", e?.message || e)
  );
  await removeUserLogosFolder(userId).catch((e) =>
    console.error("[delete-account] cleanup user-logos failed:", e?.message || e)
  );
}

async function removeUserSoundsFolder(userId: string) {
  const { data: gameFolders, error: listError } = await admin.storage
    .from("user-sounds")
    .list(userId, { limit: 1000 });
  if (listError) throw listError;
  if (!gameFolders || gameFolders.length === 0) return;

  for (const entry of gameFolders) {
    // Wpisy będące plikami mają id !== null; foldery (gry) trzeba zejść głębiej.
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
