import { timingSafeEqual } from "../_shared/internal-auth.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Opróżnia kolejkę public.storage_cleanup_queue (migracja 313): pliki
// i foldery w Storage, których wiersze w bazie zostały usunięte (gra → folder
// dźwięków, logo → obraz, konto → cały folder użytkownika). Wołana przez
// pg_net po zatwierdzeniu usunięcia i co 10 min przez pg_cron. Wywołanie
// niczego nie przyjmuje i jest bezpieczne do powtórzenia: listę do usunięcia
// daje tylko baza (storage_cleanup_claim, dostępna wyłącznie dla service_role).

// Wołają tylko serwery (pg_net z bazy: storage_cleanup_kick). Bez CORS.
// Uwierzytelnienie (audyt E24, N4): nagłówek X-Internal-Secret =
// hex(HMAC-SHA256(klucz MAIL_WORKER_SECRET, "storage-cleanup")). Baza liczy
// to samo z Vault (mail_worker_secret) -- bez nowego sekretu, a znajomość
// wartości pochodnej nie daje dostępu do mail-worker.
const CLEANUP_CONTEXT = "storage-cleanup";



async function expectedSecret(): Promise<string> {
  const base = (Deno.env.get("MAIL_WORKER_SECRET") || "").trim();
  if (!base) return "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(base), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(CLEANUP_CONTEXT)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Item = { id: number; bucket: string; path: string; is_folder: boolean };

serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const expected = await expectedSecret();
  if (!expected) return json({ ok: false, error: "not_configured" }, 503);
  if (!timingSafeEqual(req.headers.get("x-internal-secret") || "", expected)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!serviceRoleKey) return json({ ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, 500);

  let done = 0;
  let failed = 0;
  try {
    // kilka paczek na wywołanie; reszta przy następnym (cron)
    for (let round = 0; round < 10; round++) {
      const { data, error } = await admin.rpc("storage_cleanup_claim", { p_limit: 100 });
      if (error) throw error;
      const items = (data || []) as Item[];
      if (!items.length) break;

      const ok: number[] = [];
      const bad: { id: number; error: string }[] = [];
      for (const it of items) {
        try {
          if (it.is_folder) await removeFolderRecursive(it.bucket, it.path);
          else await removeFiles(it.bucket, [it.path]);
          ok.push(it.id);
        } catch (e) {
          bad.push({ id: it.id, error: String((e as Error)?.message || e).slice(0, 500) });
        }
      }
      const { error: doneError } = await admin.rpc("storage_cleanup_done", { p_done: ok, p_failed: bad });
      if (doneError) throw doneError;
      done += ok.length;
      failed += bad.length;
      if (bad.length) break; // błędy: następna próba z crona
    }
    return json({ ok: true, done, failed });
  } catch (e) {
    console.error("[storage-cleanup]", (e as Error)?.message || e);
    return json({ ok: false, error: String((e as Error)?.message || e), done, failed }, 500);
  }
});

async function removeFiles(bucket: string, paths: string[]) {
  const { error } = await admin.storage.from(bucket).remove(paths);
  if (error) throw error;
}

// Usuwa rekurencyjnie wszystko pod prefiksem (list zwraca max 1000 wpisów
// na stronę; foldery mają id === null).
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
    if (files.length === 0 || entries.length < PAGE) {
      if (files.length) await removeFiles(bucket, files);
      return;
    }
    await removeFiles(bucket, files);
  }
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
